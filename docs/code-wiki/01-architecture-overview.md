# 01. 架构总览

## 1. 项目定位

FINNE18 是一个移动端优先的财务记录系统，核心对象包括：

- 用户与管理员
- 分类与子分类
- 资金池
- 财务记录
- 应收 / 应付记录
- 归结单
- 审核记录
- 报表与导出结果

系统并不是传统前后端分离结构，而是基于 Next.js 的“同仓全栈”模式实现，页面、服务端逻辑和数据库访问都在同一个代码库中。

## 2. 整体分层

### 2.1 分层结构

```text
Browser / Client Component
  -> App Router Page / Layout
    -> Server Actions / Route Handler
      -> Prisma Client
        -> PostgreSQL
```

### 2.2 各层职责

- Client Component：负责交互、表单、弹窗、筛选、导出触发
- Server Component / Page：负责登录校验、初始数据装配、页面级路由控制
- Server Actions：负责业务规则、权限判断、事务、缓存刷新
- Prisma：负责数据库查询与事务
- PostgreSQL：负责最终持久化

## 3. 目录架构

### 3.1 根目录

```text
/
  README.md
  development_manual.md
  package.json
  next.config.ts
  Dockerfile
  prisma/
  public/
  src/
  docs/code-wiki/
```

### 3.2 `src/app` 目录

- `layout.tsx`：全局布局、顶部导航、管理员待审计数
- `page.tsx`：首页服务端入口
- `TopNav.tsx`：顶部导航栏
- `actions/`：所有核心业务 Action
- `login/`：登录页
- `admin/`：管理后台
- `review/`：审核页
- `report/`：报表页
- `ar-ap/`：应收 / 应付页
- `consolidated/`：归结单页
- `api/init/`：初始化超级管理员接口

### 3.3 `prisma` 与 `src/lib`

- `prisma/schema.prisma`：系统核心数据模型定义
- `src/lib/prisma.ts`：Prisma 单例客户端，避免开发环境重复创建连接

## 4. 路由与页面结构

| 路由 | 页面职责 | 关键依赖 |
| --- | --- | --- |
| `/login` | 登录并建立会话 | `actions/auth.ts` |
| `/` | 统计、录入记录、查看最近记录、关联归结单 | `record.ts` `category.ts` `pool.ts` `order.ts` |
| `/ar-ap` | 查看和跟进应收 / 应付 | `arap.ts` |
| `/review` | 管理员审核待审记录与修改申请 | `review.ts` |
| `/consolidated` | 查看归结单、结单 | `order.ts` |
| `/report` | 查询报表、导出 PDF / Zip、提交修改申请 | `report.ts` `modify.ts` |
| `/admin` | 管理分类、附件、资金池、用户 | `category.ts` `record.ts` `pool.ts` `user.ts` |
| `/api/init` | 初始化管理员 | `initAdmin.ts` |

## 5. 运行时页面装配方式

### 5.1 典型模式

本项目多数页面都采用如下模式：

1. 在服务端页面中调用 `getSession()` 进行登录判断
2. 按页面需要预取初始数据
3. 将数据作为 props 传给 Client Component
4. Client Component 通过 Server Actions 完成后续交互

### 5.2 首页示例

- `src/app/page.tsx` 先检查登录状态
- 然后并行获取：
  - 用户统计
  - 最近记录
  - 分类树
  - 可见资金池
  - 当前开放归结单
- 最后把这些数据传给 `HomePageClient`

这说明首页本质上是：

- 服务端负责“数据组装”
- 客户端负责“交互与提交”

## 6. 核心数据流

### 6.1 登录流

```text
用户输入密码
  -> login()
    -> hashPassword()
    -> Prisma 查询 User
    -> 签发 JWT
    -> 写入 session_token Cookie
    -> 后续页面通过 getSession() 恢复身份
```

### 6.2 录入收支流

```text
HomePageClient 表单提交
  -> createRecord()
    -> getSession()
    -> 判断是否需要审核
    -> 处理归结单
    -> 写入 Record
    -> 如有附件则写入 Attachment
    -> 若直接生效则更新 CapitalPool 余额
    -> revalidatePath()
```

### 6.3 修改申请流

```text
报表页点击“修改”
  -> requestModifyRecord()
    -> 原记录标记 isReviewing=true
    -> 创建一条 status=PENDING 的副本
  -> 管理员 reviewRecord()
    -> 审批通过：替换原记录并修正资金池余额
    -> 审批驳回：恢复原记录状态
```

### 6.4 报表导出流

```text
ReportClient 查询
  -> getReportRecords()
    -> 只返回 APPROVED 记录
ReportClient 客户端导出
  -> jsPDF 生成汇总 PDF
  -> JSZip + jsPDF 逐条生成会计明细 PDF 并打包
```

## 7. 权限模型

### 7.1 权限角色

- 普通用户
- 管理员

### 7.2 权限边界

- 普通用户：
  - 登录首页
  - 录入自己的记录
  - 查看自己的报表
  - 查看自己的应收 / 应付
  - 发起自己的记录修改申请
- 管理员：
  - 拥有普通用户能力
  - 审核待审记录
  - 管理分类、资金池、用户
  - 查看所有用户数据
  - 结单归结单

### 7.3 权限实现方式

- 页面入口用 `getSession()` 做服务端重定向控制
- Actions 内部再次做权限判断，防止仅靠前端限制
- 多数“仅管理员可调用”的函数都封装了 `checkAdmin()`

## 8. 动态渲染策略

根布局和首页都显式使用了动态渲染：

- `layout.tsx`：`export const dynamic = "force-dynamic"`
- `page.tsx`：`export const dynamic = 'force-dynamic'`

原因是：

- 页面依赖实时会话
- 页面依赖数据库动态数据
- 构建阶段不能安全地静态预渲染这些页面

## 9. 设计特征总结

### 9.1 优点

- 同仓全栈，理解成本低
- Action 集中，业务规则可追踪
- 数据模型清晰，核心关系集中在 Prisma
- 页面按业务切分明显，维护路径直观

### 9.2 维护重点

- `actions` 层是第一优先级理解对象
- `Record`、`CapitalPool`、`ConsolidatedOrder` 之间的关系最关键
- 审核与修改申请共享同一审批入口，改动时必须关注余额回滚 / 重算逻辑
