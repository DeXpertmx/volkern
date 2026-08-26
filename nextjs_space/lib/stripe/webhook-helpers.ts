import { prisma } from '@/lib/db'

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