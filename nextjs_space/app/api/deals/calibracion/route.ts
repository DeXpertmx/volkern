export const dynamic = 'force-dynamic';

/**
 * GET /api/deals/calibracion — el estado del dataset de calibración del
 * health score (C6).
 *
 * Devuelve lo que el módulo puro `lib/sales/health-calibracion.ts` evalúa
 * sobre los snapshots cerrados del tenant: resumen por desenlace (score
 * medio de ganados vs perdidos), la evaluación del corte actual (50) y de
 * cortes alternativos (30/40/60/70) con precisión y recall, el veredicto
 * «¿el score separa?» y el color de confianza de la muestra.
 *
 * La regla: la API LEE y entrega; NO interpreta ni propone. El veredicto y
 * las métricas salen del módulo puro (única definición), y cambiar pesos o
 * cortes sigue siendo una decisión de producto que pasa por la guardia de C6.
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'
import {
  colorDeMuestra,
  elScoreSepara,
  evaluarCorte,
  resumenPorDesenlace,
  CORTE_ALERTA,
} from '@/lib/sales/health-calibracion'

export async function GET() {
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

    // Ámbito por tenant SIEMPRE: un tenant no ve ni influye en la calibración de otro.
    const snapshots = await prisma.healthSnapshot.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        dealId: true,
        healthScore: true,
        healthStatus: true,
        diasSinMovimiento: true,
        diasSinActividad: true,
        slaVencido: true,
        desenlace: true,
        createdAt: true,
      },
    })

    const resumen = resumenPorDesenlace(snapshots)
    const dealsCerrados = resumen.reduce((acc, r) => acc + r.deals, 0)

    return NextResponse.json({
      corteActual: CORTE_ALERTA,
      dealsCerrados,
      resumen,
      elScoreSepara: elScoreSepara(snapshots),
      corteEvaluado: evaluarCorte(snapshots),
      cortesAlternativos: [30, 40, 60, 70].map(corte => evaluarCorte(snapshots, corte)),
      colorMuestra: colorDeMuestra(dealsCerrados),
    })
  } catch (error: any) {
    console.error('Error al calcular calibración:', error)
    return NextResponse.json(
      { error: 'Error al calcular calibración', details: error.message },
      { status: 500 }
    )
  }
}
