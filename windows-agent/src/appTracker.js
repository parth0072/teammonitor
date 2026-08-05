const { execSync } = require('child_process');
const { log } = require('./logger');

// Gets the foreground window process name + title on Windows via PowerShell.
// No native modules needed — uses Win32 via inline C# in PowerShell.
// Cache the Add-Type call across polling ticks by using -EncodedCommand with a
// persistent runspace isn't practical here; instead we keep the PS script minimal
// so each call takes ~50ms (acceptable at 30s poll interval).

const PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -Name FW -Namespace TM -MemberDefinition '
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder s,int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
' 2>$null
$h=[TM.FW]::GetForegroundWindow()
$s=New-Object System.Text.StringBuilder(512)
[TM.FW]::GetWindowText($h,$s,512)|Out-Null
$p=0;[TM.FW]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null
$n=(Get-Process -Id $p -EA SilentlyContinue).ProcessName
Write-Output "$n|$($s.ToString())"
`.trim();

const PS_ENC = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');

function getActiveWindow() {
  if (process.platform !== 'win32') {
    // macOS fallback — use osascript to get frontmost app name
    try {
      const result = execSync(
        `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
        { timeout: 2000, encoding: 'utf8' }
      ).trim();
      return { appName: result, windowTitle: '' };
    } catch (_) {
      return { appName: '', windowTitle: '' };
    }
  }
  try {
    const result = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${PS_ENC}`, {
      timeout: 3000,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    const sep   = result.indexOf('|');
    const app   = sep > -1 ? result.slice(0, sep) : result;
    const title = sep > -1 ? result.slice(sep + 1) : '';
    return { appName: app || 'Unknown', windowTitle: title };
  } catch (e) {
    return { appName: '', windowTitle: '' };
  }
}

class AppTracker {
  constructor() {
    this._timer       = null;
    this._lastApp     = null;
    this._lastStart   = null;
    this._lastLogged  = null;
    this.pollInterval = 30; // seconds

    this.onAppChange = null; // (appName, windowTitle, start, end) => void
    this.onTick      = null; // (appName, windowTitle) => void
  }

  start(pollInterval = 30) {
    this.stop();
    this.pollInterval = pollInterval;
    this._poll();
    this._timer = setInterval(() => this._poll(), pollInterval * 1000);
    log('AppTracker', 'Started');
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._flush();
    this._lastApp    = null;
    this._lastStart  = null;
    this._lastLogged = null;
  }

  _flush() {
    if (!this._lastApp || !this._lastLogged) return;
    const now      = new Date();
    const duration = Math.round((now - this._lastLogged) / 1000);
    if (duration > 2) {
      this.onAppChange?.(this._lastApp.appName, this._lastApp.windowTitle, this._lastLogged, now);
    }
  }

  _poll() {
    const now     = new Date();
    const current = getActiveWindow();
    this.onTick?.(current.appName, current.windowTitle);

    if (!this._lastApp) {
      this._lastApp    = current;
      this._lastStart  = now;
      this._lastLogged = now;
      return;
    }

    const changed = this._lastApp.appName     !== current.appName ||
                    this._lastApp.windowTitle  !== current.windowTitle;

    if (changed) {
      const duration = Math.round((now - this._lastLogged) / 1000);
      if (duration > 2) {
        this.onAppChange?.(this._lastApp.appName, this._lastApp.windowTitle, this._lastLogged, now);
      }
      this._lastStart  = now;
      this._lastLogged = now;
    } else {
      // Flush a chunk so activity is recorded even if app never changes
      const duration = Math.round((now - this._lastLogged) / 1000);
      if (duration > 5) {
        this.onAppChange?.(current.appName, current.windowTitle, this._lastLogged, now);
        this._lastLogged = now;
      }
    }

    this._lastApp = current;
  }
}

module.exports = new AppTracker();
