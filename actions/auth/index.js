const bcrypt = require('bcryptjs')
const { getPrisma } = require('../common/db')
const { createAccessToken, extractBearer, resolveUser } = require('../common/jwt')
const { ok, created, badRequest, unauthorized, notFound, serverError, preflight } = require('../common/responses')

// Ports app/auth_routes.py. Route dispatch via __ow_path:
//   POST /signup, POST /login, GET /me, GET /activities, GET /activities/:id
async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  const path = params.__ow_path || ''

  if (method === 'options') return preflight()

  try {
    if (method === 'post' && path === '/signup') return await signup(params)
    if (method === 'post' && path === '/login') return await login(params)
    if (method === 'get' && path === '/me') return await me(params)
    if (method === 'get' && path === '/activities') return await listActivities(params)

    const activityMatch = path.match(/^\/activities\/(\d+)$/)
    if (method === 'get' && activityMatch) {
      return await activityDetail(params, parseInt(activityMatch[1], 10))
    }

    return notFound(`No route for ${method.toUpperCase()} ${path}`)
  } catch (e) {
    console.error('auth action error', e)
    return serverError(e.message || 'Internal error')
  }
}

async function signup (params) {
  const { email, display_name: displayName, password } = parseBody(params)
  if (!email || !displayName || !password) return badRequest('email, display_name, password required')

  const prisma = getPrisma()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return badRequest('Email already registered')

  const hashedPassword = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, displayName, hashedPassword }
  })

  const token = createAccessToken({ sub: user.email }, params)
  return created({ access_token: token, token_type: 'bearer' })
}

async function login (params) {
  const { email, password } = parseBody(params)
  if (!email || !password) return badRequest('email and password required')

  const prisma = getPrisma()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.hashedPassword))) {
    return unauthorized('Invalid email or password')
  }

  const token = createAccessToken({ sub: user.email }, params)
  return ok({ access_token: token, token_type: 'bearer' })
}

async function me (params) {
  const user = await authenticate(params)
  if (!user) return unauthorized()
  return ok({
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    created_at: user.createdAt
  })
}

async function listActivities (params) {
  const user = await authenticate(params)
  if (!user) return unauthorized()

  const skip = parseInt(params.skip || '0', 10)
  const take = Math.min(parseInt(params.limit || '50', 10), 200)

  const prisma = getPrisma()
  const rows = await prisma.activity.findMany({
    orderBy: { createdAt: 'desc' },
    skip,
    take,
    include: { user: { select: { displayName: true } } }
  })

  return ok(rows.map(a => ({
    id: a.id,
    tool: a.tool,
    action: a.action,
    input_summary: a.inputSummary,
    session_id: a.sessionId,
    status: a.status,
    error_message: a.errorMessage,
    result_summary: a.resultSummary,
    wf_url: a.wfUrl,
    initial_estimated_hours: a.initialEstimatedHours ?? deriveInitialHours(a.estimateData),
    estimated_hours: a.estimatedHours,
    submitted_by: a.user ? a.user.displayName : null,
    has_questionnaire: a.questionnaireData != null,
    has_estimate: a.estimateData != null,
    has_staffing: a.staffingSnapshot != null,
    created_at: a.createdAt
  })))
}

async function activityDetail (params, activityId) {
  const user = await authenticate(params)
  if (!user) return unauthorized()

  const prisma = getPrisma()
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      user: { select: { displayName: true } },
      staffingPlans: { include: { roles: true } }
    }
  })
  if (!activity) return notFound('Activity not found')

  let staffingSnapshot = activity.staffingSnapshot
  if (!staffingSnapshot && activity.staffingPlans[0]) {
    const plan = activity.staffingPlans[0]
    staffingSnapshot = {
      roles: plan.roles.map(r => ({
        role: r.roleName,
        allocated_hours: r.hoursAllocated || 0,
        rate: r.rate || 0,
        cost: r.cost || 0
      })),
      total_cost: plan.totalCost,
      timeline: plan.timeline,
      total_weeks: plan.totalWeeks
    }
  }

  return ok({
    id: activity.id,
    tool: activity.tool,
    action: activity.action,
    input_summary: activity.inputSummary,
    session_id: activity.sessionId,
    status: activity.status,
    error_message: activity.errorMessage,
    result_summary: activity.resultSummary,
    wf_url: activity.wfUrl,
    initial_estimated_hours: activity.initialEstimatedHours ?? deriveInitialHours(activity.estimateData),
    estimated_hours: activity.estimatedHours,
    submitted_by: activity.user ? activity.user.displayName : null,
    questionnaire_data: activity.questionnaireData,
    estimate_data: activity.estimateData,
    staffing_snapshot: staffingSnapshot,
    created_at: activity.createdAt
  })
}

async function authenticate (params) {
  const token = extractBearer(params)
  if (!token) return null
  return resolveUser(token, getPrisma(), params)
}

function parseBody (params) {
  // App Builder puts JSON body fields directly on params. If __ow_body is present
  // (e.g. raw mode), try to parse it as a fallback.
  if (params.email || params.password || params.display_name) return params
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

function deriveInitialHours (estimateData) {
  if (!estimateData) return null
  const src = estimateData.original_summary || estimateData.summary || {}
  return src.grand_total_hours ?? null
}

exports.main = main
