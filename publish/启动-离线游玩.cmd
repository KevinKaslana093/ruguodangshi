@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 需要 Node.js 18+。请安装后重试，或用 python -m http.server 8791 启动。
  pause
  exit /b 1
)
start "" http://127.0.0.1:8791/
node offline-server.cjs
pause