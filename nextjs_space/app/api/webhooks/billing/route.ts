export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { DunningService } from '@/lib/finance/dunning-service'

/**
 * Webhook Central de Facturación (Dunning & Recovery)
 * Procesa eventos de pasarelas de pago (Stripe, Holded, etc.)
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const { event, subscriptionId, error } = payload

    console.log(`[Webhook:Billing] Evento recibido: ${event} para ${subscriptionId}`)

    switch (event) {
      case 'payment_failed':
        // Disparar motor de Dunning
        await DunningService.handlePaymentFailure(subscriptionId, error)
        break

      case 'payment_succeeded':
        // Reactivación inmediata
        await DunningService.handlePaymentSuccess(subscriptionId)
        break

      default:
        console.log(`[Webhook:Billing] Evento no procesado: ${event}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Webhook:Billing] Error procesando webhook:', error)
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 })
  }
}
