@echo off
setlocal

cd /d "%~dp0"
echo Starting Hellrush local server...
echo.
echo URL: http://127.0.0.1:8066/index.html
echo.
echo Close this window or press Ctrl+C to stop the server.
echo.

npx --yes http-server . -p 8066 -a 127.0.0.1

echo.
echo Server stopped. Press any key to close.
pause >nul
