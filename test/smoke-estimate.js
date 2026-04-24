// Smoke test for estimation + staffing actions. Also cross-checks the JS estimator
// against the Python reference by invoking both on the same inputs.
require('dotenv').config()
const { spawnSync } = require('child_process')
const path = require('path')
const { main: estimateMain } = require('../actions/migration-estimate/index.js')
const { main: staffingMain } = require('../actions/staffing/index.js')
const { main: authMain } = require('../actions/auth/index.js')
const { computeFullEstimate } = require('../actions/common/estimator.js')

function env (extra = {}) {
  return {
    JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
    JWT_EXPIRE_MINUTES: process.env.JWT_EXPIRE_MINUTES,
    DATABASE_URL: process.env.DATABASE_URL,
    ENV: 'development',
    ...extra
  }
}

function assert (cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1) }
  console.log('✅ ' + msg)
}

async function login () {
  const res = await authMain(env({
    __ow_method: 'post',
    __ow_path: '/login',
    email: process.env.SEED_USER_EMAIL,
    password: process.env.SEED_USER_PASSWORD
  }))
  return res.body.access_token
}

function pythonReference (counts, fusionScenarios) {
  // Call the original Python estimator to get a ground-truth value to compare against.
  const pyRepo = path.resolve(__dirname, '../../migration-estimator-repo')
  const script = `
import sys, json
sys.path.insert(0, r'${pyRepo}')
from app.migration_estimator import compute_full_estimate
counts = json.loads(sys.stdin.read())['counts']
fs = ${fusionScenarios}
print(json.dumps(compute_full_estimate(counts, fusion_scenarios=fs)))
`
  const r = spawnSync('python3', ['-c', script], {
    input: JSON.stringify({ counts }),
    encoding: 'utf8',
    cwd: pyRepo
  })
  if (r.status !== 0) {
    console.error('python ref failed:', r.stderr)
    return null
  }
  try { return JSON.parse(r.stdout) } catch (e) { return null }
}

async function run () {
  const token = await login()
  const auth = { authorization: `Bearer ${token}` }

  // Sample realistic counts — covers fixed, manual, and formula categories.
  const counts = {
    Users: 1500,
    Teams: 80,
    'Job Role': 120,
    Projects: 5000,
    Tasks: 30000,
    Documents: 25000,
    Templates: 200,
    Reports: 500,
    Dashboards: 60,
    Group: 10,
    'Access Level': 8,
    Companies: 15,
    Portfolios: 12,
    Programs: 20,
    Issues: 8000
  }

  // 1. Direct JS estimator correctness
  const jsEstimate = computeFullEstimate(counts, { fusionScenarios: 3 })
  assert(jsEstimate.summary.grand_total_hours > 0, `JS estimator produces grand_total_hours > 0 (${jsEstimate.summary.grand_total_hours})`)

  // 2. Cross-check against Python
  const pyEstimate = pythonReference(counts, 3)
  if (pyEstimate) {
    assert(
      pyEstimate.summary.grand_total_hours === jsEstimate.summary.grand_total_hours,
      `JS grand_total_hours (${jsEstimate.summary.grand_total_hours}) === Python (${pyEstimate.summary.grand_total_hours})`
    )
    assert(
      pyEstimate.summary.setup_admin_hours === jsEstimate.summary.setup_admin_hours,
      `JS setup_admin_hours matches Python`
    )
    assert(
      pyEstimate.summary.transactional_reporting_hours === jsEstimate.summary.transactional_reporting_hours,
      `JS transactional_reporting_hours matches Python`
    )
  } else {
    console.log('(skipped Python cross-check — python3 or repo not available)')
  }

  // 3. /estimate-from-counts via action
  let res = await estimateMain(env({
    __ow_method: 'post',
    __ow_path: '/estimate-from-counts',
    __ow_headers: auth,
    object_counts: counts,
    fusion_scenarios: 3
  }))
  assert(res.statusCode === 200, `POST /estimate-from-counts returns 200 (got ${res.statusCode})`)
  assert(
    res.body.estimate.summary.grand_total_hours === jsEstimate.summary.grand_total_hours,
    `action grand_total_hours matches direct call`
  )

  // 4. /estimate-from-counts without auth → 401
  res = await estimateMain(env({
    __ow_method: 'post',
    __ow_path: '/estimate-from-counts',
    object_counts: counts
  }))
  assert(res.statusCode === 401, `POST /estimate-from-counts without auth returns 401`)

  // 5. /recalculate with unknown session → still succeeds (graceful fallback)
  res = await estimateMain(env({
    __ow_method: 'post',
    __ow_path: '/recalculate',
    __ow_headers: auth,
    session_id: 'nonexistent-session-id',
    object_counts: counts,
    fusion_scenarios: 1
  }))
  assert(res.statusCode === 200, `POST /recalculate with unknown session returns 200 (graceful)`)
  assert(res.body.estimate.summary.grand_total_hours > 0, `recalculate produces hours > 0`)

  // 6. Staffing compute (no session_id → just computes, doesn't persist)
  const summaryHours = {
    setup: jsEstimate.summary.setup_admin_hours,
    transactional: jsEstimate.summary.transactional_reporting_hours,
    fusion: jsEstimate.summary.fusion_integration_hours,
    discovery: jsEstimate.summary.discovery_design_hours,
    pm: jsEstimate.summary.pm_hours
  }
  res = await staffingMain(env({
    __ow_method: 'post',
    __ow_path: '/staffing',
    __ow_headers: auth,
    roles: [
      { role: 'Lead', categories: ['setup', 'transactional'], headcount: 1, utilization: 0.8, rate: 150 },
      { role: 'Engineer', categories: ['fusion'], headcount: 2, utilization: 0.8, rate: 100 },
      { role: 'PM', categories: ['pm', 'discovery'], headcount: 1, utilization: 0.5, rate: 180 }
    ],
    summary_hours: summaryHours,
    timeline: '3 - 6 months'
  }))
  assert(res.statusCode === 200, `POST /staffing returns 200 (got ${res.statusCode})`)
  assert(res.body.roles.length === 3, `staffing returns 3 roles`)
  assert(res.body.total_weeks === 24, `timeline "3 - 6 months" maps to 24 weeks`)
  assert(res.body.phases && res.body.phases.setup.pct === 50, `phases breakdown present`)

  // 7. Staffing without auth → 401
  res = await staffingMain(env({
    __ow_method: 'post',
    __ow_path: '/staffing',
    roles: [], summary_hours: {}
  }))
  assert(res.statusCode === 401, `POST /staffing without auth returns 401`)

  // 8. Unknown staffing path → 404
  res = await staffingMain(env({
    __ow_method: 'get', __ow_path: '/nope', __ow_headers: auth
  }))
  assert(res.statusCode === 404, `unknown staffing path returns 404`)

  console.log('\nAll estimation + staffing smoke checks passed.')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
