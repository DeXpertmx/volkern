export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { getTrialDaysRemaining } from '@/lib/plans'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { 
        tenant: true,
        role: true 
      }
    })

    if (!user || !user.tenant) {
      return NextResponse.json({ error: 'Usuario o tenant no encontrado' }, { status: 404 })
    }

    // Si es superadmin, devolver estado activo sin restricciones
    if (user.role?.nombre === 'Superadmin') {
      return NextResponse.json({
        plan: 'ilimitado',
        status: 'active',
        limits: null,
        isSuperAdmin: true
      })
    }

    const tenant = user.tenant
    const response: any = {
      plan: tenant.plan,
      status: tenant.estado,
      limits: tenant.limites
    }

    // Si está en trial, agregar info de trial
    if (tenant.estado === 'trial' && tenant.fechaTrialFin) {
      response.trial = {
        daysRemaining: getTrialDaysRemaining(tenant.fechaTrialFin),
        endsAt: tenant.fechaTrialFin
      }
    }

    // Si tiene Stripe customer, obtener info de suscripción
    if (tenant.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: tenant.stripeCustomerId,
          limit: 1
        })

        if (subscriptions.data.length > 0) {
          const sub: any = subscriptions.data[0]
          const periodEnd = sub.current_period_end as number
          response.subscription = {
            id: sub.id,
            status: sub.status,
            currentPeriodEnd: new Date(periodEnd * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end
          }
        }
      } catch (stripeError) {
        console.error('Error fetching Stripe subscription:', stripeError)
        // No fallar si Stripe falla, solo omitir info de suscripción
      }
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Error fetching subscription status:', error)
    return NextResponse.json(
      { error: 'Error al obtener estado de suscripción' },
      { status: 500 }
    )
  }
}
