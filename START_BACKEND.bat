@echo off
title MHJ v9 Backend
cd /d "%~dp0backend"
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
