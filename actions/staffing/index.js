const { getPrisma } = require('../common/db')
const { extractBearer, resolveUser } = require('../common/jwt')
const { ok, badRequest, unauthorized, notFound, forbidden, serverError, preflight } = require('../common/responses')

// Ports:
//   POST /migration/staffing           → computeAndSaveStaffing
//   GET  /migration/staffing/{session} → getStaffing
//   POST /migration/update-hours       → updateHours
//   POST /migration/save-snapshot      → saveSnapshot

const TIMELINE_WEEKS = {
  '1 - 3 months': 12,
  '3 - 6 months': 24,
  '6 - 12 months': 48,
  '12+ months': 52
}

async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  const path = params.__ow_path || ''
  if (method === 'options') return preflight()

  try {
    const user = await authenticate(params)
    if (!user) return unauthorized()

    if (method === 'post' && path === '/staffing') return await computeAndSaveStaffing(params, user)
    if (method === 'post' && path === '/update-hours') return await updateHours(params, user)
    if (method === 'post' && path === '/save-snapshot') return await saveSnapshot(params, user)

    const m = path.match(/^\/staffing\/([^/]+)$/)
    if (method === 'get' && m) return await getStaffing(m[1])

    return notFound(`No route for ${method.toUpperCase()} ${path}`)
  } catch (e) {
    console.error('staffing action error', e)
    return serverError(e.message || 'Internal error')
  }
}

function computePlan (rolesInput, summaryHours, timeline) {
  const hours = summaryHours || {}
  const timelineWeeks = timeline ? (TIMELINE_WEEKS[timeline] || 0) : 0
  const roles = []
  let totalHours = 0
  let totalHeadcount = 0
  let totalCost = 0

  for (const r of rolesInput || []) {
    const cats = r.categories || []
    const allocated = cats.reduce((s, c) => s + (Number(hours[c]) || 0), 0)
    const hc = Math.max(1, Number(r.headcount) || 1)
    const util = Math.max(0.1, Math.min(1.0, Number(r.utilization) || 0.8))
    const weeklyCapacity = hc * 40 * util
    const durationWeeks = weeklyCapacity > 0 ? round1(allocated / weeklyCapacity) : 0
    const rate = Math.max(0, Number(r.rate) || 0)
    const cost = round2(Math.round(allocated) * rate)

    roles.push({
      role: r.role,
      seniority: r.seniority || '',
      categories: cats,
      allocated_hours: Math.round(allocated),
      headcount: hc,
      utilization: util,
      duration_weeks: durationWeeks,
      rate,
      cost
    })
    totalHours += Math.round(allocated)
    totalHeadcount += hc
    totalCost += cost
  }

  const totalWeeks = timelineWeeks > 0
    ? timelineWeeks
    : round1(Math.max(0, ...roles.map(r => r.duration_weeks)))

  const phases = totalWeeks > 0 ? buildPhases(totalWeeks) : null

  return { roles, totalHours, totalHeadcount, totalCost, totalWeeks, phases }
}

function buildPhases (totalWeeks) {
  return {
    prepare: { start_week: 0, end_week: round1(totalWeeks * 0.2), pct: 20 },
    setup:   { start_week: round1(totalWeeks * 0.2), end_week: round1(totalWeeks * 0.7), pct: 50 },
    launch:  { start_week: round1(totalWeeks * 0.7), end_week: round1(totalWeeks * 0.8), pct: 10 },
    enhance: { start_week: round1(totalWeeks * 0.8), end_week: round1(totalWeeks), pct: 20 }
  }
}

