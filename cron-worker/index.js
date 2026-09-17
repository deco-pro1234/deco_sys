'use strict'

/**
 * Always-on Railway worker.
 * Uses node-cron (Asia/Hong_Kong) to POST the main app's /api/cron/reminders.
 *
 * Required env:
 *   APP_BASE_URL   e.g. https://sk11finance.up.railway.app
 *   CRON_SECRET    same value as the web service
 *
 * Optional:
 *   CRON_EXPR      default "0 9 * * *" (09:00 every day)
 *   CRON_TZ        default "Asia/Hong_Kong"
 *   RUN_ON_START   "true" to fire once when the worker boots (for testing)
 */

const cron = require('node-cron')

const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '')
const CRON_SECRET = process.env.CRON_SECRET || ''
const CRON_EXPR = process.env.CRON_EXPR || '0 9 * * *'
const CRON_TZ = process.env.CRON_TZ || 'Asia/Hong_Kong'
const RUN_ON_START = String(process.env.RUN_ON_START || '').toLowerCase() === 'true'

function log(...args) {
  console.log(`[cron-worker ${new Date().toISOString()}]`, ...args)
}

async function runReminderJob() {
  if (!APP_BASE_URL) {
    log('SKIP: APP_BASE_URL is not set')
    return
  }
  if (!CRON_SECRET) {
    log('SKIP: CRON_SECRET is not set')
    return
  }

  const url = `${APP_BASE_URL}/api/cron/reminders`
  log(`POST ${url}`)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    })
    const text = await res.text()
    let body = text
    try {
      body = JSON.stringify(JSON.parse(text))
    } catch {
      /* keep raw */
    }
    if (!res.ok) {
      log(`FAILED status=${res.status} body=${body}`)
      return
    }
    log(`OK status=${res.status} body=${body}`)
  } catch (err) {
    log('ERROR', err && err.message ? err.message : err)
  }
}

if (!cron.validate(CRON_EXPR)) {
  console.error(`[cron-worker] Invalid CRON_EXPR: ${CRON_EXPR}`)
  process.exit(1)
}

log(`Starting. schedule="${CRON_EXPR}" tz="${CRON_TZ}" base=${APP_BASE_URL || '(missing)'}`)

cron.schedule(
  CRON_EXPR,
  () => {
    runReminderJob()
  },
  { timezone: CRON_TZ },
)

if (RUN_ON_START) {
  log('RUN_ON_START=true → firing once now')
  runReminderJob()
}

// node-cron keeps the event loop alive; do NOT set Railway "Cron Schedule" on this service.
log('Worker is running (always-on). Waiting for schedule…')
