// Smoke test for the auth action: invokes main() directly with simulated
// OpenWhisk-style params. Run with `node test/smoke-auth.js`.
require('dotenv').config()
const { main } = require('../actions/auth/index.js')

function envParams (extra = {}) {
  return {
    JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
    JWT_EXPIRE_MINUTES: process.env.JWT_EXPIRE_MINUTES,
    DATABASE_URL: process.env.DATABASE_URL,
    ENV: process.env.ENV || 'development',
    ...extra
  }
}

function assert (cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1) }
  console.log('✅ ' + msg)
}

async function run () {
  // 1. Login with seed user
  let res = await main(envParams({
    __ow_method: 'post',
    __ow_path: '/login',
    email: process.env.SEED_USER_EMAIL,
    password: process.env.SEED_USER_PASSWORD
  }))
  assert(res.statusCode === 200, `POST /login returns 200 (got ${res.statusCode})`)
  assert(res.body.access_token, 'login returns access_token')
  const token = res.body.access_token

  // 2. /me with Bearer
  res = await main(envParams({
    __ow_method: 'get',
    __ow_path: '/me',
    __ow_headers: { authorization: `Bearer ${token}` }
  }))
  assert(res.statusCode === 200, `GET /me returns 200 (got ${res.statusCode})`)
  assert(res.body.email === process.env.SEED_USER_EMAIL, `GET /me returns correct email`)

  // 3. /me without token → 401
  res = await main(envParams({ __ow_method: 'get', __ow_path: '/me' }))
  assert(res.statusCode === 401, `GET /me without token returns 401 (got ${res.statusCode})`)

  // 4. /login with wrong password → 401
  res = await main(envParams({
    __ow_method: 'post',
    __ow_path: '/login',
    email: process.env.SEED_USER_EMAIL,
    password: 'wrong'
  }))
  assert(res.statusCode === 401, `login with bad password returns 401 (got ${res.statusCode})`)

  // 5. Signup duplicate → 400
  res = await main(envParams({
    __ow_method: 'post',
    __ow_path: '/signup',
    email: process.env.SEED_USER_EMAIL,
    display_name: 'Dup',
    password: 'whatever'
  }))
  assert(res.statusCode === 400, `signup with duplicate email returns 400 (got ${res.statusCode})`)

  // 6. /activities (should be empty list initially)
  res = await main(envParams({
    __ow_method: 'get',
    __ow_path: '/activities',
    __ow_headers: { authorization: `Bearer ${token}` }
  }))
  assert(res.statusCode === 200, `GET /activities returns 200 (got ${res.statusCode})`)
  assert(Array.isArray(res.body), 'GET /activities returns array')

  // 7. Unknown path → 404
  res = await main(envParams({ __ow_method: 'get', __ow_path: '/nope' }))
  assert(res.statusCode === 404, `unknown path returns 404 (got ${res.statusCode})`)

  console.log('\nAll smoke checks passed.')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
