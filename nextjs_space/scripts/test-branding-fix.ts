import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧪 Test: Verificar fix de branding endpoint')
  console.log('')

  // 1. Buscar tenant por subdominio (como hace el endpoint)
  console.log('1️⃣ Buscando tenant con subdomain=dexpert...')
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { subdomain: 'dexpert' },
      select: { id: true, nombre: true }
    })
    console.log(`   ✅ Resultado: ${tenant ? `ID=${tenant.id}, nombre=${tenant.nombre}` : 'No encontrado'}`)
  } catch (e: any) {
    console.log(`   ❌ ERROR (sería 500): ${e.message}`)
  }

  // 2. Buscar usuario bruno.hess@dimensionexpert.com con su tenant
  console.log('')
  console.log('2️⃣ Buscando usuario bruno.hess@dimensionexpert.com...')
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'bruno.hess@dimensionexpert.com' },
      select: {
        id: true,
        email: true,
        name: true,
        tenantId: true,
        tenant: {
          select: { id: true, nombre: true, slug: true, subdomain: true }
        }
      }
    })
    if (user) {
      console.log(`   ✅ Usuario: ${user.name} (${user.email})`)
      console.log(`   Tenant: ${user.tenant?.nombre} (slug=${user.tenant?.slug}, subdomain=${user.tenant?.subdomain || 'NULL'})`)
      
      // 3. Validación cruzada que hace el auth
      const requestSubdomain = 'dexpert'
      if (requestSubdomain && user.tenant?.subdomain !== requestSubdomain) {
        console.log(`   ❌ PROBLEMA: El subdominio del tenant es '${user.tenant?.subdomain}' pero se esperaba '${requestSubdomain}'`)
        console.log(`      Esto causa 401 en el login por validación cruzada`)
      } else {
        console.log(`   ✅ Validación cruzada OK: subdomain coincide`)
      }
    } else {
      console.log(`   ❌ Usuario no encontrado en la DB`)
    }
  } catch (e: any) {
    console.log(`   ❌ ERROR: ${e.message}`)
  }

  // 3. Buscar whitelabelConfig
  console.log('')
  console.log('3️⃣ Buscando whitelabel config...')
  try {
    const config = await prisma.whitelabelConfig.findFirst({
      orderBy: { fechaCreacion: 'desc' }
    })
    console.log(`   ✅ Whitelabel config: ${config ? `nombreEmpresa=${config.nombreEmpresa}` : 'No encontrada'}`)
  } catch (e: any) {
    console.log(`   ❌ ERROR: ${e.message}`)
  }

  console.log('')
  console.log('✨ Test completado')
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
