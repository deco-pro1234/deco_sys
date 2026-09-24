# 項目提醒與手機 UX 優化

> **狀態：實作中。** 依可行性討論納入落地；優先順序 A→B→C→詳情→列表。

## 目標

1. **提醒**：事項一多不再把版面撐爆；能快速進入對應項目／事項處理。
2. **手機 UX**：降低新手學習成本；列表／新增／詳情資訊層次更清楚。

## 範圍與分期

### 第 1 期（本 PR）

| ID | 內容 | 狀態 |
|----|------|------|
| A | 提醒依**項目**彙總（項目卡＋數量，展開才見事項） | 實作 |
| B | 深連結 `/projects/{id}?task={taskId}`，詳情自動展開並捲動 | 實作 |
| C | 預設「待處理」（已過期＋今天）；即將到期另篩 | 實作 |
| D | 項目詳情頂部「本項目提醒」條 | 實作 |
| L1 | 項目列表搜尋＋精簡卡片＋提醒角標 | 實作 |
| L2 | 新增項目改為可收合／獨立區塊（＋開啟） | 實作 |
| D1 | 詳情預設「待處理事項」視圖；結構（分類）為次要 | 實作 |
| D2 | 手機 Tab：事項／帳本為主，「更多」收納其餘 | 實作 |

### 第 2 期（後續）

- 空狀態引導、首次短提示
- WhatsApp／每日摘要通知（方案 E）
- 用語統一微调、教學 tooltip

### 不做（本輪）

- 改提醒資料模型／排程策略
- 推播基礎設施大改

## 技術入口

| 檔案 | 角色 |
|------|------|
| `src/app/actions/reminder.ts` | `ReminderItem` 加 `projectId` / `taskId` / `projectTitle` |
| `src/app/actions/project.ts` | `getProjectReminderItems` 深連結 |
| `src/lib/projects/reminderGrouping.ts` | 依項目分組／緊急度篩選 |
| `src/components/ProjectRemindersGrouped.tsx` | 彙總 UI |
| `src/components/ReminderOverview.tsx` | 項目提醒改用彙總 |
| `src/app/projects/ProjectsClient.tsx` | 列表提醒＋搜尋＋精簡卡＋新增收合 |
| `src/app/projects/ProjectDetailClient.tsx` | `?task=`、本項目提醒、待處理視圖、更多 Tab |
| `src/app/projects/[projectId]/page.tsx` | 傳入本項目提醒 |

## 驗收

- [ ] 多項目、多事項時，總覽／項目頁提醒以項目卡呈現，不一次列出全部事項
- [ ] 點事項提醒進入詳情後自動展開該事項
- [ ] 預設篩選為待處理（逾期＋今天）
- [ ] 項目內可見本項目提醒並可點選定位
- [ ] 列表可搜尋；卡片較精簡；新增表單預設收合
- [ ] 詳情可在「待處理／全部結構」切換；手機次要 Tab 在「更多」
