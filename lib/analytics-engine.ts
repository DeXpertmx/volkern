
import { prisma } from './db'
import { startOfDay, endOfDay, startOfWeek, startOfMonth, subDays, subMonths, format } from 'date-fns'

export interface AnalyticsDateRange {
  desde: Date
  hasta: Date
}

export interface ConversionMetrics {
  totalLeads: number
  leadsPorEstado: { estado: string; count: number }[]
  tasaConversion: number
  leadsPorFuente: { fuente: string; count: number; conversion: number }[]
  leadsPorDia: { fecha: string; count: number }[]
  promedioTiempoConversion: number // en días
}

export interface AutomationMetrics {
  totalAutomations: number
  automationsActivas: number
  totalEjecuciones: number
  tasaExito: number
  automationsPorTrigger: { trigger: string; count: number; tasaExito: number }[]
  topAutomations: {
    id: string
    nombre: string
    ejecuciones: number
    tasaExito: number
    promedioTiempo: number
  }[]
  ejecutadosPorDia: { fecha: string; count: number; exitosas: number }[]
}

export interface CampaignROIMetrics {
  totalCampanas: number
  campanasActivas: number
  totalEnviados: number
  totalConversiones: number
  roiPromedio: number
  campanaPorCanal: {
    canal: string
    enviados: number
    conversiones: number
    tasaConversion: number
  }[]
  topCampanas: {
    id: string
    nombre: string
    canales: string[]
    enviados: number
    conversiones: number
    roi: number
  }[]
  evolucionPorDia: {
    fecha: string
    enviados: number
    conversiones: number
  }[]
}

export interface ChannelEngagementMetrics {
  totalMensajes: number
  mensajesPorCanal: {
    canal: string
    total: number
    entrantes: number
    salientes: number
    tasaRespuesta: number
  }[]
  conversacionesActivas: number
  conversacionesPorCanal: { canal: string; count: number }[]
  tiempoPromedioRespuesta: number // en minutos
  mensajesPorDia: {
    fecha: string
    whatsapp: number
    email: number
    sms: number
    telegram: number
  }[]
}

export interface CohortAnalysisMetrics {
  cohortesPorMes: {
    mes: string
    nuevoLeads: number
    convertidos: number
    tasaConversion: number
  }[]
  retencionEstudiantes: {
    cohorte: string
    mes0: number
    mes1: number
    mes2: number
    mes3: number
  }[]
}

export interface CourseMetrics {
  totalCursos: number
  totalEstudiantes: number
  totalInscripciones: number
  tasaCompletado: number
  cursosMasPopulares: {
    id: string
    titulo: string
    inscripciones: number
    completados: number
    tasaCompletado: number
    ingresoTotal: number
  }[]
  inscripcionesPorDia: { fecha: string; count: number }[]
  promedioProgreso: number
}

export interface GeneralDashboardMetrics {
  leads: {
    total: number
    nuevosEsteMes: number
    cambio: number
  }
  conversiones: {
    total: number
    esteMes: number
    cambio: number
  }
  ingresos: {
    total: number
    esteMes: number
    cambio: number
  }
  engagement: {
    mensajes: number
    conversaciones: number
    cambio: number
  }
}

// ==================== FUNCIONES DE ANÁLISIS ====================

