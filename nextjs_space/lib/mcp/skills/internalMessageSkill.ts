import { prisma } from '@/lib/db';

export async function sendInternalMessage(params: {
  to: string;
  message: string;
  fromUserId: string;
  tenantId: string;
  context?: {
    leadId?: string;
    citaId?: string;
    cliente?: string;
  };
}) {
  const internalMessage = await prisma.internalMessage.create({
    data: {
      tenantId: params.tenantId,
      fromUserId: params.fromUserId,
      toUserIdentifier: params.to,
      content: params.message,
      context: params.context || {},
      source: 'telegram',
      status: 'sent',
      createdAt: new Date()
    }
  });

  return {
    success: true,
    messageId: internalMessage.id,
    delivered: true
  };
}