/**
 * compliance-alerts.ts
 *
 * Motor de detección de Alertas Inteligentes.
 * Escanea patrones de riesgo en tiempo real:
 * 1. Acciones fuera de flujo — intentos bloqueados, flujos interrumpidos
 * 2. Accesos inusuales — usuarios accediendo a entidades fuera de su scope
 * 3. Procesos incompletos — deals estancados, contratos sin firmar, cotizaciones sin enviar
 * 4. Cambios críticos — cambios de modo, configuraciones sensibles
 */

import { prisma } from '@/lib/db'
import { ComplianceGate } from './compliance-gate'

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type AlertCategory = 'flujo' | 'acceso' | 'proceso' | 'cambio_critico'
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface IntelligentAlert {
  id: string
  category: AlertCategory
  severity: AlertSeverity
  title: string
  description: string
  entityType?: string
  entityId?: string
  entityName?: string
  detectedAt: string
  expiresAt?: string
  metadata?: Record<string, any>
  /** Acción sugerida */
  action?: {
    label: string
    href?: string
  }
}

export interface IntelligentAlertSummary {
  total: number
  critical: number
  warning: number
  info: number
  byCategory: Record<AlertCategory, number>
  alerts: IntelligentAlert[]
  generatedAt: string
  mode: 'normal' | 'compliance'
}

/* ─── Detection Engine ────────────────────────────────────────────────────── */

export class ComplianceAlertsEngine {
  /**
   * Ejecuta todos los detectores y retorna alertas activas.
   */
  static async detectAll(tenantId: string): Promise<IntelligentAlertSummary> {
    const mode = await ComplianceGate.getMode(tenantId)

    const [
      flujoAlerts,
      accesoAlerts,
      procesoAlerts,
      cambioAlerts,
    ] = await Promise.all([
      this.detectOutOfFlow(tenantId),
      this.detectUnusualAccess(tenantId),
      this.detectIncompleteProcesses(tenantId),
      this.detectCriticalChanges(tenantId),
    ])

    const allAlerts = [
      ...flujoAlerts,
      ...accesoAlerts,
      ...procesoAlerts,
      ...cambioAlerts,
    ].sort((a, b) => {
      const order = { CRITICAL: 0, WARNING: 1, INFO: 2 }
      const orderDiff = (order[a.severity] ?? 99) - (order[b.severity] ?? 99)
      if (orderDiff !== 0) return orderDiff
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    })

    // Limitar a 50 alertas
    const limited = allAlerts.slice(0, 50)

    const byCategory = {
      flujo: flujoAlerts.length,
      acceso: accesoAlerts.length,
      proceso: procesoAlerts.length,
      cambio_critico: cambioAlerts.length,
    }

    return {
      total: allAlerts.length,
      critical: limited.filter(a => a.severity === 'CRITICAL').length,
      warning: limited.filter(a => a.severity === 'WARNING').length,
      info: limited.filter(a => a.severity === 'INFO').length,
      byCategory,
      alerts: limited,
      generatedAt: new Date().toISOString(),
      mode,
    }
  }

  /* ─── 1. Acciones fuera de flujo ───────────────────────────────────────── */

