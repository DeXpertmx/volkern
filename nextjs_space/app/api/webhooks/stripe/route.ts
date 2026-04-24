export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { sendPaymentConfirmation } from '@/lib/email'
import { triggerAutomation } from '@/lib/automation-engine'
import { StripeMXService } from '@/lib/finance/mexico/stripe-mx-service'

export async function POST(request: NextRequest) {
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
      // Si tienes STRIPE_WEBHOOK_SECRET configurado, úsalo para verificar
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      } else {
        // En desarrollo, solo parseamos el evento sin verificar
        event = JSON.parse(body)
      }
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      )
    }

    // Manejar el evento
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object

        // Verificar si es un pago de suscripción o un pago único
        if (session.mode === 'subscription') {
          // Manejar suscripción completada
          const { tenantId, planId } = session.metadata || {}

          if (tenantId && planId) {
            await prisma.tenant.update({
              where: { id: tenantId },
              data: {
                plan: planId,
                estado: 'activo',
                stripeCustomerId: session.customer as string
              }
            })

            // Log de auditoría (sin userId en webhook)
            await prisma.auditLog.create({
              data: {
                accion: 'actualizar',
                entidad: 'Tenant',
                entidadId: tenantId,
                descripcion: `Suscripción activada para plan ${planId}`,
                cambiosDespues: {
                  planId,
                  subscriptionId: session.subscription,
                  customerId: session.customer
                },
                userId: 'system', // Webhook no tiene userId real
                tenantId
              }
            })

            console.log('Subscription activated for tenant:', tenantId)
          }
        } else {
          // Pago único (servicio/cita)
          const { citaId, leadId, servicioId } = session.metadata || {}

          if (citaId) {
            // Actualizar la cita como pagada
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

            // Enviar confirmación de pago por email (solo para citas con servicio)
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

              // Actualizar estado del lead a convertido
              await prisma.lead.update({
                where: { id: cita.leadId },
                data: { estado: 'convertido' }
              })

              // Disparar automatizaciones
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
        const { tenantId, planId } = subscription.metadata || {}

        if (tenantId) {
          const updateData: any = {
            estado: subscription.status === 'active' ? 'activo' : 'suspendido',
            fechaVencimiento: new Date(subscription.current_period_end * 1000)
          }

          if (planId) {
            updateData.plan = planId
          }

          await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData
          })

          console.log(`Subscription ${event.type} for tenant:`, tenantId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const { tenantId } = subscription.metadata || {}

        if (tenantId) {
          await prisma.tenant.update({
            where: { id: tenantId },
            data: {
              estado: 'cancelado',
              fechaVencimiento: new Date(subscription.ended_at ? subscription.ended_at * 1000 : Date.now())
            }
          })

          console.log('Subscription deleted for tenant:', tenantId)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const subscription = invoice.subscription

        if (subscription) {
          // Obtener la suscripción completa para acceder a metadata
          const fullSubscription = await stripe.subscriptions.retrieve(subscription as string)
          const { tenantId } = fullSubscription.metadata || {}

          if (tenantId) {
            // Actualizar MRR (Monthly Recurring Revenue)
            const mrr = invoice.amount_paid / 100 // Convertir de centavos
            const fullSub: any = fullSubscription
            const periodEnd = fullSub.current_period_end as number

            await prisma.tenant.update({
              where: { id: tenantId },
              data: {
                mrr,
                estado: 'activo',
                fechaVencimiento: new Date(periodEnd * 1000)
              }
            })

            console.log('Payment succeeded for tenant:', tenantId, 'MRR:', mrr)
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subscription = invoice.subscription

        if (subscription) {
          const fullSubscription = await stripe.subscriptions.retrieve(subscription as string)
          const { tenantId } = fullSubscription.metadata || {}

          if (tenantId) {
            await prisma.tenant.update({
              where: { id: tenantId },
              data: {
                estado: 'suspendido'
              }
            })

            // Aquí podrías enviar un email notificando el fallo de pago
            console.log('Payment failed for tenant:', tenantId)
          }
        }
        break
      }

      case 'payment_intent.payment_failed':
        console.log('Payment failed:', event.data.object.id)
        break

      case 'invoice.finalized': {
        const invoice = event.data.object
        const tenantId = invoice.metadata?.volkern_tenant_id
        if (tenantId) {
          await StripeMXService.syncFiscalFiles(invoice.id, tenantId)
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object
        const tenantId = invoice.metadata?.volkern_tenant_id
        if (tenantId) {
          await StripeMXService.syncFiscalFiles(invoice.id, tenantId)
        }
        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
