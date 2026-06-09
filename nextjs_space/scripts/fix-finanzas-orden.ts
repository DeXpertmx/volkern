/**
 * Script standalone: Corrige el orden del pipeline Finanzas (5 → 6)
 * para TODOS los tenants de una sola vez.
 *
 * Contexto: MODULE_PIPELINES definía Finanzas con orden 5 (duplicado con Compra).
 * Se corrigió en lib/pipelines.ts a orden 6, pero los tenants existentes
 * que ya tenían el pipeline creado con orden 5 necesitan esta migración.
 *
 * La migración dentro de seedTenantPipelines solo se ejecuta cuando un tenant
 * hace seed (auto-seed con count=0 o botón "Sincronizar Pipelines"). Este script
 * la aplica a todos los tenants sin depender del seed manual.
 *
 * Ejecución: npx tsx scripts/fix-finanzas-orden.ts
 */

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Corrigiendo orden del pipeline Finanzas (5 → 6)...\n')

  // ─── 1. Obtener todos los tenants ──────────────────────────────────────
  const tenants = await prisma.tenant.findMany({
    select: { id: true, nombre: true, slug: true, estado: true },
    orderBy: { fechaCreacion: 'asc' },
  })

  console.log(`📋 ${tenants.length} tenants encontrados en la BD\n`)

  let totalCorregidos = 0
  let totalYaCorrectos = 0
  let totalSinFinanzas = 0

  for (const tenant of tenants) {
    // ─── 2. Buscar pipeline Finanzas con orden 5 ──────────────────────────
    const finanzasWrongOrder = await prisma.pipeline.findFirst({
      where: {
        tenantId: tenant.id,
        categoria: 'finanzas',
        orden: 5,
      },
    })

    if (!finanzasWrongOrder) {
      // Verificar si existe en el orden correcto o simplemente no tiene pipeline Finanzas
      const finanzasCorrectOrder = await prisma.pipeline.findFirst({
        where: {
          tenantId: tenant.id,
          categoria: 'finanzas',
        },
      })

      if (finanzasCorrectOrder) {
        // Ya está en orden 6 (u otro orden válido) — nada que hacer
        totalYaCorrectos++
        console.log(
          `   ✅ ${tenant.nombre} (${tenant.slug}): Finanzas ya en orden ${finanzasCorrectOrder.orden} — correcto`
        )
      } else {
        totalSinFinanzas++
        console.log(
          `   ⬜ ${tenant.nombre} (${tenant.slug}): No tiene pipeline Finanzas`
        )
      }
      continue
    }

    // ─── 3. Corregir orden 5 → 6 ─────────────────────────────────────────
    await prisma.pipeline.update({
      where: { id: finanzasWrongOrder.id },
      data: { orden: 6 },
    })

    totalCorregidos++
    console.log(
      `   🔄 ${tenant.nombre} (${tenant.slug}): Finanzas corregido — orden 5 → 6`
    )
  }

  // ─── 4. Resumen final ──────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════')
  console.log('📊 RESUMEN')
  console.log('═══════════════════════════════════════════')
  console.log(`   Total tenants:            ${tenants.length}`)
  console.log(`   Corregidos (5 → 6):       ${totalCorregidos}`)
  console.log(`   Ya estaban correctos:     ${totalYaCorrectos}`)
  console.log(`   Sin pipeline Finanzas:    ${totalSinFinanzas}`)
  console.log('═══════════════════════════════════════════')

  if (totalCorregidos > 0) {
    console.log(`\n✅ Migración completada. ${totalCorregidos} tenant(s) corregido(s).`)
  } else if (totalSinFinanzas === tenants.length) {
    console.log('\n⚠️  Ningún tenant tiene pipeline Finanzas. Nada que migrar.')
  } else {
    console.log('\n✅ Todos los tenants ya tenían el orden correcto.')
  }
}

main()
  .catch((error) => {
    console.error('❌ Error durante la migración:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
