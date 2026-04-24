// POST /migration/start — creates an Activity row and kicks off the worker async.
// Returns immediately with the session_id; frontend polls /migration/status/:id.
const { randomUUID } = require('crypto')
const { getPrisma } = require('../common/db')
const { extractBearer, resolveUser } = require('../common/jwt')
const { ok, badRequest, unauthorized, serverError, preflight } = require('../common/responses')
const { invokeWorker } = require('../common/invoker')

const WORKER_ACTION = 'migration-estimator/migration-worker'

async function main (params) {
  const method = (params.__ow_method || 'post').toLowerCase()
  if (method === 'options') return preflight()

  try {
    const user = await authenticate(params)
    if (!user) return unauthorized()

    const body = parseBody(params)
    if (!body.wf_url || !body.api_key) return badRequest('wf_url and api_key are required')

    const sessionId = randomUUID()
    const prisma = getPrisma()
    const activity = await prisma.activity.create({
      data: {
        userId: user.id,
        tool: 'migration',
        action: 'start',
        inputSummary: body.wf_url,
        sessionId,
        wfUrl: body.wf_url,
        status: 'started',
        estimateData: { progress: 0, current_step: 'Queued', errors: [] }
      }
    })

    // Adobe I/O Runtime rejects invoke params that override action-bound defaults
    // with "reserved properties" (400). DATABASE_URL is already bound on the
    // worker via manifest.yml, so pass only request-specific params here.
    await invokeWorker(WORKER_ACTION, {
      session_id: sessionId,
      wf_url: body.wf_url,
      api_key: body.api_key,
      date_filter_years: body.date_filter_years || null,
      fusion_scenarios: body.fusion_scenarios || 0
    })

    return ok({
      session_id: sessionId,
      activity_id: activity.id,
      message: 'Migration estimation started'
    })
  } catch (e) {
    console.error('migration-start error', e)
    return serverError(e.message || 'Internal error')
  }
}

async function authenticate (params) {
  const token = extractBearer(params)
  if (!token) return null
  return resolveUser(token, getPrisma(), params)
}

function parseBody (params) {
  if (params.wf_url || params.api_key) return params
  if (params.__ow_body) {
    try {
      const decoded = Buffer.from(params.__ow_body, 'base64').toString('utf8')
      return JSON.parse(decoded)
    } catch (e) {
      try { return JSON.parse(params.__ow_body) } catch (_) { return {} }
    }
  }
  return params
}

exports.main = main
