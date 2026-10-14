
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

// Cargar variables de entorno
dotenv.config({ path: ['.env.local', '.env'] });

const prisma = new PrismaClient()

/**
 * Script para migrar etapas de deals al formato correcto
 * Este script normaliza los nombres de las etapas para que coincidan con PipelineStage.nombre
 */

async function main() {
  console.log('🔄 Iniciando migración de etapas de deals...\n')

  try {
    // Obtener todos los tenants
    const tenants = await prisma.tenant.findMany({
      select: { id: true, nombre: true }
    })

    console.log(`📋 Encontrados ${tenants.length} tenants\n`)

    let totalDealsUpdated = 0

    for (const tenant of tenants) {
      console.log(`\n🏢 Procesando tenant: ${tenant.nombre} (${tenant.id})`)

      // Obtener las etapas del tenant
      const stages = await prisma.pipelineStage.findMany({
        where: { tenantId: tenant.id },
        select: { nombre: true }
      })

      if (stages.length === 0) {
        console.log(`⚠️  No hay etapas configuradas para este tenant`)
        continue
      }

      // Obtener todos los deals del tenant
      const deals = await prisma.deal.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, etapa: true, titulo: true }
      })

      if (deals.length === 0) {
        console.log(`   No hay deals para migrar`)
        continue
      }

      console.log(`   📦 Encontrados ${deals.length} deals`)

      // Crear un mapa de normalización (sin acentos, minúsculas) -> nombre correcto
      const stageMap = new Map<string, string>()
      stages.forEach(stage => {
        const normalized = stage.nombre
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
        stageMap.set(normalized, stage.nombre)
      })

      let dealsUpdated = 0

      // Actualizar cada deal
      for (const deal of deals) {
        // Normalizar la etapa actual del deal
        const normalizedEtapa = deal.etapa
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')

        // Buscar el nombre correcto
        const correctStageName = stageMap.get(normalizedEtapa)

        if (correctStageName && correctStageName !== deal.etapa) {
          // Actualizar el deal
          await prisma.deal.update({
            where: { id: deal.id },
            data: { etapa: correctStageName }
          })
          
          console.log(`   ✅ Deal "${deal.titulo}": "${deal.etapa}" → "${correctStageName}"`)
          dealsUpdated++
        }
      }

      if (dealsUpdated > 0) {
        console.log(`   ✨ ${dealsUpdated} deals actualizados en este tenant`)
        totalDealsUpdated += dealsUpdated
      } else {
        console.log(`   ✓ Todos los deals ya tienen etapas correctas`)
      }
    }

    console.log(`\n✅ Migración completada!`)
    console.log(`📊 Total de deals actualizados: ${totalDealsUpdated}`)

  } catch (error) {
    console.error('❌ Error durante la migración:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
