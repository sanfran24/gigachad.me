@echo off
cd /d "%~dp0"
git add .
git commit -m "Update stonks prompts to exclude STONKS text and add size slider"
git push origin main
echo Push completed!
pause

