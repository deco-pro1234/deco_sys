# 05. 运行与部署说明

## 1. 运行方式总览

项目支持以下运行方式：

- 本地开发：`next dev`
- 本地 / 服务器生产运行：`next build` + `next start`
- Docker 容器运行：基于 `standalone` 输出的多阶段镜像
- Ubuntu 裸机部署：根目录 `deploy.sh`

当前最可信的运行依据应以以下文件为准：

- `package.json`
- `prisma/schema.prisma`
- `next.config.ts`
- `Dockerfile`
- `src/app/api/init/route.ts`

## 2. 环境变量

### 2.1 必需变量

| 变量 | 作用 | 备注 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 | Prisma 必需 |
| `JWT_SECRET` | JWT 签名密钥 | 生产必须配置 |
| `PWD_SALT` | 密码哈希盐值 | 生产必须配置 |
| `INIT_SECRET` | 初始化管理员密钥 | 用于 `/api/init` |

### 2.2 运行时变量

| 变量 | 作用 | 备注 |
| --- | --- | --- |
| `PORT` | Next 服务监听端口 | `npm start` 使用 |
| `NODE_ENV` | 运行环境 | Docker 中为 `production` |
| `HOSTNAME` | 服务监听主机 | Docker 中为 `0.0.0.0` |

### 2.3 推荐 `.env`

```env
DATABASE_URL="postgresql://user:password@localhost:5432/finance"
JWT_SECRET="replace-with-a-long-random-secret"
PWD_SALT="replace-with-a-random-salt"
INIT_SECRET="replace-with-an-init-secret"
```

## 3. 本地开发

### 3.1 准备步骤

1. 安装依赖
2. 配置 `.env`
3. 准备 PostgreSQL 数据库
4. 执行 Prisma 迁移
5. 生成 Prisma Client

### 3.2 推荐命令

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run dev
```

### 3.3 说明

- `npm run dev` 实际执行 `next dev`
- 页面大量依赖动态数据库数据，如果未完成迁移，开发启动后会直接报数据库相关错误

## 4. 构建与生产运行

### 4.1 构建命令

```bash
npm run build
```

该命令实际等价于：

```bash
prisma generate && next build
```

### 4.2 生产启动

```bash
PORT=3000 npm run start
```

该命令实际等价于：

```bash
next start -H 0.0.0.0 -p $PORT
```

### 4.3 注意事项

- 生产启动前必须先完成数据库迁移
- 当前代码不会在应用启动时自动建表

## 5. 首次初始化管理员

### 5.1 初始化接口

```text
GET /api/init?secret=YOUR_INIT_SECRET
```

### 5.2 执行逻辑

- `route.ts` 校验 `INIT_SECRET`
- `initAdmin()` 只有在系统中不存在管理员时才创建默认管理员

### 5.3 初始化结果

- 默认角色名：`超级管理员`
- 默认密码：`admin`

### 5.4 初始化后动作

1. 访问 `/login`
2. 选择“管理员登录”
3. 使用默认密码 `admin` 登录
4. 进入后台创建其他用户和基础配置

## 6. Docker 部署

### 6.1 Dockerfile 特征

- 基于 `node:20-alpine`
- 使用多阶段构建：
  - `deps`
  - `builder`
  - `runner`
- 启用了 Next `standalone` 输出

### 6.2 Docker 构建行为

在镜像构建阶段会执行：

```bash
npx prisma generate
npm run build
```

### 6.3 Docker 运行行为

运行镜像最终执行：

```bash
node server.js
```

### 6.4 Docker 部署要点

- 镜像中包含 `public`、`.next/standalone`、`.next/static`
- 还保留了完整 `node_modules` 和 `prisma/`
- 运行镜像默认监听 `3000`
- 运行镜像不自动执行 `prisma migrate deploy`

### 6.5 Docker 推荐流程

```bash
docker build -t finne18 .
docker run \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  -e PWD_SALT="..." \
  -e INIT_SECRET="..." \
  -e PORT=3000 \
  -p 3000:3000 \
  finne18
```

在真正启动容器前或首次部署前，应确保数据库已经执行过：

```bash
npx prisma migrate deploy
npx prisma generate
```

## 7. 裸机脚本

### 7.1 `install_env.sh`

功能：

- 安装基础系统工具
- 安装 PostgreSQL
- 安装 Node.js 20
- 安装 PM2
- 创建默认数据库和用户

特点：

- 只准备环境
- 不构建项目
- 不启动应用

### 7.2 `deploy.sh`

功能：

- 安装 Node.js、PostgreSQL、PM2
- 创建数据库和用户
- 写入 `.env`
- 安装依赖
- 执行迁移
- 构建并通过 PM2 启动

特点：

- 假定项目目录为 `~/finance-18`
- 带有较强环境绑定
- 内置了示例公网 IP 和固定初始化地址

## 8. Prisma 与数据库

### 8.1 当前数据库类型

当前代码实际使用：

```prisma
datasource db {
  provider = "postgresql"
}
```

### 8.2 迁移文件

仓库中已有：

- `prisma/migrations/20260812143457_init/`

这意味着：

- 仓库已经包含初始迁移
- 推荐优先使用 `prisma migrate deploy`

## 9. 运行路径建议

### 9.1 本地开发推荐路径

```text
配置 .env
  -> 启动 PostgreSQL
  -> npm ci
  -> npx prisma migrate deploy
  -> npx prisma generate
  -> npm run dev
  -> /api/init 初始化管理员
```

### 9.2 生产部署推荐路径

```text
准备 PostgreSQL
  -> 配置环境变量
  -> npm ci
  -> npx prisma migrate deploy
  -> npx prisma generate
  -> npm run build
  -> npm run start / PM2 / Docker
  -> /api/init 初始化管理员
```

## 10. 当前文档与代码差异

### 10.1 数据库类型差异

- 代码已是 `PostgreSQL`
- `README.md` 和 `development_manual.md` 仍保留部分 `SQLite` 历史表述

### 10.2 Docker 行为差异

- 手册中有“容器启动时自动 `db push`”的历史描述
- 当前真实 `Dockerfile` 并未包含这一步

### 10.3 依赖使用差异

- `browser-image-compression`、`@react-pdf/renderer` 等依赖已安装
- 当前主流程中并未完全按 README / 开发手册叙述方式使用

## 11. 部署排障建议

### 11.1 页面启动后数据库报错

优先检查：

1. `DATABASE_URL` 是否正确
2. 数据库是否可连接
3. 是否执行过 `prisma migrate deploy`
4. 是否执行过 `prisma generate`

### 11.2 登录异常

优先检查：

1. 是否已经访问过 `/api/init`
2. `JWT_SECRET` 与 `PWD_SALT` 是否稳定
3. 数据库中是否确实存在管理员

### 11.3 构建失败

优先检查：

1. Prisma Client 是否生成成功
2. 环境变量是否在构建时可访问
3. Node 版本是否接近 `20`

## 12. 维护建议

- 增加 `.env.example`
- 统一 README、开发手册与实际代码描述
- 明确“推荐部署路径”是 Docker 还是 PM2 裸机
- 如果希望容器完全自举，应显式增加迁移步骤并评估幂等性