async function computeAndSaveStaffing (params, user) {
  const body = parseBody(params)
  const plan = computePlan(body.roles, body.summary_hours, body.timeline)

  if (body.session_id) {
    const prisma = getPrisma()
    const activity = await prisma.activity.findFirst({ where: { sessionId: body.session_id } })
    if (activity) {
      const existing = await prisma.staffingPlan.findFirst({ where: { activityId: activity.id } })
      if (existing) await prisma.staffingPlan.delete({ where: { id: existing.id } })

      const created = await prisma.staffingPlan.create({
        data: {
          activityId: activity.id,
          totalWeeks: plan.totalWeeks,
          totalCost: plan.totalCost,
          timeline: body.timeline || null
        }
      })
      await prisma.staffingRole.createMany({
        data: plan.roles.map(r => ({
          staffingPlanId: created.id,
          roleName: r.role,
          categories: JSON.stringify(r.categories),
          hoursAllocated: r.allocated_hours,
          headcount: r.headcount,
          utilization: r.utilization,
          durationWeeks: r.duration_weeks,
          rate: r.rate,
          cost: r.cost
        }))
      })
      await prisma.activity.update({
        where: { id: activity.id },
        data: {
          staffingSnapshot: {
            roles: plan.roles,
            total_cost: round2(plan.totalCost),
            timeline: body.timeline || null,
            total_weeks: plan.totalWeeks
          }
        }
      })
    }
  }

  return ok({
    roles: plan.roles,
    total_hours: plan.totalHours,
    total_weeks: plan.totalWeeks,
    total_headcount: plan.totalHeadcount,
    total_cost: round2(plan.totalCost),
    timeline: body.timeline || null,
    phases: plan.phases
  })
}

async function getStaffing (sessionId) {
  const prisma = getPrisma()
  const activity = await prisma.activity.findFirst({ where: { sessionId } })
  if (!activity) return notFound('Activity not found')

  const plan = await prisma.staffingPlan.findFirst({
    where: { activityId: activity.id },
    include: { roles: true }
  })
  if (!plan) return notFound('No staffing plan found')

  let totalHours = 0, totalHeadcount = 0, totalCost = 0
  const roles = plan.roles.map(r => {
    let cats = r.categories
    if (typeof cats === 'string') { try { cats = JSON.parse(cats) } catch (_) { cats = [] } }
    const rate = r.rate || 0
    const allocHrs = Math.round(r.hoursAllocated || 0)
    const cost = r.cost != null ? r.cost : round2(allocHrs * rate)
    totalHours += allocHrs
    totalHeadcount += r.headcount
    totalCost += cost
    return {
      role: r.roleName,
      categories: cats,
      allocated_hours: allocHrs,
      headcount: r.headcount,
      utilization: r.utilization,
      duration_weeks: r.durationWeeks,
      rate,
      cost
    }
  })

  const tw = plan.totalWeeks || 0
  return ok({
    roles,
    total_hours: totalHours,
    total_weeks: plan.totalWeeks,
    total_headcount: totalHeadcount,
    total_cost: round2(totalCost),
    timeline: plan.timeline,
    phases: tw > 0 ? buildPhases(tw) : null
  })
}

async function updateHours (params, user) {
  const body = parseBody(params)
  if (!body.session_id || body.estimated_hours == null) {
    return badRequest('session_id and estimated_hours are required')
  }
  const prisma = getPrisma()
  const activity = await prisma.activity.findFirst({ where: { sessionId: body.session_id } })
  if (!activity) return notFound('Activity not found')
  await prisma.activity.update({
    where: { id: activity.id },
    data: { estimatedHours: Number(body.estimated_hours) }
  })
  return ok({ ok: true })
}

async function saveSnapshot (params, user) {
  const body = parseBody(params)
  if (!body.session_id) return badRequest('session_id is required')
  const prisma = getPrisma()
  const activity = await prisma.activity.findFirst({ where: { sessionId: body.session_id } })
  if (!activity) return notFound('Activity not found')
  if (activity.userId !== user.id) return forbidden('Not authorized')

  const data = {}
  if (body.questionnaire_data !== undefined) data.questionnaireData = body.questionnaire_data
  if (body.estimate_data !== undefined) data.estimateData = body.estimate_data
  if (body.staffing_snapshot !== undefined) data.staffingSnapshot = body.staffing_snapshot

  if (Object.keys(data).length) {
    await prisma.activity.update({ where: { id: activity.id }, data })
  }
  return ok({ ok: true })
}

async function authenticate (params) {
  const token = extractBearer(params)
  if (!token) return null
  return resolveUser(token, getPrisma(), params)
}

function parseBody (params) {
  if (params.roles || params.session_id || params.summary_hours) return params
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

function round1 (x) { return Math.round(x * 10) / 10 }
function round2 (x) { return Math.round(x * 100) / 100 }

exports.main = main
