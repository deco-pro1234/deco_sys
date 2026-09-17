#!/bin/bash
set -e

echo "=========================================="
echo "  🚀 开始配置 Finance-18 服务器环境"
echo "=========================================="

# 1. 更新系统并安装基础工具
echo "[1/5] 更新系统并安装基础工具..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git postgresql postgresql-contrib

# 2. 安装 Node.js 20
echo "[2/5] 安装 Node.js v20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. 配置 PostgreSQL
echo "[3/5] 配置 PostgreSQL 数据库..."
sudo -u postgres psql -c "CREATE USER finance_user WITH PASSWORD 'Finance@18';" || true
sudo -u postgres psql -c "CREATE DATABASE finance_db OWNER finance_user;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE finance_db TO finance_user;" || true

# 4. 安装 PM2
echo "[4/5] 安装 PM2..."
sudo npm install pm2 -g

echo "=========================================="
echo "  ✅ 基础环境配置完成！"
echo "  请返回 Trae 告诉 Agent '环境已就绪'"
echo "=========================================="
