@echo off
REM One-time setup: installs dependencies, builds the 3D client and the server,
REM and registers the "route-runner" command so you can type it in any cmd window.
cd /d "%~dp0"
echo [1/4] Installing dependencies...
call npm install --no-audit --no-fund || (echo npm install failed & exit /b 1)
echo [2/4] Building the game...
call npm run build || (echo Build failed & exit /b 1)
echo [3/4] Downloading the latest real forex data (skipped if offline)...
call npm run market:seed 2>nul
echo [4/4] Registering the "route-runner" command...
call npm link >nul 2>nul
echo.
echo Done! Start the game any time with:   play.cmd    or    route-runner play
exit /b 0
