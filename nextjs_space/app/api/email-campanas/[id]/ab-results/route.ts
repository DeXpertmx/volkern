export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

// GET - Obtener resultados de A/B Testing
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

    // Verificar si es campaña A/B
    if (!campana.esABTest) {
      return NextResponse.json(
        { error: 'Esta campaña no es una prueba A/B' },
        { status: 400 }
      )
    }

    // Obtener o crear resultados
    let resultado = await prisma.aBTestResult.findFirst({
      where: { campanaId, tenantId },
    })

    if (!resultado) {
      // Calcular resultados en tiempo real desde CampaignRecipient
      const recipients = await prisma.campaignRecipient.findMany({
        where: { campanaId, tenantId },
      })

      const varianteA = recipients.filter((r) => r.varianteAsignada === 'A')
      const varianteB = recipients.filter((r) => r.varianteAsignada === 'B')

      const calcularMetricas = (recipientes: any[]) => {
        const enviados = recipientes.length
        const abiertos = recipientes.filter((r) => r.abierto).length
        const clicados = recipientes.filter((r) => r.clicado).length
        const conversiones = recipientes.filter((r) => r.convertido).length

        return {
          enviados,
          abiertos,
          clics: clicados,
          conversiones,
          tasaApertura: enviados > 0 ? (abiertos / enviados) * 100 : 0,
          tasaClic: enviados > 0 ? (clicados / enviados) * 100 : 0,
          tasaConversion: enviados > 0 ? (conversiones / enviados) * 100 : 0,
        }
      }

      const metricasA = calcularMetricas(varianteA)
      const metricasB = calcularMetricas(varianteB)

      // Análisis estadístico simple (Z-test para proporciones)
      const n1 = metricasA.enviados
      const n2 = metricasB.enviados
      const p1 = metricasA.tasaConversion / 100
      const p2 = metricasB.tasaConversion / 100
      const p = ((p1 * n1) + (p2 * n2)) / (n1 + n2)

      let significativo = false
      let nivelConfianza = 0

      if (n1 > 30 && n2 > 30) {
        const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
        const z = Math.abs((p1 - p2) / se)

        // Z > 1.96 significa 95% de confianza
        // Z > 2.58 significa 99% de confianza
        if (z > 2.58) {
          significativo = true
          nivelConfianza = 99
        } else if (z > 1.96) {
          significativo = true
          nivelConfianza = 95
        }
      }

      const diferencia = Math.abs(metricasA.tasaConversion - metricasB.tasaConversion)
      let ganador: string | null = null
      let mejora: number | null = null

      if (significativo) {
        if (metricasA.tasaConversion > metricasB.tasaConversion) {
          ganador = 'A'
          mejora = ((metricasA.tasaConversion - metricasB.tasaConversion) / metricasB.tasaConversion) * 100
        } else if (metricasB.tasaConversion > metricasA.tasaConversion) {
          ganador = 'B'
          mejora = ((metricasB.tasaConversion - metricasA.tasaConversion) / metricasA.tasaConversion) * 100
        } else {
          ganador = 'empate'
        }
      }

      let recomendacion = ''
      if (!significativo) {
        if (n1 < 30 || n2 < 30) {
          recomendacion = 'Se necesitan al menos 30 envíos por variante para obtener resultados confiables.'
        } else if (diferencia < 5) {
          recomendacion = 'La diferencia entre variantes es mínima. Considera otros factores como facilidad de implementación.'
        }
      } else {
        recomendacion = `La variante ${ganador} muestra una mejora del ${mejora?.toFixed(1)}% con un ${nivelConfianza}% de confianza estadística.`
      }

      // Crear resultado en BD
      resultado = await prisma.aBTestResult.create({
        data: {
          campanaId,
          tenantId,
          varianteA_enviados: metricasA.enviados,
          varianteA_abiertos: metricasA.abiertos,
          varianteA_clics: metricasA.clics,
          varianteA_conversiones: metricasA.conversiones,
          varianteA_tasaApertura: metricasA.tasaApertura,
          varianteA_tasaClic: metricasA.tasaClic,
          varianteA_tasaConversion: metricasA.tasaConversion,
          varianteB_enviados: metricasB.enviados,
          varianteB_abiertos: metricasB.abiertos,
          varianteB_clics: metricasB.clics,
          varianteB_conversiones: metricasB.conversiones,
          varianteB_tasaApertura: metricasB.tasaApertura,
          varianteB_tasaClic: metricasB.tasaClic,
          varianteB_tasaConversion: metricasB.tasaConversion,
          significanciaEstadistica: significativo,
          nivelConfianza: nivelConfianza,
          ganador: ganador,
          mejoraPorcentaje: mejora,
          recomendacion: recomendacion,
        },
      })
    }

    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error('Error al obtener resultados de A/B test:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener resultados' },
      { status: 500 }
    )
  }
}

// POST - Declarar ganador y aplicar resultado
export async function POST(
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
    const { ganador } = await request.json()

    if (!ganador || !['A', 'B'].includes(ganador)) {
      return NextResponse.json({ error: 'Ganador inválido' }, { status: 400 })
    }

    // Actualizar campaña con ganador
    await prisma.emailCampaign.update({
      where: { id: campanaId },
      data: { ganadorAB: ganador },
    })

    // Actualizar resultado
    await prisma.aBTestResult.updateMany({
      where: { campanaId, tenantId },
      data: { ganador },
    })

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        accion: 'declarar_ganador_abtest',
        descripcion: `Variante ${ganador} declarada como ganadora`,
        entidad: 'email_campaign',
        entidadId: campanaId,
        cambiosDespues: JSON.stringify({ ganador }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error al declarar ganador:', error)
    return NextResponse.json(
      { error: error.message || 'Error al declarar ganador' },
      { status: 500 }
    )
  }
}
