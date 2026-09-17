# FINNE18 Code Wiki

## 1. 文档目标

这套 Code Wiki 面向开发者、维护者和后续接手人员，用于快速理解本仓库的：

- 项目定位与技术栈
- 整体架构与数据流
- 页面与业务模块职责
- 关键 Server Actions 与核心函数
- Prisma 数据模型与模块依赖关系
- 开发、构建、部署与初始化方式

该仓库当前是一个基于 `Next.js 16 + App Router + Prisma + PostgreSQL` 的全栈财务系统，围绕“录入、审核、应收应付、归结单、报表导出、后台配置”构建。

## 2. 文档目录

- [01-架构总览](./01-architecture-overview.md)
- [02-模块与关键函数](./02-modules-and-key-functions.md)
- [03-核心业务流程](./03-core-workflows.md)
- [04-数据模型与依赖关系](./04-data-model-and-dependencies.md)
- [05-运行与部署说明](./05-runtime-and-deployment.md)

## 3. 项目速览

### 3.1 技术栈

- 前端框架：`Next.js 16.3.0`
- UI：`React 19`、`Tailwind CSS 4`
- 路由模式：`App Router`
- 服务端能力：`Server Actions`、`Route Handler`
- ORM：`Prisma 6`
- 数据库：`PostgreSQL`
- 认证：`JWT + HttpOnly Cookie`
- 导出：`jsPDF`、`jspdf-autotable`、`JSZip`

### 3.2 主要源码目录

```text
src/
  app/
    actions/         # 业务 Server Actions
    admin/           # 管理后台
    ar-ap/           # 应收/应付页面
    consolidated/    # 归结单页面
    login/           # 登录页
    report/          # 报表与导出
    review/          # 审核页
    api/init/        # 初始化管理员接口
    layout.tsx       # 根布局
    page.tsx         # 首页
  lib/
    prisma.ts        # Prisma 单例客户端
prisma/
  schema.prisma      # 数据模型定义
public/              # 静态资源与字体
```

### 3.3 页面导航

- `/login`：普通用户 / 管理员登录
- `/`：首页，负责录入记录、查看个人统计和最近记录
- `/ar-ap`：应收 / 应付跟进
- `/review`：管理员审核入口
- `/consolidated`：归结单 / 结单查看
- `/report`：查询报表、导出 PDF / Zip、发起修改申请
- `/admin`：分类、附件、资金池、用户管理
- `/api/init`：首次初始化管理员接口

## 4. 仓库结论摘要

### 4.1 架构结论

- 这是一个单体全栈应用，不是 monorepo。
- 页面层主要负责“数据预取 + 将初始数据传给 Client Component”。
- 业务逻辑主要集中在 `src/app/actions/*.ts`。
- 所有持久化逻辑最终都落在 Prisma 模型上。
- 审核、归结单、应收应付和报表构成系统核心业务闭环。

### 4.2 关键业务能力

- 无用户名白名单式密码登录
- 收入 / 支出 / 应收 / 应付记录录入
- 按资金池决定是否进入待审核状态
- 记录修改申请与管理员审核
- 归结单聚合与结单
- 报表筛选、汇总导出、带附件的会计明细打包导出
- 管理后台维护分类、资金池、用户与附件

### 4.3 需要注意的现状

- `README.md` 和 `development_manual.md` 中仍存在部分历史表述，尤其是数据库从 `SQLite` 迁移到 `PostgreSQL` 后的文档漂移。
- 当前最可信的运行依据应以代码与配置为准，而不是旧文档描述。
- Docker 镜像负责打包与运行应用，但当前并不会在容器启动时自动执行数据库迁移。

## 5. 推荐阅读顺序

### 5.1 首次接手项目

1. 阅读 `01-architecture-overview.md`
2. 阅读 `03-core-workflows.md`
3. 阅读 `05-runtime-and-deployment.md`

### 5.2 需要改业务逻辑

1. 阅读 `02-modules-and-key-functions.md`
2. 阅读 `03-core-workflows.md`
3. 阅读 `04-data-model-and-dependencies.md`

### 5.3 需要排查环境 / 部署问题

1. 阅读 `05-runtime-and-deployment.md`
2. 对照根目录 `package.json`、`Dockerfile`、`prisma/schema.prisma`

