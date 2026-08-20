@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE=C:\Users\86158\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
start "Mammoth Two Games Server" /min cmd /c ""%NODE_EXE%" server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4211/"
