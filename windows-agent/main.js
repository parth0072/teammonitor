const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');

const path    = require('path');
const tracker = require('./src/tracker');
const { log } = require('./src/logger');

// Single-instance lock
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

app.setAppUserModelId('com.alphabyte.teammonitor');

let mainWindow   = null;
let captureWin   = null;
let tray         = null;
let captureReady = false;
let screenshotTimer = null;

// ── Tray icons (colored circles via data URI) ─────────────────────────────

function makeDotIcon(color) {
  // 16×16 circle PNG encoded inline — no file needed
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${color}"/></svg>`;
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  );
}

const ICONS = {
  active:  makeDotIcon('#10b981'),
  break:   makeDotIcon('#f59e0b'),
  idle:    makeDotIcon('#94a3b8'),
  offline: makeDotIcon('#64748b'),
};

// ── Tray ──────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const s = tracker.state;
  const statusLabel = s.isTracking
    ? (s.isOnBreak ? `⏸ On Break – ${fmtHM(s.todayMinutes)}` : `● Tracking – ${fmtHM(s.todayMinutes)}`)
    : `○ Not tracking`;

  return Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    s.isTracking
      ? (s.isOnBreak
          ? { label: '▶  Resume',        click: () => tracker.resumeFromBreak() }
          : { label: '⏸  Take a Break',  click: () => tracker.startBreak() })
      : { label: 'Punch In', click: () => { showMain(); } },
    s.isTracking
      ? { label: 'Punch Out', click: () => tracker.punchOut() }
      : { label: 'Punch Out', enabled: false },
    { type: 'separator' },
    { label: 'Open TeamMonitor…', click: showMain },
    { label: 'Quit', click: async () => {
        if (tracker.isTracking) await tracker.punchOut();
        app.quit();
    }},
  ]);
}

function updateTray() {
  if (!tray) return;
  const s = tracker.state;
  const icon = s.isTracking
    ? (s.isOnBreak ? ICONS.break : ICONS.active)
    : ICONS.offline;
  tray.setImage(icon);
  tray.setToolTip(s.isTracking
    ? (s.isOnBreak ? `TeamMonitor — On Break (${fmtHM(s.todayMinutes)})` : `TeamMonitor — ${fmtHM(s.todayMinutes)}`)
    : 'TeamMonitor — Not tracking');
  tray.setContextMenu(buildTrayMenu());
}

// ── Windows ───────────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:           720,
    height:          640,
    resizable:       false,
    title:           'TeamMonitor',
    icon:            path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload:        path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide(); // minimize to tray instead of closing
  });
}

function createCaptureWindow() {
  captureWin = new BrowserWindow({
    show: false,
    webPreferences: {
      preload:        path.join(__dirname, 'capture-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  captureWin.loadFile(path.join(__dirname, 'renderer', 'capture.html'));
}

function showMain() {
  if (!mainWindow) createMainWindow();
  mainWindow.show();
  mainWindow.focus();
}

// ── Screenshot scheduling ─────────────────────────────────────────────────

function scheduleScreenshots(intervalSeconds = 300) {
  if (screenshotTimer) clearTimeout(screenshotTimer);
  const jitter = intervalSeconds * 0.2;
  const delay  = (intervalSeconds + (Math.random() * jitter * 2 - jitter)) * 1000;
  screenshotTimer = setTimeout(async () => {
    if (tracker.isTracking && !tracker.isOnBreak && captureReady) {
      captureWin.webContents.send('do-capture');
    }
    scheduleScreenshots(intervalSeconds);
  }, Math.max(30000, delay));
}

// ── IPC handlers ──────────────────────────────────────────────────────────

ipcMain.handle('get-state', () => tracker.state);

ipcMain.handle('login', async (_, email, password) => {
  try {
    const emp = await tracker.login(email, password);
    return { ok: true, employee: emp };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('logout',        () => tracker.logout());
ipcMain.handle('punch-out',     () => tracker.punchOut());
ipcMain.handle('start-break',   () => tracker.startBreak());
ipcMain.handle('resume-break',  () => tracker.resumeFromBreak());
ipcMain.handle('get-tasks',     () => require('./src/api').getMyTasks().catch(() => []));

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

ipcMain.handle('punch-in', async (_, taskId, jiraKey, taskName, taskColor, jiraTitle) => {
  try {
    await tracker.punchIn(taskId || null, jiraKey || null, taskName || null, taskColor || null, jiraTitle || null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Screenshot result from hidden capture window
ipcMain.on('capture-ready',  ()         => { captureReady = true; });
ipcMain.on('capture-result', (_, b64)   => {
  if (!b64) return;
  const buf = Buffer.from(b64, 'base64');
  tracker.uploadScreenshot(buf).catch(() => {});
});

// ── State change → push to renderer ──────────────────────────────────────

tracker.onStateChange = (event) => {
  updateTray();
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('state', tracker.state);
  }
  if (event.type === 'state') {
    // Start/stop screenshot schedule based on tracking state
    if (tracker.isTracking && !tracker.isOnBreak) {
      const interval = tracker.employee?.screenshot_interval || 300;
      if (!screenshotTimer) scheduleScreenshots(interval);
    } else {
      if (screenshotTimer) { clearTimeout(screenshotTimer); screenshotTimer = null; }
    }
  }
};

// ── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Login at Windows startup
  app.setLoginItemSettings({ openAtLogin: true });

  // Tray
  tray = new Tray(ICONS.offline);
  tray.setToolTip('TeamMonitor');
  tray.on('click', showMain);
  updateTray();

  // Windows
  createCaptureWindow();

  // Only show main window if not logged in yet
  const Store = require('electron-store');
  const s = new Store({ name: 'teammonitor', encryptionKey: 'tm-local-v1' });
  if (!s.get('auth_token')) {
    createMainWindow();
    showMain();
  } else {
    createMainWindow();
  }

  // Init tracker (restores session, hooks sleep/wake)
  await tracker.init();
  updateTray();

  log('App', `TeamMonitor ${app.getVersion()} started`);
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep alive in tray

app.on('before-quit', async () => {
  if (tracker.isTracking) {
    log('App', 'Quitting — punching out');
    await tracker.punchOut().catch(() => {});
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtHM(mins) {
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}
