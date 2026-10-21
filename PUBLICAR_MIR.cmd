@echo off
cd /d "%~dp0"
python scripts/publish.py
if errorlevel 1 (
  echo.
  echo No se ha completado la publicacion. Revisa el mensaje anterior.
  pause
  exit /b 1
)
pause
