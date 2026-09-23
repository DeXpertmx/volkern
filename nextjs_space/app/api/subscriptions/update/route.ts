export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { PLAN_PRICES, PLANS } from '@/lib/plans'
import { VERTICAL_PLAN_IDS, getVerticalPlan } from '@/lib/vertical-plans'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { newPlanId } = await request.json()

    // Se puede cambiar a una vertical (lo que la plataforma vende) o a los planes
    // legacy que un tenant ya tuviera contratados.
    const validPaidPlans = [
      ...VERTICAL_PLAN_IDS,
      PLANS.ESENCIAL, PLANS.PROFESIONAL, PLANS.INFINITY, PLANS.SCALE, PLANS.COMPLIANCE,
    ]
    if (!validPaidPlans.includes(newPlanId)) {
      return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
    }

    // Los planes dinámicos (scale/compliance) se gestionan desde /precios, no desde esta API
    const dynamicPlans = [PLANS.SCALE, PLANS.COMPLIANCE]
    if (dynamicPlans.includes(newPlanId)) {
      return NextResponse.json({ error: 'Cambio a plan dinámico no soportado desde esta API. Usa /precios para reconfigurar.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { tenant: true }
    })

    if (!user || !user.tenant || !user.tenant.stripeCustomerId) {
      return NextResponse.json({ error: 'No se encontró información de suscripción' }, { status: 404 })
    }

    const tenant = user.tenant

    // Obtener suscripción activa
    const subscriptions = await stripe.subscriptions.list({
      customer: tenant.stripeCustomerId!,
      status: 'active',
      limit: 1
    })

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ error: 'No hay suscripción activa' }, { status: 404 })
    }

    const subscription = subscriptions.data[0]
    const currentPriceId = subscription.items.data[0].price.id
    let newPriceId = PLAN_PRICES[newPlanId as keyof typeof PLAN_PRICES]?.stripePriceId

    // Las verticales se cobran con `price_data` en línea, así que no tienen un
    // Price ID precreado. Para poder cambiar de vertical con prorrateo —sin
    // duplicar la suscripción— se crea el precio en el momento, con el importe
    // publicado y el intervalo que ya tuviera la suscripción.
    if (!newPriceId) {
      const vertical = getVerticalPlan(newPlanId)
      if (!vertical) {
        return NextResponse.json(
          { error: 'Este plan no tiene precio configurado y no se puede cambiar desde aquí.' },
          { status: 409 },
        )
      }

      const interval = subscription.items.data[0].price.recurring?.interval === 'year' ? 'yearly' : 'monthly'
      const priceInfo = PLAN_PRICES[vertical.id as keyof typeof PLAN_PRICES]
      const createdPrice = await stripe.prices.create({
        currency: 'eur',
        unit_amount: Math.round((interval === 'yearly' ? priceInfo.yearly : priceInfo.monthly) * 100),
        recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
        product_data: { name: `Volkern ${vertical.name}` },
      })
      newPriceId = createdPrice.id
    }

    if (currentPriceId === newPriceId) {
      return NextResponse.json({ error: 'Ya estás en ese plan' }, { status: 400 })
    }

    // Actualizar la suscripción
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId
        }
      ],
      proration_behavior: 'always_invoice', // Facturar inmediatamente el prorreo
      metadata: {
        tenantId: tenant.id,
        planId: newPlanId
      }
    })

    // Nota: El webhook manejará la actualización del tenant
    // Pero por ahora actualizamos el plan inmediatamente
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        plan: newPlanId
      }
    })

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        accion: 'actualizar',
        entidad: 'Subscription',
        entidadId: subscription.id,
        descripcion: `Plan actualizado de ${tenant.plan} a ${newPlanId}`,
        cambiosAntes: { plan: tenant.plan },
        cambiosDespues: {
          plan: newPlanId,
          subscriptionId: subscription.id
        },
        userId: user.id,
        tenantId: tenant.id
      }
    })

    return NextResponse.json({
      success: true,
      message: `Plan actualizado a ${newPlanId} exitosamente`,
      subscription: {
        id: updatedSubscription.id,
        plan: newPlanId,
        status: updatedSubscription.status
      }
    })

  } catch (error: any) {
    console.error('Error updating subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Error al actualizar la suscripción' },
      { status: 500 }
    )
  }
}
