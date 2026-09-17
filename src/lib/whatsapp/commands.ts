import { actorCanUsePublicLedger, type WhatsAppActor } from './identity'
import {
  clearPendingAction,
  getPendingAction,
  setPendingAction,
  type PendingLedgerDraft,
} from './pending'
import {
  createPublicLedgerForWhatsApp,
  getMonthSummaryAdmin,
  getRecentRecordsForUser,
  listPools,
  listTopCategories,
  resolveCategoryPath,
  resolveDefaultPool,
} from './ledger'
import { collectWhatsAppReminders, formatRemindersMessage } from './reminders'

function helpText(actor: WhatsAppActor) {
  const lines = [
    `你好，${actor.roleName} 👋`,
    '可用指令：',
    '',
    '• 幫助',
    '• 提醒　→ 合約／事項／恆常到期一覽',
    '• 最近　→ 你最近的公帳紀錄',
    '• 分類　→ 列出常用分類',
    '• 資金池',
  ]

  if (actor.isAdmin) {
    lines.push('• 報表　→ 本月收支摘要（管理員）')
  }

  if (actorCanUsePublicLedger(actor)) {
    lines.push(
      '',
      '公帳入數（需回覆「確認」）：',
      '• 公帳 支 120 餐飲 午餐',
      '• 公帳 收 5000 租金',
      '• 公帳 支出 88.5 交通 的士 @公司戶',
      '',
      '格式：公帳 <收|支> <金額> [分類] [備註…] [@資金池]',
    )
  }

  lines.push('', '取消待確認：取消')
  return lines.join('\n')
}

function parseLedgerCommand(text: string): {
  type: 'INCOME' | 'EXPENSE'
  amountAbs: number
  categoryHint?: string
  note?: string
  poolHint?: string
} | null {
  // 公帳 支/支出/收/收入 金額 [分類] [備註...] [@資金池]
  const m = text.match(
    /^公帳\s*(支|支出|收|收入)\s*([\d]+(?:\.\d{1,2})?)\s*(.*)$/i,
  )
  if (!m) return null

  const type: 'INCOME' | 'EXPENSE' =
    m[1] === '收' || m[1] === '收入' ? 'INCOME' : 'EXPENSE'
  const amountAbs = Number(m[2])
  if (!Number.isFinite(amountAbs) || amountAbs <= 0) return null

  let rest = (m[3] || '').trim()
  let poolHint: string | undefined
  const atIdx = rest.lastIndexOf('@')
  if (atIdx >= 0) {
    poolHint = rest.slice(atIdx + 1).trim() || undefined
    rest = rest.slice(0, atIdx).trim()
  }

  const parts = rest.split(/\s+/).filter(Boolean)
  const categoryHint = parts[0]
  const note = parts.slice(1).join(' ') || undefined

  return { type, amountAbs, categoryHint, note, poolHint }
}

