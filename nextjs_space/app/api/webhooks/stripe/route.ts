export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { sendPaymentConfirmation } from '@/lib/email'
import { sendEmail } from '@/lib/ses-email'
import { triggerAutomation } from '@/lib/automation-engine'
import { StripeMXService } from '@/lib/finance/mexico/stripe-mx-service'

const DUNNING_NOTIFICATION_DAYS = [3, 7, 14]

async function checkIfEventProcessed(stripeEventId: string, tenantId: string | undefined): Promise<boolean> {
  if (!stripeEventId) return false
  
  const existing = await prisma.processedWebhook.findUnique({
    where: {
      stripeEventId_tenantId: {
        stripeEventId,
        tenantId: tenantId || ''
      }
    }
  })
  return !!existing
}

async function markEventProcessed(
  stripeEventId: string,
  eventType: string,
  tenantId: string | undefined,
  error: string | null = null
): Promise<void> {
  await prisma.processedWebhook.upsert({
    where: {
      stripeEventId_tenantId: {
        stripeEventId,
        tenantId: tenantId || ''
      }
    },
    create: {
      stripeEventId,
      eventType,
      tenantId,
      processingError: error
    },
    update: {
      processedAt: new Date(),
      processingError: error
    }
  })
}

async function handleTrialExpiration(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { nombre: true, billingEmail: true, plan: true }
  })

  if (tenant?.billingEmail) {
    await sendEmail({
      to: tenant.billingEmail,
      subject: 'Tu período de prueba ha terminado',
      html: `
        <h2>Hola,</h2>
        <p>Tu período de prueba en Volkern ha terminado. Para continuar usando el servicio, por favor renueva tu suscripción.</p>
        <p>Plan actual: ${tenant.plan}</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/billing">Renovar ahora</a></p>
      `,
      tenantSubdomain: tenantId,
    })
  }
}

async function sendDunningEmail(tenantId: string, daysSinceFailure: number, invoiceAmount: number): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { nombre: true, billingEmail: true, plan: true, mrr: true }
  })

  if (!tenant?.billingEmail) return

  const isFinalNotice = daysSinceFailure >= 14
  const subject = isFinalNotice 
    ? 'URGENTE: Tu servicio será cancelado' 
    : `Tu pago de $${invoiceAmount} no pudo ser procesado - Día ${daysSinceFailure}`

  await sendEmail({
    to: tenant.billingEmail,
    subject,
    html: `
      <h2>Hola,</h2>
      <p>Hemos intentado procesar tu pago de <strong>$${invoiceAmount}</strong> pero no fue exitoso.</p>
      <p>Días desde el fallo: ${daysSinceFailure}</p>
      <p>Por favor actualiza tu método de pago para evitar la suspensión del servicio.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/billing">Actualizar método de pago</a></p>
      ${isFinalNotice ? '<p><strong>Después de 14 días, tu cuenta será suspendida.</strong></p>' : ''}
    `,
    tenantSubdomain: tenantId,
  })
}

async function handlePaymentFailureDunning(tenantId: string, subscriptionId: string): Promise<void> {
  const lastFailure = await prisma.processedWebhook.findFirst({
    where: {
      tenantId,
      eventType: 'invoice.payment_failed'
    },
    orderBy: { processedAt: 'desc' }
  })

  if (!lastFailure) return

  const daysSinceFailure = Math.floor(
    (Date.now() - lastFailure.processedAt.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (DUNNING_NOTIFICATION_DAYS.includes(daysSinceFailure)) {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId }
    })

    await sendDunningEmail(
      tenantId,
      daysSinceFailure,
      subscription?.montoPagado || 0
    )
  }
}

