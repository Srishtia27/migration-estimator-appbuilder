const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
}

function json (statusCode, body) {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body
  }
}

function ok (body) { return json(200, body) }
function created (body) { return json(201, body) }
function badRequest (detail) { return json(400, { detail }) }
function unauthorized (detail = 'Not authenticated') { return json(401, { detail }) }
function forbidden (detail = 'Forbidden') { return json(403, { detail }) }
function notFound (detail = 'Not found') { return json(404, { detail }) }
function serverError (detail) { return json(500, { detail }) }

function preflight () {
  return { statusCode: 204, headers: DEFAULT_HEADERS, body: '' }
}

module.exports = { json, ok, created, badRequest, unauthorized, forbidden, notFound, serverError, preflight }
