@echo off
echo TeamMonitor Agent — First-time setup
echo =====================================

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please download and install from https://nodejs.org
    echo Then run this script again.
    pause
    exit /b 1
)

echo Node.js found:
node --version

:: Install dependencies
echo.
echo Installing dependencies...
cd /d "%~dp0"
npm install

if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo Setup complete! Run start.bat to launch TeamMonitor.
pause
