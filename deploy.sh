#!/bin/bash
set -e

# ==========================================
# Finance-18 一键部署脚本 (Ubuntu)
# ==========================================

echo "开始部署 Finance-18 项目..."

# 1. 更新系统包
echo "[1/6] 更新系统包..."
sudo apt update && sudo apt upgrade -y

# 2. 安装 Node.js 20
echo "[2/6] 安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. 安装 PostgreSQL
echo "[3/6] 安装 PostgreSQL..."
sudo apt install postgresql postgresql-contrib -y
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 4. 配置数据库和用户
echo "[4/6] 配置 PostgreSQL 数据库和用户..."
# 创建数据库 finance18 和用户 finance18 (密码为 finance18_pwd)
sudo -u postgres psql -c "CREATE DATABASE finance18;" || true
sudo -u postgres psql -c "CREATE USER finance18 WITH ENCRYPTED PASSWORD 'finance18_pwd';" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE finance18 TO finance18;" || true
sudo -u postgres psql -c "ALTER DATABASE finance18 OWNER TO finance18;" || true

# 5. 安装 PM2
echo "[5/6] 安装 PM2..."
sudo npm install pm2 -g

# 6. 配置项目
echo "[6/6] 配置项目、安装依赖并构建..."
cd ~/finance-18

# 创建 .env 文件
cat > .env << EOL
DATABASE_URL="postgresql://finance18:finance18_pwd@localhost:5432/finance18"
JWT_SECRET="$(openssl rand -hex 32)"
PWD_SALT="$(openssl rand -hex 16)"
INIT_SECRET="admin123"
EOL

# 安装项目依赖
npm ci

# 执行数据库迁移
npx prisma migrate deploy
npx prisma generate

# 构建项目
npm run build

# 使用 PM2 启动项目
pm2 start npm --name "finance-18" -- run start
pm2 save
pm2 startup | tail -n 1 > /tmp/pm2-startup.sh
sudo bash /tmp/pm2-startup.sh

echo "=========================================="
echo "部署完成！"
echo "项目正在后台运行，内部端口为 3000。"
echo "你现在可以通过 http://120.77.253.95:3000 访问系统。"
echo ""
echo "首次系统初始化，请访问："
echo "http://120.77.253.95:3000/api/init?secret=admin123"
echo "=========================================="