  private static async detectOutOfFlow(tenantId: string): Promise<IntelligentAlert[]> {
    const alerts: IntelligentAlert[] = []

    // 1.1 Compliance blocks recientes (últimos 7 días)
    const blocks = await prisma.auditLog.findMany({
      where: {
        tenantId,
        accion: 'COMPLIANCE_BLOCKED',
        fechaCreacion: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 10,
    })

    for (const block of blocks) {
      const meta = block.metadata as Record<string, any> | null
      alerts.push({
        id: `flujo-block-${block.id}`,
        category: 'flujo',
        severity: 'WARNING',
        title: 'Intento bloqueado por Compliance Gate',
        description: block.descripcion || `Acción ${block.accion} bloqueada en ${block.entidad} ${block.entidadId}`,
        entityType: block.entidad,
        entityId: block.entidadId,
        detectedAt: block.fechaCreacion.toISOString(),
        metadata: meta || undefined,
        action: {
          label: 'Revisar regla',
          href: '/dashboard/configuracion?section=compliance',
        },
      })
    }

    // 1.2 Cambios de etapa sin secuencia lógica (últimos 30 días)
    const stageChanges = await prisma.deal.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        titulo: true,
        etapa: true,
        fechaActualizacion: true,
      },
      orderBy: { fechaActualizacion: 'desc' },
      take: 50,
    })

    // No se puede detectar saltos de etapa sin historial; esto es referencial
    const saltosRapidos = stageChanges.filter(d => {
      const diffHours = (Date.now() - new Date(d.fechaActualizacion).getTime()) / (1000 * 3600)
      return diffHours < 1 && d.etapa === 'closed_won'
    })

    if (saltosRapidos.length > 3) {
      alerts.push({
        id: `flujo-rapido-${Date.now()}`,
        category: 'flujo',
        severity: 'INFO',
        title: 'Múltiples deals cerrados en poco tiempo',
        description: `${saltosRapidos.length} deals marcados como ganados en la última hora. Verificar que todos tienen contratos asociados.`,
        detectedAt: new Date().toISOString(),
        action: {
          label: 'Ir a Pipeline',
          href: '/dashboard/pipeline',
        },
      })
    }

    return alerts
  }

  /* ─── 2. Accesos inusuales ─────────────────────────────────────────────── */

  private static async detectUnusualAccess(tenantId: string): Promise<IntelligentAlert[]> {
    const alerts: IntelligentAlert[] = []

    // 2.1 Usuarios sin rol asignado que realizan acciones
    const usuariosSinRol = await prisma.user.findMany({
      where: {
        tenantId,
        estado: 'activo',
        roleId: null,
      },
      select: { id: true, name: true, email: true },
    })

    if (usuariosSinRol.length > 0) {
      // Verificar si han tenido actividad reciente
      const usuariosActivosSinRol = await prisma.user.count({
        where: {
          id: { in: usuariosSinRol.map(u => u.id) },
          auditLogs: {
            some: {
              tenantId,
              fechaCreacion: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
          },
        },
      })

      if (usuariosActivosSinRol > 0) {
        alerts.push({
          id: `acceso-sinrol-${Date.now()}`,
          category: 'acceso',
          severity: 'WARNING',
          title: 'Usuarios activos sin rol asignado',
          description: `${usuariosActivosSinRol} usuario(s) sin rol han realizado acciones en los últimos 7 días. Esto puede eludir controles de acceso.`,
          detectedAt: new Date().toISOString(),
          metadata: {
            totalSinRol: usuariosSinRol.length,
            activosSinRol: usuariosActivosSinRol,
            usuarios: usuariosSinRol.slice(0, 5).map(u => u.name || u.email),
          },
          action: {
            label: 'Gestionar Roles',
            href: '/dashboard/equipo/roles',
          },
        })
      }
    }

    // 2.2 Usuarios con intentos de acceso fallidos (simulado desde audit logs)
    const accionesEliminacion = await prisma.auditLog.findMany({
      where: {
        tenantId,
        entidad: 'User',
        accion: { in: ['DELETE', 'UPDATE'] },
        fechaCreacion: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      distinct: ['userId'],
      take: 10,
    })

    if (accionesEliminacion.length > 3) {
      alerts.push({
        id: `acceso-cambios-${Date.now()}`,
        category: 'acceso',
        severity: 'INFO',
        title: 'Múltiples cambios de usuarios recientes',
        description: `${accionesEliminacion.length} usuarios distintos han realizado cambios en usuarios en los últimos 30 días. Verificar que sean cambios autorizados.`,
        detectedAt: new Date().toISOString(),
        action: {
          label: 'Ver Equipo',
          href: '/dashboard/equipo',
        },
      })
    }

    return alerts
  }

  /* ─── 3. Procesos incompletos ──────────────────────────────────────────── */

  private static async detectIncompleteProcesses(tenantId: string): Promise<IntelligentAlert[]> {
    const alerts: IntelligentAlert[] = []

    // 3.1 Contratos en borrador sin firmar por más de 7 días
    const contractsPending = await prisma.contrato.findMany({
      where: {
        tenantId,
        estado: { in: ['borrador', 'enviado'] },
        firmadoPorCliente: false,
        fechaCreacion: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        titulo: true,
        estado: true,
        fechaCreacion: true,
        dealId: true,
      },
      orderBy: { fechaCreacion: 'asc' },
      take: 10,
    })

    if (contractsPending.length > 0) {
      alerts.push({
        id: `proceso-contratos-${Date.now()}`,
        category: 'proceso',
        severity: contractsPending.length > 5 ? 'CRITICAL' : 'WARNING',
        title: `${contractsPending.length} contrato(s) pendientes de firma`,
        description: `${contractsPending.length} contratos llevan más de 7 días en estado "${contractsPending[0].estado}" sin firmar. El más antiguo tiene ${Math.floor((Date.now() - new Date(contractsPending[0].fechaCreacion).getTime()) / (1000 * 60 * 60 * 24))} días.`,
        detectedAt: new Date().toISOString(),
        metadata: {
          count: contractsPending.length,
          oldestDays: Math.floor((Date.now() - new Date(contractsPending[0].fechaCreacion).getTime()) / (1000 * 60 * 60 * 24)),
          contratos: contractsPending.slice(0, 5).map(c => c.titulo || c.id),
        },
        action: {
          label: 'Ir a Contratos',
          href: '/dashboard/contratos',
        },
      })
    }

    // 3.2 Cotizaciones en borrador sin enviar por más de 14 días
    const quotesPending = await prisma.cotizacion.count({
      where: {
        tenantId,
        estado: 'borrador',
        fechaCreacion: { lte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
    })

    if (quotesPending > 0) {
      alerts.push({
        id: `proceso-cotizaciones-${Date.now()}`,
        category: 'proceso',
        severity: quotesPending > 10 ? 'WARNING' : 'INFO',
        title: `${quotesPending} cotización(es) en borrador sin enviar`,
        description: `${quotesPending} cotizaciones llevan más de 14 días en estado borrador sin ser enviadas. Revisar y completar o descartar.`,
        detectedAt: new Date().toISOString(),
        action: {
          label: 'Ir a Cotizaciones',
          href: '/dashboard/cotizaciones',
        },
      })
    }

    // 3.3 Deals estancados en misma etapa por más de 30 días
    const dealsStuck = await prisma.deal.findMany({
      where: {
        tenantId,
        etapa: { notIn: ['closed_won', 'closed_lost'] },
        fechaActualizacion: { lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        titulo: true,
        etapa: true,
        valor: true,
        fechaActualizacion: true,
      },
      orderBy: { fechaActualizacion: 'asc' },
      take: 10,
    })

    if (dealsStuck.length > 0) {
      const totalAmount = dealsStuck.reduce((sum, d) => sum + (d.valor || 0), 0)
      alerts.push({
        id: `proceso-deals-${Date.now()}`,
        category: 'proceso',
        severity: dealsStuck.length > 5 ? 'CRITICAL' : 'WARNING',
        title: `${dealsStuck.length} deal(s) estancados >30 días`,
        description: `${dealsStuck.length} deals no han cambiado de etapa en más de 30 días. Valor total estimado: ${totalAmount.toLocaleString()} ${dealsStuck[0]?.valor ? '€' : 'en riesgo'}.`,
        detectedAt: new Date().toISOString(),
        metadata: {
          count: dealsStuck.length,
          totalAmount,
          deals: dealsStuck.slice(0, 5).map(d => ({ id: d.id, title: d.titulo, stage: d.etapa, amount: d.valor })),
        },
        action: {
          label: 'Ir a Pipeline',
          href: '/dashboard/pipeline',
        },
      })
    }

    // 3.4 Tareas obligatorias sin completar
    const tareasObligatoriasPendientes = await prisma.task.count({
      where: {
        tenantId,
        tipo: 'obligatoria',
        completada: false,
      },
    })

    if (tareasObligatoriasPendientes > 0) {
      alerts.push({
        id: `proceso-tareas-${Date.now()}`,
        category: 'proceso',
        severity: tareasObligatoriasPendientes > 10 ? 'CRITICAL' : 'WARNING',
        title: `${tareasObligatoriasPendientes} tarea(s) obligatoria(s) pendiente(s)`,
        description: `Hay ${tareasObligatoriasPendientes} tareas de tipo obligatoria sin completar. Estas pueden estar bloqueando avances en pipeline.`,
        detectedAt: new Date().toISOString(),
        action: {
          label: 'Ir a Tareas',
          href: '/dashboard/tareas',
        },
      })
    }

    // 3.5 Aprobaciones pendientes de resolución
    const aprobacionesPendientes = await prisma.approvalRequest.count({
      where: {
        tenantId,
        status: 'pending',
      },
    })

    if (aprobacionesPendientes > 0) {
      const aprobacionesViejas = await prisma.approvalRequest.count({
        where: {
          tenantId,
          status: 'pending',
          createdAt: { lte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        },
      })

      alerts.push({
        id: `proceso-aprobaciones-${Date.now()}`,
        category: 'proceso',
        severity: aprobacionesViejas > 0 ? 'WARNING' : 'INFO',
        title: `${aprobacionesPendientes} aprobación(es) pendiente(s)`,
        description: `${aprobacionesPendientes} solicitudes de aprobación sin resolver${aprobacionesViejas > 0 ? ` (${aprobacionesViejas} con más de 3 días)` : ''}. Revisar y tomar acción.`,
        detectedAt: new Date().toISOString(),
        action: {
          label: 'Ir a Aprobaciones',
          href: '/dashboard/aprobaciones',
        },
      })
    }

    return alerts
  }

  /* ─── 4. Cambios críticos ─────────────────────────────────────────────── */

  private static async detectCriticalChanges(tenantId: string): Promise<IntelligentAlert[]> {
    const alerts: IntelligentAlert[] = []

    // 4.1 Cambios de modo Compliance
    const modeChanges = await prisma.auditLog.findMany({
      where: {
        tenantId,
        accion: 'COMPLIANCE_MODE_CHANGED',
        fechaCreacion: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 5,
      select: {
        id: true,
        descripcion: true,
        metadata: true,
        fechaCreacion: true,
      },
    })

    if (modeChanges.length > 0) {
      const latest = modeChanges[0]
      const meta = latest.metadata as Record<string, any> | null
      const newMode = meta?.newMode || 'desconocido'

      alerts.push({
        id: `cambio-mode-${latest.id}`,
        category: 'cambio_critico',
        severity: 'INFO',
        title: `Modo Compliance cambiado a "${newMode}"`,
        description: latest.descripcion || `Cambio de modo registrado el ${new Date(latest.fechaCreacion).toLocaleString('es-ES')}`,
        detectedAt:      latest.fechaCreacion.toISOString(),
        metadata: meta || undefined,
        action: {
          label: 'Ver Configuración',
          href: '/dashboard/configuracion?section=compliance',
        },
      })

      // Si hay múltiples cambios en poco tiempo, alertar
      if (modeChanges.length >= 3) {
        const firstDate = new Date(modeChanges[modeChanges.length - 1].fechaCreacion)
        const daysSpan = Math.ceil((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSpan <= 7) {
          alerts.push({
            id: `cambio-mode-frecuente-${Date.now()}`,
            category: 'cambio_critico',
            severity: 'WARNING',
            title: 'Cambios frecuentes de modo Compliance',
            description: `Se han registrado ${modeChanges.length} cambios de modo en los últimos ${daysSpan} días. Esto puede indicar inestabilidad en la configuración.`,
            detectedAt: new Date().toISOString(),
            metadata: { count: modeChanges.length, daysSpan },
            action: {
              label: 'Revisar Historial',
              href: '/dashboard/configuracion?section=compliance',
            },
          })
        }
      }
    }

    // 4.2 Eliminaciones recientes de entidades importantes
    const deletions = await prisma.auditLog.findMany({
      where: {
        tenantId,
        accion: { in: ['DELETE', 'delete'] },
        fechaCreacion: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 20,
    })

    if (deletions.length > 10) {
      alerts.push({
        id: `cambio-deletions-${Date.now()}`,
        category: 'cambio_critico',
        severity: 'WARNING',
        title: 'Volumen alto de eliminaciones',
        description: `Se han registrado ${deletions.length} eliminaciones de entidades en los últimos 3 días. Verificar que sean acciones legítimas.`,
        detectedAt: new Date().toISOString(),
        metadata: { count: deletions.length },
        action: {
          label: 'Ver Registro',
          href: '#',
        },
      })
    }

    return alerts
  }
}

export default ComplianceAlertsEngine
