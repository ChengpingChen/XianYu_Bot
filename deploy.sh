#!/bin/bash
# 在服务器上更新并运行闲鱼 bot
# 使用方法：修改下方变量后，在服务器上直接运行本脚本
# ssh root@<YOUR_SERVER_IP> 'bash -s' < deploy.sh

set -e

# ====== 请修改以下变量 ======
SERVER_USER="<YOUR_SERVER_USER>"
SERVER_IP="<YOUR_SERVER_IP>"
BOT_DIR="/root/bot"
# ==============================

BACKUP_DIR="/root/bot_backup_$(date +%Y%m%d_%H%M%S)"

echo "========== 开始更新闲鱼 Bot =========="

# 1. 备份当前项目
if [ -d "$BOT_DIR" ]; then
    echo "[1/5] 备份当前项目到 $BACKUP_DIR ..."
    cp -r "$BOT_DIR" "$BACKUP_DIR"
    echo "  备份完成"
else
    echo "[1/5] 项目目录不存在，跳过备份"
    mkdir -p "$BOT_DIR"
fi

# 2. 上传项目文件
# ⚠️ 请确保已将本地 bot 目录的所有文件上传到服务器 $BOT_DIR
# 可以用 scp -r <本地bot目录>/* ${SERVER_USER}@${SERVER_IP}:$BOT_DIR/
echo "[2/5] 请确保已上传项目文件到服务器"
echo "  执行: scp -r <本地bot目录>/* ${SERVER_USER}@${SERVER_IP}:$BOT_DIR/"

# 3. 检查 Node.js
echo "[3/5] 检查 Node.js 环境..."
if command -v node &> /dev/null; then
    echo "  Node.js: $(node -v)"
else
    echo "  错误: 未安装 Node.js，请先安装 Node.js 18+"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt install -y nodejs"
    exit 1
fi

# 4. 安装依赖
echo "[4/5] 安装项目依赖..."
cd "$BOT_DIR"
if [ -f "package.json" ]; then
    rm -rf node_modules
    npm install --production
    echo "  依赖安装完成"
else
    echo "  错误: 未找到 package.json"
    exit 1
fi

# 5. 配置 .env
echo "[5/5] 检查 .env 配置..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "  已从 .env.example 创建 .env 文件"
        echo "  ⚠️ 请编辑 .env 填写 Cookie 和 API Key"
    else
        echo "  错误: 无 .env 和 .env.example 文件"
        exit 1
    fi
else
    echo "  .env 文件已存在"
fi

# 6. 停止旧进程
echo "[6/5] 停止旧进程..."
OLD_PID=$(pgrep -f "node bot.js" || true)
if [ -n "$OLD_PID" ]; then
    echo "  正在停止旧进程 (PID: $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
    if kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    echo "  旧进程已停止"
else
    echo "  无正在运行的 bot 进程"
fi

# 7. 启动 bot
echo "[7/5] 启动 bot..."
cd "$BOT_DIR"
nohup node bot.js > bot.log 2>&1 &
BOT_PID=$!
echo "  Bot 已启动 (PID: $BOT_PID)"
echo "  日志文件: $BOT_DIR/bot.log"
echo "  查看日志: tail -f $BOT_DIR/bot.log"

echo ""
echo "========== 部署完成 =========="
echo "备份位置: $BACKUP_DIR"
echo "Bot PID:  $BOT_PID"
echo ""
echo "常用命令:"
echo "  查看实时日志: tail -f $BOT_DIR/bot.log"
echo "  查看日志目录: ls $BOT_DIR/logs/"
echo "  重启 Bot:     kill $BOT_PID && cd $BOT_DIR && nohup node bot.js > bot.log 2>&1 &"
