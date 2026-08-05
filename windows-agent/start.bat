@echo off
cd /d "%~dp0"

:: Check node_modules exists
if not exist "node_modules" (
    echo node_modules not found. Running install first...
    call install.bat
)

:: Launch app (hidden console window)
start "" /B node_modules\.bin\electron.cmd .
