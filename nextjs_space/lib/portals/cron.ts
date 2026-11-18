/**
 * Job de sindicación: cada 15 minutos revisa qué conexiones toca sincronizar
 * según su `syncFrequencyMinutes`.
 *
 * No hay lock distribuido (el servicio corre con una réplica), y el feed pull no
 * tiene coste de red: regenerar el documento es barato e idempotente.
 */

import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { runPortalSync } from './orchestrator'

export const JOB_ID_PORTAL_SYNC = 'portal-sync'
export const JOB_LABEL_PORTAL_SYNC = 'Sindicación multiportal'
export const JOB_SCHEDULE_PORTAL_SYNC = '*/15 * * * *'

/** Reintento con espera creciente: 1×, 2× y 4× la frecuencia tras cada fallo. */
function esperaMinimaMinutos(frecuencia: number, fallos: number): number {
  const factor = Math.pow(2, Math.min(Math.max(fallos, 0), 2))
  return frecuencia * factor
}

export async function runPortalSyncCron(): Promise<{ mensaje: string; avisos: string[] }> {
  const now = Date.now()
  const connections = await prisma.portalConnection.findMany({
    where: { enabled: true },
    select: {
      tenantId: true,
      portalKey: true,
      syncFrequencyMinutes: true,
      lastSyncAt: true,
      consecutiveFailures: true,
    },
  })

  let ejecutadas = 0
  const avisos: string[] = []

  for (const connection of connections) {
    const frecuencia = Math.max(connection.syncFrequencyMinutes, 60)
    const espera = esperaMinimaMinutos(frecuencia, connection.consecutiveFailures)
    const desde = connection.lastSyncAt?.getTime() ?? 0
    if (desde > 0 && now - desde < espera * 60_000) continue

    ejecutadas++
    try {
      const result = await runPortalSync({
        tenantId: connection.tenantId,
        portalKey: connection.portalKey,
        trigger: 'cron',
      })
      if (result.failed.length > 0) {
        avisos.push(
          `${connection.portalKey} (${connection.tenantId}): ${result.failed.length} inmueble(s) con error`
        )
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err)
      logger.warn(
        { tenantId: connection.tenantId, portalKey: connection.portalKey, err },
        '[portals] Sincronización de cron fallida'
      )
      avisos.push(`${connection.portalKey} (${connection.tenantId}): ${mensaje.slice(0, 160)}`)
    }
  }

  if (connections.length === 0) {
    return { mensaje: 'Sin conexiones de portal activas', avisos: [] }
  }

  return {
    mensaje: `${ejecutadas} de ${connections.length} portal(es) sincronizados`,
    avisos,
  }
}
