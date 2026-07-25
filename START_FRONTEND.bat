@echo off
title MHJ v9 Frontend
cd /d "%~dp0frontend"
call npm install
call npm run dev
pause
