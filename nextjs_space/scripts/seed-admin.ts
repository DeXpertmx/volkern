/**
 * Seed script to create the admin user for local development.
 * Run: npx tsx scripts/seed-admin.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Creating local admin user...\n')

  // 1. Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'local-dev-tenant' },
    update: {},
    create: {
      id: 'local-dev-tenant',
      nombre: 'Volkern Dev',
      slug: 'volkern-dev',
      plan: 'enterprise',
      estado: 'activo',
    },
  })
  console.log('✅ Tenant created:', tenant.nombre)

  // 2. Create admin role
  const adminRole = await prisma.role.upsert({
    where: { id: 'local-admin-role' },
    update: {},
    create: {
      id: 'local-admin-role',
      nombre: 'Administrador',
      descripcion: 'Acceso total al sistema',
      tenantId: tenant.id,
      permisos: {
        // La última llave es el alcance: sin ella, quien entra al pipeline
        // solo ve sus leads asignados.
        leads: { ver: true, crear: true, editar: true, eliminar: true, ver_todos: true },
        citas: { ver: true, crear: true, editar: true, eliminar: true },
        mensajes: { ver: true, crear: true, editar: true, eliminar: true },
        campanas: { ver: true, crear: true, editar: true, eliminar: true },
        pages: { ver: true, crear: true, editar: true, eliminar: true },
        configuracion: { ver: true, crear: true, editar: true, eliminar: true },
        equipo: { ver: true, crear: true, editar: true, eliminar: true },
        cursos: { ver: true, crear: true, editar: true, eliminar: true },
        estudiantes: { ver: true, crear: true, editar: true, eliminar: true },
        automatizaciones: { ver: true, crear: true, editar: true, eliminar: true },
        analytics: { ver: true, crear: true, editar: true, eliminar: true },
      },
    },
  })
  console.log('✅ Admin role created:', adminRole.nombre)

  // 3. Create TenantFeatures for the tenant (sidebar visibility)
  const modules = [
    'analytics', 'tareas', 'leads', 'contactos', 'empresas', 'pipeline',
    'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring',
    'mensajes', 'citas', 'catalogo', 'chatbot_whatsapp',
    'campanas', 'email_marketing', 'cms',
    'cursos', 'estudiantes',
    'automatizaciones',
    'mi_tarjeta',
    'equipo', 'integraciones',
  ]

  for (const mod of modules) {
    await prisma.tenantFeature.upsert({
      where: {
        tenantId_feature: {
          tenantId: tenant.id,
          feature: mod,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        feature: mod,
        habilitado: true,
      },
    })
  }
  console.log('✅ Tenant features created:', modules.length, 'modules')

  // 4. Create admin user
  const hashedPassword = await bcrypt.hash('Admin12345@', 12)

  // ⚠️ update NUNCA toca password para no sobrescribir la contraseña del usuario
  const user = await prisma.user.upsert({
    where: { email: 'bruno.hess@dimensionexpert.com' },
    update: {
      roleId: adminRole.id,
      tenantId: tenant.id,
    },
    create: {
      email: 'bruno.hess@dimensionexpert.com',
      name: 'Bruno Hess',
      password: hashedPassword,
      roleId: adminRole.id,
      tenantId: tenant.id,
    },
  })
  console.log('✅ Admin user created:', user.email)

  console.log('\n🚀 Local database is ready!')
  console.log('   Login: bruno.hess@dimensionexpert.com')
  console.log('   Password: Admin12345@')
  console.log('   URL: http://localhost:3001/auth/login')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('❌ Error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
