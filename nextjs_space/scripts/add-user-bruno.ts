import { prisma } from '../lib/db'
import bcrypt from 'bcryptjs'

/** La contraseña temporal se lee del entorno; ver scripts/bootstrap-admin.env.example. */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`❌ Define ${name} en el entorno antes de ejecutar.`)
    process.exit(1)
  }
  return value
}

const EMAIL = 'bruno.hess@dimensionexpert.com'

async function main() {
  const TEMP_PASSWORD = requireEnv('BRUNO_TEMP_PASSWORD')

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: 'dexpert' },
    select: { id: true, nombre: true }
  })
  if (!tenant) throw new Error('Tenant dexpert not found')

  const role = await prisma.role.findFirst({
    where: { tenantId: tenant.id, nombre: 'Admin' },
    select: { id: true }
  })
  if (!role) throw new Error('Role Admin for tenant dexpert not found')

  const hashedPassword = await bcrypt.hash(TEMP_PASSWORD, 10)

  const result = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      name: 'Bruno Hess',
      password: hashedPassword,
      tenantId: tenant.id,
      roleId: role.id,
      estado: 'activo',
      emailVerified: new Date(),
    },
    update: {
      name: 'Bruno Hess',
      password: hashedPassword,
      tenantId: tenant.id,
      roleId: role.id,
      estado: 'activo',
    },
  })

  const back = await prisma.user.findUnique({
    where: { id: result.id },
    select: {
      id: true, email: true, name: true, estado: true,
      tenantId: true, roleId: true,
      tenant: { select: { nombre: true, subdomain: true, slug: true } },
      role: { select: { nombre: true } }
    }
  })

  console.log(JSON.stringify({
    status: 'ok',
    user: {
      id: back?.id,
      email: back?.email,
      name: back?.name,
      estado: back?.estado,
      tenant: {
        id: back?.tenantId,
        nombre: back?.tenant?.nombre,
        subdomain: back?.tenant?.subdomain,
        slug: back?.tenant?.slug,
      },
      role: { id: back?.roleId, nombre: back?.role?.nombre },
    },
    instructions: [
      'Bruno logs in at https://dexpert.volkern.app/auth/login',
      'Email: ' + EMAIL,
      'Contraseña: la de BRUNO_TEMP_PASSWORD (cambiar en el primer login). No se imprime aquí.',
    ],
  }, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((e: any) => {
    console.error(JSON.stringify({ status: 'error', message: e?.message ?? 'unknown', code: e?.code ?? null }, null, 2))
    process.exit(1)
  })
