// Thin localhost shim that lets the existing React frontend talk to the
// App Builder actions without rebuilding. Routes HTTP requests to action
// main() functions using the same params shape OpenWhisk passes in production.
//
// Run with: node scripts/local-server.js
// Default port: 9080 (override with PORT env var).

require('dotenv').config()
const path = require('path')
const express = require('express')
const cors = require('cors')

// Action main() functions
const authAction = require('../actions/auth/index.js').main
const estimateAction = require('../actions/migration-estimate/index.js').main
const staffingAction = require('../actions/staffing/index.js').main
const startAction = require('../actions/migration-start/index.js').main
const statusAction = require('../actions/migration-status/index.js').main
const resultsAction = require('../actions/migration-results/index.js').main

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use((req, _res, next) => { console.log(`[req] ${req.method} ${req.path}`); next() })

const WEB_SRC = path.resolve(__dirname, '..', 'web-src')

function envParams (extra = {}) {
  return {
    JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
    JWT_EXPIRE_MINUTES: process.env.JWT_EXPIRE_MINUTES,
    DATABASE_URL: process.env.DATABASE_URL,
    ENV: process.env.ENV || 'development',
    ...extra
  }
}

function buildParams (req, owPath) {
  return envParams({
    __ow_method: req.method.toLowerCase(),
    __ow_path: owPath,
    __ow_headers: req.headers,
    __ow_query: req.query,
    ...req.query,
    ...(typeof req.body === 'object' ? req.body : {})
  })
}

async function invoke (actionMain, req, res, owPath) {
  try {
    console.log(`  → action __ow_path=${owPath}`)
    const result = await actionMain(buildParams(req, owPath))
    const status = result.statusCode || 200
    const headers = result.headers || {}
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v))
    // Action bodies are JS objects — use res.json so Express sets headers correctly
    // even if the action's headers map already includes content-type.
    if (typeof result.body === 'string' || Buffer.isBuffer(result.body)) {
      res.status(status).send(result.body)
    } else {
      res.status(status).json(result.body ?? {})
    }
  } catch (e) {
    console.error('action error:', e)
    res.status(500).json({ detail: e.message || 'Internal error' })
  }
}

// ── Route mapping (matches the FastAPI URLs so the existing React build works) ──

// Auth
app.post('/auth/signup', (req, res) => invoke(authAction, req, res, '/signup'))
app.post('/auth/login',  (req, res) => invoke(authAction, req, res, '/login'))
app.get ('/auth/me',     (req, res) => invoke(authAction, req, res, '/me'))
app.get ('/auth/activities', (req, res) => invoke(authAction, req, res, '/activities'))
app.get ('/auth/activities/:id', (req, res) => invoke(authAction, req, res, `/activities/${req.params.id}`))

// Migration — lifecycle
app.post('/migration/start',   (req, res) => invoke(startAction, req, res, '/start'))
app.get ('/migration/status/:id',  (req, res) => invoke(statusAction, req, res, `/status/${req.params.id}`))
app.get ('/migration/results/:id', (req, res) => invoke(resultsAction, req, res, `/results/${req.params.id}`))

// Migration — estimation
app.post('/migration/estimate-from-counts', (req, res) => invoke(estimateAction, req, res, '/estimate-from-counts'))
app.post('/migration/recalculate',          (req, res) => invoke(estimateAction, req, res, '/recalculate'))

// Migration — staffing + persistence (same action, different paths)
app.post('/migration/staffing',      (req, res) => invoke(staffingAction, req, res, '/staffing'))
app.get ('/migration/staffing/:id',  (req, res) => invoke(staffingAction, req, res, `/staffing/${req.params.id}`))
app.post('/migration/update-hours',  (req, res) => invoke(staffingAction, req, res, '/update-hours'))
app.post('/migration/save-snapshot', (req, res) => invoke(staffingAction, req, res, '/save-snapshot'))

// /migration/refetch-counts is not yet ported — return a helpful message.
app.post('/migration/refetch-counts', (req, res) => {
  res.status(501).json({ detail: 'refetch-counts not yet implemented in the App Builder port' })
})

// Also expose the App Builder-style URLs for future-proofing (so whatever
// React code we build for production also works here without changes).
app.all('/api/v1/web/migration-estimator/:action{/*rest}', (req, res) => routeOwStyle(req, res))

function routeOwStyle (req, res) {
  const actionName = req.params.action
  const rest = req.params.rest
  const sub = Array.isArray(rest) ? (rest.length ? `/${rest.join('/')}` : '') : (rest ? `/${rest}` : '')
  const map = {
    auth: authAction,
    'migration-estimate': estimateAction,
    staffing: staffingAction,
    'migration-start': startAction,
    'migration-status': statusAction,
    'migration-results': resultsAction
  }
  const fn = map[actionName]
  if (!fn) return res.status(404).json({ detail: `Unknown action: ${actionName}` })
  return invoke(fn, req, res, sub)
}

// ── Static frontend ──
app.use(express.static(WEB_SRC))
// SPA fallback: any non-API GET returns index.html. Express 5 forbids bare `*`,
// so use a regex that excludes the API prefixes.
app.get(/^(?!\/auth\b|\/migration\b|\/api\b).*$/, (req, res) => {
  res.sendFile(path.join(WEB_SRC, 'index.html'), err => {
    if (err) res.status(404).send('Frontend not built yet — copy frontend/build into web-src/')
  })
})

const PORT = parseInt(process.env.PORT || '9080', 10)
app.listen(PORT, () => {
  console.log(`migration-estimator-appbuilder local server on http://localhost:${PORT}`)
  console.log(`Serving frontend from: ${WEB_SRC}`)
})
