// Create the seed admin user if it doesn't exist. Mirrors the SEED_USER_* behavior
// from the existing Render deployment (see render.yaml).
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

async function main () {
  const prisma = new PrismaClient()
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const displayName = process.env.SEED_USER_DISPLAY_NAME || 'Admin'

  if (!email || !password) {
    console.log('SEED_USER_EMAIL / SEED_USER_PASSWORD not set — skipping.')
    await prisma.$disconnect()
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Seed user ${email} already exists (id=${existing.id}).`)
  } else {
    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, displayName, hashedPassword }
    })
    console.log(`Created seed user ${email} (id=${user.id}).`)
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
