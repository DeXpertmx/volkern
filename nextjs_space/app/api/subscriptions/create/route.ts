export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { PLAN_PRICES, PLANS } from '@/lib/plans'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { planId, interval = 'monthly' } = await request.json()

    const validPaidPlans = [PLANS.ESENCIAL, PLANS.PROFESIONAL, PLANS.INFINITY]
    if (!validPaidPlans.includes(planId)) {
      return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
    }
    if (!['monthly', 'yearly'].includes(interval)) {
      return NextResponse.json({ error: 'Intervalo inválido' }, { status: 400 })
    }

    // Obtener usuario y tenant
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { tenant: true }
    })

    if (!user || !user.tenant) {
      return NextResponse.json({ error: 'Usuario o tenant no encontrado' }, { status: 404 })
    }

    const tenant = user.tenant

    // Crear o recuperar Stripe customer
    let customerId = tenant.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.billingEmail || user.email,
        name: tenant.nombre,
        metadata: {
          tenantId: tenant.id,
          tenantSlug: tenant.slug
        }
      })
      customerId = customer.id

      // Actualizar tenant con el customer ID
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId }
      })
    }

    const priceInfo = PLAN_PRICES[planId as keyof typeof PLAN_PRICES]
    const stripePriceId = interval === 'yearly' ? priceInfo.stripePriceYearlyId : priceInfo.stripePriceId

    if (!stripePriceId) {
      return NextResponse.json({ error: 'Price ID no configurado para este plan' }, { status: 500 })
    }
    
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://volkern.app'}/dashboard/configuracion/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://volkern.app'}/dashboard/configuracion/billing?canceled=true`,
      metadata: {
        tenantId: tenant.id,
        planId,
        interval,
      },
      subscription_data: {
        metadata: {
          tenantId: tenant.id,
          planId,
          interval,
        }
      }
    })

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        accion: 'crear',
        entidad: 'Subscription',
        entidadId: checkoutSession.id,
        descripcion: `Checkout de suscripción iniciado para plan ${planId}`,
        cambiosDespues: {
          planId,
          sessionId: checkoutSession.id
        },
        userId: user.id,
        tenantId: tenant.id
      }
    })

    return NextResponse.json({
      success: true,
      checkoutUrl: checkoutSession.url
    })

  } catch (error: any) {
    console.error('Error creating subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Error al crear la suscripción' },
      { status: 500 }
    )
  }
}
