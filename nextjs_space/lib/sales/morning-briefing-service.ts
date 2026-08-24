// Refreshed Prisma Client
import { prisma } from '@/lib/db';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';
import { createSystemContext } from '@/lib/skills/context';
import { buildTaskButtonsMarkup } from '@/lib/telegram/task-buttons';

export interface BriefingData {
  topDeals: { id: string; titulo: string; valor: number; healthScore: number; reason: string }[];
  riskyDeals: { id: string; titulo: string; risk: number; rescueMessage: string }[];
  newDiamonds: { id: string; nombre: string; quality: number }[];
  motivationalQuote: string;
  /** Tareas pendientes importantes (determinista, no pasa por Gemma):
   *  vencidas primero y luego las más próximas, del usuario o sin asignar. */
  tareasPendientes: {
    id: string;
    titulo: string;
    leadId: string | null;
    leadNombre: string | null;
    fechaVencimiento: string;
    vencida: boolean;
  }[];
}

export class MorningBriefingService {
  /**
   * Genera el briefing personalizado para un usuario
   */
  static async generateBriefing(userId: string, tenantId: string): Promise<BriefingData> {
    // 1. Obtener deals del usuario (ordenados por valor, re-priorizados en memoria)
    const rawDeals = await prisma.deal.findMany({
      where: {
        tenantId,
        usuarioAsignadoId: userId,
        estado: 'activo'
      },
      orderBy: { valor: 'desc' },
      take: 20
    });

    // Re-priorizar por salud cognitiva si el campo existe
    const deals = rawDeals.sort((a, b) => ((b as any).healthScore ?? 0) - ((a as any).healthScore ?? 0));

    // 2. Obtener leads calientes
    const leads = await prisma.lead.findMany({
      where: {
        tenantId,
        asignadoA: userId,
        estado: 'calificado'
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 5
    });

    // 3. Tareas pendientes importantes (determinista: vencidas primero, luego
    //    las más próximas). No pasan por Gemma para que el briefing siempre
    //    muestre los pendientes reales aunque la IA falle.
    const now = new Date();
    const pendingTasks = await prisma.task.findMany({
      where: {
        tenantId,
        AND: [{ OR: [{ asignadoA: userId }, { asignadoA: null }] }],
        completada: false,
        OR: [
          { recordatorioPospuestoHasta: null },
          { recordatorioPospuestoHasta: { lte: now } },
        ],
      },
      orderBy: { fechaVencimiento: 'asc' },
      take: 20,
      include: { lead: { select: { id: true, nombre: true } } },
    });
    const nowMs = Date.now();
    const tareasPendientes = (pendingTasks as any[])
      .map((t) => ({
        id: t.id,
        titulo: t.titulo,
        leadId: t.lead?.id ?? null,
        leadNombre: t.lead?.nombre ?? null,
        fechaVencimiento: new Date(t.fechaVencimiento).toISOString(),
        vencida: Boolean(t.fechaVencimiento && new Date(t.fechaVencimiento).getTime() < nowMs),
      }))
      .sort(
        (a, b) =>
          Number(b.vencida) - Number(a.vencida) ||
          new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime(),
      )
      .slice(0, 6);

    // 4. Priorizar con Gemma
    const systemPrompt = `Eres Gemma, el Asistente de Proactividad de Volkern CRM. Tu misión es generar un "Morning Briefing" para el comercial. Prioriza 3 deals por impacto y detecta riesgos. Responde SOLO en JSON válido.`;

    const userPrompt = `
Analiza los siguientes datos y genera el briefing matinal:

DEALS ACTIVOS:
${JSON.stringify(deals.map(d => ({ id: d.id, titulo: d.titulo, valor: d.valor, health: (d as any).healthScore, sentiment: (d as any).aiSentiment })))}

LEADS CALIFICADOS:
${JSON.stringify(leads.map(l => ({ id: l.id, nombre: l.nombre })))}

RESPONDE EN ESTE FORMATO JSON:
{
  "topDeals": [
    {"id": "...", "titulo": "...", "valor": 0, "healthScore": 0, "reason": "por qué es prioridad"}
  ],
  "riskyDeals": [
    {"id": "...", "titulo": "...", "risk": 0.0, "rescueMessage": "texto corto de rescate"}
  ],
  "newDiamonds": [
    {"id": "...", "nombre": "...", "quality": 90}
  ],
  "motivationalQuote": "una frase motivadora corta"
}
    `.trim();

    const messages: GemmaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });

