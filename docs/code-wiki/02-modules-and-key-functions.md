# 02. 模块与关键函数

## 1. 模块总览

本仓库的核心代码集中在 `src/app/actions`、各页面目录和 `src/lib/prisma.ts`。

按职责可以分为以下模块：

- 认证与会话
- 记录录入与统计
- 分类管理
- 资金池管理
- 用户管理
- 应收 / 应付管理
- 归结单管理
- 报表查询与导出
- 审核与修改申请
- 系统初始化

## 2. 认证与会话

### 2.1 文件

- `src/app/actions/auth.ts`

### 2.2 模块职责

- 处理密码哈希
- 执行登录
- 签发和校验 JWT
- 维护 `session_token` Cookie
- 为所有页面和 Actions 提供会话恢复能力

### 2.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `hashPassword(password)` | 对密码进行 SHA-256 + salt 哈希 | 登录和创建用户都依赖它 |
| `login(password, isAdminLogin)` | 登录入口 | 兼容旧明文密码并自动升级为哈希 |
| `performLogin(user, isAdminLogin)` | 签发会话 | 内部函数，生成 JWT 并写 Cookie |
| `logout()` | 退出登录 | 删除 `session_token` |
| `getSession()` | 恢复当前会话 | 验证 JWT 后再查库确认用户仍存在 |

### 2.4 维护提示

- 任何涉及权限的新增 Action 都应继续复用 `getSession()`
- `JWT_SECRET` 和 `PWD_SALT` 虽然有默认值，但生产环境必须显式配置

## 3. 记录录入与统计

### 3.1 文件

- `src/app/actions/record.ts`
- `src/app/page.tsx`
- `src/app/HomePageClient.tsx`

### 3.2 模块职责

- 创建收入 / 支出 / 应收 / 应付记录
- 计算首页统计卡片
- 查询最近记录
- 查询附件列表
- 决定一条记录是否需要进入审核流程
- 在可直接生效时更新资金池余额

### 3.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `createRecord(data)` | 核心入账函数 | 负责审核判断、归结单处理、附件落库、余额更新 |
| `getUserStats(userId)` | 获取用户统计 | 分别统计 HKD / RMB 的现金流、应收、应付 |
| `getRecentRecords(userId?)` | 查询最近 10 条记录 | 普通用户默认只看自己 |
| `getAttachments()` | 附件列表 | 管理后台附件页的数据来源 |

### 3.4 `HomePageClient` 关键职责

| 位置 | 作用 |
| --- | --- |
| `compressImage()` | 前端压缩图片至约 200KB 内 |
| `generateOrderNo()` | 生成默认 10 位归结单号 |
| `handleAddCategory()` | 直接从录入页面新增分类 |
| `executeSubmit()` | 组装表单数据并调用 `createRecord()` |

### 3.5 维护提示

- 任何改变资金池余额的逻辑都要和 `review.ts` 联动核对
- `createRecord()` 是录入主入口，修改业务规则优先从这里入手

## 4. 分类管理

### 4.1 文件

- `src/app/actions/category.ts`

### 4.2 模块职责

- 查询分类树与平铺分类列表
- 创建主分类和子分类
- 删除分类时兜底到“未分类”

### 4.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `getCategories()` | 查询主分类及 children | 首页和后台分类管理使用 |
| `getFlatCategories()` | 查询平铺列表 | 报表和修改弹窗使用 |
| `ensureUncategorized()` | 确保存在“未分类” | 删除分类时的兜底逻辑 |
| `createCategory(name, parentId, type)` | 创建分类 | 子分类自动继承父分类类型 |
| `updateCategory(id, name, type)` | 更新分类 | 当前后台 UI 实际几乎未使用 |
| `deleteCategory(id)` | 删除分类 | 迁移关联记录并处理子分类层级 |

### 4.4 维护提示

- 删除分类不是简单删除，必须保留记录可追溯性
- 若未来要扩展三级分类，当前自关联模型和 UI 都需要同步调整

## 5. 资金池管理

### 5.1 文件

- `src/app/actions/pool.ts`

### 5.2 模块职责

- 查询用户可见资金池
- 创建 / 更新 / 删除资金池
- 支持公共池、专属池、审核池三种概念

### 5.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `getCapitalPools(userId?)` | 查询资金池 | 普通用户看到自己的、审核池、公共池 |
| `createCapitalPool(name, userId, isReviewRequired)` | 创建资金池 | 后台使用 |
| `updateCapitalPool(id, name, userId, isReviewRequired)` | 更新资金池 | 已预留，当前 UI 基本未使用 |
| `deleteCapitalPool(id)` | 删除资金池 | 有关联记录时禁止删除 |

### 5.4 维护提示

- `isReviewRequired` 会直接影响录入时是否进入待审状态
- 对资金池可见性规则的修改会影响首页、后台和审核流

## 6. 用户管理

### 6.1 文件

- `src/app/actions/user.ts`

### 6.2 模块职责

- 管理白名单用户
- 控制管理员身份
- 启用 / 禁用用户专属资金池

### 6.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `getUsers()` | 获取用户列表 | 管理员看全部，普通用户只看自己 |
| `createUser(data)` | 创建用户 | 自动哈希密码 |
| `updateUser(id, data)` | 更新用户 | 若角色名变化且开启专属池，会同步池名 |
| `deleteUser(id)` | 删除用户 | 后台操作 |
| `toggleUserPool(id, enabled)` | 开关专属资金池 | 开启时自动创建同名池 |

