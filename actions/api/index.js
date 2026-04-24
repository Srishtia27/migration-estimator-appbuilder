// Monolithic dispatcher so the unchanged React bundle can hit one base URL
// (.../api/v1/web/migration-estimator/api) and keep its FastAPI-shaped paths:
// /auth/login, /migration/start, /migration/staffing/:id, etc.
//
// Same routing logic as scripts/local-server.js, collapsed into a single
// action main() that delegates to the per-feature action handlers.
const authAction = require('../auth/index.js').main
const estimateAction = require('../migration-estimate/index.js').main
const staffingAction = require('../staffing/index.js').main
const startAction = require('../migration-start/index.js').main
const statusAction = require('../migration-status/index.js').main
const resultsAction = require('../migration-results/index.js').main

function delegate (handler, params, subPath) {
  return handler({ ...params, __ow_path: subPath })
}

async function main (params) {
  // OpenWhisk passes bound inputs as params, not process.env. Promote the ones
  // Prisma / jwt libs read from process.env so sub-action handlers just work.
  if (params.DATABASE_URL) process.env.DATABASE_URL = params.DATABASE_URL
  if (params.JWT_SECRET_KEY) process.env.JWT_SECRET_KEY = params.JWT_SECRET_KEY
  if (params.JWT_EXPIRE_MINUTES) process.env.JWT_EXPIRE_MINUTES = String(params.JWT_EXPIRE_MINUTES)

  const path = (params.__ow_path || '/').replace(/\/+$/, '') || '/'

  // /auth/* — auth action already routes by __ow_path
  if (path.startsWith('/auth')) {
    return delegate(authAction, params, path.slice('/auth'.length) || '/')
  }

  // /migration/* — fan out to the right per-feature action
  if (path === '/migration/start') return delegate(startAction, params, '/start')

  let m
  if ((m = path.match(/^\/migration\/status\/(.+)$/))) return delegate(statusAction, params, `/status/${m[1]}`)
  if ((m = path.match(/^\/migration\/results\/(.+)$/))) return delegate(resultsAction, params, `/results/${m[1]}`)

  if (path === '/migration/estimate-from-counts') return delegate(estimateAction, params, '/estimate-from-counts')
  if (path === '/migration/recalculate') return delegate(estimateAction, params, '/recalculate')
  if (path === '/migration/refetch-counts') return delegate(estimateAction, params, '/refetch-counts')

  if (path === '/migration/staffing') return delegate(staffingAction, params, '/staffing')
  if ((m = path.match(/^\/migration\/staffing\/(.+)$/))) return delegate(staffingAction, params, `/staffing/${m[1]}`)
  if (path === '/migration/update-hours') return delegate(staffingAction, params, '/update-hours')
  if (path === '/migration/save-snapshot') return delegate(staffingAction, params, '/save-snapshot')

  return {
    statusCode: 404,
    headers: { 'content-type': 'application/json' },
    body: { detail: `No route for ${path}` }
  }
}

exports.main = main