async function handleSubscriptionUpdate(
  tenantId: string,
  subscriptionId: string,
  status: string,
  currentPeriodEnd: number,
  planId?: string
): Promise<void> {
  const periodEnd = new Date(currentPeriodEnd * 1000)

  const existingSub = await prisma.subscription.findFirst({
    where: { tenantId }
  })

  if (existingSub) {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        estado: status === 'active' ? 'activa' : 'suspendida',
        fechaRenovacion: periodEnd,
        stripeSubscriptionId: subscriptionId,
        ...(planId && { planId })
      }
    })
  } else if (planId) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId }
    })

    await prisma.subscription.create({
      data: {
        tenantId,
        planId,
        estado: status === 'active' ? 'activa' : 'suspendida',
        fechaRenovacion: periodEnd,
        stripeSubscriptionId: subscriptionId,
        montoPagado: plan?.precio || 0
      }
    })
  }
}

async function handleTrialExpirationCheck(): Promise<void> {
  const expiredTrials = await prisma.tenant.findMany({
    where: {
      fechaTrialFin: { lte: new Date() },
      estado: 'trial',
      plan: { not: 'basico' }
    },
    select: { id: true }
  })

  for (const tenant of expiredTrials) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        estado: 'suspendido',
        plan: 'basico'
      }
    })

    await handleTrialExpiration(tenant.id)
  }
}

export async function GET() {
  await handleTrialExpirationCheck()
  return NextResponse.json({ received: true })
}

