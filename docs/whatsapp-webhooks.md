# WhatsApp Webhooks（公帳／提醒／報表）

透過 Meta WhatsApp Cloud API，用手機直接對系統發指令：查提醒、公帳入數、本月摘要等。

## 架構

```
WhatsApp 用戶
    │  文字訊息
    ▼
Meta Cloud API
    │  POST /api/webhooks/whatsapp
    ▼
本系統 webhook
    ├─ GET：hub.verify_token 驗證
    ├─ POST：驗簽 → 解析來電號碼 → 對應 User → 執行指令 → 回覆文字
    └─ 每日 cron（可選）：合約／事項／恆常到期 → WhatsApp 推播
```

**Callback URL（填到你截圖的「回呼網址」）**

```text
https://<你的網域>/api/webhooks/whatsapp
```

例：`https://sk11finance.up.railway.app/api/webhooks/whatsapp`

**Verify Token（驗證權杖）**：自訂一字串，與環境變數 `WHATSAPP_VERIFY_TOKEN` **完全相同**，再按「驗證並儲存」。

Webhook 欄位請訂閱：`messages`。

> Development mode 時 Meta 只會送測試 webhook；要收真實用戶訊息需完成 App 審核／上線，並綁定正式 WhatsApp Business 號碼。

## 環境變數（網站服務）

| 變數 | 必填 | 說明 |
|------|------|------|
| `WHATSAPP_VERIFY_TOKEN` | ✅ | 與 Meta「驗證權杖」相同 |
| `WHATSAPP_ACCESS_TOKEN` | ✅（回覆） | Cloud API 永久／長期 token |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅（回覆） | 發送用 Phone number ID（非顯示號碼） |
| `WHATSAPP_APP_SECRET` | ✅（生產） | App Secret，用於驗 `X-Hub-Signature-256` |
| `WHATSAPP_API_VERSION` | 可選 | 預設 `v21.0` |
| `WHATSAPP_ALLOWED_PHONES` | 建議 | 白名單，逗號分隔，如 `85291111111,85292222222` |
| `WHATSAPP_USER_MAP` | 可選 | `電話:userId` 對照，如 `85291111111:uuid-...` |
| `WHATSAPP_REMINDER_PHONES` | 可選 | 每日到期提醒要推到的號碼 |

部署後執行 migration：`WhatsAppBinding` 表。

## 用戶綁定（建議用用戶資料電話）

1. **個人資料／管理後台「聯絡電話」**（建議）  
   儲存時會正規化成 E.164，並**自動同步 `WhatsAppBinding`**。香港 8 位本地號會補 `852`。
2. **管理後台 → WhatsApp 分頁**  
   手動綁定；會反寫 `contactPhone`。
3. **環境變數 `WHATSAPP_USER_MAP`**（可選）  
   `電話:userId` 對照。

來電號碼會正規化成純數字 E.164（如 `85291234567`）。

互動功能路線與可行性見 [`docs/whatsapp-interaction-roadmap.md`](./whatsapp-interaction-roadmap.md)。

**已拍板、等 Meta 審核後開發：** 分步公帳上單＋OCR（roadmap §4.1）。審核通過後可直接開 Agent 任務：「實作 docs/whatsapp-interaction-roadmap.md §4.1」。
## 用戶可傳送的指令

| 指令 | 說明 | 權限 |
|------|------|------|
| `幫助` | 指令說明 | 已綁定用戶 |
| `提醒` | 合約／事項／恆常到期一覽 | 合約僅管理員；事項依可見性 |
| `最近` | 最近公帳紀錄 | 公帳成員／管理員 |
| `分類` / `資金池` | 列出名稱方便入數 | 已綁定 |
| `報表` | 本月收支摘要 | 管理員 |
| `公帳 支 120 餐飲 午餐` | 預備入數 → 回覆 `確認` | 公帳成員／管理員 |
| `公帳 收 5000 租金 @公司戶` | 指定資金池 | 同上 |
| `確認` / `取消` | 確認或放棄待入數（5 分鐘內） | — |

完整 PDF／會計結算包仍須登入網頁「報表」匯出；WhatsApp 只做文字摘要與快捷入數。

## Meta 後台逐步設定

1. [developers.facebook.com](https://developers.facebook.com/) → 你的 App → WhatsApp → 配置。
2. **Configure Webhooks** → Callback URL + Verify Token → Verify and Save。
3. Webhook fields 勾選 **messages**。
4. 複製 **Phone number ID**、產生 **Access Token**、從 App 設定取得 **App Secret**，寫入 Railway／`.env`。
5. 用「寄送測試訊息」或真實測試號對 Business 號碼傳 `幫助`。
6. 確認綁定電話後試：`提醒`、`公帳 支 1 未分类 測試` → `確認`。

## 安全注意

- 生產環境**必須**設定 `WHATSAPP_APP_SECRET`，否則簽名驗證會拒絕 POST。
- 建議設定 `WHATSAPP_ALLOWED_PHONES`，避免陌生人觸發指令（未綁定也會被拒，但白名單可再擋一層）。
- 公帳入數一律二次確認；備註會加上 `[WhatsApp]` 前綴方便稽核。
- 需審核的資金池仍會建成 `PENDING`，與網頁行為一致。

## 本機用 ngrok 測試

```bash
npx ngrok http 3000
# Callback: https://xxxx.ngrok-free.app/api/webhooks/whatsapp
```

`.env` 填好 token 後 `npm run dev`，在 Meta 按驗證。

## 驗證失敗排查（Meta 紅字錯誤）

若出現「無法驗證回呼網址或驗證權杖」：

1. **端點必須已部署上線**  
   瀏覽器或 curl 測：
   ```bash
   curl -i "https://你的網域/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=你的權杖&hub.challenge=abc"
   ```
   成功應為 **HTTP 200**，body 純文字 `abc`。若是 **404**，代表此功能尚未合併／部署到該網域（PR 未進 `main` 或 Railway 未重新部署）。

2. **關掉「將用戶端憑證附加至 Webhook 要求」**  
   一般 Railway／Next 部署不需要此選項；開著常會導致 Meta 驗證失敗。

3. **Railway 環境變數**必須有：
   ```env
   WHATSAPP_VERIFY_TOKEN=與 Meta 驗證權杖完全相同的字串
   ```
   大小寫、空白都要一致。未設定時端點會回 503。

4. 部署後再於 Meta 按「驗證並儲存」。
