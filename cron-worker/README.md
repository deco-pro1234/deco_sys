# Reminder cron worker

Always-on Node process using `node-cron` (timezone `Asia/Hong_Kong` by default).  
Calls the main web app: `POST $APP_BASE_URL/api/cron/reminders`.

## Railway setup

1. In the same project as `Sk11_finance`, create a **new service** from the same GitHub repo.
2. Set **Root Directory** to `cron-worker` (so it builds this Dockerfile).
3. Do **not** enable Railway **Cron Schedule** on this service (or on the web service).
4. Variables on the worker:
   - `APP_BASE_URL` = public URL of the web service
   - `CRON_SECRET` = same as web
   - Optional: `CRON_EXPR=0 9 * * *`, `CRON_TZ=Asia/Hong_Kong`, `RUN_ON_START=true` (test once)

Resend keys stay on the **web** service only.
