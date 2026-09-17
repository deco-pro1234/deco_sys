# 03. 核心业务流程

## 1. 流程总览

本系统最重要的业务链路有 6 条：

1. 登录与会话恢复
2. 新增收支记录
3. 新增应收 / 应付记录
4. 记录修改申请与审核
5. 归结单聚合与结单
6. 报表查询与导出

## 2. 登录与会话恢复

### 2.1 目标

- 用户通过密码直接登录
- 管理员额外需要满足 `isAdmin=true`
- 登录后通过 Cookie 维持会话

### 2.2 流程

```text
LoginPage 提交密码
  -> login(password, isAdminLogin)
    -> hashPassword(password)
    -> prisma.user.findUnique({ password: hashed })
    -> 如不存在则尝试 legacy 明文密码
    -> performLogin()
      -> SignJWT
      -> cookies().set('session_token')
```

### 2.3 关键规则

- 当前系统没有用户名字段，密码本身就是登录凭证
- 普通登录与管理员登录共用同一个函数
- 管理员登录只是比普通登录多一层 `isAdmin` 检查
- `getSession()` 每次都会在验签后再查一次数据库，避免用户被删除后旧 token 仍然有效

## 3. 新增收支记录

### 3.1 目标

- 支持录入收入 / 支出
- 支持上传一张附件图片
- 可绑定资金池
- 可绑定归结单
- 根据资金池配置决定是否进入待审

### 3.2 前端流程

```text
HomePageClient
  -> 填写日期、分类、金额、资金池、备注
  -> 可选上传图片
  -> 5 秒确认倒计时
  -> executeSubmit()
```

### 3.3 服务端流程

```text
createRecord(data)
  -> getSession()
  -> 判断 poolId 对应资金池是否为审核账户
  -> 处理归结单：
       若传 orderNo 且不存在则创建 ConsolidatedOrder
       若已存在且已关闭则拒绝写入
  -> 创建 Record
  -> 如有附件则创建 Attachment
  -> 若 status=APPROVED 且是收入/支出，则更新 CapitalPool 余额
  -> 刷新首页/报表/后台/归结单/应收应付页面缓存
```

### 3.4 关键规则

- 支出在前端转换为负数，收入转换为正数
- 审核账户下的收入 / 支出记录初始状态为 `PENDING`
- 非审核账户下的收入 / 支出记录初始状态为 `APPROVED`
- 归结单已结单时不可追加记录

## 4. 新增应收 / 应付记录

### 4.1 目标

- 在首页切换模式后录入 AR / AP
- 不依赖资金池
- 支持后续金额跟进与备注

### 4.2 流程

```text
HomePageClient 切换应收/付模式
  -> type=INCOME 映射为 AR
  -> type=EXPENSE 映射为 AP
  -> createRecord()
```

### 4.3 关键规则

- AR / AP 仍然存放在 `Record` 表中
- AR / AP 不通过资金池入账
- AR / AP 当前默认直接 `APPROVED`
- 后续变更在 `/ar-ap` 页面通过 `updateARAPAmount()` 和 `addRemarkLog()` 完成

## 5. 应收 / 应付跟进流程

### 5.1 查询流程

```text
/ar-ap 页面加载
  -> getSession()
  -> getARAPRecords()
  -> 返回 AR/AP 记录及其 remarkLogs
```

### 5.2 跟进流程

```text
点击某条 AR/AP 记录
  -> 打开详情弹窗
  -> 可修改金额
    -> updateARAPAmount()
      -> 校验本人或管理员权限
      -> 更新 Record.amount
      -> 写入 RemarkLog
  -> 可追加备注
    -> addRemarkLog()
```

### 5.3 关键规则

- 修改金额会保留一条文字化跟进日志
- 普通用户只能操作自己的 AR / AP
- 管理员可以查看和处理所有 AR / AP

## 6. 记录修改申请与审核

### 6.1 场景

- 已生效的收入 / 支出记录需要修改
- 不能直接覆盖原记录，必须经过管理员审核

### 6.2 提交流程

```text
报表页点击“修改”
  -> 打开编辑弹窗
  -> submitEdit()
  -> requestModifyRecord(originalId, data)
    -> 校验原记录归属
    -> 若原记录 isReviewing=true，则拒绝重复申请
    -> 原记录标记 isReviewing=true
    -> 创建一条新的 PENDING Record
       originalRecordId = 原记录 ID
```

