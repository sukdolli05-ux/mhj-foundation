@echo off
cd /d "%~dp0backend"
if exist mhj_v9.db del /f /q mhj_v9.db
echo MHJ v9 database reset complete.
pause
