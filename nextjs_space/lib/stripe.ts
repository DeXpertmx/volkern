
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

/**
 * Crea una sesión de checkout de suscripción con precio dinámico.
 * Usa price_data con recurring en lugar de un Price ID predefinido.
 */
export async function createSubscriptionCheckout({
  customerId,
  tenantId,
  planLabel,
  usuarios,
  contactos,
  plan,
  interval,
  precioMensual,
  successUrl,
  cancelUrl,
}: {
  customerId: string
  tenantId: string
  planLabel: string
  usuarios: number
  contactos: number
  plan: string
  interval: 'monthly' | 'yearly'
  precioMensual: number
  successUrl: string
  cancelUrl: string
}) {
  try {
    const precioCentavos = Math.round(precioMensual * 100)

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Volkern ${planLabel}`,
              description: `${usuarios} usuarios · ${contactos >= 1000 ? `${(contactos / 1000).toFixed(0)}.000` : contactos} contactos`,
            },
            recurring: {
              interval: interval === 'yearly' ? 'year' : 'month',
            },
            unit_amount: precioCentavos,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenantId,
        plan,
        interval,
        usuarios: String(usuarios),
        contactos: String(contactos),
        precioMensual: String(precioMensual),
      },
      subscription_data: {
        metadata: {
          tenantId,
          plan,
          interval,
          usuarios: String(usuarios),
          contactos: String(contactos),
        },
      },
    })

    return { success: true, session }
  } catch (error) {
    console.error('Error creating subscription checkout:', error)
    return { success: false, error }
  }
}
