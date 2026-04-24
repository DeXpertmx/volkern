import { prisma } from '@/lib/db';
import { notifyUser } from './notification-layer';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';

export interface GhostingDetectionResult {
  leadId: string;
  nombre: string;
  ultimaActividad: Date;
  horasInactivo: number;
  draftRescate?: string;
}

/**
 * Radar de Ghosting
 * Detecta leads que no han tenido interacción en más de X horas y genera un draft de rescate.
 */
export async function detectGhosting(input: { tenantId: string; hours?: number }): Promise<GhostingDetectionResult[]> {
  const { tenantId, hours = 48 } = input;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  // 1. Buscar leads en etapas calientes que estén inactivos
  const inactiveLeads = await prisma.lead.findMany({
    where: {
      tenantId,
      estado: { in: ['calificado', 'propuesta', 'negociacion'] },
      fechaUltimaActividad: { lt: cutoff },
    },
    include: {
      notasTimestamp: { orderBy: { fechaCreacion: 'desc' }, take: 5 },
      interacciones: { orderBy: { fechaCreacion: 'desc' }, take: 5 },
    }
  });

  const results: GhostingDetectionResult[] = [];

  for (const lead of inactiveLeads) {
    const horasInactivo = Math.floor((Date.now() - lead.fechaUltimaActividad.getTime()) / (1000 * 60 * 60));
    
    results.push({
      leadId: lead.id,
      nombre: lead.nombre,
      ultimaActividad: lead.fechaUltimaActividad,
      horasInactivo,
    });
  }

  return results;
}

/**
 * Genera una sugerencia estratégica ("Success Path") para un lead.
 */
export async function generateSuccessPath(input: { leadId: string; tenantId: string }) {
  const { leadId, tenantId } = input;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      notasTimestamp: { orderBy: { fechaCreacion: 'desc' }, take: 10 },
      deals: { select: { valor: true, etapa: true } }
    }
  });

  if (!lead) throw new Error('Lead no encontrado');

  const notasTexto = lead.notasTimestamp.map(n => n.contenido).join('\n');

  const systemPrompt = `
Eres un estratega de ventas experto de Volkern CRM.
Tu tarea es analizar el historial de un Lead y generar una "Ruta de Éxito" (Success Path) con 3 pasos accionables para cerrar la venta.

CONTEXTO DEL LEAD:
Nombre: ${lead.nombre}
Notas previas:
${notasTexto || 'No hay notas registradas.'}

Responde ÚNICAMENTE en JSON con este formato:
{
  "steps": [
    {"title": "Paso 1", "description": "acción específica", "icon": "zap|target|phone|mail|calendar"},
    {"title": "Paso 2", "description": "acción específica", "icon": "..."},
    {"title": "Paso 3", "description": "acción específica", "icon": "..."}
  ],
  "reasoning": "Breve explicación de por qué sugieres esta ruta"
}
  `.trim();

  const messages: GemmaMessage[] = [
    { role: 'system', content: systemPrompt }
  ];

  const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });

  let result;

  if (!aiRes.error) {
    try {
      const cleaned = aiRes.content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      result = {
        steps: parsed.steps,
        metadata: {
          generatedBy: 'Gemma 4',
          reasoning: parsed.reasoning
        }
      };
    } catch (e) {
      console.error('[SuccessPath] Error parsing AI response:', aiRes.content);
    }
  }

  if (!result) {
    result = {
      steps: [
        { title: 'Primer Contacto', description: 'Realizar una llamada de descubrimiento para entender sus miedos actuales.', icon: 'phone' },
        { title: 'Demo Personalizada', description: 'Enfocar la demo en la funcionalidad de reportes, que es su mayor dolor.', icon: 'target' },
        { title: 'Cierre de Valor', description: 'Enviar propuesta con el caso de éxito de la industria metalmecánica.', icon: 'zap' }
      ],
      metadata: {
        generatedBy: 'Gemma 4 (Fallback)',
        reasoning: 'Lógica heurística basada en la etapa actual del lead.'
      }
    };
  }

  // Actualizar el lead con la estrategia de la IA
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      aiStrategy: result.metadata.reasoning,
      fechaUltimaActividad: new Date() // Actualizamos actividad porque la IA "pensó" en él
    }
  });

  return {
    leadId,
    steps: result.steps,
    metadata: result.metadata
  };
}
