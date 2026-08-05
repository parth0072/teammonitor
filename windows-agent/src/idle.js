const { powerMonitor } = require('electron');
const { log } = require('./logger');

// Mirrors IdleDetectionService.swift
// Uses Electron's built-in powerMonitor.getSystemIdleTime() — works on Windows + Mac

class IdleDetector {
  constructor() {
    this.warningThreshold = 120; // seconds — show warning
    this.stopThreshold    = 300; // seconds — auto-pause timer
    this.pollInterval     = 10;  // seconds

    this._state     = 'active'; // active | warning | stopped
    this._timer     = null;
    this._idleStart = null;
    this._totalActive = 0;
    this._totalIdle   = 0;

    // Callbacks
    this.onIdleWarning          = null; // (secondsRemaining) => void
    this.onIdleWarningCancelled = null; // () => void
    this.onIdleStart            = null; // (date) => void
    this.onIdleEnd              = null; // (start, end) => void
    this.onActivityPercent      = null; // (pct) => void
  }

  configure({ warningMinutes, stopMinutes }) {
    this.warningThreshold = (warningMinutes || 2) * 60;
    this.stopThreshold    = (stopMinutes    || 5) * 60;
  }

  start() {
    this.stop();
    this._state       = 'active';
    this._idleStart   = null;
    this._totalActive = 0;
    this._totalIdle   = 0;
    this._timer = setInterval(() => this._check(), this.pollInterval * 1000);
    log('Idle', `Started — warning=${this.warningThreshold}s stop=${this.stopThreshold}s`);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._state     = 'active';
    this._idleStart = null;
  }

  getSystemIdleSeconds() {
    return powerMonitor.getSystemIdleTime();
  }

  _check() {
    const idle = this.getSystemIdleSeconds();
    const dt   = this.pollInterval;

    switch (this._state) {
      case 'active':
        if (idle >= this.stopThreshold) {
          // Jumped straight past warning (lid close / long absence)
          this._state     = 'stopped';
          this._idleStart = new Date();
          this._totalIdle += dt;
          this.onIdleStart?.(this._idleStart);
          log('Idle', `Auto-stopped (gap) — idle=${idle}s`);
        } else if (idle >= this.warningThreshold) {
          this._state = 'warning';
          this._totalIdle += dt;
          this.onIdleWarning?.(this.stopThreshold - idle);
        } else {
          this._totalActive += dt;
        }
        break;

      case 'warning':
        if (idle < this.warningThreshold) {
          this._state = 'active';
          this._totalActive += dt;
          this.onIdleWarningCancelled?.();
        } else if (idle >= this.stopThreshold) {
          this._state     = 'stopped';
          this._idleStart = new Date();
          this._totalIdle += dt;
          this.onIdleStart?.(this._idleStart);
          log('Idle', `Stopped — idle=${idle}s`);
        } else {
          this._totalIdle += dt;
          this.onIdleWarning?.(this.stopThreshold - idle);
        }
        break;

      case 'stopped':
        if (idle < this.warningThreshold) {
          const end   = new Date();
          const start = this._idleStart || end;
          this._state     = 'active';
          this._idleStart = null;
          this._totalActive += dt;
          this.onIdleEnd?.(start, end);
          log('Idle', `Resumed — idle was ${Math.round((end - start) / 1000)}s`);
        } else {
          this._totalIdle += dt;
        }
        break;
    }

    const total = this._totalActive + this._totalIdle;
    const pct   = total > 0 ? Math.min(100, Math.round(this._totalActive / total * 100)) : 100;
    this.onActivityPercent?.(pct);
  }

  resetActivityCounters() {
    this._totalActive = 0;
    this._totalIdle   = 0;
  }

  get isIdle() { return this._state === 'stopped'; }
}

module.exports = new IdleDetector();
