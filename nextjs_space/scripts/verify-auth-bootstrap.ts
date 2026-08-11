import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Verificando que las credenciales bootstrap funcionan\n')

  const cases = [
    { email: 'admin@volkern.app',          password: 'Admin123!' },
    { email: 'admin@dexpert.volkern.app',  password: 'Dexpert123!' },
  ]

  for (const c of cases) {
    const cleaned = c.email.trim().toLowerCase()
    const user = await prisma.user.findUnique({
      where: { email: cleaned },
      include: {
        tenant: { select: { subdomain: true, accountType: true } },
        role:   { select: { nombre:    true } },
      },
    })
    if (!user) {
      console.log(`❌ ${c.email} → NOT FOUND`)
      continue
    }
    if (!user.password) {
      console.log(`❌ ${c.email} → SIN password`)
      continue
    }
    const match = await bcrypt.compare(c.password, user.password)
    const storedHashPrefix = user.password.slice(0, 7)
    console.log(
      `${match ? '✅' : '❌'} ${c.email.padEnd(40)} hash=${storedHashPrefix}…` +
      `  pwd:${match?'OK':'NO'}  tenant=${user.tenant?.subdomain ?? '∅'}  role=${user.role?.nombre ?? '∅'}`
    )
  }

  // Simulate the exact subdomain detection from lib/auth.ts
  console.log('\n=== Lógica de detección de subdominio (lib/auth.ts l.30-45) ===')
  const RESERVED = new Set(['www','app','api','auth','login','register','dashboard','webcreator','admin'])
  for (const host of ['dexpert.volkern.app', 'admin.volkern.app', 'volkern.app']) {
    const cleanHost = host.replace(/:.*$/, '')
    let requestSubdomain: string | null = null
    if (cleanHost.includes('.volkern.app')) {
      const parts = cleanHost.split('.')
      if (parts.length >= 3) requestSubdomain = parts[0]
    }
    const isReserved = requestSubdomain ? RESERVED.has(requestSubdomain) : false
    console.log(`  ${host.padEnd(28)} → subdomain=${requestSubdomain ?? '∅'}, isReserved=${isReserved}`)
  }

  // Check the exact auth flow per subdomain
  console.log('\n=== Test del flow completo de authorize() por subdominio ===')
  for (const host of ['dexpert.volkern.app', 'admin.volkern.app']) {
    const cleanHost = host.replace(/:.*$/, '')
    let requestSubdomain: string | null = null
    if (cleanHost.includes('.volkern.app')) {
      const parts = cleanHost.split('.')
      if (parts.length >= 3) requestSubdomain = parts[0]
    }
    const isReserved = requestSubdomain ? RESERVED.has(requestSubdomain) : false

    // Para cada user, simulamos lo que authorize hace
    const testEmail = requestSubdomain === 'admin'
      ? 'admin@volkern.app'
      : 'admin@dexpert.volkern.app'
    const testPassword = requestSubdomain === 'admin' ? 'Admin123!' : 'Dexpert123!'

    const user = await prisma.user.findUnique({
      where: { email: testEmail.toLowerCase() },
      include: {
        tenant: { select: { subdomain: true } },
        role:   { select: { nombre:    true } },
      },
    })

    if (!user) {
      console.log(`  ${host} ${testEmail}: USER NOT FOUND`)
      continue
    }
    if (requestSubdomain && !isReserved && user.tenant?.subdomain !== requestSubdomain) {
      console.log(`  ${host} ${testEmail}: ❌ MISMATCH subdomain request=${requestSubdomain} user.tenant=${user.tenant?.subdomain}`)
      continue
    }
    const pwdOk = await bcrypt.compare(testPassword, user.password!)
    console.log(`  ${host} ${testEmail}: ${pwdOk ? '✅ AUTH OK' : '❌ PASSWORD WRONG'}  (subdomain=${requestSubdomain}, role=${user.role?.nombre})`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
