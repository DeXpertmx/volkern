export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { subDays, format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'

/**
 * GET /api/dashboard - Métricas consolidadas del dashboard
 * Refactorizado con withTenantAuth para soportar el aislamiento multi-db e impersonación.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '30'
    const tenantId = auth.tenant!.id;

    const ahora = new Date()
    const diasRange = parseInt(range)
    const haceX_Dias = subDays(ahora, diasRange)

    const inicioMes = startOfMonth(ahora)
    const finMes = endOfMonth(ahora)
    const hoy = startOfDay(ahora)
    const finHoy = endOfDay(ahora)

    // Filtro base de tenant para mayor seguridad (aunque el proxy ya lo maneja al nivel de DB)
    const baseWhere = { tenantId };

    // Total de leads
    const totalLeads = await prisma.lead.count({
      where: {
        ...baseWhere,
        ...(range !== 'all' ? { fechaCreacion: { gte: haceX_Dias } } : {})
      }
    })

    // Citas de hoy
    const citasHoy = await prisma.cita.count({
      where: {
        ...baseWhere,
        fechaHora: {
          gte: hoy,
          lt: finHoy
        }
      }
    })

    // Citas pendientes
    const citasPendientes = await prisma.cita.count({
      where: {
        ...baseWhere,
        estado: {
          in: ['confirmada', 'pendiente']
        }
      }
    })

    // Ingresos del mes
    const citasPagadas = await prisma.cita.findMany({
      where: {
        ...baseWhere,
        estado: 'pagada',
        fechaCreacion: {
          gte: inicioMes,
          lte: finMes
        }
      },
      select: {
        montoPagado: true
      }
    })

    const ingresosMes = citasPagadas.reduce((total, cita) => {
      return total + (cita.montoPagado || 0)
    }, 0)

    // Ingresos diarios (últimos 30 días)
    const hace30Dias = subDays(ahora, 30)

    const citasDiarias = await prisma.cita.findMany({
      where: {
        ...baseWhere,
        estado: 'pagada',
        fechaCreacion: {
          gte: hace30Dias
        }
      },
      select: {
        montoPagado: true,
        fechaCreacion: true
      }
    })

    // Agrupar por día
    const ingresosPorDia = new Map<string, number>()

    for (let i = 0; i < 30; i++) {
      const fecha = subDays(ahora, i)
      const fechaStr = format(fecha, 'yyyy-MM-dd')
      ingresosPorDia.set(fechaStr, 0)
    }

    citasDiarias.forEach(cita => {
      const fechaStr = format(cita.fechaCreacion, 'yyyy-MM-dd')
      const ingresoActual = ingresosPorDia.get(fechaStr) || 0
      ingresosPorDia.set(fechaStr, ingresoActual + (cita.montoPagado || 0))
    })

    const ingresosDiarios = Array.from(ingresosPorDia.entries())
      .map(([fecha, ingresos]) => ({ fecha, ingresos }))
      .reverse()

    // Próximas citas (próximos 7 días)
    const enUnaSemana = new Date(ahora)
    enUnaSemana.setDate(ahora.getDate() + 7)

    const proximasCitas = await prisma.cita.findMany({
      where: {
        ...baseWhere,
        fechaHora: {
          gte: ahora,
          lte: enUnaSemana
        },
        estado: {
          in: ['confirmada', 'pagada']
        }
      },
      include: {
        lead: true,
        servicio: true
      },
      orderBy: {
        fechaHora: 'asc'
      },
      take: 5
    })

    // Estadísticas de campañas
    const totalCampanas = await prisma.campaign.count({ where: baseWhere })
    const campanasActivas = await prisma.campaign.count({
      where: {
        ...baseWhere,
        estado: 'en_curso'
      }
    })
    const campanasCompletadas = await prisma.campaign.count({
      where: {
        ...baseWhere,
        estado: 'completada'
      }
    })

    const stats = {
      totalLeads,
      citasHoy,
      citasPendientes,
      ingresosMes,
      ingresosDiarios,
      proximasCitas,
      totalCampanas,
      campanasActivas,
      campanasCompletadas
    }

    return NextResponse.json(stats)

  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { error: 'Error al obtener estadísticas del dashboard' },
      { status: 500 }
    )
  }
}, ['dashboard:read']);
