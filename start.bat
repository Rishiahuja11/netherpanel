@echo off
rem NetherPanel Start Script (Windows)
rem Starts the panel server in the current window.

cd /d "%~dp0"

echo.
echo   NetherPanel v4.0 - Minecraft Server Manager
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [!] Node.js not found. Install Node.js 18+ from https://nodejs.org
    goto :eof
)

where java >nul 2>nul
if errorlevel 1 (
    echo   [!] Java not found in PATH. Java servers will not start until you
    echo   [!] install a JDK (e.g. Temurin 21) and add it to PATH.
    echo.
)

if not exist node_modules (
    echo   [*] Installing dependencies...
    call npm install --production
    if errorlevel 1 (
        echo   [!] npm install failed.
        goto :eof
    )
)

if not exist data\servers mkdir data\servers
if not exist data\backups mkdir data\backups
if not exist data\uploads mkdir data\uploads
if not exist data\eggs mkdir data\eggs
if not exist data\crashes mkdir data\crashes
if not exist data\logs mkdir data\logs

echo   [*] Runtime: Windows | Node %node version% 2>nul
echo.
echo   [] Starting panel...
echo   Access it from a browser at http://localhost:3000
echo   Press Ctrl+C to stop
echo.

node server.js