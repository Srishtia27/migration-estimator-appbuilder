const jwt = require('jsonwebtoken')

const ALGORITHM = 'HS256'

function getSecret (params = {}) {
  const secret = params.JWT_SECRET_KEY || process.env.JWT_SECRET_KEY
  const env = params.ENV || process.env.ENV || 'development'
  if (env === 'production' && !secret) {
    throw new Error('JWT_SECRET_KEY is required in production')
  }
  return secret || 'dev-secret-change-in-production'
}

function getExpireMinutes (params = {}) {
  const raw = params.JWT_EXPIRE_MINUTES || process.env.JWT_EXPIRE_MINUTES || '1440'
  return parseInt(raw, 10)
}

function createAccessToken (payload, params = {}) {
  return jwt.sign(payload, getSecret(params), {
    algorithm: ALGORITHM,
    expiresIn: `${getExpireMinutes(params)}m`
  })
}

function verifyAccessToken (token, params = {}) {
  try {
    return jwt.verify(token, getSecret(params), { algorithms: [ALGORITHM] })
  } catch (e) {
    return null
  }
}

function extractBearer (params = {}) {
  const headers = params.__ow_headers || {}
  const auth = headers.authorization || headers.Authorization
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

async function resolveUser (token, prisma, params = {}) {
  const decoded = verifyAccessToken(token, params)
  if (!decoded || !decoded.sub) return null
  const user = await prisma.user.findUnique({ where: { email: decoded.sub } })
  if (!user || !user.isActive) return null
  return user
}

module.exports = {
  createAccessToken,
  verifyAccessToken,
  extractBearer,
  resolveUser
}