### 6.4 维护提示

- 当前登录模型是“密码即身份凭证”，并没有用户名字段
- 若未来要改为账号密码模式，`User` 模型与 `login()` 都要调整

## 7. 应收 / 应付管理

### 7.1 文件

- `src/app/actions/arap.ts`
- `src/app/ar-ap/ARAPClient.tsx`

### 7.2 模块职责

- 查询 AR / AP 列表
- 修改 AR / AP 金额
- 追加跟进日志

### 7.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `getARAPRecords()` | 查询应收 / 应付记录 | 包含备注日志和创建人 |
| `updateARAPAmount(id, amount)` | 修改金额 | 同时写入 remark log |
| `addRemarkLog(recordId, content)` | 添加跟进备注 | 普通用户只能操作自己的记录 |

### 7.4 维护提示

- 应收 / 应付记录也存放在 `Record` 表中，只是 `type` 不同
- 跟进日志使用独立的 `RemarkLog` 表，不写回 `Record.note`

## 8. 归结单管理

### 8.1 文件

- `src/app/actions/order.ts`
- `src/app/consolidated/ConsolidatedClient.tsx`

### 8.2 模块职责

- 查询开放 / 已结归结单
- 聚合归结单下的所有记录
- 管理员结单

### 8.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `getOpenOrders()` | 查询开放归结单 | 普通用户只看自己参与的单 |
| `closeOrder(id)` | 结单 | 仅管理员可用 |
| `getClosedOrders()` | 查询已结单 | 用于归结单页面的“结单”标签页 |

### 8.4 维护提示

- 归结单创建逻辑并不在 `order.ts`，而是在 `createRecord()` 中隐式触发
- 若后续要加入“删单 / 改单号”功能，需要同时修改录入流和查询流

## 9. 报表与导出

### 9.1 文件

- `src/app/actions/report.ts`
- `src/app/report/ReportClient.tsx`

### 9.2 模块职责

- 按条件查询已审批生效的记录
- 导出总览 PDF
- 导出逐条会计明细 Zip
- 发起收支记录修改申请

### 9.3 关键函数

| 函数 / 方法 | 作用 | 说明 |
| --- | --- | --- |
| `getReportRecords(filter)` | 查询报表数据 | 仅返回 `APPROVED` 记录 |
| `handleSearch()` | 客户端筛选查询 | 组装时间、分类、角色、币种条件 |
| `exportListPdf()` | 导出汇总 PDF | 带统计摘要和明细表格 |
| `exportAccountingPdfs()` | 导出会计明细 Zip | 对每条记录单独生成 PDF |
| `handleEditClick()` / `submitEdit()` | 发起修改申请 | 通过 `requestModifyRecord()` 提交 |

### 9.4 维护提示

- 导出逻辑主要在客户端实现，不在服务端
- 中文 PDF 渲染依赖 `public/fonts/NotoSansSC-Regular.ttf`

## 10. 审核与修改申请

### 10.1 文件

- `src/app/actions/review.ts`
- `src/app/actions/modify.ts`
- `src/app/review/ReviewClient.tsx`

### 10.2 模块职责

- 统计待审核数量
- 查询待审 / 已审记录
- 审批普通录入记录
- 审批“记录修改申请”

### 10.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `getPendingReviewCount()` | 查询待审数量 | 顶部导航红点来源 |
| `getReviewRecords(status)` | 查询审核列表 | `PENDING` / `APPROVED` / `REJECTED` |
| `reviewRecord(id, action)` | 审核核心入口 | 处理通过、驳回、余额回滚、替换原记录 |
| `requestModifyRecord(originalId, data)` | 提交修改申请 | 创建待审副本并锁定原记录 |

### 10.4 维护提示

- `reviewRecord()` 是全项目业务复杂度最高的函数之一
- 任何对“修改申请”逻辑的调整都必须验证：
  - 原记录是否正确回滚
  - 新记录是否正确替换
  - 资金池余额是否一致
  - `isReviewing` 是否被正确恢复

## 11. 初始化模块

### 11.1 文件

- `src/app/actions/initAdmin.ts`
- `src/app/api/init/route.ts`

### 11.2 模块职责

- 首次部署时创建默认管理员
- 通过带密钥的 HTTP 接口触发初始化

### 11.3 关键函数

| 函数 | 作用 | 说明 |
| --- | --- | --- |
| `initAdmin()` | 创建默认管理员 | 仅当当前不存在管理员时执行 |
| `GET /api/init` | 初始化入口 | 使用 `INIT_SECRET` 保护 |

## 12. 页面组件职责速查

| 组件 | 作用 |
| --- | --- |
| `TopNav.tsx` | 全站顶部导航与待审数展示 |
| `HomePageClient.tsx` | 首页录入与最近记录视图 |
| `AdminTabs.tsx` | 管理后台四大标签页 |
| `ARAPClient.tsx` | 应收 / 应付列表与跟进弹窗 |
| `ConsolidatedClient.tsx` | 归结单列表、统计、结单弹窗 |
| `ReportClient.tsx` | 报表查询、导出、修改申请 |
| `ReviewClient.tsx` | 待审 / 已审切换与审批操作 |

