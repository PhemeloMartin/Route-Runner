@echo off
REM Route Runner - double-click (or type "play" in cmd) to start the game. Works offline after setup.
title Route Runner
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required: https://nodejs.org ^(LTS^) & pause & exit /b 1)
if not exist "apps\server\dist\index.js" (
  echo First run: building the game. This needs internet once and takes a few minutes...
  call setup.cmd || exit /b 1
)
node bin\route-runner.mjs play
