// GET /migration/status/{session_id} — polls Activity row for worker progress.
const { getPrisma } = require('../common/db')
const { extractBearer, resolveUser } = require('../common/jwt')
const { ok, unauthorized, notFound, serverError, preflight } = require('../common/responses')

async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  const path = params.__ow_path || ''
  if (method === 'options') return preflight()

  try {
    const user = await authenticate(params)
    if (!user) return unauthorized()

    const m = path.match(/^\/status\/([^/]+)$/)
    if (method !== 'get' || !m) return notFound(`No route for ${method.toUpperCase()} ${path}`)
    const sessionId = m[1]

    const prisma = getPrisma()
    const activity = await prisma.activity.findFirst({ where: { sessionId } })
    if (!activity) return notFound('Session not found')

    const est = activity.estimateData || {}
    // Map backend statuses ("started"/"running"/"success"/"failed") to the
    // shape the React client already expects from the FastAPI version.
    const status = activity.status === 'success' ? 'completed' : activity.status
    return ok({
      session_id: sessionId,
      status,
      progress: est.progress ?? 0,
      current_step: est.current_step || '',
      errors: est.errors || []
    })
  } catch (e) {
    console.error('migration-status error', e)
    return serverError(e.message || 'Internal error')
  }
}

async function authenticate (params) {
  const token = extractBearer(params)
  if (!token) return null
  return resolveUser(token, getPrisma(), params)
}

exports.main = main
