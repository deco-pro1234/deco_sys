# 04. 数据模型与依赖关系

## 1. 数据模型总览

项目使用 Prisma 管理数据库模型，当前数据源为 `PostgreSQL`。

核心模型包括：

- `User`
- `Category`
- `CapitalPool`
- `ConsolidatedOrder`
- `Record`
- `RemarkLog`
- `Attachment`

其中最核心的业务中心是 `Record`，它连接了用户、分类、资金池、归结单和修改审核链路。

## 2. 模型关系图

```text
User
  -> Record[]
  -> Attachment[]
  -> CapitalPool[]
  -> RemarkLog[]

Category
  -> parent Category?
  -> children Category[]
  -> Record[] as category
  -> Record[] as subCategory
  -> Attachment[]

CapitalPool
  -> User?
  -> Record[]

ConsolidatedOrder
  -> Record[]

Record
  -> User
  -> Category
  -> SubCategory?
  -> CapitalPool?
  -> ConsolidatedOrder?
  -> original Record?
  -> modifications[]
  -> RemarkLog[]

RemarkLog
  -> Record
  -> User

Attachment
  -> User(uploader)
  -> Category?
```

## 3. 模型说明

### 3.1 `User`

#### 字段重点

- `password`：唯一登录凭证，当前系统无用户名字段
- `roleName`：页面展示的角色名
- `isAdmin`：是否为管理员
- `poolEnabled`：是否启用专属资金池

#### 业务意义

- 同时承担“身份”和“业务角色名”的概念
- 专属资金池与用户是一对多关系，但后台逻辑一般只会维持一个主专属池

### 3.2 `Category`

#### 字段重点

- `name`：分类名称
- `type`：`INCOME` 或 `EXPENSE`
- `parentId`：支持两级分类结构

#### 业务意义

- 首页录入使用树状分类
- 报表与修改弹窗使用平铺分类
- 删除分类时依赖“未分类”兜底

### 3.3 `CapitalPool`

#### 字段重点

- `name`：资金池名称
- `balanceHkd` / `balanceRmb`：双币种余额
- `userId`：可选，表示专属资金池归属
- `isReviewRequired`：是否为审核账户

#### 业务意义

- 普通收支记录会挂到某个资金池
- 如果选中的池是审核账户，录入会进入待审

### 3.4 `ConsolidatedOrder`

#### 字段重点

- `orderNo`：唯一归结单号
- `status`：`OPEN` / `CLOSED`
- `closedAt`：结单时间

#### 业务意义

- 用于把多条记录聚合成一张归结单
- 一旦结单，不能继续追加记录

### 3.5 `Record`

#### 字段重点

- `type`：`INCOME` / `EXPENSE` / `AR` / `AP`
- `status`：`PENDING` / `APPROVED` / `REJECTED`
- `date`：业务日期
- `executionDate`：AR / AP 的执行期限
- `currency`：`HKD` / `RMB`
- `amount`：正负号由业务语义决定
- `attachmentUrl`：当前直接存 Data URL 或路径字符串
- `originalRecordId`：修改申请时指向原记录
- `isReviewing`：原记录是否处于修改待审状态

#### 业务意义

- 全系统的核心事实表
- 收支、应收、应付都在这张表中表达
- 审核流、修改流、归结单流都围绕它展开

### 3.6 `RemarkLog`

#### 字段重点

- `content`：日志内容
- `recordId`：所属 AR / AP 记录
- `userId`：备注添加者

#### 业务意义

- 主要用于应收 / 应付的跟进历史
- 与 `Record.note` 的“单次备注”不同，它是时间线型记录

### 3.7 `Attachment`

#### 字段重点

- `fileUrl`：附件内容或路径
- `size`：文件大小
- `uploaderId`：上传用户
- `categoryId`：所属分类

#### 业务意义

- 当前主要服务于首页录入和报表导出
- 报表导出会尝试把图片附件嵌入单条 PDF

## 4. 核心数据约束

### 4.1 业务约束

- `User.password` 唯一，因此系统不允许多个用户共用相同密码
- `ConsolidatedOrder.orderNo` 唯一，保证一张归结单只有一个编号
- `Record.poolId` 对 AR / AP 可为空，对普通收支通常应有值
- `Record.originalRecordId` 仅在“修改申请副本”场景中使用

### 4.2 逻辑约束

- 余额只对已批准的收入 / 支出记录生效
- AR / AP 记录不直接修改资金池余额
- 修改申请通过时，本质是“替换旧记录并调整旧影响”

## 5. 模块依赖关系

### 5.1 直接依赖图

```text
pages / client components
  -> actions/*
     -> actions/auth.ts
     -> prisma.ts
        -> Prisma Client
           -> PostgreSQL
```

### 5.2 Actions 依赖关系

