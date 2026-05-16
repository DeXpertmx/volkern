import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';

export interface CreateInteractionInput {
  tenantId: string;
  leadId?: string;
  contactId?: string;
  tipo: 'llamada' | 'email' | 'whatsapp' | 'reunion' | 'nota_interna';
  contenido: string;
  resultado?: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

/**
 * Registrar una interacción con un lead o contacto
 */
export async function createInteraction(input: CreateInteractionInput) {
  const { tenantId, leadId, contactId, tipo, contenido, resultado, userId, source = 'app' } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!leadId && !contactId) throw new Error('Debe proporcionar leadId o contactId');
  if (!tipo) throw new Error('tipo es requerido');
  if (!contenido) throw new Error('contenido es requerido');

  // 2. Crear en Core
  const interaction = await prisma.interaction.create({
    data: {
      leadId,
      contactId,
      tipo,
      contenido,
      resultado,
      creadoPor: userId,
    },
  });

  // 3. Emitir evento (si existe el tipo de evento, si no lo agregamos luego)
  // eventBus.emitEvent(EVENTS.INTERACTION_CREATED, { ... });

  // 4. Retornar resultado
  return interaction;
}

/**
 * Obtener interacciones de un lead
 */
export async function getInteractionsByLead(leadId: string) {
  return prisma.interaction.findMany({
    where: { leadId },
    orderBy: { fechaCreacion: 'desc' },
  });
}

/**
 * Obtener interacciones de un contacto
 */
export async function getInteractionsByContact(contactId: string) {
  return prisma.interaction.findMany({
    where: { contactId },
    orderBy: { fechaCreacion: 'desc' },
  });
}
