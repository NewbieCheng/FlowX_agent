@echo off
echo ========================================
echo   FlowX 本地 Agent 服务端
echo ========================================
echo.
echo 确保 Chrome 已打开且插件开关已开启。
echo.
cd /d "%~dp0.."
node dist/index.js
pause