import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'

const PORT = Number(process.env.HANDBOOK_API_PORT || 5174)
const DATA_PATH =
  process.env.HANDBOOK_DATA_PATH ||
  path.join(process.cwd(), 'public', 'data', 'handbook-2026-s1.json')
const REFRESH_TOKEN = process.env.HANDBOOK_REFRESH_TOKEN || ''
const SCRIPT_PATH =
  process.env.HANDBOOK_SCRAPER_PATH ||
  path.join(process.cwd(), 'scripts', 'handbook-scrape-2026-s1.mjs')

let cache = {
  mtimeMs: 0,
  payload: null,
  version: null,
}
let refreshPromise = null

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(payload))
}

const withCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Handbook-Token')
}

const computeVersion = (payload) => {
  const json = JSON.stringify(payload?.items || payload)
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 12)
}

const loadData = async () => {
  const stat = await fs.stat(DATA_PATH)
  if (cache.payload && stat.mtimeMs === cache.mtimeMs) {
    return cache.payload
  }
  const raw = await fs.readFile(DATA_PATH, 'utf8')
  const payload = JSON.parse(raw)
  const version = payload.version || computeVersion(payload)
  cache = {
    mtimeMs: stat.mtimeMs,
    payload: { ...payload, version },
    version,
  }
  return cache.payload
}

const runRefresh = async () => {
  if (refreshPromise) return refreshPromise
  refreshPromise = new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT_PATH], {
      stdio: 'inherit',
      env: process.env,
    })
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code === 0) {
        cache = { mtimeMs: 0, payload: null, version: null }
        resolve()
      } else {
        reject(new Error(`Scraper exited with code ${code}`))
      }
    })
  })

  try {
    await refreshPromise
  } finally {
    refreshPromise = null
  }
}

const server = http.createServer(async (req, res) => {
  withCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  if (!url.pathname.startsWith('/api/handbook')) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/handbook/meta') {
      const payload = await loadData()
      sendJson(res, 200, {
        version: payload.version,
        generatedAt: payload.generatedAt || null,
        count: payload.items?.length || 0,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/handbook') {
      const payload = await loadData()
      const code = (url.searchParams.get('code') || '').toUpperCase()
      if (code) {
        const item = payload.items?.find((entry) => entry.code === code) || null
        sendJson(res, 200, {
          version: payload.version,
          generatedAt: payload.generatedAt || null,
          item,
        })
        return
      }
      sendJson(res, 200, payload)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/handbook/refresh') {
      if (REFRESH_TOKEN) {
        const token = req.headers['x-handbook-token']
        if (!token || token !== REFRESH_TOKEN) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }
      }
      await runRefresh()
      const payload = await loadData()
      sendJson(res, 200, {
        version: payload.version,
        generatedAt: payload.generatedAt || null,
        count: payload.items?.length || 0,
      })
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    console.error('API error', error)
    sendJson(res, 500, { error: 'Server error' })
  }
})

server.listen(PORT, () => {
  console.log(`Handbook API listening on http://127.0.0.1:${PORT}`)
  console.log(`Data file: ${DATA_PATH}`)
})