export async function getConversionMetrics(dateRange: AnalyticsDateRange): Promise<ConversionMetrics> {
  const { desde, hasta } = dateRange

  // Total de leads en el rango
  const totalLeads = await prisma.lead.count({
    where: {
      fechaCreacion: {
        gte: desde,
        lte: hasta
      }
    }
  })

  // Leads por estado
  const leadsPorEstado = await prisma.lead.groupBy({
    by: ['estado'],
    where: {
      fechaCreacion: {
        gte: desde,
        lte: hasta
      }
    },
    _count: true
  })

  const leadsPorEstadoFormatted = leadsPorEstado.map(item => ({
    estado: item.estado,
    count: item._count
  }))

  // Tasa de conversión
  const leadsConvertidos = leadsPorEstado.find(item => item.estado === 'convertido')?._count || 0
  const tasaConversion = totalLeads > 0 ? (leadsConvertidos / totalLeads) * 100 : 0

  // Leads por día (últimos 30 días)
  const days = []
  for (let i = 29; i >= 0; i--) {
    const date = subDays(new Date(), i)
    const count = await prisma.lead.count({
      where: {
        fechaCreacion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    days.push({
      fecha: format(date, 'dd/MM'),
      count
    })
  }

  // Promedio de tiempo de conversión (simplificado)
  const leadsConvertidosDetalle = await prisma.lead.findMany({
    where: {
      estado: 'convertido',
      fechaCreacion: {
        gte: desde,
        lte: hasta
      }
    },
    select: {
      fechaCreacion: true,
      fechaActualizacion: true
    }
  })

  let promedioTiempoConversion = 0
  if (leadsConvertidosDetalle.length > 0) {
    const tiempos = leadsConvertidosDetalle.map(lead => {
      const diff = lead.fechaActualizacion.getTime() - lead.fechaCreacion.getTime()
      return diff / (1000 * 60 * 60 * 24) // convertir a días
    })
    promedioTiempoConversion = tiempos.reduce((a, b) => a + b, 0) / tiempos.length
  }

  return {
    totalLeads,
    leadsPorEstado: leadsPorEstadoFormatted,
    tasaConversion,
    leadsPorFuente: [], // Placeholder - requiere campo fuente en modelo Lead
    leadsPorDia: days,
    promedioTiempoConversion
  }
}

export async function getAutomationMetrics(dateRange: AnalyticsDateRange): Promise<AutomationMetrics> {
  const { desde, hasta } = dateRange

  const totalAutomations = await prisma.automation.count()
  const automationsActivas = await prisma.automation.count({ where: { activo: true } })

  const totalEjecuciones = await prisma.automationExecution.count({
    where: {
      fechaInicio: {
        gte: desde,
        lte: hasta
      }
    }
  })

  const ejecucionesExitosas = await prisma.automationExecution.count({
    where: {
      estado: 'completado',
      fechaInicio: {
        gte: desde,
        lte: hasta
      }
    }
  })

  const tasaExito = totalEjecuciones > 0 ? (ejecucionesExitosas / totalEjecuciones) * 100 : 0

  // Ejecuciones por trigger
  const automationsPorTrigger = await prisma.$queryRaw<Array<{ trigger: string; count: bigint; exitosas: bigint }>>`
    SELECT a.trigger, 
           COUNT(ae.id) as count,
           COUNT(CASE WHEN ae.estado = 'completado' THEN 1 END) as exitosas
    FROM "Automation" a
    LEFT JOIN "AutomationExecution" ae ON a.id = ae."automationId"
      AND ae."fechaInicio" >= ${desde}
      AND ae."fechaInicio" <= ${hasta}
    GROUP BY a.trigger
  `

  const automationsPorTriggerFormatted = automationsPorTrigger.map(item => ({
    trigger: item.trigger,
    count: Number(item.count),
    tasaExito: Number(item.count) > 0 ? (Number(item.exitosas) / Number(item.count)) * 100 : 0
  }))

  // Top automations
  const topAutomationsRaw = await prisma.$queryRaw<Array<{
    id: string
    nombre: string
    ejecuciones: bigint
    exitosas: bigint
    promedioTiempo: number | null
  }>>`
    SELECT a.id, a.nombre,
           COUNT(ae.id) as ejecuciones,
           COUNT(CASE WHEN ae.estado = 'completado' THEN 1 END) as exitosas,
           AVG(EXTRACT(EPOCH FROM (ae."fechaFin" - ae."fechaInicio"))) as "promedioTiempo"
    FROM "Automation" a
    LEFT JOIN "AutomationExecution" ae ON a.id = ae."automationId"
      AND ae."fechaInicio" >= ${desde}
      AND ae."fechaInicio" <= ${hasta}
    GROUP BY a.id, a.nombre
    ORDER BY ejecuciones DESC
    LIMIT 10
  `

  const topAutomations = topAutomationsRaw.map(item => ({
    id: item.id,
    nombre: item.nombre,
    ejecuciones: Number(item.ejecuciones),
    tasaExito: Number(item.ejecuciones) > 0 ? (Number(item.exitosas) / Number(item.ejecuciones)) * 100 : 0,
    promedioTiempo: item.promedioTiempo || 0
  }))

  // Ejecutados por día (últimos 30 días)
  const days = []
  for (let i = 29; i >= 0; i--) {
    const date = subDays(new Date(), i)
    const count = await prisma.automationExecution.count({
      where: {
        fechaInicio: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    const exitosas = await prisma.automationExecution.count({
      where: {
        estado: 'completado',
        fechaInicio: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    days.push({
      fecha: format(date, 'dd/MM'),
      count,
      exitosas
    })
  }

  return {
    totalAutomations,
    automationsActivas,
    totalEjecuciones,
    tasaExito,
    automationsPorTrigger: automationsPorTriggerFormatted,
    topAutomations,
    ejecutadosPorDia: days
  }
}

export async function getCampaignROIMetrics(dateRange: AnalyticsDateRange): Promise<CampaignROIMetrics> {
  const { desde, hasta } = dateRange

  const totalCampanas = await prisma.campaign.count({
    where: {
      fechaCreacion: {
        gte: desde,
        lte: hasta
      }
    }
  })

  const campanasActivas = await prisma.campaign.count({
    where: {
      estado: 'en_curso'
    }
  })

  const campanas = await prisma.campaign.findMany({
    where: {
      fechaCreacion: {
        gte: desde,
        lte: hasta
      }
    },
    select: {
      id: true,
      nombre: true,
      canales: true,
      totalEnviados: true,
      totalConversiones: true
    }
  })

  const totalEnviados = campanas.reduce((sum, c) => sum + c.totalEnviados, 0)
  const totalConversiones = campanas.reduce((sum, c) => sum + c.totalConversiones, 0)

  const roiPromedio = totalEnviados > 0 ? (totalConversiones / totalEnviados) * 100 : 0

  // Por canal
  const campanaPorCanalRaw = await prisma.$queryRaw<Array<{
    canal: string
    enviados: bigint
    conversiones: bigint
  }>>`
    SELECT ce.canal,
           COUNT(CASE WHEN ce.estado IN ('enviado', 'entregado', 'abierto', 'click', 'convertido') THEN 1 END) as enviados,
           COUNT(CASE WHEN ce.estado = 'convertido' THEN 1 END) as conversiones
    FROM "CampaignExecution" ce
    WHERE ce."fechaCreacion" >= ${desde}
      AND ce."fechaCreacion" <= ${hasta}
    GROUP BY ce.canal
  `

  const campanaPorCanal = campanaPorCanalRaw.map(item => ({
    canal: item.canal,
    enviados: Number(item.enviados),
    conversiones: Number(item.conversiones),
    tasaConversion: Number(item.enviados) > 0 ? (Number(item.conversiones) / Number(item.enviados)) * 100 : 0
  }))

  // Top campañas
  const topCampanas = campanas
    .map(c => ({
      id: c.id,
      nombre: c.nombre,
      canales: c.canales,
      enviados: c.totalEnviados,
      conversiones: c.totalConversiones,
      roi: c.totalEnviados > 0 ? (c.totalConversiones / c.totalEnviados) * 100 : 0
    }))
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 10)

  // Evolución por día (últimos 30 días)
  const days = []
  for (let i = 29; i >= 0; i--) {
    const date = subDays(new Date(), i)
    const enviados = await prisma.campaignExecution.count({
      where: {
        estado: {
          in: ['enviado', 'entregado', 'abierto', 'click', 'convertido']
        },
        fechaCreacion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    const conversiones = await prisma.campaignExecution.count({
      where: {
        estado: 'convertido',
        fechaCreacion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    days.push({
      fecha: format(date, 'dd/MM'),
      enviados,
      conversiones
    })
  }

  return {
    totalCampanas,
    campanasActivas,
    totalEnviados,
    totalConversiones,
    roiPromedio,
    campanaPorCanal,
    topCampanas,
    evolucionPorDia: days
  }
}

export async function getChannelEngagementMetrics(dateRange: AnalyticsDateRange): Promise<ChannelEngagementMetrics> {
  const { desde, hasta } = dateRange

  const totalMensajes = await prisma.message.count({
    where: {
      fechaCreacion: {
        gte: desde,
        lte: hasta
      }
    }
  })

  // Mensajes por canal
  const mensajesPorCanalRaw = await prisma.$queryRaw<Array<{
    canal: string
    total: bigint
    entrantes: bigint
    salientes: bigint
  }>>`
    SELECT canal,
           COUNT(*) as total,
           COUNT(CASE WHEN direccion = 'entrante' THEN 1 END) as entrantes,
           COUNT(CASE WHEN direccion = 'saliente' THEN 1 END) as salientes
    FROM "Message"
    WHERE "fechaCreacion" >= ${desde}
      AND "fechaCreacion" <= ${hasta}
    GROUP BY canal
  `

  const mensajesPorCanal = mensajesPorCanalRaw.map(item => ({
    canal: item.canal,
    total: Number(item.total),
    entrantes: Number(item.entrantes),
    salientes: Number(item.salientes),
    tasaRespuesta: Number(item.salientes) > 0 && Number(item.entrantes) > 0 
      ? (Number(item.entrantes) / Number(item.salientes)) * 100 
      : 0
  }))

  const conversacionesActivas = await prisma.conversation.count({
    where: {
      estado: 'abierta'
    }
  })

  const conversacionesPorCanal = await prisma.conversation.groupBy({
    by: ['canal'],
    where: {
      fechaCreacion: {
        gte: desde,
        lte: hasta
      }
    },
    _count: true
  })

  const conversacionesPorCanalFormatted = conversacionesPorCanal.map(item => ({
    canal: item.canal,
    count: item._count
  }))

  // Mensajes por día por canal (últimos 30 días)
  const days = []
  for (let i = 29; i >= 0; i--) {
    const date = subDays(new Date(), i)
    const whatsapp = await prisma.message.count({
      where: {
        canal: 'whatsapp',
        fechaCreacion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    const email = await prisma.message.count({
      where: {
        canal: 'email',
        fechaCreacion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    const sms = await prisma.message.count({
      where: {
        canal: 'sms',
        fechaCreacion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    const telegram = await prisma.message.count({
      where: {
        canal: 'telegram',
        fechaCreacion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    days.push({
      fecha: format(date, 'dd/MM'),
      whatsapp,
      email,
      sms,
      telegram
    })
  }

  return {
    totalMensajes,
    mensajesPorCanal,
    conversacionesActivas,
    conversacionesPorCanal: conversacionesPorCanalFormatted,
    tiempoPromedioRespuesta: 0, // Placeholder - requiere cálculo más complejo
    mensajesPorDia: days
  }
}

export async function getCohortAnalysisMetrics(): Promise<CohortAnalysisMetrics> {
  // Cohortes de leads por mes (últimos 6 meses)
  const months = []
  for (let i = 5; i >= 0; i--) {
    const date = subMonths(new Date(), i)
    const inicio = startOfMonth(date)
    const fin = endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))

    const nuevoLeads = await prisma.lead.count({
      where: {
        fechaCreacion: {
          gte: inicio,
          lte: fin
        }
      }
    })

    const convertidos = await prisma.lead.count({
      where: {
        fechaCreacion: {
          gte: inicio,
          lte: fin
        },
        estado: 'convertido'
      }
    })

    months.push({
      mes: format(date, 'MMM yyyy'),
      nuevoLeads,
      convertidos,
      tasaConversion: nuevoLeads > 0 ? (convertidos / nuevoLeads) * 100 : 0
    })
  }

  // Retención de estudiantes (simplificado)
  const retencionEstudiantes: Array<{
    cohorte: string
    mes0: number
    mes1: number
    mes2: number
    mes3: number
  }> = []

  return {
    cohortesPorMes: months,
    retencionEstudiantes
  }
}

export async function getCourseMetrics(dateRange: AnalyticsDateRange): Promise<CourseMetrics> {
  const { desde, hasta } = dateRange

  const totalCursos = await prisma.curso.count()
  const totalEstudiantes = await prisma.estudiante.count()
  
  const totalInscripciones = await prisma.inscripcion.count({
    where: {
      fechaInscripcion: {
        gte: desde,
        lte: hasta
      }
    }
  })

  const inscripcionesCompletadas = await prisma.inscripcion.count({
    where: {
      progresoPorcentaje: 100,
      fechaInscripcion: {
        gte: desde,
        lte: hasta
      }
    }
  })

  const tasaCompletado = totalInscripciones > 0 ? (inscripcionesCompletadas / totalInscripciones) * 100 : 0

  // Cursos más populares
  const cursosMasPopularesRaw = await prisma.$queryRaw<Array<{
    id: string
    titulo: string
    inscripciones: bigint
    completados: bigint
    ingresoTotal: number
  }>>`
    SELECT c.id, c.titulo,
           COUNT(i.id) as inscripciones,
           COUNT(CASE WHEN i."progresoPorcentaje" = 100 THEN 1 END) as completados,
           SUM(COALESCE(i."montoPagado", 0)) as "ingresoTotal"
    FROM "Curso" c
    LEFT JOIN "Inscripcion" i ON c.id = i."cursoId"
      AND i."fechaInscripcion" >= ${desde}
      AND i."fechaInscripcion" <= ${hasta}
    GROUP BY c.id, c.titulo
    ORDER BY inscripciones DESC
    LIMIT 10
  `

  const cursosMasPopulares = cursosMasPopularesRaw.map(item => ({
    id: item.id,
    titulo: item.titulo,
    inscripciones: Number(item.inscripciones),
    completados: Number(item.completados),
    tasaCompletado: Number(item.inscripciones) > 0 
      ? (Number(item.completados) / Number(item.inscripciones)) * 100 
      : 0,
    ingresoTotal: item.ingresoTotal || 0
  }))

  // Inscripciones por día (últimos 30 días)
  const days = []
  for (let i = 29; i >= 0; i--) {
    const date = subDays(new Date(), i)
    const count = await prisma.inscripcion.count({
      where: {
        fechaInscripcion: {
          gte: startOfDay(date),
          lte: endOfDay(date)
        }
      }
    })
    days.push({
      fecha: format(date, 'dd/MM'),
      count
    })
  }

  // Promedio de progreso
  const progresoResult = await prisma.inscripcion.aggregate({
    _avg: {
      progresoPorcentaje: true
    },
    where: {
      fechaInscripcion: {
        gte: desde,
        lte: hasta
      }
    }
  })

  const promedioProgreso = progresoResult._avg.progresoPorcentaje || 0

  return {
    totalCursos,
    totalEstudiantes,
    totalInscripciones,
    tasaCompletado,
    cursosMasPopulares,
    inscripcionesPorDia: days,
    promedioProgreso
  }
}

export async function getGeneralDashboardMetrics(): Promise<GeneralDashboardMetrics> {
  const now = new Date()
  const inicioMesActual = startOfMonth(now)
  const inicioMesAnterior = startOfMonth(subMonths(now, 1))
  const finMesAnterior = endOfDay(new Date(inicioMesActual.getTime() - 1))

  // Leads
  const totalLeads = await prisma.lead.count()
  const nuevosLeadsEsteMes = await prisma.lead.count({
    where: {
      fechaCreacion: {
        gte: inicioMesActual
      }
    }
  })
  const nuevosLeadsMesAnterior = await prisma.lead.count({
    where: {
      fechaCreacion: {
        gte: inicioMesAnterior,
        lte: finMesAnterior
      }
    }
  })
  const cambioLeads = nuevosLeadsMesAnterior > 0 
    ? ((nuevosLeadsEsteMes - nuevosLeadsMesAnterior) / nuevosLeadsMesAnterior) * 100 
    : 0

  // Conversiones
  const totalConversiones = await prisma.lead.count({
    where: {
      estado: 'convertido'
    }
  })
  const conversionesEsteMes = await prisma.lead.count({
    where: {
      estado: 'convertido',
      fechaActualizacion: {
        gte: inicioMesActual
      }
    }
  })
  const conversionesMesAnterior = await prisma.lead.count({
    where: {
      estado: 'convertido',
      fechaActualizacion: {
        gte: inicioMesAnterior,
        lte: finMesAnterior
      }
    }
  })
  const cambioConversiones = conversionesMesAnterior > 0 
    ? ((conversionesEsteMes - conversionesMesAnterior) / conversionesMesAnterior) * 100 
    : 0

  // Ingresos
  const ingresosEsteMesResult = await prisma.cita.aggregate({
    _sum: {
      montoPagado: true
    },
    where: {
      fechaCreacion: {
        gte: inicioMesActual
      },
      estado: {
        in: ['pagada', 'completada']
      }
    }
  })
  
  const ingresosMesAnteriorResult = await prisma.cita.aggregate({
    _sum: {
      montoPagado: true
    },
    where: {
      fechaCreacion: {
        gte: inicioMesAnterior,
        lte: finMesAnterior
      },
      estado: {
        in: ['pagada', 'completada']
      }
    }
  })

  const ingresosEsteMes = ingresosEsteMesResult._sum.montoPagado || 0
  const ingresosMesAnterior = ingresosMesAnteriorResult._sum.montoPagado || 0
  
  const ingresosTotalesResult = await prisma.cita.aggregate({
    _sum: {
      montoPagado: true
    },
    where: {
      estado: {
        in: ['pagada', 'completada']
      }
    }
  })
  const ingresosTotal = ingresosTotalesResult._sum.montoPagado || 0

  const cambioIngresos = ingresosMesAnterior > 0 
    ? ((ingresosEsteMes - ingresosMesAnterior) / ingresosMesAnterior) * 100 
    : 0

  // Engagement
  const mensajesEsteMes = await prisma.message.count({
    where: {
      fechaCreacion: {
        gte: inicioMesActual
      }
    }
  })
  const mensajesMesAnterior = await prisma.message.count({
    where: {
      fechaCreacion: {
        gte: inicioMesAnterior,
        lte: finMesAnterior
      }
    }
  })
  const cambioMensajes = mensajesMesAnterior > 0 
    ? ((mensajesEsteMes - mensajesMesAnterior) / mensajesMesAnterior) * 100 
    : 0

  const conversacionesActivas = await prisma.conversation.count({
    where: {
      estado: 'abierta'
    }
  })

  return {
    leads: {
      total: totalLeads,
      nuevosEsteMes: nuevosLeadsEsteMes,
      cambio: cambioLeads
    },
    conversiones: {
      total: totalConversiones,
      esteMes: conversionesEsteMes,
      cambio: cambioConversiones
    },
    ingresos: {
      total: ingresosTotal,
      esteMes: ingresosEsteMes,
      cambio: cambioIngresos
    },
    engagement: {
      mensajes: mensajesEsteMes,
      conversaciones: conversacionesActivas,
      cambio: cambioMensajes
    }
  }
}
