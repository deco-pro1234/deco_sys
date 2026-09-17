# FINNE18 - 财务收支记录程序

本项目是一个侧重于手机端使用的 H5 财务收支记录程序，包含收支数据录入、资金池管理、分类管理、用户管理、薪金、活动/合约，以及报表与 PDF / 会计结算包导出。项目前端与后端均基于 Next.js (App Router) + Prisma (PostgreSQL) 打造，样式基于 Tailwind CSS，移动端优先。

## 开发手册与文档

详细的产品需求文档（PRD）和开发手册，请参考根目录下的 [development_manual.md](./development_manual.md)。

## 如何启动与部署

1. **配置环境变量**
   在根目录创建 `.env` 文件，配置你的 PostgreSQL 连接与初始化密钥：
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/finance"
   JWT_SECRET="your-super-secret-jwt-key"
   PWD_SALT="your-password-salt"
   INIT_SECRET="your-init-secret"
   # Email reminders (Resend) — optional; job no-ops if missing
   RESEND_API_KEY="re_xxx"
   RESEND_FROM="SK11-system <noreply@your-verified-domain.com>"
   REMINDER_EMAILS="you@example.com"
   CRON_SECRET="long-random-string"
   APP_BASE_URL="https://sk11finance.up.railway.app"
   # WhatsApp Cloud API（可選；見 docs/whatsapp-webhooks.md）
   WHATSAPP_VERIFY_TOKEN="your-verify-token"
   WHATSAPP_ACCESS_TOKEN="EAAB..."
   WHATSAPP_PHONE_NUMBER_ID="1234567890"
   WHATSAPP_APP_SECRET="your-app-secret"
   WHATSAPP_ALLOWED_PHONES="85291234567"
   # WHATSAPP_USER_MAP="85291234567:user-uuid"
   # WHATSAPP_REMINDER_PHONES="85291234567"
   ```

2. **安装依赖**
   ```bash
   npm ci
   ```

3. **数据库初始化与迁移**
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

4. **系统初始化与首次登录**
   - 首次部署后创建超级管理员：访问 `http://your-domain/api/init?secret=your-init-secret`（secret 需与 `.env` 一致）。默认超级管理员密码为 `admin`。
   - 访问 `/login` 登录后台修改密码及配置用户。

5. **到期邮件提醒（常驻 cron-worker，不依赖外部 Cron SaaS）**
   - Web 端点：`POST /api/cron/reminders`（`Authorization: Bearer $CRON_SECRET`）
   - 仓库内另有 [`cron-worker/`](./cron-worker/)：用 `node-cron` 每天（默认香港 09:00）请求上述端点
   - **Railway 第二台服务**（与网站同仓库）：
     1. Project 内 **New → Empty Service / GitHub Repo**（同一 `Sk11_finance` 仓库）
     2. Settings → **Root Directory** 设为 `cron-worker`（或 Dockerfile Path = `cron-worker/Dockerfile`）
     3. **不要**在网站服务或 worker 上填 Railway「Cron Schedule」（worker 靠 node-cron 常驻）
     4. Worker 环境变量（可与网站共享）：
        ```env
        APP_BASE_URL=https://sk11finance.up.railway.app
        CRON_SECRET=与网站相同
        CRON_EXPR=0 9 * * *
        CRON_TZ=Asia/Hong_Kong
        RUN_ON_START=true
        ```
        （`RUN_ON_START=true` 仅测试用，确认日志 OK 后可改回 `false`）
   - Resend 相关变量仍配在**网站**服务：`RESEND_API_KEY`、`RESEND_FROM`、`REMINDER_EMAILS`
   - 范围：全部合约 + 公开活动；触发：提前提醒日、到期前 5 天、到期当天、过期第 1/7/30 天

## 核心功能说明

- **账号 / 角色登录**：支持邮箱账号与角色白名单登录；管理员可维护用户资料。
- **高信息密度录入**：收入 / 支出双模板，附件前端压缩至约 `200KB` 以下。
- **审核流**：待审记录可查看附件（Blob 预览，避免 `data:` URL 被浏览器拦截）。
- **报表中心（管理员）**
  - 分页：收支报表 / 活动报表 / 合约报表
  - **汇出语文可选**：繁体中文或 English（仅影响 PDF / CSV / ZIP，不改变页面 UI 语言）
  - 收支：横向明细列表 PDF；会计结算包 ZIP（`00_凭証索引.csv` + `01` 正式 PDF + `02_凭証/` 可读文件名）
  - 活动 / 合约：可导出横向列表 PDF
- **薪金（Payroll）**：管理员结算、个人薪金查阅与 PDF 工资单
- **合约**：管理员维护；仅建立者可编辑/删除核心内容，其他管理员可加附件与备注
- **邮件提醒（Resend）**：按环境变量收件人发送合约/公开活动到期提醒
- **WhatsApp（可选）**：Webhook `/api/webhooks/whatsapp`；用户资料「联络电话」保存后自动绑定身份。互动路线见 [docs/whatsapp-interaction-roadmap.md](./docs/whatsapp-interaction-roadmap.md)；配置见 [docs/whatsapp-webhooks.md](./docs/whatsapp-webhooks.md)

## 技术栈

- **Next.js (App Router)**
- **Tailwind CSS**
- **Prisma + PostgreSQL**
- **jspdf, jspdf-autotable, jszip**（报表导出）
- **browser-image-compression**（前端图片压缩）
- **resend**（到期邮件提醒）

## 仓库

GitHub：https://github.com/11theridings-hk/Sk11_finance
