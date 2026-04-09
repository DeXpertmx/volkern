export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const periodo = searchParams.get('periodo') || 'mes' // mes, trimestre, año
    const usuarioId = searchParams.get('usuarioId')

    // Calcular fechas según período
    const ahora = new Date()
    let fechaInicio: Date

    switch (periodo) {
      case 'semana':
        fechaInicio = new Date(ahora.setDate(ahora.getDate() - 7))
        break
      case 'mes':
        fechaInicio = new Date(ahora.setMonth(ahora.getMonth() - 1))
        break
      case 'trimestre':
        fechaInicio = new Date(ahora.setMonth(ahora.getMonth() - 3))
        break
      case 'año':
        fechaInicio = new Date(ahora.setFullYear(ahora.getFullYear() - 1))
        break
      default:
        fechaInicio = new Date(ahora.setMonth(ahora.getMonth() - 1))
    }

    const where: any = {
      tenantId: user.tenantId,
      fechaCreacion: {
        gte: fechaInicio,
      },
    }

    if (usuarioId) {
      where.usuarioAsignadoId = usuarioId
    }

    // Obtener deals
    const deals = await prisma.deal.findMany({
      where,
      include: {
        lead: true,
        usuarioAsignado: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Calcular métricas generales
    const totalDeals = deals.length
    const dealsActivos = deals.filter((d) => d.estado === 'activo').length
    const dealsGanados = deals.filter((d) => d.estado === 'ganado').length
    const dealsPerdidos = deals.filter((d) => d.estado === 'perdido').length

    const valorTotal = deals.reduce((sum, d) => sum + d.valor, 0)
    const valorGanado = deals
      .filter((d) => d.estado === 'ganado')
      .reduce((sum, d) => sum + (d.valorReal || d.valor), 0)
    const valorPerdido = deals
      .filter((d) => d.estado === 'perdido')
      .reduce((sum, d) => sum + d.valor, 0)
    const valorPonderado = deals
      .filter((d) => d.estado === 'activo')
      .reduce((sum, d) => sum + (d.valor * d.probabilidad) / 100, 0)

    const tasaConversion = totalDeals > 0 ? (dealsGanados / totalDeals) * 100 : 0
    const ticketPromedio = dealsGanados > 0 ? valorGanado / dealsGanados : 0

    // Calcular tiempo promedio de ciclo de venta (en días)
    const dealsCerrados = deals.filter((d) => d.fechaCierre)
    const tiempoPromedioCiclo =
      dealsCerrados.length > 0
        ? dealsCerrados.reduce((sum, d) => {
            const diff = d.fechaCierre!.getTime() - d.fechaCreacion.getTime()
            return sum + diff / (1000 * 60 * 60 * 24) // Convertir a días
          }, 0) / dealsCerrados.length
        : 0

    // Distribución por etapa
    const porEtapa = deals.reduce((acc: any, deal) => {
      if (!acc[deal.etapa]) {
        acc[deal.etapa] = {
          cantidad: 0,
          valor: 0,
          valorPonderado: 0,
        }
      }
      acc[deal.etapa].cantidad += 1
      acc[deal.etapa].valor += deal.valor
      if (deal.estado === 'activo') {
        acc[deal.etapa].valorPonderado += (deal.valor * deal.probabilidad) / 100
      }
      return acc
    }, {})

    // Distribución por prioridad
    const porPrioridad = deals.reduce((acc: any, deal) => {
      acc[deal.prioridad] = (acc[deal.prioridad] || 0) + 1
      return acc
    }, {})

    // Top vendedores
    const porVendedor = deals.reduce((acc: any, deal) => {
      if (deal.usuarioAsignado) {
        const key = deal.usuarioAsignadoId
        if (!acc[key!]) {
          acc[key!] = {
            id: deal.usuarioAsignadoId,
            nombre: deal.usuarioAsignado.name,
            deals: 0,
            ganados: 0,
            valorTotal: 0,
            valorGanado: 0,
          }
        }
        acc[key!].deals += 1
        acc[key!].valorTotal += deal.valor
        if (deal.estado === 'ganado') {
          acc[key!].ganados += 1
          acc[key!].valorGanado += deal.valorReal || deal.valor
        }
      }
      return acc
    }, {})

    const topVendedores = Object.values(porVendedor)
      .sort((a: any, b: any) => b.valorGanado - a.valorGanado)
      .slice(0, 10)

    // Evolución temporal (últimos 12 períodos)
    const evolucion: any[] = []
    for (let i = 11; i >= 0; i--) {
      const fechaPeriodo = new Date()
      if (periodo === 'semana') {
        fechaPeriodo.setDate(fechaPeriodo.getDate() - i * 7)
      } else {
        fechaPeriodo.setMonth(fechaPeriodo.getMonth() - i)
      }

      const periodoDatos = deals.filter((d) => {
        const fechaDeal = d.fechaCreacion
        if (periodo === 'semana') {
          const diff = Math.abs(fechaDeal.getTime() - fechaPeriodo.getTime())
          return diff < 7 * 24 * 60 * 60 * 1000
        } else {
          return (
            fechaDeal.getMonth() === fechaPeriodo.getMonth() &&
            fechaDeal.getFullYear() === fechaPeriodo.getFullYear()
          )
        }
      })

      evolucion.push({
        periodo: fechaPeriodo.toISOString().split('T')[0],
        creados: periodoDatos.length,
        ganados: periodoDatos.filter((d) => d.estado === 'ganado').length,
        perdidos: periodoDatos.filter((d) => d.estado === 'perdido').length,
        valorCreado: periodoDatos.reduce((sum, d) => sum + d.valor, 0),
        valorGanado: periodoDatos
          .filter((d) => d.estado === 'ganado')
          .reduce((sum, d) => sum + (d.valorReal || d.valor), 0),
      })
    }

    // Pronóstico (deals activos con fecha estimada)
    const pronostico = deals
      .filter((d) => d.estado === 'activo' && d.fechaEstimadaCierre)
      .reduce((acc: any, deal) => {
        const mes = deal.fechaEstimadaCierre!.toISOString().substring(0, 7)
        if (!acc[mes]) {
          acc[mes] = {
            cantidad: 0,
            valorPonderado: 0,
          }
        }
        acc[mes].cantidad += 1
        acc[mes].valorPonderado += (deal.valor * deal.probabilidad) / 100
        return acc
      }, {})

    return NextResponse.json({
      resumen: {
        totalDeals,
        dealsActivos,
        dealsGanados,
        dealsPerdidos,
        valorTotal,
        valorGanado,
        valorPerdido,
        valorPonderado,
        tasaConversion: Math.round(tasaConversion * 100) / 100,
        ticketPromedio: Math.round(ticketPromedio * 100) / 100,
        tiempoPromedioCiclo: Math.round(tiempoPromedioCiclo * 10) / 10,
      },
      distribucion: {
        porEtapa,
        porPrioridad,
      },
      topVendedores,
      evolucion,
      pronostico: Object.entries(pronostico).map(([mes, datos]) => ({
        mes,
        ...(datos as any),
      })),
    })
  } catch (error: any) {
    console.error('Error al obtener métricas:', error)
    return NextResponse.json(
      { error: 'Error al obtener métricas', details: error.message },
      { status: 500 }
    )
  }
}
