/**
 * Migración: Planes viejos (esencial/profesional/infinity) → Nuevo modelo (scale/compliance)
 *
 * Mapeo:
 *   esencial  → scale       (entry-level → base ilimitado)
 *   profesional → scale      (mid-tier → scale)
 *   infinity  → compliance   (top-tier → compliance con compliance_mode=true)
 *
 * Uso: npx tsx scripts/migrate-plans-to-new-model.ts
 *
 * Safe to run multiple times (solo actualiza tenants que aún tengan planes viejos).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PLAN_MAPPING: Record<string, string> = {
  esencial: 'scale',
  profesional: 'scale',
  infinity: 'compliance',
}

async function main() {
  console.log('=== Migración de planes al nuevo modelo (scale/compliance) ===\n')

  const tenantsToMigrate = await prisma.tenant.findMany({
    where: { plan: { in: Object.keys(PLAN_MAPPING) } },
    select: {
      id: true,
      nombre: true,
      plan: true,
      estado: true,
      stripeCustomerId: true,
      billingEmail: true,
    },
  })

  if (tenantsToMigrate.length === 0) {
    console.log('✅ No hay tenants con planes viejos. Nada que migrar.')
    await prisma.$disconnect()
    return
  }

  console.log(`Tenants a migrar: ${tenantsToMigrate.length}\n`)

  // Agrupar por plan actual
  const groups: Record<string, typeof tenantsToMigrate> = {}
  for (const t of tenantsToMigrate) {
    if (!groups[t.plan]) groups[t.plan] = []
    groups[t.plan].push(t)
  }
  for (const [plan, list] of Object.entries(groups)) {
    console.log(`  ${plan} → ${PLAN_MAPPING[plan]}: ${list.length} tenant(s)`)
  }
  console.log('')

  // Migrar en una transacción
  const results = await prisma.$transaction(async (tx) => {
    const updated: Array<{ id: string; nombre: string; oldPlan: string; newPlan: string }> = []
    const errors: Array<{ id: string; nombre: string; error: string }> = []

    for (const tenant of tenantsToMigrate) {
      const newPlan = PLAN_MAPPING[tenant.plan]
      if (!newPlan) {
        errors.push({ id: tenant.id, nombre: tenant.nombre, error: `No hay mapeo para plan "${tenant.plan}"` })
        continue
      }

      try {
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            plan: newPlan,
            // Mantenemos enabledModules intacto — los nuevos planes tienen módulos más amplios,
            // así que ningún módulo se pierde. Si acaso, se ganan.
          },
        })

        // Crear entrada de auditoría
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            accion: 'MIGRACION_PLAN',
            entidad: 'Tenant',
            entidadId: tenant.id,
            descripcion: `Migración automática: plan "${tenant.plan}" → "${newPlan}"`,
            cambiosAntes: { plan: tenant.plan },
            cambiosDespues: { plan: newPlan },
            metadata: {
              migracion: 'plans-to-new-model',
              fecha: new Date().toISOString(),
            },
          },
        })

        updated.push({ id: tenant.id, nombre: tenant.nombre, oldPlan: tenant.plan, newPlan })
        console.log(`  ✅ ${tenant.nombre} (${tenant.id.slice(0, 8)}): ${tenant.plan} → ${newPlan}`)
      } catch (err: any) {
        errors.push({ id: tenant.id, nombre: tenant.nombre, error: err.message })
        console.error(`  ❌ ${tenant.nombre}: ${err.message}`)
      }
    }

    return { updated, errors }
  })

  // Resumen
  console.log('\n=== Resumen ===')
  console.log(`  Actualizados: ${results.updated.length}`)
  console.log(`  Errores:      ${results.errors.length}`)

  if (results.errors.length > 0) {
    console.log('\nErrores:')
    for (const e of results.errors) {
      console.log(`  - ${e.nombre}: ${e.error}`)
    }
  }

  console.log('\n✅ Migración completada.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Error fatal:', e)
  prisma.$disconnect()
  process.exit(1)
})
