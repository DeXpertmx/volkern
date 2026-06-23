/**
 * compliance-score.ts
 *
 * Motor de cálculo del Score de Cumplimiento.
 * Evalúa 5 categorías y genera un score global 0-100
 * con desglose por categoría, tendencia y alertas.
 */

import { prisma } from '@/lib/db'
import { ComplianceGate } from './compliance-gate'

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface ScoreCategory {
  id: string
  name: string
  description: string
  icon: string
  weight: number // 0-1, suma total = 1
  score: number // 0-100
  maxScore: number // 100
  details: {
    label: string
    value: string | number
    status: 'good' | 'warning' | 'critical'
  }[]
}

export interface ComplianceScoreReport {
  overall: number // 0-100
  trend: 'up' | 'down' | 'stable'
  trendDelta: number // puntos de cambio vs periodo anterior
  categories: ScoreCategory[]
  mode: 'normal' | 'compliance'
  alerts: {
    count: number
    critical: number
    warning: number
  }
  summary: string
  generatedAt: string
}

/* ─── Service ──────────────────────────────────────────────────────────────── */

export class ComplianceScoreService {
  /**
   * Calcula el score completo de compliance para un tenant
   */
  static async calculate(tenantId: string): Promise<ComplianceScoreReport> {
    const mode = await ComplianceGate.getMode(tenantId)

    const [
      trazabilidad,
      documentacion,
      procesos,
      accesos,
      alertas,
    ] = await Promise.all([
      this.scoreTrazabilidad(tenantId),
      this.scoreDocumentacion(tenantId),
      this.scoreProcesos(tenantId),
      this.scoreAccesos(tenantId),
      this.scoreAlertas(tenantId),
    ])

    const categories: ScoreCategory[] = [
      trazabilidad,
      documentacion,
      procesos,
      accesos,
      alertas,
    ]

    // Score global ponderado
    const overall = Math.round(
      categories.reduce((acc, cat) => acc + cat.score * cat.weight, 0)
    )

    // Conteo de alertas
    const alertCounts = this.countAlerts(categories)

    // Resumen ejecutivo
    const summary = this.generateSummary(overall, mode, categories)

    // Tendencia (simulada contra último cálculo almacenado)
    const trend = await this.getTrend(tenantId, overall)

    return {
      overall,
      trend: trend.direction,
      trendDelta: trend.delta,
      categories,
      mode,
      alerts: alertCounts,
      summary,
      generatedAt: new Date().toISOString(),
    }
  }

  /* ─── Categoría 1: Trazabilidad (25%) ─────────────────────────────────── */

