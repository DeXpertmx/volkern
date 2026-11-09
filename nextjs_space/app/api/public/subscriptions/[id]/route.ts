export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DunningService } from '@/lib/finance/dunning-service'

// GET /api/public/subscriptions/[id]
export async function GET(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const subscription = await (prisma as any).clientSubscription.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        monto: true,
        moneda: true,
        estado: true,
        metadata: true,
        // No devolvemos campos sensibles
      }
    })

    if (!subscription) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    // Añadir planNombre mock si no existe en BD
    const planNombre = (subscription.metadata as any)?.planNombre || 'Plan Premium Hub'

    return NextResponse.json({ ...subscription, planNombre })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST /api/public/subscriptions/[id]/resolve
// En producción, aquí se recibiría un token de pago (Stripe/etc)
export async function POST(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const subscription = await (prisma as any).clientSubscription.findUnique({
      where: { id: params.id }
    })

    if (!subscription) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    // Simulación de validación de pago exitoso
    // 1. Llamar al DunningService para reactivar
    await DunningService.handlePaymentSuccess(params.id)

    return NextResponse.json({ success: true, message: 'Suscripción reactivada' })
  } catch (error) {
    console.error('[PublicAPI] Error al resolver pago:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
