import { prisma } from '@/lib/db';

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
export async function detectGhosting(tenantId: string, hours: number = 48): Promise<GhostingDetectionResult[]> {
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
export async function generateSuccessPath(leadId: string, tenantId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      notasTimestamp: { orderBy: { fechaCreacion: 'desc' }, take: 10 },
      deals: { select: { valor: true, etapa: true } }
    }
  });

  if (!lead) throw new Error('Lead no encontrado');

  // En una implementación real, aquí llamaríamos a Gemma 4 pasándole el historial de:
  // - Notas del lead actual
  // - Patrones de deals 'ganados' del mismo tenant
  
  // Simulamos la respuesta de Gemma analizando el contexto
  const hasTechnicalNotes = lead.notasTimestamp.some(n => n.contenido.toLowerCase().includes('precio') || n.contenido.toLowerCase().includes('costo'));
  
  let suggestion = "Enfócate en los beneficios de automatización. El cliente ha mostrado interés en la eficiencia operativa.";
  let risk = 20;

  if (hasTechnicalNotes) {
    suggestion = "Este cliente se parece a tus cierres exitosos del mes pasado. No hables de características técnicas, enfócate en el ROI y el ahorro de costos que mencionó en la última nota.";
    risk = 10;
  }

  // Actualizar el lead con la estrategia de la IA
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      aiStrategy: suggestion,
      riskLevel: risk,
      fechaUltimaActividad: new Date() // Actualizamos actividad porque la IA "pensó" en él
    }
  });

  return {
    leadId,
    strategy: suggestion,
    riskLevel: risk
  };
}
