$installDir = "$env:LOCALAPPDATA\TeamMonitorAgent"

# Install Node.js if missing
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js..." -ForegroundColor Cyan
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Clone or update
if (Test-Path "$installDir\.git") {
    Write-Host "Updating TeamMonitor Agent..." -ForegroundColor Cyan
    git -C $installDir pull
} else {
    Write-Host "Installing TeamMonitor Agent..." -ForegroundColor Cyan
    git clone --depth 1 https://github.com/parth0072/teammonitor.git $installDir
}

# Install dependencies
Set-Location "$installDir\windows-agent"
npm install

# Launch
Write-Host "Starting TeamMonitor..." -ForegroundColor Green
Start-Process -FilePath "node_modules\.bin\electron.cmd" -ArgumentList "." -WorkingDirectory "$installDir\windows-agent"
