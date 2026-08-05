// tracker.js — core tracking manager (mirrors TrackingManager.swift)

const { ipcMain, powerMonitor, Notification, app } = require('electron');
const api        = require('./api');
const store      = require('./store');
const idle       = require('./idle');
const appTracker = require('./appTracker');
const { log }    = require('./logger');

const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

class Tracker {
  constructor() {
    // State
    this.isTracking      = false;
    this.isOnBreak       = false;
    this.sessionId       = null;
    this.punchInTime     = null;
    this.trackedMinutes  = 0;  // current session (heartbeat baseline)
    this.todayMinutes    = 0;  // all-day accumulator
    this.activityPercent = 100;
    this.currentApp      = '';
    this.employee        = null;

    // Current task / Jira context (set at punch-in, cleared at punch-out)
    this.currentTaskId    = null;
    this.currentTaskName  = null;
    this.currentTaskColor = null;
    this.currentJiraKey   = null;
    this.currentJiraTitle = null;

    // Break tracking
    this._pendingBreaks    = [];
    this._currentBreakStart = null;

    // Timers
    this._heartbeatTimer = null;
    this._minuteTimer    = null;

    // Pending delivered command IDs
    this._deliveredCmdIds = [];

    // Callbacks → main.js listens and forwards to renderer
    this.onStateChange = null;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async init() {
    // Restore today's accumulated minutes
    const today = this._today();
    if (store.getTodayDate() === today) {
      this.todayMinutes = store.getTodayMinutes();
    } else {
      store.setTodayDate(today);
      store.setTodayMinutes(0);
    }

    // Restore employee info
    this.employee = store.getEmployee();

    // Try to restore an active session from previous run
    const saved = store.getSession();
    if (saved && saved.date === today) {
      log('Tracker', `Restoring session ${saved.sessionId} from previous run`);
      this.sessionId      = saved.sessionId;
      this.punchInTime    = new Date(saved.punchInTime);
      this.trackedMinutes = saved.trackedMinutes || 0;
      this.isTracking     = true;
      this._startHeartbeat();
      this._startMinuteTimer();
      this._startServices();
    }

    // Sleep/wake handling
    powerMonitor.on('suspend', () => this._onSleep());
    powerMonitor.on('resume',  () => this._onWake());

    this._emit();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email, password) {
    const data = await api.login(email, password);
    store.setToken(data.token);
    store.setEmployee(data.employee);
    this.employee = data.employee;
    this._applyEmployeeConfig(data.employee);
    log('Tracker', `Logged in as ${data.employee.name}`);
    return data.employee;
  }

  logout() {
    if (this.isTracking) this.punchOut().catch(() => {});
    store.clearToken();
    store.setEmployee(null);
    store.clearSession();
    this.employee       = null;
    this.isTracking     = false;
    this.isOnBreak      = false;
    this.sessionId      = null;
    this.trackedMinutes = 0;
    this._stopHeartbeat();
    this._stopMinuteTimer();
    this._stopServices();
    this.currentTaskId    = null;
    this.currentTaskName  = null;
    this.currentTaskColor = null;
    this.currentJiraKey   = null;
    this.currentJiraTitle = null;
    this._emit();
    log('Tracker', 'Logged out');
  }

  _applyEmployeeConfig(emp) {
    if (!emp) return;
    idle.configure({
      warningMinutes: emp.idle_warning_minutes || 2,
      stopMinutes:    emp.idle_stop_minutes    || 5,
    });
  }

  // ── Punch In ──────────────────────────────────────────────────────────────

  async punchIn(taskId = null, jiraKey = null, taskName = null, taskColor = null, jiraTitle = null) {
    if (this.isTracking) return;
    try {
      const data = await api.punchIn(taskId);
      this.sessionId        = data.sessionId;
      this.punchInTime      = new Date();
      this.trackedMinutes   = 0;
      this.isTracking       = true;
      this.isOnBreak        = false;
      this._pendingBreaks   = [];
      this._currentBreakStart = null;
      this.currentTaskId    = taskId;
      this.currentTaskName  = taskName;
      this.currentTaskColor = taskColor;
      this.currentJiraKey   = jiraKey;
      this.currentJiraTitle = jiraTitle;
      idle.resetActivityCounters();

      this._persistSession();
      this._startHeartbeat();
      this._startMinuteTimer();
      this._startServices();

      // Seed trackedMinutes from server session
      this._seedTrackedMinutes();

      log('Tracker', `Punched in — session ${this.sessionId}`);
      this._emit();
    } catch (err) {
      log('Tracker', `Punch-in failed: ${err.message}`);
      throw err;
    }
  }

  async _seedTrackedMinutes() {
    try {
      const sessions = await api.getMySessions(this._today());
      const match    = sessions.find(s => s.id === this.sessionId);
      if (match && match.total_minutes > this.trackedMinutes) {
        log('Tracker', `Seeding trackedMinutes ${this.trackedMinutes} → ${match.total_minutes}`);
        this.trackedMinutes = match.total_minutes;
      }
    } catch (_) {}
  }

  // ── Punch Out ─────────────────────────────────────────────────────────────

  async punchOut() {
    if (!this.isTracking || !this.sessionId) return;
    const sessionId = this.sessionId;
    const mins      = this.trackedMinutes;

    this._stopHeartbeat();
    this._stopMinuteTimer();
    this._stopServices();
    this.isTracking       = false;
    this.isOnBreak        = false;
    this.sessionId        = null;
    this.currentTaskId    = null;
    this.currentTaskName  = null;
    this.currentTaskColor = null;
    this.currentJiraKey   = null;
    this.currentJiraTitle = null;
    store.clearSession();

    try {
      await api.punchOut(sessionId, mins);
      log('Tracker', `Punched out — session ${sessionId}, ${mins}m`);
    } catch (err) {
      log('Tracker', `Punch-out error: ${err.message}`);
    }
    this._emit();
  }

  // ── Break ─────────────────────────────────────────────────────────────────

  async startBreak() {
    if (!this.isTracking || this.isOnBreak) return;
    this.isOnBreak          = true;
    this._currentBreakStart = new Date();
    idle.stop();
    appTracker.stop();
    log('Tracker', `Break started at ${this._currentBreakStart.toISOString()}`);
    this._emit();
    this._notify('TeamMonitor', 'Timer paused. See you soon!');
  }

  async resumeFromBreak() {
    if (!this.isOnBreak) return;
    const breakStart = this._currentBreakStart || new Date();
    const breakEnd   = new Date();
    this.isOnBreak          = false;
    this._currentBreakStart = null;

    this._pendingBreaks.push({ start: breakStart.toISOString(), end: breakEnd.toISOString() });

    idle.resetActivityCounters();
    idle.start();
    appTracker.start();

    // Send resume heartbeat immediately
    this._sendHeartbeat({ reconnect: false });

    log('Tracker', `Break ended — ${Math.round((breakEnd - breakStart) / 60000)}m`);
    this._emit();
  }

  // ── Idle callbacks ────────────────────────────────────────────────────────

  _hookIdleCallbacks() {
    idle.onIdleStart = (start) => {
      if (!this.isTracking || this.isOnBreak) return;
      log('Tracker', 'Idle detected — auto break');
      this.isOnBreak          = true;
      this._currentBreakStart = start;
      this._emit();
      this._notify('TeamMonitor', 'Timer paused — idle detected. Will auto-resume when you\'re back.');
    };

    idle.onIdleEnd = (start, end) => {
      if (!this.isTracking) return;
      const breakDuration = Math.round((end - start) / 1000);
      this._pendingBreaks.push({ start: start.toISOString(), end: end.toISOString() });

      // Log idle
      api.logIdle(this.sessionId, start, end).catch(() => {});

      this.isOnBreak          = false;
      this._currentBreakStart = null;
      idle.resetActivityCounters();
      log('Tracker', `Idle ended — ${breakDuration}s`);
      this._emit();
      this._sendHeartbeat({ reconnect: false });
    };

    idle.onIdleWarning = (remaining) => {
      this.onStateChange?.({ type: 'idle_warning', secondsRemaining: remaining });
    };

    idle.onIdleWarningCancelled = () => {
      this.onStateChange?.({ type: 'idle_warning_cancelled' });
    };

    idle.onActivityPercent = (pct) => {
      this.activityPercent = pct;
      this.onStateChange?.({ type: 'activity', activityPercent: pct });
    };
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
  }

  async _sendHeartbeat(opts = {}) {
    if (!this.sessionId) return;
    try {
      const payload = {
        screenPermission:    true,
        agentVersion:        app.getVersion(),
        isIdle:              this.isOnBreak,
        deliveredCommandIds: this._deliveredCmdIds,
        breaks:              this._pendingBreaks,
        reconnect:           opts.reconnect ?? false,
      };
      if (this._currentBreakStart) {
        payload.currentBreakStart = this._currentBreakStart.toISOString();
      }

      const resp = await api.heartbeat(this.sessionId, this.trackedMinutes, payload);

      // Clear delivered + pending after successful sync
      this._deliveredCmdIds = [];
      this._pendingBreaks   = [];

      // Update today minutes from server
      if (resp.today_minutes != null && resp.today_minutes > this.todayMinutes) {
        this.todayMinutes = resp.today_minutes;
        store.setTodayMinutes(this.todayMinutes);
      }

      log('Tracker', `Heartbeat ✓ — ${this.trackedMinutes}m, ${this._pendingBreaks.length} breaks`);

      // Handle admin commands
      if (resp.commands?.length) this._handleCommands(resp.commands);

      this._emit();
    } catch (err) {
      log('Tracker', `Heartbeat failed: ${err.message}`);
    }
  }

  _handleCommands(commands) {
    for (const cmd of commands) {
      log('Tracker', `Admin command: ${cmd.type}`);
      switch (cmd.type) {
        case 'punch_out':
          this.punchOut(); break;
        case 'take_break':
          if (!this.isOnBreak) this.startBreak(); break;
        case 'notify':
          this._notify(cmd.title || 'TeamMonitor', cmd.message || ''); break;
        case 'lock_tracking':
          this._notify('TeamMonitor', cmd.message || 'Tracking locked by admin.'); break;
        case 'unlock_tracking':
          this._notify('TeamMonitor', 'Tracking unlocked by admin.'); break;
      }
      this._deliveredCmdIds.push(cmd.id);
    }
  }

  // ── Minute timer ─────────────────────────────────────────────────────────

  _startMinuteTimer() {
    this._stopMinuteTimer();
    this._minuteTimer = setInterval(() => {
      if (this.isTracking && !this.isOnBreak) {
        this.trackedMinutes++;
        this.todayMinutes++;
        store.setTodayMinutes(this.todayMinutes);
        this._persistSession();
        this._emit();
      }
    }, 60 * 1000);
  }

  _stopMinuteTimer() {
    if (this._minuteTimer) { clearInterval(this._minuteTimer); this._minuteTimer = null; }
  }

  // ── Sleep / Wake ──────────────────────────────────────────────────────────

  _onSleep() {
    if (!this.isTracking) return;
    log('Tracker', 'Sleep detected');
    if (!this.isOnBreak) {
      this.isOnBreak          = true;
      this._currentBreakStart = new Date();
      this._emit();
    }
    // Send a final heartbeat before sleep
    this._sendHeartbeat().catch(() => {});
  }

  _onWake() {
    if (!this.isTracking) return;
    log('Tracker', 'Wake detected');
    if (this.isOnBreak && this._currentBreakStart) {
      // Auto-resume after wake
      setTimeout(() => this.resumeFromBreak(), 2000);
    }
  }

  // ── Services (idle + app tracking) ────────────────────────────────────────

  _startServices() {
    this._hookIdleCallbacks();

    const emp = this.employee;
    idle.configure({
      warningMinutes: emp?.idle_warning_minutes || 2,
      stopMinutes:    emp?.idle_stop_minutes    || 5,
    });
    idle.start();

    appTracker.onAppChange = (appName, windowTitle, start, end) => {
      if (!this.sessionId) return;
      const duration = Math.round((end - start) / 1000);
      if (duration < 3) return;
      api.logActivity(this.sessionId, appName, windowTitle, start, end, duration).catch(() => {});
    };
    appTracker.onTick = (appName) => {
      this.currentApp = appName;
      this.onStateChange?.({ type: 'app', currentApp: appName });
    };
    appTracker.start(30);
  }

  _stopServices() {
    idle.stop();
    appTracker.stop();
  }

  // ── Screenshot ────────────────────────────────────────────────────────────

  // Called from main.js after screenshot is captured via desktopCapturer
  async uploadScreenshot(imageBuffer) {
    if (!this.sessionId) return;
    try {
      await api.uploadScreenshot(imageBuffer, this.sessionId, this.activityPercent);
      log('Tracker', 'Screenshot uploaded');
    } catch (err) {
      log('Tracker', `Screenshot upload failed: ${err.message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _persistSession() {
    if (!this.sessionId) return;
    store.setSession({
      sessionId:      this.sessionId,
      punchInTime:    this.punchInTime?.toISOString(),
      trackedMinutes: this.trackedMinutes,
      date:           this._today(),
    });
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  _notify(title, body) {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
    } catch (_) {}
  }

  _emit() {
    this.onStateChange?.({
      type:             'state',
      isTracking:       this.isTracking,
      isOnBreak:        this.isOnBreak,
      sessionId:        this.sessionId,
      trackedMinutes:   this.trackedMinutes,
      todayMinutes:     this.todayMinutes,
      activityPercent:  this.activityPercent,
      currentApp:       this.currentApp,
      employee:         this.employee,
      punchInTime:      this.punchInTime?.toISOString() ?? null,
      currentTaskId:    this.currentTaskId,
      currentTaskName:  this.currentTaskName,
      currentTaskColor: this.currentTaskColor,
      currentJiraKey:   this.currentJiraKey,
      currentJiraTitle: this.currentJiraTitle,
    });
  }

  get state() {
    return {
      isTracking:       this.isTracking,
      isOnBreak:        this.isOnBreak,
      sessionId:        this.sessionId,
      trackedMinutes:   this.trackedMinutes,
      todayMinutes:     this.todayMinutes,
      activityPercent:  this.activityPercent,
      currentApp:       this.currentApp,
      employee:         this.employee,
      punchInTime:      this.punchInTime?.toISOString() ?? null,
      currentTaskId:    this.currentTaskId,
      currentTaskName:  this.currentTaskName,
      currentTaskColor: this.currentTaskColor,
      currentJiraKey:   this.currentJiraKey,
      currentJiraTitle: this.currentJiraTitle,
      token:            store.getToken(),
    };
  }
}

module.exports = new Tracker();
