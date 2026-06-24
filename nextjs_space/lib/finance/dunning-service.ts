import { prisma } from '@/lib/db'
import { addDays } from 'date-fns'
import { eventBus, EVENTS } from '@/lib/skills/event-bus'

export class DunningService {
  /**
   * Procesa un fallo de pago recibido (ej. vía Webhook de pasarela)
   */
  static async handlePaymentFailure(subscriptionId: string, error?: string) {
    console.log(`[DunningService] Procesando fallo de pago para suscripción: ${subscriptionId}`)
    
    const subscription = await (prisma as any).clientSubscription.findUnique({
      where: { id: subscriptionId },
      include: { 
        contact: true, 
        attempts: {
          orderBy: { intento: 'desc' },
          take: 1
        }
      }
    })

    if (!subscription) {
      console.warn(`[DunningService] Suscripción ${subscriptionId} no encontrada.`)
      return
    }

    const lastAttempt = subscription.attempts[0]
    const nextAttemptNumber = (lastAttempt?.intento || 0) + 1

    // 1. Política de Reintentos: 1, 3 y 7 días
    let daysToNext = 1
    if (nextAttemptNumber === 2) daysToNext = 3
    if (nextAttemptNumber === 3) daysToNext = 7

    const nextAttemptDate = nextAttemptNumber <= 3 ? addDays(new Date(), daysToNext) : null

    // 2. Transición de Estado
    // Si ya superó los 3 intentos sin éxito, se pausa definitivamente
    const newStatus = nextAttemptNumber > 3 ? 'PAUSED' : 'GRACE_PERIOD'

    await (prisma as any).clientSubscription.update({
      where: { id: subscriptionId },
      data: {
        estado: newStatus,
        attempts: {
          create: {
            intento: nextAttemptNumber,
            estado: 'FAILED',
            errorLog: error || 'Fallo de cargo en tarjeta / Fondos insuficientes',
            fechaProximoIntento: nextAttemptDate
          }
        }
      }
    })

    // 3. Notificar y Alertar
    await this.triggerAlerts(subscription, nextAttemptNumber, nextAttemptDate)
  }

  /**
   * Reactiva una suscripción tras un pago exitoso en el periodo de gracia
   */
  static async handlePaymentSuccess(subscriptionId: string) {
    console.log(`[DunningService] Pago exitoso detectado. Reactivando suscripción: ${subscriptionId}`)
    
    await (prisma as any).clientSubscription.update({
      where: { id: subscriptionId },
      data: {
        estado: 'activa',
        ultimaFactura: new Date(),
        // Limpiamos o marcamos intentos como resueltos si fuera necesario
      }
    })

    // Registrar en auditoría
    const subscription = await (prisma as any).clientSubscription.findUnique({
      where: { id: subscriptionId },
      include: { tenant: true }
    })

    if (subscription) {
      const systemUser = await prisma.user.findFirst({ where: { tenantId: subscription.tenantId } })
      await prisma.auditLog.create({
        data: {
          tenantId: subscription.tenantId,
          userId: systemUser?.id || 'SYSTEM',
          accion: 'DUNNING_RECOVERY_SUCCESS',
          entidad: 'ClientSubscription',
          entidadId: subscriptionId,
          descripcion: `Suscripción ${subscription.planNombre} reactivada tras pago exitoso.`,
        }
      })
    }
  }

  /**
   * Orquestación de alertas (Telegram + EventBus)
   */
  private static async triggerAlerts(subscription: any, attempt: number, nextDate: Date | null) {
    const isFinalFailure = attempt > 3
    
    // Alerta para el equipo de ventas
    const telegramMessage = isFinalFailure
      ? `🚨 SUSCRIPCIÓN PAUSADA [${subscription.contact.nombre}]\nSe han agotado los 3 reintentos de cobro para ${subscription.planNombre}. Acción manual requerida.`
      : `⚠️ FALLO DE COBRO [${subscription.contact.nombre}]\nIntento ${attempt}/3 fallido. Suscripción en Periodo de Gracia.\nPróximo reintento: ${nextDate?.toLocaleDateString()}`

    console.log(`[DunningService] Alertando: ${telegramMessage}`)

    // Emitir evento para automatizaciones (ej. envío de email de recuperación)
    eventBus.emitEvent(EVENTS.PAYMENT_FAILED, {
      tenantId: subscription.tenantId,
      contactId: subscription.contactId,
      monto: subscription.monto,
      error: `Dunning Attempt ${attempt} failed. Status: ${isFinalFailure ? 'PAUSED' : 'GRACE_PERIOD'}`,
      source: 'automation',
      timestamp: new Date()
    })
  }
}
