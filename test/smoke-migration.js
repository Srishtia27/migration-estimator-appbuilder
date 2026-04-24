// End-to-end smoke test for the async migration flow:
//   login → POST /migration/start → poll /migration/status → GET /migration/results
// Workfront API is mocked with nock so no real WF creds are needed.
require('dotenv').config()
const nock = require('nock')
const { main: authMain } = require('../actions/auth/index.js')
const { main: startMain } = require('../actions/migration-start/index.js')
const { main: statusMain } = require('../actions/migration-status/index.js')
const { main: resultsMain } = require('../actions/migration-results/index.js')

const WF_HOST = 'https://test.my.workfront.com'

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
    __ow_method: 'post', __ow_path: '/login',
    email: process.env.SEED_USER_EMAIL,
    password: process.env.SEED_USER_PASSWORD
  }))
  return res.body.access_token
}

function mockWorkfront () {
  // validate_connection hits /user/search
  nock(WF_HOST)
    .get('/attask/api/v17.0/user/search')
    .query(true)
    .reply(200, { data: [] })

  // /count for every object code used by fetch_object_counts. Return varied counts.
  const sample = {
    group: 15, team: 80, role: 120, cmpy: 20, mpath: 5, prtl: 40, param: 350,
    ctgy: 60, user: 1500, arvpth: 8, sched: 3, port: 12, prgm: 20, tmpl: 200,
    proj: 5000, ttsk: 15000, task: 30000, optask: 8000, docu: 25000, note: 40000,
    ptlsec: 500, ptl: 60
  }
  for (const [code, cnt] of Object.entries(sample)) {
    nock(WF_HOST)
      .get(`/attask/api/v17.0/${code}/count`)
      .query(true)
      .reply(200, { data: { count: cnt } })
      .persist()
  }
}

async function waitUntilDone (token, sessionId, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await statusMain(env({
      __ow_method: 'get',
      __ow_path: `/status/${sessionId}`,
      __ow_headers: { authorization: `Bearer ${token}` }
    }))
    if (res.body.status === 'completed' || res.body.status === 'failed') return res.body
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('timeout waiting for worker to finish')
}

async function run () {
  mockWorkfront()

  const token = await login()
  const auth = { authorization: `Bearer ${token}` }

  // 1. /migration/start
  let res = await startMain(env({
    __ow_method: 'post',
    __ow_headers: auth,
    wf_url: WF_HOST,
    api_key: 'fake-api-key-for-test',
    fusion_scenarios: 2
  }))
  assert(res.statusCode === 200, `POST /migration/start returns 200 (got ${res.statusCode})`)
  assert(res.body.session_id, 'start returns session_id')
  const sessionId = res.body.session_id

  // 2. /migration/start without auth → 401
  const unauth = await startMain(env({
    __ow_method: 'post',
    wf_url: WF_HOST,
    api_key: 'x'
  }))
  assert(unauth.statusCode === 401, `POST /migration/start without auth returns 401`)

  // 3. /migration/start missing fields → 400
  const bad = await startMain(env({
    __ow_method: 'post',
    __ow_headers: auth
  }))
  assert(bad.statusCode === 400, `POST /migration/start with missing body returns 400`)

  // 4. Immediately poll status (worker is still running)
  res = await statusMain(env({
    __ow_method: 'get',
    __ow_path: `/status/${sessionId}`,
    __ow_headers: auth
  }))
  assert(res.statusCode === 200, `GET /migration/status returns 200 (got ${res.statusCode})`)
  assert(['started', 'running', 'completed'].includes(res.body.status), `status is a known value (${res.body.status})`)

  // 5. Poll status of unknown session → 404
  res = await statusMain(env({
    __ow_method: 'get',
    __ow_path: '/status/nonexistent',
    __ow_headers: auth
  }))
  assert(res.statusCode === 404, `unknown session status returns 404`)

  // 6. While running, /results should return 202
  res = await resultsMain(env({
    __ow_method: 'get',
    __ow_path: `/results/${sessionId}`,
    __ow_headers: auth
  }))
  assert([200, 202].includes(res.statusCode), `GET /results during/after run returns 200 or 202 (got ${res.statusCode})`)

  // 7. Wait for worker, then results
  const final = await waitUntilDone(token, sessionId)
  assert(final.status === 'completed', `worker finishes with status=completed (got ${final.status})`)

  res = await resultsMain(env({
    __ow_method: 'get',
    __ow_path: `/results/${sessionId}`,
    __ow_headers: auth
  }))
  assert(res.statusCode === 200, `GET /results after completion returns 200 (got ${res.statusCode})`)
  assert(res.body.estimate && res.body.estimate.summary, 'results include estimate.summary')
  assert(res.body.object_counts && res.body.object_counts.Users === 1500, 'object_counts.Users matches mocked value')
  assert(res.body.estimate.summary.grand_total_hours > 0, `grand_total_hours > 0 (${res.body.estimate.summary.grand_total_hours})`)
  assert(res.body.fusion_scenarios === 2, 'fusion_scenarios preserved through the flow')

  // 8. Results for unknown session → 404
  res = await resultsMain(env({
    __ow_method: 'get',
    __ow_path: '/results/nonexistent',
    __ow_headers: auth
  }))
  assert(res.statusCode === 404, `results for unknown session returns 404`)

  nock.cleanAll()
  console.log('\nAll async migration flow checks passed.')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