### 6.3 审批通过流程

```text
管理员 reviewRecord(id, 'APPROVE')
  -> 查询待审记录
  -> 若 originalRecordId 存在，表示“修改申请”
  -> 撤销原记录对资金池的影响
  -> 应用新记录对资金池的影响
  -> 用待审记录内容覆盖原记录
  -> 原记录 isReviewing=false
  -> 删除待审副本
```

### 6.4 审批驳回流程

```text
管理员 reviewRecord(id, 'REJECT')
  -> 若是修改申请：
       原记录 isReviewing=false
  -> 将待审记录标记为 REJECTED
```

### 6.5 关键风险点

- 余额回滚与重新施加必须成对出现
- 原记录与待审副本的关系依赖 `originalRecordId`
- 驳回时必须清掉原记录的“正在审核中”状态

## 7. 普通待审记录审核

### 7.1 场景

- 某条收入 / 支出提交到审核账户下
- 管理员决定是否使其真正生效

### 7.2 审批流程

```text
管理员 reviewRecord(id, action)
  -> 若无 originalRecordId，表示普通新增待审
  -> APPROVE:
       Record.status = APPROVED
       更新 CapitalPool 余额
  -> REJECT:
       Record.status = REJECTED
```

### 7.3 关键规则

- 只有收入 / 支出会影响资金池余额
- 审核通过后才真正入账

## 8. 归结单聚合与结单

### 8.1 归结单创建

归结单不是后台独立创建，而是在录入记录时自动处理：

```text
createRecord(data.orderNo)
  -> 查询是否已有该 orderNo
  -> 无则创建 ConsolidatedOrder(status=OPEN)
  -> 有则复用
  -> 若已 CLOSED，则拒绝追加
```

### 8.2 查看流程

```text
/consolidated 页面
  -> getOpenOrders()
  -> getClosedOrders()
  -> ConsolidatedClient 展示归单 / 结单标签页
```

### 8.3 结单流程

```text
管理员点击“结单”
  -> closeOrder(id)
    -> 校验管理员权限
    -> status=OPEN -> CLOSED
    -> 写 closedAt
```

### 8.4 关键规则

- 普通用户只能看到自己参与过的归结单
- 结单后不能继续追加记录
- 归结单页面会统计各单下 HKD / RMB 的收入、支出、应收、应付与小计

## 9. 报表查询与导出

### 9.1 查询流程

```text
ReportClient 设置筛选条件
  -> handleSearch()
  -> getReportRecords(filter)
    -> 默认只查 APPROVED 记录
    -> 普通用户只能查自己的
    -> 管理员可按 userId 过滤
    -> 分类过滤会自动包含其子分类
```

### 9.2 导出汇总 PDF

```text
点击“导出明细列表-PDF”
  -> exportListPdf()
    -> 计算 HKD/RMB 收支与 AR/AP 汇总
    -> 生成总览页
    -> 生成明细表页
    -> 下载 PDF
```

### 9.3 导出会计明细 Zip

```text
点击“导出会计明细-PDF (Zip)”
  -> exportAccountingPdfs()
    -> 遍历查询结果
    -> 每条记录生成一个 PDF
    -> 若有 data:image 附件则嵌入 PDF
    -> 用 JSZip 打包为 zip 下载
```

### 9.4 关键规则

- 报表口径只包含 `APPROVED` 记录
- 导出是客户端行为，不依赖后端生成文件
- 中文字体加载依赖 `public/fonts/NotoSansSC-Regular.ttf`

## 10. 管理后台流程

### 10.1 分类管理

- 新增主分类 / 子分类
- 删除分类时自动迁移关联记录到“未分类”

### 10.2 资金池管理

- 新增公共池或指定用户专属池
- 可设置审核账户
- 有关联记录时禁止删除资金池

### 10.3 用户管理

- 创建白名单用户
- 可赋予管理员身份
- 可启用 / 禁用专属资金池
- 启用时自动创建以角色名命名的资金池

## 11. 初始化流程

### 11.1 首次部署

```text
访问 /api/init?secret=INIT_SECRET
  -> route.ts 校验 secret
  -> initAdmin()
    -> 若当前没有管理员
    -> 创建默认管理员
```

### 11.2 关键规则

- 默认管理员密码是 `admin`
- 只在“没有管理员”的情况下生效
- 属于一次性初始化入口，不参与日常业务流程

