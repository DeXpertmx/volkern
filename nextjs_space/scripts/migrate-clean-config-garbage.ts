#!/usr/bin/env npx tsx
/**
 * Migración: limpieza de claves basura en Configuracion de TODOS los tenants.
 *
 * Problema:
 *  - Versiones antiguas del formulario SMTP guardaban todo el objeto bajo la
 *    clave `data` (bug pre-fix a924099). Si las claves individuales
 *    (smtp_host, smtp_user, …) NO existen, `data` es la ÚNICA copia y no se
 *    puede borrar a ciegas.
 *  - El GET de /api/configuracion inyecta `_tenantId` en la respuesta; el
 *    formulario "Datos de la Empresa" lo enviaba de vuelta y el POST lo
 *    persistía como clave interna (prefijo `_`).
 *
 * Solución:
 *  1. Por cada tenant, si existe `data` con JSON de campos SMTP/IMAP, promover
 *     cada campo a su clave individual (upsert). Así no se pierde nada.
 *  2. Eliminar la clave `data` (ya migrada) y cualquier clave con prefijo `_`
 *     (claves internas).
 *  3. Reportar por tenant: campos promovidos y basura eliminada.
 *
 * Uso: npx tsx scripts/migrate-clean-config-garbage.ts [--dry-run]
 */
import { prisma, runWithTenant } from '../lib/db'

const DRY_RUN = process.argv.includes('--dry-run')

// Campos SMTP/IMAP conocidos que pueden vivir dentro de la clave legacy `data`
const CAMPOS_DATA = [
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password',
  'smtp_encryption', 'smtp_from_email', 'smtp_from_name', 'smtp_enabled',
  'imap_host', 'imap_port', 'imap_user', 'imap_password',
  'imap_encryption', 'imap_catchall', 'imap_enabled',
]

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function migrarTenant(tenantId: string, slug: string) {
  const resultado: { promovidos: string[]; basuraEliminada: string[]; error?: string } = {
    promovidos: [],
    basuraEliminada: [],
  }

  try {
    await runWithTenant(tenantId, async () => {
      const filas = await prisma.configuracion.findMany({
        where: { tenantId },
        select: { clave: true, valor: true },
      })

      // 1. Promover campos de la clave `data` (si existe y es JSON de SMTP/IMAP)
      const filaData = filas.find(f => f.clave === 'data')
      const clavesExistentes = new Set(filas.map(f => f.clave))
      if (filaData) {
        let parsed: unknown = null
        try { parsed = JSON.parse(filaData.valor) } catch { parsed = null }
        if (esObjetoPlano(parsed)) {
          const camposEnData = Object.keys(parsed)
          const camposDesconocidos = camposEnData.filter(c => !CAMPOS_DATA.includes(c))
          if (camposDesconocidos.length > 0) {
            // Guard de seguridad: no borrar `data` si contiene campos que no
            // sabemos promover (evitaría pérdida de datos inesperada).
            resultado.error = `data contiene campos desconocidos (${camposDesconocidos.join(', ')}) — se omite la promoción y el borrado`
            return
          }
          for (const campo of CAMPOS_DATA) {
            const valor = parsed[campo]
            if (valor === undefined || valor === null) continue
            const valorFinal = typeof valor === 'boolean'
              ? String(valor)
              : typeof valor === 'object'
                ? JSON.stringify(valor)
                : String(valor)
            if (DRY_RUN) {
              resultado.promovidos.push(`${campo} → (dry-run)`)
            } else if (!clavesExistentes.has(campo)) {
              // Solo crear las claves que faltan: si el tenant ya tiene la clave
              // individual (posiblemente más nueva que la del bug legacy `data`),
              // NO la sobrescribimos.
              await prisma.configuracion.create({
                data: { tenantId, clave: campo, valor: valorFinal },
              })
              resultado.promovidos.push(campo)
            } else {
              resultado.promovidos.push(`${campo} (ya existía, se conserva)`)
            }
          }
        }
      }

      // 2. Eliminar basura: `data` (ya migrada) y claves con prefijo `_`
      const basura = filas
        .filter(f => f.clave === 'data' || f.clave.startsWith('_'))
        .map(f => f.clave)

      if (basura.length > 0 && !resultado.error) {
        if (!DRY_RUN) {
          await prisma.configuracion.deleteMany({
            where: { tenantId, clave: { in: basura } },
          })
        }
        resultado.basuraEliminada = basura
      }
    })
  } catch (e) {
    resultado.error = e instanceof Error ? e.message : String(e)
  }

  return resultado
}

async function main() {
  console.log(DRY_RUN ? '🔍 MODO DRY-RUN (no se modifica nada)\n' : '🚀 Ejecutando migración real\n')

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, estado: true },
  })
  console.log(`Total tenants: ${tenants.length}\n`)

  let tenantsConCambios = 0
  for (const t of tenants) {
    const r = await migrarTenant(t.id, t.slug)
    if (r.error) {
      console.log(`[!] ${t.slug}: ERROR ${r.error.slice(0, 100)}`)
    } else if (r.promovidos.length > 0 || r.basuraEliminada.length > 0) {
      tenantsConCambios++
      console.log(`[${t.slug}]`)
      if (r.promovidos.length > 0) console.log(`   ✅ Promovidos de 'data': ${r.promovidos.join(', ')}`)
      if (r.basuraEliminada.length > 0) console.log(`   🗑️  Basura eliminada: ${r.basuraEliminada.join(', ')}`)
    } else {
      console.log(`[${t.slug}] sin basura`)
    }
  }

  console.log(`\nRESULTADO: ${tenantsConCambios} tenants con cambios` + (DRY_RUN ? ' (dry-run, nada modificado)' : ''))
  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
