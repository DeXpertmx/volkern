
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2025-10-29.clover' as any, // Usar la versión más reciente disponible
})

export async function createCheckoutSession({
  servicioId,
  servicioNombre,
  precio,
  moneda,
  leadId,
  citaId,
  successUrl,
  cancelUrl,
}: {
  servicioId: string
  servicioNombre: string
  precio: number
  moneda: string
  leadId: string
  citaId: string
  successUrl: string
  cancelUrl: string
}) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: moneda.toLowerCase(),
            product_data: {
              name: servicioNombre,
            },
            unit_amount: Math.round(precio * 100), // Stripe usa centavos
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        servicioId,
        leadId,
        citaId,
      },
    })

    return { success: true, session }
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return { success: false, error }
  }
}
