'use strict'

/**
 * Always-on WhatsApp Web session worker (whatsapp-web.js).
 *
 * Env:
 *   PORT                     default 4010
 *   WHATSAPP_WORKER_SECRET   shared with Next.js (required in production)
 *   WHATSAPP_SESSION_PATH    default /data/whatsapp-session (Railway volume)
 *   PUPPETEER_EXECUTABLE_PATH Chromium path (set in Dockerfile)
 *   CORS_ORIGIN              optional comma list; empty = allow all (BFF only)
 */

const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const QRCode = require('qrcode')
const { Client, LocalAuth } = require('whatsapp-web.js')

const PORT = Number(process.env.PORT || 4010)
const SECRET = (process.env.WHATSAPP_WORKER_SECRET || '').trim()
const SESSION_PATH = process.env.WHATSAPP_SESSION_PATH || path.join(process.cwd(), 'whatsapp-session')
const DATA_PATH = path.dirname(SESSION_PATH)
const CLIENT_ID = 'deco-sys'

const STATE = {
  status: 'disconnected', // disconnected | initializing | qr | ready
  qrDataUrl: null,
  phone: null,
  pushName: null,
  lastError: null,
  updatedAt: null,
}

/** @type {Set<import('express').Response>} */
const sseClients = new Set()
/** @type {import('whatsapp-web.js').Client | null} */
let waClient = null
let starting = false
let suppressAutoRestart = false

function log(...args) {
  console.log(`[whatsapp-worker ${new Date().toISOString()}]`, ...args)
}

function touch() {
  STATE.updatedAt = new Date().toISOString()
}

function publicState() {
  return {
    status: STATE.status,
    qrDataUrl: STATE.status === 'qr' ? STATE.qrDataUrl : null,
    phone: STATE.phone,
    pushName: STATE.pushName,
    lastError: STATE.lastError,
    updatedAt: STATE.updatedAt,
  }
}

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of sseClients) {
    try {
      res.write(data)
    } catch {
      sseClients.delete(res)
    }
  }
}

function setStatus(status, extra = {}) {
  STATE.status = status
  Object.assign(STATE, extra)
  touch()
  broadcast('status', publicState())
  log('status →', status, STATE.phone || '', STATE.lastError || '')
}

function authOk(req) {
  if (!SECRET) {
    // Local/dev convenience; Railway should always set the secret.
    return process.env.NODE_ENV !== 'production'
  }
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const query = typeof req.query.token === 'string' ? req.query.token : ''
  return bearer === SECRET || query === SECRET
}

function requireAuth(req, res, next) {
  if (!authOk(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

async function clearSessionFiles() {
  const targets = [SESSION_PATH, path.join(DATA_PATH, `.wwebjs_auth`), path.join(process.cwd(), `.wwebjs_cache`)]
  for (const target of targets) {
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true })
        log('cleared', target)
      }
    } catch (err) {
      log('clear session warn', err && err.message ? err.message : err)
    }
  }
  // LocalAuth stores under dataPath/session-{clientId}
  const localAuthDir = path.join(DATA_PATH, `session-${CLIENT_ID}`)
  try {
    if (fs.existsSync(localAuthDir)) {
      fs.rmSync(localAuthDir, { recursive: true, force: true })
      log('cleared', localAuthDir)
    }
  } catch (err) {
    log('clear LocalAuth warn', err && err.message ? err.message : err)
  }
}

async function destroyClient() {
  if (!waClient) return
  const c = waClient
  waClient = null
  try {
    await c.destroy()
  } catch (err) {
    log('destroy warn', err && err.message ? err.message : err)
  }
}

