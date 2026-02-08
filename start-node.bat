@echo off
echo ╔════════════════════════════════════════════╗
echo ║   💰 FinanceFlow Pro (Node.js)            ║
echo ╚════════════════════════════════════════════╝
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js found
node --version
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo 📦 Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo ✅ Dependencies already installed
)

echo.
echo 🚀 Starting FinanceFlow Pro...
echo.
echo ✅ Server will start on http://127.0.0.1:5001
echo.
echo ⏸️  Press Ctrl+C to stop the server
echo.

REM Start the server
node server.js

pause