| 模块 | 依赖 | 说明 |
| --- | --- | --- |
| `record.ts` | `auth.ts` `prisma.ts` `next/cache` | 首页录入主逻辑 |
| `report.ts` | `auth.ts` `prisma.ts` | 报表筛选查询 |
| `review.ts` | `auth.ts` `prisma.ts` `next/cache` | 审核与余额调整 |
| `modify.ts` | `auth.ts` `prisma.ts` `next/cache` | 修改申请 |
| `arap.ts` | `auth.ts` `prisma.ts` `next/cache` | AR / AP 跟进 |
| `category.ts` | `auth.ts` `prisma.ts` `next/cache` | 分类管理 |
| `pool.ts` | `auth.ts` `prisma.ts` `next/cache` | 资金池管理 |
| `user.ts` | `auth.ts` `prisma.ts` `next/cache` | 用户管理 |
| `order.ts` | `auth.ts` `prisma.ts` `next/cache` | 归结单管理 |
| `initAdmin.ts` | `auth.ts` `prisma.ts` | 默认管理员初始化 |

### 5.3 页面到模块依赖

| 页面 / 组件 | 主要依赖 |
| --- | --- |
| `layout.tsx` | `auth.ts` `review.ts` `TopNav.tsx` |
| `page.tsx` | `auth.ts` `record.ts` `category.ts` `pool.ts` `order.ts` |
| `HomePageClient.tsx` | `record.ts` `category.ts` |
| `AdminTabs.tsx` | `category.ts` `pool.ts` `user.ts` |
| `ReportClient.tsx` | `report.ts` `modify.ts` `jsPDF` `JSZip` |
| `ReviewClient.tsx` | `review.ts` |
| `ARAPClient.tsx` | `arap.ts` |
| `ConsolidatedClient.tsx` | `order.ts` |

## 6. 外部依赖与用途

### 6.1 框架与基础设施

| 依赖 | 用途 |
| --- | --- |
| `next` | 应用框架、App Router、Server Actions、Route Handler |
| `react` / `react-dom` | 组件与交互 |
| `typescript` | 类型系统 |
| `eslint` / `eslint-config-next` | 代码检查 |

### 6.2 数据与认证

| 依赖 | 用途 |
| --- | --- |
| `@prisma/client` | Prisma 运行时客户端 |
| `prisma` | Schema、迁移和生成客户端 |
| `jose` | JWT 签发与校验 |
| Node `crypto` | 密码哈希 |

### 6.3 UI 与前端能力

| 依赖 | 用途 |
| --- | --- |
| `tailwindcss` | 样式系统 |
| `@tailwindcss/postcss` | Tailwind PostCSS 集成 |
| `lucide-react` | 图标，当前实际使用不多 |
| `@fontsource/noto-sans-sc` | 中文字体资源补充 |

### 6.4 导出与多媒体

| 依赖 | 用途 |
| --- | --- |
| `jspdf` | PDF 导出 |
| `jspdf-autotable` | PDF 表格 |
| `jszip` | 批量打包 Zip |
| `html2canvas` | 预留截图能力，当前主流程中未见明显使用 |
| `browser-image-compression` | 设计上用于压缩图片，但当前首页实际使用的是自定义 canvas 压缩 |
| `@react-pdf/renderer` | 已安装，当前主流程未见直接使用 |
| `date-fns` | 已安装，当前源码使用较少 |

## 7. 关键耦合点

### 7.1 余额耦合

以下模块共同影响资金池余额：

- `record.ts`
- `review.ts`

任何修改都要验证：

- 新增时是否重复入账
- 审核通过时是否漏入账
- 修改申请通过时是否先回滚旧值再应用新值

### 7.2 会话耦合

以下模块共同依赖 `getSession()`：

- 所有页面入口
- 大多数 `actions/*.ts`
- 根布局 `layout.tsx`

这意味着认证机制变化会影响全站。

### 7.3 分类耦合

以下模块共同依赖分类结构：

- 首页录入
- 报表筛选
- 修改申请
- 后台分类管理

如果分类层级或类型策略改变，这四处都需要联动验证。

### 7.4 归结单耦合

归结单逻辑分散在两个地方：

- `record.ts`：创建 / 关联归结单
- `order.ts`：查询 / 结单

这意味着它不是一个完全内聚的独立模块，维护时要横向检查。

## 8. 可维护性观察

### 8.1 当前优点

- 依赖层次简单，路径易追踪
- Actions 职责总体清晰
- Prisma 模型较集中，业务对象边界明确

### 8.2 当前问题

- 若干依赖已安装但未充分使用，存在历史残留
- 某些业务逻辑分散在不同模块，尤其是归结单和审核
- 一些类型仍使用 `any`，不利于长期维护

## 9. 建议的阅读路径

### 9.1 从业务到数据库

1. 先读页面组件
2. 再读对应 Action
3. 最后读 `schema.prisma`

### 9.2 从数据库到业务

1. 先读 `Record`、`CapitalPool`、`ConsolidatedOrder`
2. 再看 `record.ts`、`review.ts`、`modify.ts`
3. 最后看 `HomePageClient.tsx`、`ReviewClient.tsx`、`ReportClient.tsx`
