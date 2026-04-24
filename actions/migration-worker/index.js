// Background worker — does the Workfront scan and writes results to Postgres.
// Replaces the daemon Thread in app/server.py::migration_start._run.
const { getPrisma } = require('../common/db')
const { WorkfrontClient, fetchObjectCounts, normalizeWorkfrontBaseUrl } = require('../common/workfront')
const { computeFullEstimate } = require('../common/estimator')

async function main (params) {
  const { session_id: sessionId, wf_url: wfUrl, api_key: apiKey, date_filter_years: dateFilterYears, fusion_scenarios: fusionScenarios = 0 } = params
  const prisma = getPrisma()
  const activity = await prisma.activity.findFirst({ where: { sessionId } })
  if (!activity) {
    console.error(`[migration-worker] no activity row for session ${sessionId}`)
    return { statusCode: 404, body: { detail: 'Activity not found' } }
  }

  let client
  try {
    await updateProgress(prisma, activity.id, 'running', 5, 'Connecting to Workfront...')
    client = new WorkfrontClient(normalizeWorkfrontBaseUrl(wfUrl), apiKey)
    const conn = await client.validateConnection()
    if (!conn.connected) {
      await markFailed(prisma, activity.id, `Connection failed: ${conn.message}`)
      return { statusCode: 200, body: { status: 'failed', error: conn.message } }
    }

    await updateProgress(prisma, activity.id, 'running', 20, 'Fetching object counts...')
    const objectCounts = await fetchObjectCounts(client, { dateFilterYears })

    await updateProgress(prisma, activity.id, 'running', 70, 'Calculating effort estimates...')
    const estimate = computeFullEstimate(objectCounts, { fusionScenarios })

    const totalHrs = estimate.summary.grand_total_hours
    const objCount = Object.keys(objectCounts).length
    await prisma.activity.update({
      where: { id: activity.id },
      data: {
        status: 'success',
        resultSummary: `Estimated ${totalHrs} hours, ${objCount} object types analyzed`,
        estimatedHours: totalHrs,
        initialEstimatedHours: activity.initialEstimatedHours ?? totalHrs,
        estimateData: {
          object_counts: objectCounts,
          estimate,
          errors: [],
          fusion_scenarios: fusionScenarios,
          progress: 100,
          current_step: 'Estimation complete!',
          date_filter_years: dateFilterYears || null
        }
      }
    })
    return { statusCode: 200, body: { status: 'success', session_id: sessionId } }
  } catch (e) {
    console.error('[migration-worker] error', e)
    await markFailed(prisma, activity.id, e.message || String(e))
    return { statusCode: 500, body: { detail: e.message } }
  } finally {
    if (client) client.close()
  }
}

async function updateProgress (prisma, activityId, status, progress, currentStep) {
  const current = await prisma.activity.findUnique({ where: { id: activityId } })
  const existing = current.estimateData || {}
  await prisma.activity.update({
    where: { id: activityId },
    data: {
      status,
      estimateData: { ...existing, progress, current_step: currentStep }
    }
  })
}

async function markFailed (prisma, activityId, message) {
  const current = await prisma.activity.findUnique({ where: { id: activityId } })
  const existing = current.estimateData || {}
  await prisma.activity.update({
    where: { id: activityId },
    data: {
      status: 'failed',
      errorMessage: message,
      estimateData: { ...existing, errors: [...(existing.errors || []), message] }
    }
  })
}

exports.main = main
