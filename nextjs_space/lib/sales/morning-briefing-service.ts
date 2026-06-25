// Refreshed Prisma Client
import { prisma } from '@/lib/db';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';
import { createSystemContext } from '@/lib/skills/context';

export interface BriefingData {
  topDeals: { id: string; titulo: string; valor: number; healthScore: number; reason: string }[];
  riskyDeals: { id: string; titulo: string; risk: number; rescueMessage: string }[];
  newDiamonds: { id: string; nombre: string; quality: number }[];
  motivationalQuote: string;
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

    // 3. Priorizar con Gemma
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
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('Error parsing JSON from Gemma:', jsonStr);
      throw new Error('La respuesta de Gemma no es un JSON válido');
    }
  }

  /**
   * Ejecuta el envío masivo del Morning Briefing (Cron)
   */
  static async sendGlobalBriefing() {
    const users = await prisma.user.findMany({
      where: { active: true, tenantId: { not: null } } as any
    });

    for (const user of users) {
      if (!user.tenantId) continue;
      
      try {
        const briefing = await this.generateBriefing(user.id, user.tenantId);
        
        // Enviar a Telegram si tiene configurado
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
        
        const message = `
☀️ *¡Buenos días, ${user.name}!*

🚀 *Tus 3 prioridades de hoy:*
${briefing.topDeals.map(d => `• *${d.titulo}* (${d.valor}€) - ${d.reason}`).join('\n')}

🚨 *Operación Rescate:*
${briefing.riskyDeals.length > 0 
  ? briefing.riskyDeals.map(d => `⚠️ *${d.titulo}* está en riesgo.`).join('\n') 
  : '✅ ¡Sin riesgos críticos hoy!'}

✨ *Mensaje del día:*
_"${briefing.motivationalQuote}"_
        `.trim();

        await notifyByTelegram(message, createSystemContext(user.tenantId));

      } catch (error) {
        console.error(`Error enviando briefing a usuario ${user.id}:`, error);
      }
    }
  }
}
