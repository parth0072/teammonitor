$installDir = "$env:LOCALAPPDATA\TeamMonitorAgent"
$electronExe = "$installDir\windows-agent\node_modules\electron\dist\electron.exe"
$appDir = "$installDir\windows-agent"

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
Set-Location $appDir
npm install

# Register in Windows startup (runs silently on login)
$startupCmd = "powershell -WindowStyle Hidden -Command `"Start-Process '$electronExe' -ArgumentList '.' -WorkingDirectory '$appDir'`""
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "TeamMonitorAgent" -Value $startupCmd
Write-Host "Registered in Windows startup." -ForegroundColor Green

# Launch now (detached from terminal, no console window)
Write-Host "Starting TeamMonitor..." -ForegroundColor Green
Start-Process -FilePath $electronExe -ArgumentList "." -WorkingDirectory $appDir

Write-Host "Done! TeamMonitor will auto-start on every login." -ForegroundColor Green
