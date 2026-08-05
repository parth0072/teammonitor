$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js not installed. Download from https://nodejs.org" -ForegroundColor Red
    pause
    exit 1
}

# Install deps if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
}

# Launch
Write-Host "Starting TeamMonitor..." -ForegroundColor Green
Start-Process -FilePath "node_modules\.bin\electron.cmd" -ArgumentList "." -WorkingDirectory $dir
