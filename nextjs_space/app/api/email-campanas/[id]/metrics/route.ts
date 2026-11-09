export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener usuario con tenantId
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!currentUser?.tenantId) {
      return NextResponse.json({ error: 'Usuario no válido' }, { status: 403 })
    }

    const campanaId = params.id
    const tenantId = currentUser.tenantId

    // Verificar que la campaña pertenece al tenant
    const campana = await prisma.emailCampaign.findFirst({
      where: { id: campanaId, tenantId },
    })

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    // Obtener todos los destinatarios
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campanaId, tenantId },
    })

    // Calcular métricas generales
    const total = recipients.length
    const enviados = recipients.filter((r) => r.estado === 'enviado' || r.abierto || r.clicado).length
    const abiertos = recipients.filter((r) => r.abierto).length
    const clicados = recipients.filter((r) => r.clicado).length
    const convertidos = recipients.filter((r) => r.convertido).length
    const rebotados = recipients.filter((r) => r.estado === 'rebotado').length

    // Calcular tasas
    const tasaApertura = enviados > 0 ? (abiertos / enviados) * 100 : 0
    const tasaClic = enviados > 0 ? (clicados / enviados) * 100 : 0
    const tasaConversion = enviados > 0 ? (convertidos / enviados) * 100 : 0
    const tasaRebote = total > 0 ? (rebotados / total) * 100 : 0

    // Calcular engagement score (0-100)
    const engagementScore = (
      (tasaApertura * 0.3) +
      (tasaClic * 0.4) +
      (tasaConversion * 0.3)
    )

    // Agrupar por fecha para timeline
    const recipientsByDate = recipients.reduce((acc: any, r) => {
      if (!r.fechaEnviado) return acc
      
      const fecha = r.fechaEnviado.toISOString().split('T')[0]
      if (!acc[fecha]) {
        acc[fecha] = {
          fecha,
          enviados: 0,
          abiertos: 0,
          clicados: 0,
          convertidos: 0,
        }
      }

      if (r.estado === 'enviado' || r.abierto || r.clicado) {
        acc[fecha].enviados++
      }
      if (r.abierto) acc[fecha].abiertos++
      if (r.clicado) acc[fecha].clicados++
      if (r.convertido) acc[fecha].convertidos++

      return acc
    }, {})

    const timeline = Object.values(recipientsByDate).sort((a: any, b: any) => 
      new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    )

    // Calcular ROI si hay datos de conversión
    const valorPromedioPorConversion = 100 // Esto debería venir de configuración
    const costoTotal = enviados * 0.01 // Estimado $0.01 por email
    const ingresoTotal = convertidos * valorPromedioPorConversion
    const roi = costoTotal > 0 ? ((ingresoTotal - costoTotal) / costoTotal) * 100 : 0

    // Agrupar por hora del día para encontrar mejor momento de envío
    const recipientsByHour = recipients.reduce((acc: any, r) => {
      if (!r.fechaApertura) return acc
      
      const hour = r.fechaApertura.getHours()
      if (!acc[hour]) {
        acc[hour] = { hora: hour, aperturas: 0 }
      }
      acc[hour].aperturas++
      return acc
    }, {})

    const aperturasPorHora = Object.values(recipientsByHour).sort((a: any, b: any) => a.hora - b.hora)

    // Encontrar mejor momento de envío
    const mejorHora = aperturasPorHora.length > 0 
      ? (aperturasPorHora as any[]).reduce((max, curr) => curr.aperturas > max.aperturas ? curr : max)
      : null

    return NextResponse.json({
      // Métricas básicas
      total,
      enviados,
      abiertos,
      clicados,
      convertidos,
      rebotados,
      
      // Tasas
      tasaApertura,
      tasaClic,
      tasaConversion,
      tasaRebote,
      
      // Métricas avanzadas
      engagementScore,
      roi,
      
      // Análisis temporal
      timeline,
      aperturasPorHora,
      mejorHora,
      
      // Información adicional
      costoPorConversion: convertidos > 0 ? costoTotal / convertidos : 0,
      valorGenerado: ingresoTotal,
    })
  } catch (error: any) {
    console.error('Error al obtener métricas:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener métricas' },
      { status: 500 }
    )
  }
}
