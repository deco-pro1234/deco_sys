# WhatsApp Web（whatsapp-web.js）連線管理

> **狀態：第 1 期（連線 UI）實作中。** Meta Cloud API 審批未過，暫以 web.js 作主通道。

## 你問：是否在該專案新增多一個服務器即可？

**可以。** 做法與現有 `cron-worker` 相同：

- **同一個** GitHub 專案 `deco_sys`
- **同一個** Railway Project
- **再新增一個 Service**，Root Directory = `whatsapp-worker`
- 掛 **Volume** 到 `/data`（保存掃碼 session）

不是另開一個 repo，也不是改現有 Web 容器塞 Chromium。

```
Railway Project
├── Service: deco-production (Next.js 網頁)     ← 已有
├── Service: cron-worker（可選）                 ← 已有模式
└── Service: whatsapp-worker（新增）            ← 掃碼 / SSE / 斷線
```

## 第 1 期範圍（本輪）

- 管理後台 → WhatsApp 分頁上方：**連線狀態卡**
  - 未連線／載入／請掃碼／已連線
  - QR 即時推送（SSE）；過期自動換新
  - 已連線顯示號碼 + 中斷連線（清 session）
- 獨立 `whatsapp-worker`（Express + whatsapp-web.js）
- Next BFF：`/api/admin/whatsapp-session/*`（僅 Admin）

**暫不做：** 事項提醒推播、收訊指令、公帳入數（第 2 期，等你有系統專用號碼並掃碼成功後再接）。

## 你需要做的部署步驟

詳見 [`whatsapp-worker/README.md`](../whatsapp-worker/README.md)。摘要：

1. Railway New Service → 同 repo → Root `whatsapp-worker`
2. Volume → `/data`
3. Worker 設 `WHATSAPP_WORKER_SECRET`
4. Web 設 `WHATSAPP_WORKER_URL` + 同一個 `WHATSAPP_WORKER_SECRET`
5. 部署後 Admin → WhatsApp → 掃碼（用新號碼）

## 通道策略

| 通道 | 狀態 |
|------|------|
| Meta Cloud API | 暫緩（審批中） |
| whatsapp-web.js | **主通道**（本方案） |

## 後續期（確認連線後）

2. 收訊 ↔ 現有 `commands.ts`（提醒／公帳）  
3. 主動事項／項目提醒推播  
4. 新增事項指令  

## 風險

非官方協定，有封號風險；請用**系統專用號碼**，勿用個人主力號。
