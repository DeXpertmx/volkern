export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { tenant: true }
    })

    if (!user || !user.tenant || !user.tenant.stripeCustomerId) {
      return NextResponse.json({ error: 'No se encontró información de suscripción' }, { status: 404 })
    }

    const tenant = user.tenant

    // Obtener suscripciones activas del customer
    const subscriptions = await stripe.subscriptions.list({
      customer: tenant.stripeCustomerId!,
      status: 'active',
      limit: 1
    })

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ error: 'No hay suscripción activa para cancelar' }, { status: 404 })
    }

    const subscription = subscriptions.data[0]

    // Cancelar al final del período de facturación
    const canceledSubscription: any = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true
    })

    const periodEnd = canceledSubscription.current_period_end as number

    // Actualizar tenant
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        estado: 'cancelado',
        fechaVencimiento: new Date(periodEnd * 1000)
      }
    })

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        accion: 'actualizar',
        entidad: 'Subscription',
        entidadId: subscription.id,
        descripcion: `Suscripción cancelada para el tenant ${tenant.nombre}`,
        cambiosDespues: {
          subscriptionId: subscription.id,
          cancelAt: new Date(periodEnd * 1000).toISOString()
        },
        userId: user.id,
        tenantId: tenant.id
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Suscripción cancelada. Tendrás acceso hasta el final del período de facturación.',
      accessUntil: new Date(periodEnd * 1000)
    })

  } catch (error: any) {
    console.error('Error canceling subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Error al cancelar la suscripción' },
      { status: 500 }
    )
  }
}
