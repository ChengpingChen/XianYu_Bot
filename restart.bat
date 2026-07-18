@echo off
chcp 65001 >nul 2>&1
echo ====== 重启闲鱼 Bot ======
cd /d "%~dp0"

echo [1/3] 停止 PM2 进程...
call npx pm2 delete goofish-bot >nul 2>&1

echo [2/3] 重新启动 (重新读取 .env)...
call npx pm2 start ecosystem.config.js

echo [3/3] 保存进程列表...
call npx pm2 save

echo.
echo ====== 重启完成 ======
echo 查看日志: npx pm2 logs goofish-bot
pause
