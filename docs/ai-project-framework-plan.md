# AI 建立項目框架

> **狀態：開發中（第 1 期 MVP）。** 2026-09-19 進入實作；預設採計劃建議項。

## 本輪產品預設（開工時採用）

1. 入口：**A** 項目列表（管理員建立區）
2. 誰可用：**A** 僅 Admin
3. 寫庫：**A** 必須預覽確認
4. 事項到期：**A** AI 可不填
5. 模型：**A/B 混合** — 有 `PROJECT_AI_API_KEY`（或沿用 `OCR_API_KEY`）走 LLM；否則本機 mock（`PROJECT_AI_ALLOW_MOCK`，預設 true）
6. 第 1 期僅草稿＋確認：**是**（不含分判／附件／PDF）

## 背景與目標

使用者在 AI 入口輸入項目描述，例如：

> 香港中環街市啤酒節，我們的工作範圍搭建兩個帳篷，並委託分判商完成此類工作，請幫我建立項目及其相關分類及分工。

系統應把描述拆成**最簡單的項目管理框架**：

- 項目（Project）
- 大類 → 第二層分工（現有 `ProjectSection`，最多兩層）
- 事項（`ProjectTask`：標題、內容等）

目的：用自然語言快速得到可改的骨架，再人工確認後寫入本系統 Projects 插件。

## 明確不做（本計劃範圍外）

- 自動指派分判／建臨時帳／授權
- 讀圖則、合約、附件再分析
- 自動排期／提醒策略
- 自動產生 PDF
- AI 直接寫庫、不可預覽

## 產品形態

1. 入口：項目列表「AI 建立項目框架」（Admin）
2. 輸入：多行描述（必填）
3. 後端 `suggestProjectFramework` → 嚴格 JSON 草稿（LLM 或 mock）
4. **預覽＋可編輯**（改名、刪節點、加事項；強制 ≤2 層）
5. `commitProjectFramework` 確認後寫入
6. 原則：**AI 只產草稿，寫庫必須人確認**

## 限制

- 大類 ≤ 8、每層下級 ≤ 10、事項總數 ≤ 50
- 描述長度 ≤ 4000

## 技術入口

| 檔案 | 角色 |
|------|------|
| `src/lib/projects/frameworkDraft.ts` | Schema／正規化／上限 |
| `src/lib/projects/frameworkAi.ts` | Prompt、LLM、mock |
| `src/app/actions/projectFramework.ts` | `suggestProjectFramework` / `commitProjectFramework` |
| `src/app/projects/AiProjectFrameworkPanel.tsx` | UI |

環境變數見 `.env.example`（`PROJECT_AI_*`，可共用 OCR 金鑰）。

## 建議分期

### 第 1 期（MVP，進行中）

- AI 入口＋描述 → 草稿預覽 → 確認建立
- 伺服器驗證兩層／數量上限
- Admin 可用；API Key 僅伺服器

### 第 2 期

- 行業範本、「再生一版」、用量上限
- 可選建議負責人角色名（不自動建帳）

### 第 3 期（高難度，暫緩）

- 讀附件／圖則、對接分判、排期與文件包

## 紀錄

- 2026-09-19：可行性討論；先記存。
- 2026-09-19：進入第 1 期開發（本文件更新為開發中）。
