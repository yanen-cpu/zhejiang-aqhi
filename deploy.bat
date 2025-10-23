@echo off
setlocal ENABLEDELAYEDEXPANSION

echo === Zhejiang AQHI Website Deploy Script ===

REM Check if git repo
if not exist .git (
  echo Not a git repository. Initializing...
  git init
  if %errorlevel% neq 0 goto :err
)

REM Stage changes
git add -A
if %errorlevel% neq 0 goto :err

REM Commit (allow empty)
set MSG=%*
if "%MSG%"=="" set MSG=update

git commit -m "%MSG%" --allow-empty
if %errorlevel% neq 0 goto :err

REM Push
for /f "tokens=*" %%i in ('git remote') do set HASREMOTE=1
if not defined HASREMOTE (
  echo No remote set. Please add remote first, e.g.:
  echo   git remote add origin https://github.com/<your-username>/zhejiang-aqhi.git
  goto :end
)

git push
if %errorlevel% neq 0 goto :err

echo === Git push complete, Cloudflare Pages will redeploy automatically! ===

goto :end

:err
echo.
echo [ERROR] Deployment failed. Please review the messages above.

:end
pause
