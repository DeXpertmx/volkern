export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { sendPaymentConfirmation } from '@/lib/email'
import { sendEmail } from '@/lib/ses-email'
import { triggerAutomation } from '@/lib/automation-engine'
import { StripeMXService } from '@/lib/finance/mexico/stripe-mx-service'

export const DUNNING_NOTIFICATION_DAYS = [3, 7, 14]

export async function checkIfEventProcessed(stripeEventId: string, tenantId: string | undefined): Promise<boolean> {
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

async function sendWelcomeEmail(tenantId: string, plan: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { nombre: true, billingEmail: true }
  })

  if (!tenant?.billingEmail) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'
  const dashboardUrl = `${appUrl}/dashboard/onboarding-quick`
  const PLAN_NAMES: Record<string, string> = {
    scale: 'Scale',
    compliance: 'Compliance Pro',
    esencial: 'Esencial',
    profesional: 'Profesional',
    infinity: 'Infinity',
  }
  const planName = PLAN_NAMES[plan] || plan

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0; font-size: 28px;">🎉 ¡Bienvenido a Volkern!</h1>
        <p style="color: #6b7280; font-size: 16px; margin-top: 8px;">Tu plataforma todo en uno está lista</p>
      </div>

      <p style="font-size: 16px; color: #374151;">Hola <strong>${tenant.nombre}</strong>,</p>
      <p style="font-size: 16px; color: #374151;">
        Tu cuenta ha sido activada correctamente con el plan <strong>${planName}</strong>.
        Todo está configurado y listo para que empieces a operar.
      </p>

      <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #7c3aed;">
        <h2 style="margin: 0 0 12px 0; color: #5b21b6; font-size: 18px;">⚡ Tu configuración incluye</h2>
        <ul style="margin: 0; padding-left: 20px; color: #374151; line-height: 1.8;">
          <li>Configuración inicial del CRM</li>
          <li>Pipeline de ventas estándar</li>
          <li>Automatización básica</li>
          <li>1 canal de comunicación activo</li>
          <li>Sesión de onboarding en vivo</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${dashboardUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px;">
          Ir a mi panel →
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Si tienes alguna duda, responde a este correo o contáctanos en 
        <a href="mailto:soporte@volkern.app" style="color: #7c3aed;">soporte@volkern.app</a>.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Volkern — La plataforma todo en uno para tu negocio
      </p>
    </div>
  `

  await sendEmail({
    to: tenant.billingEmail,
    subject: `🎉 ¡Bienvenido a Volkern! — Plan ${planName} activado`,
    html,
    tenantSubdomain: tenantId,
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
      if (!webhookSecret) {
        console.error('[StripeWebhook] STRIPE_WEBHOOK_SECRET no configurado — rechazando evento')
        return NextResponse.json(
          { error: 'Webhook secret not configured' },
          { status: 500 }
        )
      }
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      )
    }

    const obj = event.data.object as any
    stripeEventId = obj?.id || event.id
    tenantId = obj?.metadata?.tenantId || obj?.tenantId

    const alreadyProcessed = await checkIfEventProcessed(stripeEventId!, tenantId)
    if (alreadyProcessed) {
      console.log(`Duplicate webhook event skipped: ${stripeEventId}`)
      return NextResponse.json({ received: true, skipped: true, duplicate: true })
    }

    let result = { received: true }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any

          if (session.mode === 'subscription') {
            const { tenantId: subTenantId, plan: planKey, planId } = session.metadata || {}
            const resolvedPlan = planKey || planId

            if (subTenantId && resolvedPlan) {
              await prisma.tenant.update({
                where: { id: subTenantId },
                data: {
                  plan: resolvedPlan,
                  estado: 'activo',
                  stripeCustomerId: session.customer as string
                }
              })

              await prisma.auditLog.create({
                data: {
                  accion: 'actualizar',
                  entidad: 'Tenant',
                  entidadId: subTenantId,
                  descripcion: `Suscripción activada para plan ${resolvedPlan}`,
                  cambiosDespues: {
                    planId: resolvedPlan,
                    subscriptionId: session.subscription,
                    customerId: session.customer
                  } as any,
                  userId: 'system',
                  tenantId: subTenantId
                }
              })

              // Enviar email de bienvenida
              await sendWelcomeEmail(subTenantId, resolvedPlan).catch(err =>
                console.error('[StripeWebhook] Error sending welcome email:', err)
              )

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

              if (cita.montoPagado && cita.stripePaymentId && cita.servicio && cita.lead) {
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
                  leadId: cita.leadId!,
                  servicioId: cita.servicioId as any,
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
          const subscription = event.data.object as any
          const { tenantId: subTenantId, plan: planKey, planId } = subscription.metadata || {}
          const resolvedPlan = planKey || planId

          if (subTenantId) {
            const currentPeriodEnd = subscription.current_period_end as number
            const updateData: any = {
              estado: subscription.status === 'active' ? 'activo' : 'suspendido',
              fechaVencimiento: new Date(currentPeriodEnd * 1000)
            }

            if (resolvedPlan) {
              updateData.plan = resolvedPlan
            }

            await prisma.tenant.update({
              where: { id: subTenantId },
              data: updateData
            })

            await handleSubscriptionUpdate(
              subTenantId,
              subscription.id,
              subscription.status,
              currentPeriodEnd,
              planId
            )

            console.log(`Subscription ${event.type} for tenant:`, subTenantId)
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as any
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
          const invoice = event.data.object as any
          const subscription = invoice.subscription

          if (subscription) {
            const fullSubscription = await stripe.subscriptions.retrieve(subscription as string) as any
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
          const invoice = event.data.object as any
          const subscription = invoice.subscription

          if (subscription) {
            const fullSubscription = await stripe.subscriptions.retrieve(subscription as string) as any
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
      await markEventProcessed(stripeEventId || '', event.type, tenantId || '', String(processingError))
      throw processingError
    }

    await markEventProcessed(stripeEventId || '', event.type, tenantId || '', null)

    return NextResponse.json(result)

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}