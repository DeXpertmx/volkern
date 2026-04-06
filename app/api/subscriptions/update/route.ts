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

    const { newPlanId } = await request.json()

    if (!newPlanId || !Object.values(PLANS).includes(newPlanId)) {
      return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
    }

    if (newPlanId === PLANS.TRIAL) {
      return NextResponse.json({ error: 'No se puede cambiar a plan trial' }, { status: 400 })
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
    const newPriceId = PLAN_PRICES[newPlanId as keyof typeof PLAN_PRICES].stripePriceId

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
