# WhatsApp Web worker（whatsapp-web.js）

與主站 **同一個 Railway Project／同一個 GitHub repo**，再新增一個 **Service**（做法同 `cron-worker`）。

這不是另開一個 GitHub 專案；只是多一個常駐服務跑 Chromium + 掃碼 session。

## 為什麼要獨立服務？

`whatsapp-web.js` 需要長駐瀏覽器。現有 Next.js Web 服務不適合塞 Puppeteer。  
本 worker 負責：QR、連線狀態 SSE、中斷並清除 session。  
**第 1 期只做連線管理 UI**；事項提醒／入數指令下一期再接。

## Railway 設定步驟（請你操作）

1. Railway → 現有 Project（與 `deco-production` 同專案）→ **New Service** → 同一 GitHub repo `deco_sys`。
2. **Root Directory** 設為 `whatsapp-worker`（或 Config File = `/whatsapp-worker/railway.toml`）。
3. **Volume**：掛載到 `/data`（Persistent Volume），否則重啟要重掃 QR。
4. Variables（此 service）：

| 變數 | 說明 |
|------|------|
| `WHATSAPP_WORKER_SECRET` | 長隨機字串；與 Web 服務相同 |
| `PORT` | 可留空（Dockerfile 預設 4010） |
| `WHATSAPP_SESSION_PATH` | 可留空（預設 `/data/whatsapp-session`） |

5. 產生 **Private Networking** 網址（或 Public Domain）。記下例如：  
   `https://whatsapp-worker-xxxx.up.railway.app`  
   或內部 `http://whatsapp-worker.railway.internal:4010`

6. 回到 **Web 服務** Variables 新增：

| 變數 | 說明 |
|------|------|
| `WHATSAPP_WORKER_URL` | Worker 的 URL（無尾斜線） |
| `WHATSAPP_WORKER_SECRET` | 與 worker 相同 |

7. 部署兩邊後，用 **管理員** 登入 → 管理後台 → **WhatsApp** 分頁 → 上方「連線狀態」掃碼。

## 本機開發（可選）

```bash
cd whatsapp-worker
npm install
export WHATSAPP_WORKER_SECRET=dev-secret
export WHATSAPP_SESSION_PATH=./data/whatsapp-session
# macOS 可省略 PUPPETEER_EXECUTABLE_PATH（會下載 Chromium）
npm start
```

Web `.env`：

```bash
WHATSAPP_WORKER_URL=http://127.0.0.1:4010
WHATSAPP_WORKER_SECRET=dev-secret
```

## API（給 Next BFF 用）

全部需 `Authorization: Bearer $WHATSAPP_WORKER_SECRET`。

- `GET /health` — 無需密鑰
- `GET /status` — 狀態／QR／已登入號碼
- `GET /events` — SSE（`status` / `qr` / `ready`）
- `POST /disconnect` — `destroy` + 清 session + 重新出 QR
- `POST /restart` — 重啟 client

## 注意

- 請用**專給系統的新號碼**掃碼，勿用個人主力號碼。
- 非官方協定，有封號風險；作 Meta 審批前的過渡方案。
- 第 2 期才會把收訊接到現有 `提醒`／`公帳` 指令。