async function startClient() {
  if (starting) return
  starting = true
  try {
    await destroyClient()
    fs.mkdirSync(DATA_PATH, { recursive: true })

    setStatus('initializing', {
      qrDataUrl: null,
      phone: null,
      pushName: null,
      lastError: null,
    })

    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
    ]

    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROMIUM_PATH ||
      undefined

    waClient = new Client({
      authStrategy: new LocalAuth({
        clientId: CLIENT_ID,
        dataPath: DATA_PATH,
      }),
      puppeteer: {
        headless: true,
        executablePath,
        args: puppeteerArgs,
      },
    })

    waClient.on('qr', async (qr) => {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          margin: 1,
          width: 320,
          errorCorrectionLevel: 'M',
        })
        // New QR replaces expired one automatically.
        setStatus('qr', { qrDataUrl, phone: null, pushName: null, lastError: null })
        broadcast('qr', { qrDataUrl, at: new Date().toISOString() })
      } catch (err) {
        setStatus('disconnected', {
          lastError: err && err.message ? err.message : 'QR encode failed',
        })
      }
    })

    waClient.on('authenticated', () => {
      log('authenticated')
      setStatus('initializing', { qrDataUrl: null, lastError: null })
    })

    waClient.on('ready', async () => {
      let phone = null
      let pushName = null
      try {
        const wid = waClient.info && waClient.info.wid
        phone = wid && (wid.user || String(wid).replace(/@.*/, ''))
        pushName = (waClient.info && waClient.info.pushname) || null
      } catch {
        /* ignore */
      }
      setStatus('ready', { qrDataUrl: null, phone, pushName, lastError: null })
      broadcast('ready', { phone, pushName, at: new Date().toISOString() })
    })

    waClient.on('auth_failure', (msg) => {
      setStatus('disconnected', {
        qrDataUrl: null,
        phone: null,
        lastError: String(msg || 'auth_failure'),
      })
    })

    waClient.on('disconnected', (reason) => {
      setStatus('disconnected', {
        qrDataUrl: null,
        phone: null,
        pushName: null,
        lastError: String(reason || 'disconnected'),
      })
      if (suppressAutoRestart) return
      // Auto re-init so a fresh QR appears without manual restart.
      setTimeout(() => {
        startClient().catch((err) =>
          log('restart after disconnect failed', err && err.message ? err.message : err),
        )
      }, 1500)
    })

    await waClient.initialize()
  } catch (err) {
    setStatus('disconnected', {
      lastError: err && err.message ? err.message : 'initialize failed',
      qrDataUrl: null,
    })
    log('initialize error', err)
  } finally {
    starting = false
  }
}

async function disconnectAndClear() {
  suppressAutoRestart = true
  try {
    await destroyClient()
    await clearSessionFiles()
    setStatus('disconnected', {
      qrDataUrl: null,
      phone: null,
      pushName: null,
      lastError: null,
    })
  } finally {
    suppressAutoRestart = false
  }
  // Start again so admin can scan a new QR with a new number.
  await startClient()
  return publicState()
}

const app = express()
app.use(
  cors({
    origin: true,
    credentials: false,
  }),
)
app.use(express.json({ limit: '32kb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'whatsapp-worker', status: STATE.status })
})

app.get('/status', requireAuth, (_req, res) => {
  res.json(publicState())
})

app.get('/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  sseClients.add(res)
  res.write(`event: status\ndata: ${JSON.stringify(publicState())}\n\n`)

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`)
    } catch {
      clearInterval(heartbeat)
      sseClients.delete(res)
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.delete(res)
  })
})

app.post('/disconnect', requireAuth, async (_req, res) => {
  try {
    const state = await disconnectAndClear()
    res.json({ ok: true, ...state })
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'disconnect failed',
    })
  }
})

app.post('/restart', requireAuth, async (_req, res) => {
  try {
    await startClient()
    res.json({ ok: true, ...publicState() })
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : 'restart failed',
    })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  log(`listening on :${PORT}`)
  log(`session dataPath=${DATA_PATH} clientId=${CLIENT_ID}`)
  if (!SECRET) log('WARN: WHATSAPP_WORKER_SECRET is empty')
  startClient().catch((err) => log('boot start failed', err && err.message ? err.message : err))
})