    if (aiRes.error) throw new Error(`Error al generar briefing con Gemma: ${aiRes.error}`);

    let jsonStr = aiRes.content;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    try {
      return {
        ...JSON.parse(jsonStr),
        tareasPendientes,
      };
    } catch (e) {
      console.error('Error parsing JSON from Gemma:', jsonStr);
      throw new Error('La respuesta de Gemma no es un JSON válido');
    }
  }

  /**
   * Ejecuta el envío masivo del Morning Briefing (Cron)
   */
  static async sendGlobalBriefing() {
    // Solo los usuarios con la preferencia de briefing activada. La preferencia
    // se guarda en `metadata.notifications.briefing` (perfil → Notificaciones).
    // Default: activado (no rompe el comportamiento existente); el usuario
    // puede desactivarlo desde su perfil.
    const users = await prisma.user.findMany({
      where: { active: true, tenantId: { not: null } } as any
    });

    const optedIn = users.filter((u: any) => {
      const notifications = (u.metadata as any)?.notifications;
      if (notifications && typeof notifications === 'object') {
        return notifications.briefing !== false;
      }
      return true;
    });

    console.log(`[Morning Briefing] ${optedIn.length}/${users.length} usuarios con briefing activado`);

    for (const user of optedIn) {
      if (!user.tenantId) continue;
      
      try {
        const briefing = await this.generateBriefing(user.id, user.tenantId);
        
        // Enviar a Telegram si tiene configurado
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer');

        // Botones inline de acción por cada tarea pendiente (completar /
        // reprogramar / recordar más tarde), igual que en el listado del chat.
        // El briefing sale del cron de forma outbound (no pasa por el webhook),
        // así que los botones van en la propia llamada de envío.
        const inlineKeyboard = briefing.tareasPendientes.length > 0
          ? buildTaskButtonsMarkup(briefing.tareasPendientes.map((t) => ({ taskId: t.id, titulo: t.titulo }))).inline_keyboard
          : undefined;
        
        const tareasBlock = briefing.tareasPendientes.length > 0
          ? briefing.tareasPendientes.map(t => {
              const fecha = new Date(t.fechaVencimiento).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
              return `${t.vencida ? '🔴' : '⏳'} *${t.titulo}*${t.leadNombre ? ` (${t.leadNombre})` : ''} — ${fecha}`;
            }).join('\n')
          : '✅ Nada urgente pendiente.';

        const message = `
☀️ *¡Buenos días, ${user.name}!*

🚀 *Tus 3 prioridades de hoy:*
${briefing.topDeals.map(d => `• *${d.titulo}* (${d.valor}€) - ${d.reason}`).join('\n')}

🚨 *Operación Rescate:*
${briefing.riskyDeals.length > 0 
  ? briefing.riskyDeals.map(d => `⚠️ *${d.titulo}* está en riesgo.`).join('\n') 
  : '✅ ¡Sin riesgos críticos hoy!'}

📋 *Pendientes importantes:*
${tareasBlock}

✨ *Mensaje del día:*
_"${briefing.motivationalQuote}"_
        `.trim();

        await notifyByTelegram(message, createSystemContext(user.tenantId), inlineKeyboard);

      } catch (error) {
        console.error(`Error enviando briefing a usuario ${user.id}:`, error);
      }
    }
  }
}
