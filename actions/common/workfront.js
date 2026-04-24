// Minimal port of app/wf_client.py. Only the endpoints the migration flow uses
// (validate_connection + count) are implemented; convenience extractors aren't
// needed for count-based estimation.
const axios = require('axios')
const {
  WF_OBJ_CODE_MAP,
  TRANSACTIONAL_OBJECTS,
  FIXED_EFFORT_OBJECTS,
  MANUAL_MULTIPLIER_OBJECTS
} = require('./estimator')

const API_VERSION = 'v17.0'

// Canned counts for MOCK_WORKFRONT=1 — lets us exercise the full flow locally
// without real WF creds. Values mirror the smoke test fixture.
const MOCK_COUNTS = {
  group: 15, team: 80, role: 120, cmpy: 20, mpath: 5, prtl: 40, param: 350,
  ctgy: 60, user: 1500, arvpth: 8, sched: 3, port: 12, prgm: 20, tmpl: 200,
  proj: 5000, ttsk: 15000, task: 30000, optask: 8000, docu: 25000, note: 40000,
  ptlsec: 500, ptl: 60
}

function normalizeWorkfrontBaseUrl (url) {
  let s = (url || '').trim()
  if (!s) return s
  if (s.startsWith('ttps://')) s = 'h' + s
  else if (s.startsWith('ttp://')) s = 'h' + s
  if (!/^https?:\/\//.test(s)) s = 'https://' + s.replace(/^\/+/, '')
  return s.replace(/\/+$/, '')
}

class WorkfrontClient {
  constructor (baseUrl, apiKey) {
    this.baseUrl = normalizeWorkfrontBaseUrl(baseUrl)
    this.apiKey = apiKey
    this.apiBase = `${this.baseUrl}/attask/api/${API_VERSION}`
    this.client = axios.create({
      baseURL: this.apiBase,
      timeout: 30000,
      headers: { apiKey: this.apiKey }
    })
  }

  close () {
    this.apiKey = null
    if (this.client && this.client.defaults && this.client.defaults.headers) {
      delete this.client.defaults.headers.apiKey
    }
    this.client = null
  }

  async _get (endpoint, params = {}) {
    const resp = await this.client.get(endpoint, { params })
    const body = resp.data
    if (body && body.error) {
      throw new Error(body.error.message || JSON.stringify(body.error))
    }
    return body
  }

  async validateConnection () {
    if (process.env.MOCK_WORKFRONT === '1') return { connected: true, message: 'Mock connection' }
    try {
      await this._get('/user/search', { $$LIMIT: 1, fields: 'name' })
      return { connected: true, message: 'Connection successful' }
    } catch (e) {
      return { connected: false, message: e.message || String(e) }
    }
  }

  async count (objCode, filters = null) {
    if (process.env.MOCK_WORKFRONT === '1') {
      return Object.prototype.hasOwnProperty.call(MOCK_COUNTS, objCode) ? MOCK_COUNTS[objCode] : 0
    }
    try {
      const body = await this._get(`/${objCode}/count`, filters || {})
      return (body.data && body.data.count) || 0
    } catch (e) {
      return -1
    }
  }
}

async function fetchObjectCounts (client, { dateFilterYears = null } = {}) {
  const counts = {}
  const transactionalSet = new Set(TRANSACTIONAL_OBJECTS)

  for (const [objName, objCode] of Object.entries(WF_OBJ_CODE_MAP)) {
    try {
      let filters = null
      if (dateFilterYears && transactionalSet.has(objName)) {
        filters = {
          entryDate: `$$TODAY-${dateFilterYears}y`,
          entryDate_Range: '$$TODAY',
          entryDate_Mod: 'between'
        }
      }
      let c = await client.count(objCode, filters)
      if (c < 0 && filters) {
        // Fallback to unfiltered if date filter is rejected.
        c = await client.count(objCode)
      }
      counts[objName] = c >= 0 ? c : null
    } catch (_) {
      counts[objName] = null
    }
  }

  for (const name of Object.keys(FIXED_EFFORT_OBJECTS)) {
    if (!(name in counts)) counts[name] = null
  }
  for (const name of Object.keys(MANUAL_MULTIPLIER_OBJECTS)) {
    if (!(name in counts)) counts[name] = null
  }
  for (const name of TRANSACTIONAL_OBJECTS) {
    if (!(name in counts)) counts[name] = null
  }
  return counts
}

module.exports = {
  normalizeWorkfrontBaseUrl,
  WorkfrontClient,
  fetchObjectCounts
}
