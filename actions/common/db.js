const { PrismaClient } = require('@prisma/client')

let prisma

function getPrisma (params) {
  if (params && params.DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = params.DATABASE_URL
  }
  if (!prisma) {
    prisma = new PrismaClient()
  }
  return prisma
}

module.exports = { getPrisma }
