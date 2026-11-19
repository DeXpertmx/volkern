/**
 * Historial reciente de la conversación para el agente.
 *
 * El agente recibía sólo el mensaje actual, así que no podía resolver
 * referencias («que tengan terraza», «y en el centro») porque no sabía de qué
 * se había hablado antes. Aquí se leen los últimos mensajes del canal de chat
 * y se entregan como turnos `user`/`assistant` del modelo.
 */
import { prisma } from '@/lib/db';

export interface MensajeDeHistorial {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Seis turnos (doce mensajes) es suficiente para una conversación comercial y
 * mantiene el prompt corto: el agente no necesita todo el hilo, sólo el
 * contexto inmediato al que se refiere el usuario.
 */
const MAX_MENSAJES_HISTORIAL = 12;

/**
 * Últimos mensajes del canal, del más antiguo al más reciente.
 *
 * `senderId` distingue quién habló: usuario autenticado (`user`) o respuesta
 * del agente (`assistant`, sin remitente). Se filtra por `tenantId` además del
 * canal para no leer hilos de otro tenant aunque llegue un id de canal ajeno.
 */
export async function cargarHistorialDeConversacion(params: {
  channelId: string;
  tenantId: string;
}): Promise<MensajeDeHistorial[]> {
  const { channelId, tenantId } = params;

  const filas = await prisma.chatMessage.findMany({
    where: { channelId, tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: MAX_MENSAJES_HISTORIAL,
    select: { senderId: true, content: true },
  });

  return filas
    .reverse()
    .map((fila) => ({ role: fila.senderId ? 'user' : 'assistant', content: fila.content }));
}