async function handleConfirm(actor: WhatsAppActor): Promise<string> {
  const pending = await getPendingAction(actor.phoneE164)
  if (!pending || pending.kind !== 'ledger') {
    return '沒有待確認的公帳入數。可傳送「幫助」查看指令。'
  }
  if (pending.userId !== actor.userId) {
    await clearPendingAction(actor.phoneE164)
    return '待確認資料與目前用戶不符，已清除。請重新輸入。'
  }

  const { record, status, amount } = await createPublicLedgerForWhatsApp({
    actor,
    type: pending.type,
    amountAbs: Math.abs(pending.amount),
    categoryId: pending.categoryId,
    subCategoryId: pending.subCategoryId,
    thirdCategoryId: pending.thirdCategoryId,
    poolId: pending.poolId,
    note: pending.note,
    date: new Date(pending.dateIso),
  })
  await clearPendingAction(actor.phoneE164)

  const sign = amount >= 0 ? '+' : ''
  return [
    '✅ 已入帳',
    `${pending.type === 'INCOME' ? '收入' : '支出'} ${sign}${amount.toFixed(2)} HKD`,
    `分類：${pending.categoryLabel}`,
    pending.poolLabel ? `資金池：${pending.poolLabel}` : null,
    pending.note ? `備註：${pending.note}` : null,
    `狀態：${status === 'PENDING' ? '待審核' : '已通過'}`,
    `單號：${record.id.slice(0, 8)}…`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function prepareLedger(
  actor: WhatsAppActor,
  parsed: NonNullable<ReturnType<typeof parseLedgerCommand>>,
): Promise<string> {
  if (!actorCanUsePublicLedger(actor)) {
    return '你沒有公帳權限，無法經 WhatsApp 入數。'
  }

  const cat = await resolveCategoryPath(parsed.type, parsed.categoryHint)
  const pool = await resolveDefaultPool(actor, parsed.poolHint)

  const draft: PendingLedgerDraft = {
    kind: 'ledger',
    type: parsed.type,
    amount: parsed.amountAbs,
    categoryId: cat.categoryId,
    categoryLabel: cat.label,
    subCategoryId: cat.subCategoryId,
    thirdCategoryId: cat.thirdCategoryId,
    poolId: pool.poolId,
    poolLabel: pool.poolLabel,
    note: parsed.note,
    dateIso: new Date().toISOString(),
    createdAt: Date.now(),
    userId: actor.userId,
  }
  await setPendingAction(actor.phoneE164, draft)

  return [
    '請確認公帳入數（5 分鐘內有效）：',
    `${parsed.type === 'INCOME' ? '收入' : '支出'} ${parsed.amountAbs.toFixed(2)} HKD`,
    `分類：${cat.label}${parsed.categoryHint ? '' : '（未指定，用未分类）'}`,
    pool.poolLabel ? `資金池：${pool.poolLabel}` : '資金池：（無）',
    parsed.note ? `備註：${parsed.note}` : null,
    '',
    '回覆「確認」提交，或「取消」放棄。',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * 處理單則入站文字，回傳要回覆給用戶的訊息。
 */
export async function handleWhatsAppCommand(
  actor: WhatsAppActor,
  rawText: string,
): Promise<string> {
  const text = rawText.replace(/\u200e|\u200f/g, '').trim()
  if (!text) return helpText(actor)

  const lower = text.toLowerCase()

  if (['幫助', '帮忙', 'help', '?', '？', '選單', '菜单', 'menu'].includes(lower) || text === '幫助') {
    return helpText(actor)
  }

  if (['確認', '确认', 'confirm', 'ok', '是'].includes(lower)) {
    return handleConfirm(actor)
  }

  if (['取消', 'cancel', '否'].includes(lower)) {
    await clearPendingAction(actor.phoneE164)
    return '已取消待確認操作。'
  }

  if (['提醒', '事項', '事项', '合約', '合同', '到期'].includes(text) || lower === 'remind') {
    const items = await collectWhatsAppReminders(actor)
    return formatRemindersMessage(items)
  }

  if (['最近', '紀錄', '记录', 'recent'].includes(lower) || text === '最近') {
    if (!actorCanUsePublicLedger(actor)) return '沒有公帳權限。'
    const rows = await getRecentRecordsForUser(actor.userId, 5)
    if (rows.length === 0) return '尚無公帳紀錄。'
    const lines = ['🧾 最近公帳：', '']
    for (const r of rows) {
      const sign = r.amount >= 0 ? '+' : ''
      lines.push(
        `• ${r.date.toISOString().slice(0, 10)} ${r.type === 'INCOME' ? '收' : '支'} ${sign}${r.amount.toFixed(2)}`,
        `  ${r.category?.name || '—'}${r.note ? `｜${r.note}` : ''}`,
      )
    }
    return lines.join('\n')
  }

  if (text === '分類' || text === '分类' || lower === 'categories') {
    const [ex, inc] = await Promise.all([
      listTopCategories('EXPENSE'),
      listTopCategories('INCOME'),
    ])
    return [
      '📂 分類（部分）',
      '',
      '支出：' + (ex.join('、') || '（無）'),
      '收入：' + (inc.join('、') || '（無）'),
      '',
      '入數時可寫分類名稱，系統會模糊匹配。',
    ].join('\n')
  }

  if (text === '資金池' || text === '资金池' || lower === 'pools') {
    const pools = await listPools()
    if (pools.length === 0) return '尚未建立資金池。'
    return [
      '🏦 資金池',
      '',
      ...pools.map((p) => `• ${p.name}：${p.balanceHkd.toFixed(2)} HKD`),
      '',
      '入數可用 @資金池名 指定，例如：公帳 支 50 餐飲 咖啡 @公司戶',
    ].join('\n')
  }

  if (text === '報表' || text === '报表' || lower === 'report' || text === '摘要') {
    if (!actor.isAdmin) return '報表摘要僅管理員可用。完整 PDF 請登入系統「報表」頁。'
    const s = await getMonthSummaryAdmin()
    return [
      `📊 ${s.year}/${s.month} 公帳摘要`,
      `筆數：${s.count}`,
      `收入：+${s.income.toFixed(2)}`,
      `支出：-${s.expense.toFixed(2)}`,
      `淨額：${s.net >= 0 ? '+' : ''}${s.net.toFixed(2)}`,
      `資金池合計：${s.poolTotal.toFixed(2)} HKD`,
      '',
      '完整 PDF／會計結算包請用網頁匯出。',
    ].join('\n')
  }

  const ledger = parseLedgerCommand(text)
  if (ledger) {
    return prepareLedger(actor, ledger)
  }

  return [
    '未能辨識指令。',
    '',
    helpText(actor),
  ].join('\n')
}
