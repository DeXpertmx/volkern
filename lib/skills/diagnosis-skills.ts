/**
 * Diagnosis Skills
 * API funcional para el flujo de diagnóstico
 * 
 * Este es un skill compuesto que internamente llama a otros skills:
 * diagnosis_completed:
 *   → create_lead (o actualizar)
 *   → create_note
 *   → create_task
 *   → emit diagnosis_completed
 */

import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';
import { createLead, findLeadByEmail } from './contact-skills';
import { createTask, createNote } from './task-skills';
import { createConversation } from './conversation-skills';
import type { DiagnosisCompletedEvent } from '@/lib/types/events';

// ============== TIPOS ==============

export interface DiagnosisResult {
  tipo: string;
  respuestas: Record<string, unknown>;
  score?: number;
  recomendaciones?: string[];
  urgencia?: 'baja' | 'media' | 'alta';
  segmento?: string;
}

export interface CompleteDiagnosisInput {
  tenantId: string;
  // Datos del lead
  nombre: string;
  email: string;
  telefono?: string;
  empresa?: string;
  // Resultado del diagnóstico
  resultado: DiagnosisResult;
  // Opciones
  crearTarea?: boolean;
  diasSeguimiento?: number;
  enviarEmail?: boolean;
  crearConversacion?: boolean;
  // Metadata
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

// ============== SKILLS ==============

/**
 * Completar diagnóstico
 * Este es el skill principal que orquesta todo el flujo
 */
export async function completeDiagnosis(input: CompleteDiagnosisInput) {
  const {
    tenantId,
    nombre,
    email,
    telefono,
    empresa,
    resultado,
    crearTarea = true,
    diasSeguimiento = 1,
    crearConversacion = false,
    userId,
    source = 'app',
  } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!nombre) throw new Error('nombre es requerido');
  if (!email) throw new Error('email es requerido');
  if (!resultado) throw new Error('resultado es requerido');

  // 2. Buscar o crear lead
  let lead = await findLeadByEmail(email, tenantId);
  
  if (!lead) {
    // Crear nuevo lead usando el skill
    lead = await createLead({
      tenantId,
      nombre,
      email,
      telefono,
      empresa,
      fuente: `diagnostico_${resultado.tipo}`,
      notas: `Diagnóstico completado: ${resultado.tipo}`,
      userId,
      source,
    });
  } else {
    // Actualizar lead existente
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        telefono: telefono || lead.telefono,
        empresa: empresa || lead.empresa,
        fechaActualizacion: new Date(),
      },
    });
  }

  // 3. Crear nota con el resultado
  const notaContenido = formatDiagnosisNote(resultado);
  await createNote({
    tenantId,
    leadId: lead.id,
    contenido: notaContenido,
    userId,
    source,
  });

  // 4. Crear tarea de seguimiento si se solicita
  let task = null;
  if (crearTarea) {
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasSeguimiento);

    task = await createTask({
      tenantId,
      leadId: lead.id,
      titulo: `Seguimiento diagnóstico: ${nombre}`,
      tipo: 'seguimiento',
      descripcion: `Contactar a ${nombre} para dar seguimiento al diagnóstico de tipo ${resultado.tipo}. Urgencia: ${resultado.urgencia || 'media'}`,
      fechaVencimiento,
      asignadoA: userId,
      userId,
      source,
    });
  }

  // 5. Crear conversación si se solicita
  let conversation = null;
  if (crearConversacion) {
    conversation = await createConversation({
      tenantId,
      contactoNombre: nombre,
      contactoEmail: email,
      contactoTelefono: telefono,
      canal: 'web',
      leadId: lead.id,
      userId,
      source,
    });
  }

  // 6. Emitir evento diagnosis_completed
  const eventPayload: DiagnosisCompletedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    leadId: lead.id,
    resultado: JSON.parse(JSON.stringify(resultado)),
    score: resultado.score,
  };
  eventBus.emitEvent(EVENTS.DIAGNOSIS_COMPLETED, eventPayload);

  // 7. Retornar resultado
  return {
    success: true,
    lead,
    task,
    conversation,
    evento: EVENTS.DIAGNOSIS_COMPLETED,
  };
}

/**
 * Formatear resultado de diagnóstico como nota
 */
function formatDiagnosisNote(resultado: DiagnosisResult): string {
  let nota = `## Diagnóstico: ${resultado.tipo}\n\n`;
  
  if (resultado.score !== undefined) {
    nota += `**Score:** ${resultado.score}/100\n`;
  }
  
  if (resultado.urgencia) {
    nota += `**Urgencia:** ${resultado.urgencia}\n`;
  }
  
  if (resultado.segmento) {
    nota += `**Segmento:** ${resultado.segmento}\n`;
  }
  
  nota += `\n### Respuestas\n`;
  for (const [key, value] of Object.entries(resultado.respuestas)) {
    nota += `- **${key}:** ${JSON.stringify(value)}\n`;
  }
  
  if (resultado.recomendaciones && resultado.recomendaciones.length > 0) {
    nota += `\n### Recomendaciones\n`;
    for (const rec of resultado.recomendaciones) {
      nota += `- ${rec}\n`;
    }
  }
  
  return nota;
}

/**
 * Obtener diagnósticos de un lead (a través de notas)
 */
export async function getDiagnosisByLead(leadId: string, tenantId: string) {
  // Los diagnósticos se guardan como notas que empiezan con "## Diagnóstico:"
  const notes = await prisma.note.findMany({
    where: {
      leadId,
      contenido: {
        startsWith: '## Diagnóstico:',
      },
    },
    orderBy: { fechaCreacion: 'desc' },
  });
  return notes;
}
