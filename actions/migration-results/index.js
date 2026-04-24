// GET /migration/results/{session_id} — returns object_counts + estimate
// once the worker has finished.
const { getPrisma } = require('../common/db')
const { extractBearer, resolveUser } = require('../common/jwt')
const { ok, json, unauthorized, notFound, serverError, preflight } = require('../common/responses')

async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  const path = params.__ow_path || ''
  if (method === 'options') return preflight()

  try {
    const user = await authenticate(params)
    if (!user) return unauthorized()

    const m = path.match(/^\/results\/([^/]+)$/)
    if (method !== 'get' || !m) return notFound(`No route for ${method.toUpperCase()} ${path}`)
    const sessionId = m[1]

    const prisma = getPrisma()
    const activity = await prisma.activity.findFirst({ where: { sessionId } })
    if (!activity) return notFound('Session not found')

    if (activity.status !== 'success' && activity.status !== 'failed') {
      return json(202, { detail: 'Still running' })
    }

    const est = activity.estimateData || {}
    return ok({
      object_counts: est.object_counts || {},
      estimate: est.estimate || {},
      errors: est.errors || [],
      fusion_scenarios: est.fusion_scenarios || 0
    })
  } catch (e) {
    console.error('migration-results error', e)
    return serverError(e.message || 'Internal error')
  }
}

async function authenticate (params) {
  const token = extractBearer(params)
  if (!token) return null
  return resolveUser(token, getPrisma(), params)
}

exports.main = main
