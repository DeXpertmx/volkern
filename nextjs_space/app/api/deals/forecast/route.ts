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

    // Obtener todos los deals históricos
    const allDeals = await prisma.deal.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { fechaCreacion: 'asc' },
    })

    const dealsActivos = allDeals.filter(d => d.estado === 'activo')
    const dealsGanados = allDeals.filter(d => d.estado === 'ganado')
    const dealsPerdidos = allDeals.filter(d => d.estado === 'perdido')

    // Obtener etapas del pipeline
    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId: user.tenantId, activo: true },
      orderBy: { orden: 'asc' },
    })

    // Obtener metas de venta activas
    const currentDate = new Date()

    const metasVenta = await prisma.metaVenta.findMany({
      where: {
        tenantId: user.tenantId,
        estado: 'activa',
        fechaInicio: { lte: currentDate },
        fechaFin: { gte: currentDate },
      },
    })

    // ===============================
    // 1. PRONÓSTICO POR PROBABILIDAD (BÁSICO)
    // ===============================
    const pronosticoBasico = dealsActivos.reduce((sum, deal) => {
      return sum + (deal.valor * deal.probabilidad / 100)
    }, 0)

    // ===============================
    // 2. TASA DE CONVERSIÓN HISTÓRICA POR ETAPA
    // ===============================
    const conversionPorEtapa: Record<string, { total: number; ganados: number; tasa: number }> = {}
    
    // Agrupar deals históricos por etapa de origen
    for (const stage of stages) {
      const dealsEnEtapa = allDeals.filter(d => d.etapa === stage.nombre)
      const ganadosDeEtapa = dealsEnEtapa.filter(d => d.estado === 'ganado').length
      const total = dealsEnEtapa.length
      
      conversionPorEtapa[stage.nombre] = {
        total,
        ganados: ganadosDeEtapa,
        tasa: total > 0 ? (ganadosDeEtapa / total) * 100 : stage.probabilidad
      }
    }

    // ===============================
    // 3. PRONÓSTICO AJUSTADO POR TASA HISTÓRICA
    // ===============================
    const pronosticoAjustado = dealsActivos.reduce((sum, deal) => {
      const tasaHistorica = conversionPorEtapa[deal.etapa]?.tasa || deal.probabilidad
      return sum + (deal.valor * tasaHistorica / 100)
    }, 0)

    // ===============================
    // 4. VELOCIDAD DEL PIPELINE (DÍAS PROMEDIO EN CADA ETAPA)
    // ===============================
    const dealsCerrados = allDeals.filter(d => d.fechaCierre)
    const tiempoPromedioCiclo = dealsCerrados.length > 0
      ? dealsCerrados.reduce((sum, d) => {
          const diff = d.fechaCierre!.getTime() - d.fechaCreacion.getTime()
          return sum + diff / (1000 * 60 * 60 * 24)
        }, 0) / dealsCerrados.length
      : 30 // Default 30 días si no hay histórico

    // ===============================
    // 5. PROYECCIÓN MENSUAL (PRÓXIMOS 6 MESES)
    // ===============================
    const proyeccionMensual: Array<{
      mes: string
      mesNumero: number
      anio: number
      valorProyectado: number
      valorPonderado: number
      dealsEstimados: number
      meta?: number
    }> = []

    for (let i = 0; i < 6; i++) {
      const fechaProyeccion = new Date()
      fechaProyeccion.setMonth(fechaProyeccion.getMonth() + i)
      const mes = fechaProyeccion.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
      const mesNumero = fechaProyeccion.getMonth() + 1
      const anio = fechaProyeccion.getFullYear()

      // Deals con fecha estimada de cierre en este mes
      const dealsEnMes = dealsActivos.filter(d => {
        if (!d.fechaEstimadaCierre) return false
        const fechaCierre = new Date(d.fechaEstimadaCierre)
        return fechaCierre.getMonth() === fechaProyeccion.getMonth() &&
               fechaCierre.getFullYear() === fechaProyeccion.getFullYear()
      })

      const valorTotal = dealsEnMes.reduce((sum, d) => sum + d.valor, 0)
      const valorPonderado = dealsEnMes.reduce((sum, d) => {
        const tasaHistorica = conversionPorEtapa[d.etapa]?.tasa || d.probabilidad
        return sum + (d.valor * tasaHistorica / 100)
      }, 0)

      // Buscar meta para este mes (meta que cubra este período)
      const metaMes = metasVenta.find(m => {
        const inicio = new Date(m.fechaInicio)
        const fin = new Date(m.fechaFin)
        return fechaProyeccion >= inicio && fechaProyeccion <= fin
      })

      proyeccionMensual.push({
        mes,
        mesNumero,
        anio,
        valorProyectado: valorTotal,
        valorPonderado,
        dealsEstimados: dealsEnMes.length,
        meta: metaMes?.valorObjetivo || undefined,
      })
    }

    // ===============================
    // 6. ANÁLISIS DE TENDENCIA (REGRESIÓN SIMPLE)
    // ===============================
    // Calcular ventas históricas por mes (ultimos 12 meses)
    const ventasHistoricas: Array<{ mes: string; valor: number; cantidad: number }> = []
    
    for (let i = 11; i >= 0; i--) {
      const fecha = new Date()
      fecha.setMonth(fecha.getMonth() - i)
      const mes = fecha.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
      
      const dealsGanadosMes = dealsGanados.filter(d => {
        if (!d.fechaCierre) return false
        const fechaCierre = new Date(d.fechaCierre)
        return fechaCierre.getMonth() === fecha.getMonth() &&
               fechaCierre.getFullYear() === fecha.getFullYear()
      })

      ventasHistoricas.push({
        mes,
        valor: dealsGanadosMes.reduce((sum, d) => sum + (d.valorReal || d.valor), 0),
        cantidad: dealsGanadosMes.length,
      })
    }

    // Regresión lineal simple para tendencia
    const n = ventasHistoricas.length
    const sumX = (n * (n - 1)) / 2 // Suma de 0 a n-1
    const sumY = ventasHistoricas.reduce((sum, v) => sum + v.valor, 0)
    const sumXY = ventasHistoricas.reduce((sum, v, i) => sum + i * v.valor, 0)
    const sumX2 = ventasHistoricas.reduce((sum, _, i) => sum + i * i, 0)

    const pendiente = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0
    const intercepto = n > 0 ? (sumY - pendiente * sumX) / n : 0

    // Tendencia: positiva, negativa o estable
    let tendencia: 'positiva' | 'negativa' | 'estable' = 'estable'
    if (pendiente > 1000) tendencia = 'positiva'
    else if (pendiente < -1000) tendencia = 'negativa'

    // Predicción basada en tendencia para los próximos 3 meses
    const prediccionTendencia = []
    for (let i = 0; i < 3; i++) {
      const mesIndex = n + i
      const valorPredicho = Math.max(0, intercepto + pendiente * mesIndex)
      const fecha = new Date()
      fecha.setMonth(fecha.getMonth() + i)
      
      prediccionTendencia.push({
        mes: fecha.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
        valorPredicho: Math.round(valorPredicho),
      })
    }

    // ===============================
    // 7. DISTRIBUCIÓN POR ETAPA (FUNNEL)
    // ===============================
    const funnelData = stages
      .filter(s => !s.esEtapaFinal)
      .map(stage => {
        const dealsEnEtapa = dealsActivos.filter(d => d.etapa === stage.nombre)
        return {
          etapa: stage.nombre,
          color: stage.color,
          cantidad: dealsEnEtapa.length,
          valor: dealsEnEtapa.reduce((sum, d) => sum + d.valor, 0),
          valorPonderado: dealsEnEtapa.reduce((sum, d) => {
            const tasa = conversionPorEtapa[stage.nombre]?.tasa || stage.probabilidad
            return sum + (d.valor * tasa / 100)
          }, 0),
          probabilidadTeorica: stage.probabilidad,
          probabilidadReal: conversionPorEtapa[stage.nombre]?.tasa || stage.probabilidad,
        }
      })

    // ===============================
    // 8. TOP DEALS POR CERRAR
    // ===============================
    const topDeals = [...dealsActivos]
      .sort((a, b) => {
        // Ordenar por valor ponderado (valor * probabilidad)
        const valorA = a.valor * a.probabilidad / 100
        const valorB = b.valor * b.probabilidad / 100
        return valorB - valorA
      })
      .slice(0, 10)
      .map(d => ({
        id: d.id,
        titulo: d.titulo,
        valor: d.valor,
        valorPonderado: d.valor * d.probabilidad / 100,
        etapa: d.etapa,
        probabilidad: d.probabilidad,
        fechaEstimadaCierre: d.fechaEstimadaCierre,
      }))

    // ===============================
    // 9. RESUMEN EJECUTIVO
    // ===============================
    const mesActual = metasVenta.find(m => {
      const inicio = new Date(m.fechaInicio)
      const fin = new Date(m.fechaFin)
      return currentDate >= inicio && currentDate <= fin
    })
    const ventasMesActual = ventasHistoricas[ventasHistoricas.length - 1]?.valor || 0
    const progresoMeta = mesActual?.valorObjetivo 
      ? (ventasMesActual / mesActual.valorObjetivo) * 100 
      : null

    return NextResponse.json({
      resumen: {
        totalPipeline: dealsActivos.reduce((sum, d) => sum + d.valor, 0),
        pronosticoBasico,
        pronosticoAjustado,
        dealsActivos: dealsActivos.length,
        tiempoPromedioCiclo: Math.round(tiempoPromedioCiclo),
        tendencia,
        metaMesActual: mesActual?.valorObjetivo || null,
        ventasMesActual,
        progresoMeta: progresoMeta ? Math.round(progresoMeta) : null,
      },
      proyeccionMensual,
      ventasHistoricas,
      prediccionTendencia,
      funnelData,
      conversionPorEtapa,
      topDeals,
    })
  } catch (error: any) {
    console.error('Error al obtener pronóstico:', error)
    return NextResponse.json(
      { error: 'Error al obtener pronóstico', details: error.message },
      { status: 500 }
    )
  }
}
