const { getPrisma } = require('../common/db')
const { extractBearer, resolveUser } = require('../common/jwt')
const { ok, badRequest, unauthorized, notFound, serverError, preflight } = require('../common/responses')
const { normalizeObjectCounts, computeFullEstimate } = require('../common/estimator')

// Ports POST /migration/estimate-from-counts and POST /migration/recalculate.
// Both are pure-compute; /recalculate also best-effort writes the new hours
// back to the matching Activity row so history stays in sync.
async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  const path = params.__ow_path || ''
  if (method === 'options') return preflight()

  try {
    const user = await authenticate(params)
    if (!user) return unauthorized()

    if (method === 'post' && path === '/estimate-from-counts') {
      return await estimateFromCounts(params)
    }
    if (method === 'post' && path === '/recalculate') {
      return await recalculate(params)
    }
    return notFound(`No route for ${method.toUpperCase()} ${path}`)
  } catch (e) {
    console.error('migration-estimate error', e)
    return serverError(e.message || 'Internal error')
  }
}

async function estimateFromCounts (params) {
  const body = parseBody(params)
  if (!body.object_counts || typeof body.object_counts !== 'object') {
    return badRequest('object_counts is required')
  }
  const normalized = normalizeObjectCounts(body.object_counts)
  const fs = Number(body.fusion_scenarios) || 0
  const estimate = computeFullEstimate(normalized, {
    fusionScenarios: fs,
    excludedObjects: body.excluded_objects || null
  })
  return ok({
    object_counts: normalized,
    estimate,
    errors: [],
    fusion_scenarios: fs
  })
}

async function recalculate (params) {
  const body = parseBody(params)
  const { session_id: sessionId } = body
  if (!sessionId) return badRequest('session_id is required')

  const prisma = getPrisma()
  const activity = await prisma.activity.findFirst({ where: { sessionId } })

  const normalized = normalizeObjectCounts(body.object_counts || {})
  const fs = Number(body.fusion_scenarios) || 0
  const estimate = computeFullEstimate(normalized, {
    fusionScenarios: fs,
    excludedObjects: body.excluded_objects || null
  })

  // Best-effort: update the activity's stored hours so history reflects the
  // latest recalculate (mirrors update_activity_status in the Python app).
  if (activity) {
    const totalHrs = estimate.summary.grand_total_hours
    const objCount = Object.keys(normalized).length
    await prisma.activity.update({
      where: { id: activity.id },
      data: {
        estimatedHours: totalHrs,
        resultSummary: `Estimated ${totalHrs} hours, ${objCount} object types analyzed`
      }
    })
  }

  return ok({
    object_counts: normalized,
    estimate,
    errors: [],
    fusion_scenarios: fs
  })
}

async function authenticate (params) {
  const token = extractBearer(params)
  if (!token) return null
  return resolveUser(token, getPrisma(), params)
}

function parseBody (params) {
  if (params.object_counts || params.session_id) return params
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
