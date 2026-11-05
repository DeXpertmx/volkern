export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { PLAN_PRICES, PLANS } from '@/lib/plans'
import { calcularPrecio } from '@/lib/pricing-engine'
import { VERTICAL_PLAN_IDS, getVerticalPlan } from '@/lib/vertical-plans'
import { MONEDA_PLATAFORMA, formatearImporte } from '@/lib/moneda'
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

    const { planId, interval = 'monthly', tier, seats } = await request.json()

    // Lo que la plataforma vende son las verticales. Esencial/Profesional/Infinity
    // quedan fuera de la venta: su checkout dependía de `NEXT_PUBLIC_STRIPE_PRICE_*`,
    // variables que no existen en producción, y devolvía un 500 al pulsar el plan.
    // Si un tenant sigue en uno de ellos, su precio se conserva en PLAN_PRICES,
    // pero no se puede contratar desde aquí.
    const vertical = getVerticalPlan(planId)
    const validPaidPlans = [...VERTICAL_PLAN_IDS, PLANS.SCALE, PLANS.COMPLIANCE]
    if (!vertical && !validPaidPlans.includes(planId)) {
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

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId }
      })
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://volkern.app'
    const successUrl = `${origin}/dashboard/configuracion/billing?success=true`
    const cancelUrl = `${origin}/dashboard/configuracion/billing?canceled=true`

    // ─── Verticales: el precio publicado, desde la fuente única ─────────────
    // El importe se construye en línea con `price_data` —el mismo patrón que ya
    // usaba el motor dinámico— así que el cobro no depende de ninguna variable
    // de entorno ni de Stripe Price IDs precreados. El descuento anual (20 %) sale
    // de PLAN_PRICES, donde se deriva de la misma fuente única.
    if (vertical) {
      const esCrm = vertical.id === 'crm_ventas'

      // ─── CRM & Ventas: precio por usuario y nivel ─────────────────────────
      // El importe sale de `lib/crm-pricing.ts`, la misma fuente que la web y
      // el dossier. Stripe cobra `quantity = asientos`; el descuento por
      // volumen ya viene aplicado en el precio unitario.
      let unitAmount: number
      /** Precio por asiento en céntimos decimales, solo para el CRM. */
      let unitAmountDecimal: string | null = null
      let quantity = 1
      let crmTier: string | null = null
      let crmSeats: number | null = null
      let descripcion = vertical.subtitle

      if (esCrm) {
        if (!isCrmTier(tier)) {
          return NextResponse.json(
            { error: 'Elige un nivel de CRM: esencial, profesional o avanzado.' },
            { status: 400 },
          )
        }

        const asientos = Number(seats)
        if (!Number.isInteger(asientos) || asientos < 1) {
          return NextResponse.json(
            { error: 'Indica al menos un usuario.' },
            { status: 400 },
          )
        }
        if (asientos > CRM_MAX_SELF_SERVE_SEATS) {
          return NextResponse.json(
            {
              error: 'Hasta mil usuarios se contrata en línea. Para más, hablemos: el precio es a medida.',
            },
            { status: 400 },
          )
        }

        const precio = calcularPrecioCrm({ tier, interval, seats: asientos })
        const nivel = getCrmTier(tier)!

        // En anual se cobra el año completo por asiento; el precio de lista ya
        // es el mensual equivalente con el descuento de pagar al año. Los
        // tramos son marginales, así que el importe del periodo se reparte
        // entre los asientos en céntimos decimales: `precio medio × asientos`
        // no siempre da un céntimo exacto por asiento.
        unitAmount = precio.billedAmount / asientos
        unitAmountDecimal = (
          Math.round(((precio.billedAmount * 100) / asientos) * 100) / 100
        ).toFixed(2)
        quantity = asientos
        crmTier = nivel.id
        crmSeats = asientos
        descripcion = `${nivel.name} · ${asientos} ${asientos === 1 ? 'usuario' : 'usuarios'}${precio.discount > 0 ? ` · ${Math.round(precio.discount * 100)} % de descuento por volumen` : ''}`
      } else {
        const priceInfo = PLAN_PRICES[vertical.id as keyof typeof PLAN_PRICES]
        unitAmount = interval === 'yearly' ? priceInfo.yearly : priceInfo.monthly
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: `Volkern ${vertical.name}${crmTier ? ` ${getCrmTier(crmTier)?.name}` : ''}`,
                description: descripcion,
              },
              recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
              ...(unitAmountDecimal
                ? { unit_amount_decimal: unitAmountDecimal }
                : { unit_amount: Math.round(unitAmount * 100) }),
            },
            quantity,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tenantId: tenant.id,
          plan: vertical.id,
          vertical: vertical.id,
          interval,
          ...(crmTier && { crmTier, crmSeats: String(crmSeats) }),
        },
        subscription_data: {
          metadata: {
            tenantId: tenant.id,
            plan: vertical.id,
            vertical: vertical.id,
            interval,
            ...(crmTier && { crmTier, crmSeats: String(crmSeats) }),
          },
        },
      })

      await prisma.auditLog.create({
        data: {
          accion: 'crear',
          entidad: 'Subscription',
          entidadId: checkoutSession.id,
          descripcion: crmTier
            ? `Checkout de CRM ${getCrmTier(crmTier)?.name} iniciado (${quantity} usuarios, ${formatearImporte(unitAmount, MONEDA_PLATAFORMA)} / ${interval === 'yearly' ? 'año' : 'mes'} por usuario de media)`
            : `Checkout de la vertical ${vertical.name} iniciado (${formatearImporte(unitAmount, MONEDA_PLATAFORMA)} / ${interval === 'yearly' ? 'año' : 'mes'})`,
          cambiosDespues: {
            planId: vertical.id,
            vertical: vertical.id,
            interval,
            unitAmount,
            quantity,
            ...(crmTier && { crmTier, crmSeats }),
            sessionId: checkoutSession.id,
          },
          userId: user.id,
          tenantId: tenant.id,
        },
      })

      return NextResponse.json({
        success: true,
        checkoutUrl: checkoutSession.url,
      })
    }

    const isDynamicPlan = [PLANS.SCALE, PLANS.COMPLIANCE].includes(planId)

    if (isDynamicPlan) {
      // ─── Planes nuevos: precio dinámico con pricing engine ──────
      const planLabel = planId === 'compliance' ? 'Compliance Pro' : 'Scale'

      // Obtener datos reales del tenant para calcular el precio
      const [actualUsers, actualLeads, actualContacts] = await Promise.all([
        prisma.user.count({ where: { tenantId: tenant.id, estado: 'activo' } }),
        prisma.lead.count({ where: { tenantId: tenant.id } }),
        prisma.contact.count({ where: { tenantId: tenant.id } }),
      ])

      // Usar mínimos razonables si el tenant aún no tiene datos
      const usuarios = Math.max(actualUsers, 1)
      const contactos = Math.max(actualLeads + actualContacts, 1000)

      const engineResult = calcularPrecio({
        usuarios,
        contactos,
        plan: planId === 'compliance' ? 'compliance' : 'scale',
      })

      const precioMensual = interval === 'yearly'
        ? Math.round(engineResult.precio * 0.8)
        : engineResult.precio

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: `Volkern ${planLabel}`,
                description: `${usuarios} usuarios · ${contactos >= 1000 ? `${(contactos / 1000).toFixed(0)}.000` : contactos} contactos · ${planLabel}`,
              },
              recurring: {
                interval: interval === 'yearly' ? 'year' : 'month',
              },
              unit_amount: Math.round(precioMensual * 100),
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tenantId: tenant.id,
          plan: planId,
          interval,
        },
        subscription_data: {
          metadata: {
            tenantId: tenant.id,
            plan: planId,
            interval,
          },
        },
      })

      await prisma.auditLog.create({
        data: {
          accion: 'crear',
          entidad: 'Subscription',
          entidadId: checkoutSession.id,
          descripcion: `Checkout de suscripción iniciado para plan ${planId}`,
          cambiosDespues: { planId, sessionId: checkoutSession.id },
          userId: user.id,
          tenantId: tenant.id,
        },
      })

      return NextResponse.json({
        success: true,
        checkoutUrl: checkoutSession.url,
      })
    }

    // ─── Planes viejos: usar Stripe Price IDs fijos ──────
    const priceInfo = PLAN_PRICES[planId as keyof typeof PLAN_PRICES]
    const stripePriceId = interval === 'yearly' ? priceInfo.stripePriceYearlyId : priceInfo.stripePriceId

    if (!stripePriceId) {
      return NextResponse.json({ error: 'Price ID no configurado para este plan' }, { status: 500 })
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenantId: tenant.id,
        plan: planId,
        interval,
      },
      subscription_data: {
        metadata: {
          tenantId: tenant.id,
          plan: planId,
          interval,
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        accion: 'crear',
        entidad: 'Subscription',
        entidadId: checkoutSession.id,
        descripcion: `Checkout de suscripción iniciado para plan ${planId}`,
        cambiosDespues: {
          planId,
          sessionId: checkoutSession.id,
        },
        userId: user.id,
        tenantId: tenant.id,
      },
    })

    return NextResponse.json({
      success: true,
      checkoutUrl: checkoutSession.url,
    })

  } catch (error: any) {
    console.error('Error creating subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Error al crear la suscripción' },
      { status: 500 }
    )
  }
}
