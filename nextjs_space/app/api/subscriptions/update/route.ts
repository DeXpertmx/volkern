export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { PLAN_PRICES, PLANS } from '@/lib/plans'
import { VERTICAL_PLAN_IDS, getVerticalPlan } from '@/lib/vertical-plans'
import {
  CRM_MAX_SELF_SERVE_SEATS,
  calcularPrecioCrm,
  getCrmTier,
  isCrmTier,
} from '@/lib/crm-pricing'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { newPlanId, tier, seats } = await request.json()

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
    const currentItem = subscription.items.data[0]
    const currentPriceId = currentItem.price.id
    const intervalActual = currentItem.price.recurring?.interval === 'year' ? 'yearly' : 'monthly'
    let newPriceId = PLAN_PRICES[newPlanId as keyof typeof PLAN_PRICES]?.stripePriceId
    let nuevaCantidad: number | undefined
    let crmTierFinal: string | null = null

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

      if (vertical.id === 'crm_ventas') {
        // Subir o bajar de nivel sin cambiar de producto: el nivel sale del
        // cuerpo o de la configuración actual, y los asientos de la suscripción.
        const config = (tenant.configuracion as Record<string, unknown> | null) || {}
        const tierFinal = isCrmTier(tier) ? tier : config.crmTier
        if (!isCrmTier(tierFinal as string)) {
          return NextResponse.json(
            { error: 'Elige un nivel de CRM: esencial, profesional o avanzado.' },
            { status: 400 },
          )
        }

        const asientos = Number(seats) || currentItem.quantity || 1
        if (!Number.isInteger(asientos) || asientos < 1 || asientos > CRM_MAX_SELF_SERVE_SEATS) {
          return NextResponse.json(
            { error: `Indica entre 1 y ${CRM_MAX_SELF_SERVE_SEATS} usuarios.` },
            { status: 400 },
          )
        }

        const precio = calcularPrecioCrm({ tier: tierFinal as string, interval: intervalActual, seats: asientos })
        const nivel = getCrmTier(tierFinal as string)!

        // El importe del periodo se reparte entre los asientos en céntimos
        // decimales: con tramos marginales, el precio medio por asiento no
        // siempre cae en un céntimo exacto.
        const centimosPorAsiento =
          Math.round(((precio.billedAmount * 100) / asientos) * 100) / 100

        const createdPrice = await stripe.prices.create({
          currency: 'eur',
          unit_amount_decimal: centimosPorAsiento.toFixed(2),
          recurring: { interval: intervalActual === 'yearly' ? 'year' : 'month' },
          product_data: { name: `Volkern ${vertical.name} ${nivel.name}` },
        })
        newPriceId = createdPrice.id
        nuevaCantidad = asientos
        crmTierFinal = nivel.id
      } else {
        const priceInfo = PLAN_PRICES[vertical.id as keyof typeof PLAN_PRICES]
        const createdPrice = await stripe.prices.create({
          currency: 'eur',
          unit_amount: Math.round((intervalActual === 'yearly' ? priceInfo.yearly : priceInfo.monthly) * 100),
          recurring: { interval: intervalActual === 'yearly' ? 'year' : 'month' },
          product_data: { name: `Volkern ${vertical.name}` },
        })
        newPriceId = createdPrice.id
      }
    }

    if (currentPriceId === newPriceId && !nuevaCantidad) {
      return NextResponse.json({ error: 'Ya estás en ese plan' }, { status: 400 })
    }

    // Actualizar la suscripción
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: currentItem.id,
          price: newPriceId,
          ...(nuevaCantidad && { quantity: nuevaCantidad }),
        }
      ],
      proration_behavior: 'always_invoice', // Facturar inmediatamente el prorreo
      metadata: {
        tenantId: tenant.id,
        planId: newPlanId,
        ...(crmTierFinal && { crmTier: crmTierFinal, crmSeats: String(nuevaCantidad) }),
      }
    })

    // Nota: El webhook manejará la actualización del tenant
    // Pero por ahora actualizamos el plan inmediatamente
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        plan: newPlanId,
        ...(crmTierFinal && {
          configuracion: {
            ...((tenant.configuracion as Record<string, unknown>) || {}),
            crmTier: crmTierFinal,
            crmSeats: nuevaCantidad,
          } as any,
        }),
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