  private static async scoreTrazabilidad(tenantId: string): Promise<ScoreCategory> {
    const details: ScoreCategory['details'] = []
    let score = 100

    // 1.1 Auditoría activa — ¿existen registros de auditoría?
    const auditCount = await prisma.auditLog.count({
      where: { tenantId },
    })

    if (auditCount === 0) {
      score -= 40
      details.push({
        label: 'Registros de auditoría',
        value: 'Sin registros',
        status: 'critical',
      })
    } else {
      const recentAudits = await prisma.auditLog.count({
        where: {
          tenantId,
          fechaCreacion: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      })
      details.push({
        label: 'Registros de auditoría',
        value: `${auditCount.toLocaleString()} total (${recentAudits} últ. 30d)`,
        status: recentAudits > 0 ? 'good' : 'warning',
      })
      if (recentAudits === 0) score -= 15
    }

    // 1.2 Hash chain — verificar que haya audit hash en contratos
    const contratosConHash = await prisma.contrato.count({
      where: {
        tenantId,
        auditHash: { not: null },
      },
    })
    const totalContratos = await prisma.contrato.count({
      where: { tenantId },
    })

    if (totalContratos > 0) {
      const ratio = contratosConHash / totalContratos
      details.push({
        label: 'Contratos sellados (hash)',
        value: `${contratosConHash}/${totalContratos}`,
        status: ratio >= 0.9 ? 'good' : ratio >= 0.5 ? 'warning' : 'critical',
      })
      if (ratio < 0.5) score -= 20
      else if (ratio < 0.9) score -= 10
    } else {
      details.push({
        label: 'Contratos sellados (hash)',
        value: 'Sin contratos',
        status: 'warning',
      })
      score -= 5
    }

    // 1.3 Compliance Gate activo
    const gateMode = await ComplianceGate.getMode(tenantId)
    details.push({
      label: 'Modo Compliance Gate',
      value: gateMode === 'compliance' ? 'Activado' : 'Desactivado',
      status: gateMode === 'compliance' ? 'good' : 'warning',
    })
    if (gateMode === 'normal') score -= 15

    return {
      id: 'trazabilidad',
      name: 'Trazabilidad',
      description: 'Registro inmutable de acciones y sellado digital',
      icon: 'ShieldCheck',
      weight: 0.25,
      score: Math.max(0, score),
      maxScore: 100,
      details,
    }
  }

  /* ─── Categoría 2: Documentación (20%) ────────────────────────────────── */

  private static async scoreDocumentacion(tenantId: string): Promise<ScoreCategory> {
    const details: ScoreCategory['details'] = []
    let score = 100

    // 2.1 Contratos firmados digitalmente
    const totalContratos = await prisma.contrato.count({
      where: { tenantId },
    })
    const contratosFirmados = await prisma.contrato.count({
      where: {
        tenantId,
        firmadoPorCliente: true,
        firmadoPorEmpresa: true,
      },
    })

    if (totalContratos > 0) {
      const ratio = contratosFirmados / totalContratos
      details.push({
        label: 'Contratos firmados digitalmente',
        value: `${contratosFirmados}/${totalContratos} (${Math.round(ratio * 100)}%)`,
        status: ratio >= 0.8 ? 'good' : ratio >= 0.4 ? 'warning' : 'critical',
      })
      if (ratio < 0.4) score -= 30
      else if (ratio < 0.8) score -= 15
    } else {
      details.push({
        label: 'Contratos firmados digitalmente',
        value: 'Sin contratos',
        status: 'warning',
      })
      score -= 10
    }

    // 2.2 Cotizaciones con estado completo
    const totalCotizaciones = await prisma.cotizacion.count({
      where: { tenantId },
    })
    const cotizacionesCompletas = await prisma.cotizacion.count({
      where: {
        tenantId,
        estado: { in: ['enviada', 'aceptada', 'facturada'] },
      },
    })

    if (totalCotizaciones > 0) {
      const ratio = cotizacionesCompletas / totalCotizaciones
      details.push({
        label: 'Cotizaciones completadas',
        value: `${cotizacionesCompletas}/${totalCotizaciones}`,
        status: ratio >= 0.6 ? 'good' : ratio >= 0.3 ? 'warning' : 'critical',
      })
      if (ratio < 0.3) score -= 20
      else if (ratio < 0.6) score -= 10
    }

    // 2.3 Páginas activas en WebCreator (proxy razonable: `Documento` no existe como modelo Prisma)
    const documentosWeb = await prisma.page.count({
      where: { tenantId, estado: { not: 'draft' } },
    })
    details.push({
      label: 'Páginas activas (WebCreator)',
      value: documentosWeb > 0 ? `${documentosWeb} publicadas` : 'Sin páginas',
      status: documentosWeb > 0 ? 'good' : 'warning',
    })
    if (documentosWeb === 0) score -= 10

    return {
      id: 'documentacion',
      name: 'Documentación',
      description: 'Gestión documental, firmas y contratos',
      icon: 'FileText',
      weight: 0.20,
      score: Math.max(0, score),
      maxScore: 100,
      details,
    }
  }

  /* ─── Categoría 3: Procesos (25%) ─────────────────────────────────────── */

  private static async scoreProcesos(tenantId: string): Promise<ScoreCategory> {
    const details: ScoreCategory['details'] = []
    let score = 100

    // 3.1 Workflows activos y ejecutados
    const workflowsActivos = await prisma.tenantWorkflow.count({
      where: { tenantId, isActive: true },
    })
    details.push({
      label: 'Workflows activos',
      value: `${workflowsActivos} activos`,
      status: workflowsActivos > 0 ? 'good' : 'warning',
    })
    if (workflowsActivos === 0) score -= 15

    // 3.2 Tareas completadas
    const totalTareas = await prisma.task.count({
      where: { tenantId },
    })
    const tareasCompletadas = await prisma.task.count({
      where: { tenantId, completada: true },
    })

    if (totalTareas > 0) {
      const ratio = tareasCompletadas / totalTareas
      details.push({
        label: 'Tareas completadas',
        value: `${tareasCompletadas}/${totalTareas} (${Math.round(ratio * 100)}%)`,
        status: ratio >= 0.7 ? 'good' : ratio >= 0.4 ? 'warning' : 'critical',
      })
      if (ratio < 0.4) score -= 25
      else if (ratio < 0.7) score -= 10
    } else {
      details.push({
        label: 'Tareas completadas',
        value: 'Sin tareas',
        status: 'warning',
      })
      score -= 5
    }

    // 3.3 Aprobaciones
    const totalAprobaciones = await prisma.approvalRequest.count({
      where: { tenantId },
    })
    const aprobacionesResueltas = await prisma.approvalRequest.count({
      where: { tenantId, status: { in: ['approved', 'rejected'] } },
    })

    if (totalAprobaciones > 0) {
      const ratio = aprobacionesResueltas / totalAprobaciones
      details.push({
        label: 'Aprobaciones resueltas',
        value: `${aprobacionesResueltas}/${totalAprobaciones}`,
        status: ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'warning' : 'critical',
      })
      if (ratio < 0.5) score -= 20
      else if (ratio < 0.8) score -= 10
    }

    return {
      id: 'procesos',
      name: 'Procesos',
      description: 'Workflows, tareas obligatorias y aprobaciones',
      icon: 'Workflow',
      weight: 0.25,
      score: Math.max(0, score),
      maxScore: 100,
      details,
    }
  }

  /* ─── Categoría 4: Accesos y Roles (15%) ──────────────────────────────── */

  private static async scoreAccesos(tenantId: string): Promise<ScoreCategory> {
    const details: ScoreCategory['details'] = []
    let score = 100

    // 4.1 Usuarios con roles asignados
    const totalUsuarios = await prisma.user.count({
      where: { tenantId, estado: 'activo' },
    })
    const usuariosConRol = await prisma.user.count({
      where: {
        tenantId,
        estado: 'activo',
        roleId: { not: null },
      },
    })

    if (totalUsuarios > 0) {
      const ratio = usuariosConRol / totalUsuarios
      details.push({
        label: 'Usuarios con rol asignado',
        value: `${usuariosConRol}/${totalUsuarios}`,
        status: ratio >= 0.9 ? 'good' : ratio >= 0.6 ? 'warning' : 'critical',
      })
      if (ratio < 0.6) score -= 25
      else if (ratio < 0.9) score -= 10
    }

    // 4.2 Roles definidos en el tenant
    const rolesDefinidos = await prisma.role.count({
      where: { tenantId },
    })
    details.push({
      label: 'Roles definidos',
      value: `${rolesDefinidos} roles`,
      status: rolesDefinidos >= 3 ? 'good' : rolesDefinidos >= 1 ? 'warning' : 'critical',
    })
    if (rolesDefinidos < 1) score -= 20
    else if (rolesDefinidos < 3) score -= 10

    return {
      id: 'accesos',
      name: 'Accesos y Roles',
      description: 'Control de accesos, roles y permisos',
      icon: 'Users',
      weight: 0.15,
      score: Math.max(0, score),
      maxScore: 100,
      details,
    }
  }

  /* ─── Categoría 5: Alertas (15%) ──────────────────────────────────────── */

  private static async scoreAlertas(tenantId: string): Promise<ScoreCategory> {
    const details: ScoreCategory['details'] = []
    let score = 100

    // 5.1 Alertas activas del sistema
    const alertasActivas = await prisma.systemAlert.count({
      where: {
        resolved: false,
      },
    })
    const alertasCriticas = await prisma.systemAlert.count({
      where: {
        level: 'CRITICAL',
        resolved: false,
      },
    })
    const alertasWarning = await prisma.systemAlert.count({
      where: {
        level: 'WARNING',
        resolved: false,
      },
    })

    details.push({
      label: 'Alertas activas',
      value: `${alertasActivas} (${alertasCriticas} críticas, ${alertasWarning} warnings)`,
      status: alertasCriticas === 0 && alertasActivas === 0
        ? 'good'
        : alertasCriticas === 0 && alertasActivas <= 3
          ? 'warning'
          : 'critical',
    })

    if (alertasCriticas > 0) score -= alertasCriticas * 20
    if (alertasWarning > 0) score -= alertasWarning * 10
    if (alertasActivas > 5) score -= 10

    // 5.2 Compliance Blocks (intentos bloqueados)
    const blocksRecientes = await prisma.auditLog.count({
      where: {
        tenantId,
        accion: 'COMPLIANCE_BLOCKED',
        fechaCreacion: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    })
    details.push({
      label: 'Intentos bloqueados (7d)',
      value: `${blocksRecientes} bloqueos`,
      status: blocksRecientes === 0 ? 'good' : blocksRecientes <= 5 ? 'warning' : 'critical',
    })
    if (blocksRecientes > 5) score -= 15
    else if (blocksRecientes > 0) score -= 5

    return {
      id: 'alertas',
      name: 'Alertas y Prevención',
      description: 'Alertas del sistema y detección de riesgos',
      icon: 'AlertTriangle',
      weight: 0.15,
      score: Math.max(0, score),
      maxScore: 100,
      details,
    }
  }

  /* ─── Helpers ──────────────────────────────────────────────────────────── */

  private static countAlerts(categories: ScoreCategory[]) {
    let critical = 0
    let warning = 0
    let count = 0

    for (const cat of categories) {
      for (const d of cat.details) {
        if (d.status === 'critical') {
          critical++
          count++
        } else if (d.status === 'warning') {
          warning++
          count++
        }
      }
    }

    return { count, critical, warning }
  }

  private static generateSummary(
    overall: number,
    mode: 'normal' | 'compliance',
    categories: ScoreCategory[]
  ): string {
    const peorCategoria = categories.reduce((peor, cat) =>
      cat.score < peor.score ? cat : peor
    )

    if (mode === 'normal') {
      return `Score ${overall}% — Modo Normal. Activa Compliance Mode para aplicar gates de control. Área con más margen de mejora: ${peorCategoria.name} (${peorCategoria.score}%).`
    }

    if (overall >= 90) {
      return `Excelente: ${overall}% de cumplimiento. Todos los procesos bajo control con Compliance Mode activo.`
    }
    if (overall >= 70) {
      return `Buen nivel: ${overall}%. Revisa ${peorCategoria.name} (${peorCategoria.score}%) para mejorar la puntuación.`
    }
    if (overall >= 50) {
      return `Nivel medio: ${overall}%. Se recomienda reforzar ${peorCategoria.name} (${peorCategoria.score}%) y revisar las alertas activas.`
    }
    return `Score crítico: ${overall}%. Es necesario revisar ${peorCategoria.name} y las alertas del sistema urgentemente.`
  }

  private static async getTrend(
    tenantId: string,
    currentScore: number
  ): Promise<{ direction: 'up' | 'down' | 'stable'; delta: number }> {
    try {
      const prevLog = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          accion: 'COMPLIANCE_SCORE',
        },
        orderBy: { fechaCreacion: 'desc' },
        select: { metadata: true },
      })

      if (prevLog?.metadata) {
        const prevScore = (prevLog.metadata as Record<string, any>)?.score as number
        if (prevScore != null) {
          const delta = currentScore - prevScore
          return {
            direction: delta > 2 ? 'up' : delta < -2 ? 'down' : 'stable',
            delta,
          }
        }
      }
    } catch { /* no previous score */ }

    return { direction: 'stable', delta: 0 }
  }

  /**
   * Almacena el score actual para tracking de tendencia
   */
  static async persistScore(tenantId: string, userId: string, score: number) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          accion: 'COMPLIANCE_SCORE',
          entidad: 'Tenant',
          entidadId: tenantId,
          descripcion: `Compliance Score calculado: ${score}%`,
          metadata: { score, timestamp: new Date().toISOString() },
        },
      })
    } catch { /* non-critical */ }
  }
}

export default ComplianceScoreService