export async function POST(request: NextRequest) {
  let stripeEventId: string | undefined
  let tenantId: string | undefined

  try {
    const body = await request.text()
    const signature = headers().get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 400 }
      )
    }

    let event

    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      } else {
        event = JSON.parse(body)
      }
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      )
    }

    stripeEventId = event.data.object?.id || event.id
    tenantId = event.data.object?.metadata?.tenantId || event.data.object?.tenantId

    const alreadyProcessed = await checkIfEventProcessed(stripeEventId, tenantId)
    if (alreadyProcessed) {
      console.log(`Duplicate webhook event skipped: ${stripeEventId}`)
      return NextResponse.json({ received: true, skipped: true, duplicate: true })
    }

    let result = { received: true }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object

          if (session.mode === 'subscription') {
            const { tenantId: subTenantId, planId } = session.metadata || {}

            if (subTenantId && planId) {
              await prisma.tenant.update({
                where: { id: subTenantId },
                data: {
                  plan: planId,
                  estado: 'activo',
                  stripeCustomerId: session.customer as string
                }
              })

              await prisma.auditLog.create({
                data: {
                  accion: 'actualizar',
                  entidad: 'Tenant',
                  entidadId: subTenantId,
                  descripcion: `Suscripción activada para plan ${planId}`,
                  cambiosDespues: {
                    planId,
                    subscriptionId: session.subscription,
                    customerId: session.customer
                  },
                  userId: 'system',
                  tenantId: subTenantId
                }
              })

              console.log('Subscription activated for tenant:', subTenantId)
            }
          } else {
            const { citaId, leadId, servicioId } = session.metadata || {}

            if (citaId) {
              const cita = await prisma.cita.update({
                where: { id: citaId },
                data: {
                  estado: 'pagada',
                  montoPagado: session.amount_total ? session.amount_total / 100 : 0,
                  stripePaymentId: session.payment_intent as string
                },
                include: {
                  lead: true,
                  servicio: true
                }
              })

              if (cita.montoPagado && cita.stripePaymentId && cita.servicio) {
                await sendPaymentConfirmation({
                  lead: { nombre: cita.lead.nombre, email: cita.lead.email },
                  servicio: {
                    nombre: cita.servicio.nombre,
                    precio: cita.servicio.precio,
                    moneda: cita.servicio.moneda
                  },
                  montoPagado: cita.montoPagado,
                  stripePaymentId: cita.stripePaymentId,
                  tenantId: cita.tenantId || ''
                })

                await prisma.lead.update({
                  where: { id: cita.leadId },
                  data: { estado: 'convertido' }
                })

                await triggerAutomation('pago_recibido', {
                  citaId: cita.id,
                  leadId: cita.leadId,
                  servicioId: cita.servicioId || undefined,
                  cita: cita,
                  montoPagado: cita.montoPagado,
                })
              }

              console.log('Payment completed for cita:', citaId)
            }
          }
          break
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object
          const { tenantId: subTenantId, planId } = subscription.metadata || {}

          if (subTenantId) {
            const updateData: any = {
              estado: subscription.status === 'active' ? 'activo' : 'suspendido',
              fechaVencimiento: new Date(subscription.current_period_end * 1000)
            }

            if (planId) {
              updateData.plan = planId
            }

            await prisma.tenant.update({
              where: { id: subTenantId },
              data: updateData
            })

            await handleSubscriptionUpdate(
              subTenantId,
              subscription.id,
              subscription.status,
              subscription.current_period_end,
              planId
            )

            console.log(`Subscription ${event.type} for tenant:`, subTenantId)
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object
          const { tenantId: subTenantId } = subscription.metadata || {}

          if (subTenantId) {
            await prisma.tenant.update({
              where: { id: subTenantId },
              data: {
                estado: 'cancelado',
                fechaVencimiento: new Date(subscription.ended_at ? subscription.ended_at * 1000 : Date.now())
              }
            })

            const existingSub = await prisma.subscription.findFirst({
              where: { tenantId: subTenantId }
            })

            if (existingSub) {
              await prisma.subscription.update({
                where: { id: existingSub.id },
                data: {
                  estado: 'cancelada',
                  fechaCancelacion: new Date()
                }
              })
            }

            console.log('Subscription deleted for tenant:', subTenantId)
          }
          break
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object
          const subscription = invoice.subscription

          if (subscription) {
            const fullSubscription = await stripe.subscriptions.retrieve(subscription as string)
            const { tenantId: subTenantId } = fullSubscription.metadata || {}

            if (subTenantId) {
              const mrr = invoice.amount_paid / 100
              const periodEnd = fullSubscription.current_period_end as number

              await prisma.tenant.update({
                where: { id: subTenantId },
                data: {
                  mrr,
                  estado: 'activo',
                  fechaVencimiento: new Date(periodEnd * 1000)
                }
              })

              console.log('Payment succeeded for tenant:', subTenantId, 'MRR:', mrr)
            }
          }
          break
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object
          const subscription = invoice.subscription

          if (subscription) {
            const fullSubscription = await stripe.subscriptions.retrieve(subscription as string)
            const { tenantId: subTenantId } = fullSubscription.metadata || {}

            if (subTenantId) {
              await prisma.tenant.update({
                where: { id: subTenantId },
                data: {
                  estado: 'suspendido'
                }
              })

              await handlePaymentFailureDunning(subTenantId, subscription as string)

              console.log('Payment failed for tenant:', subTenantId)
            }
          }
          break
        }

        case 'payment_intent.payment_failed':
          console.log('Payment failed:', event.data.object.id)
          break

        case 'invoice.finalized': {
          const invoice = event.data.object
          const volkernTenantId = invoice.metadata?.volkern_tenant_id
          if (volkernTenantId) {
            await StripeMXService.syncFiscalFiles(invoice.id, volkernTenantId)
          }
          break
        }

        case 'invoice.paid': {
          const invoice = event.data.object
          const volkernTenantId = invoice.metadata?.volkern_tenant_id
          if (volkernTenantId) {
            await StripeMXService.syncFiscalFiles(invoice.id, volkernTenantId)
          }
          break
        }

        default:
          console.log('Unhandled event type:', event.type)
      }
    } catch (processingError) {
      console.error('Event processing error:', processingError)
      await markEventProcessed(stripeEventId, event.type, tenantId, String(processingError))
      throw processingError
    }

    await markEventProcessed(stripeEventId!, event.type, tenantId, null)

    return NextResponse.json(result)

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}