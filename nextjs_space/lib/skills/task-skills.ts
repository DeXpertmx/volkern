/**
 * Task Skills
 * API funcional para gestión de tareas y notas
 * 
 * Arquitectura:
 * App/Agent/Automation → Skill → Core (Prisma) → EventBus
 */

import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';
import type { TaskCreatedEvent, TaskCompletedEvent, NoteCreatedEvent } from '@/lib/types/events';

// ============== TIPOS ==============

export interface CreateTaskInput {
  tenantId: string;
  leadId: string;
  titulo: string;
  tipo: 'llamada' | 'email' | 'reunion' | 'seguimiento' | 'otro';
  descripcion?: string;
  fechaVencimiento: Date;
  asignadoA?: string;
  // Metadata
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface CompleteTaskInput {
  taskId: string;
  tenantId: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface CreateNoteInput {
  tenantId: string;
  leadId: string;
  contenido: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

// ============== SKILLS ==============

/**
 * Crear una nueva tarea
 */
export async function createTask(input: CreateTaskInput) {
  const {
    tenantId,
    leadId,
    titulo,
    tipo,
    descripcion,
    fechaVencimiento,
    asignadoA,
    userId,
    source = 'app',
  } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!leadId) throw new Error('leadId es requerido');
  if (!titulo) throw new Error('titulo es requerido');
  if (!tipo) throw new Error('tipo es requerido');
  if (!fechaVencimiento) throw new Error('fechaVencimiento es requerida');

  // Verificar que el lead existe
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
  });
  if (!lead) {
    throw new Error('Lead no encontrado');
  }

  // Validar asignadoA: canales externos (Telegram/WhatsApp) pasan el id de
  // conversación como userId, que NO es un usuario real → sin asignar.
  let asignadoAValido: string | null = null;
  if (asignadoA) {
    const usuario = await prisma.user.findFirst({
      where: { id: asignadoA, tenantId },
      select: { id: true },
    });
    if (usuario) asignadoAValido = asignadoA;
  }

  // 2. Crear en Core
  const task = await prisma.task.create({
    data: {
      tenantId,
      leadId,
      titulo,
      tipo,
      descripcion,
      fechaVencimiento,
      asignadoA: asignadoAValido,
      completada: false,
    } as any,
  });

  // 3. Emitir evento
  const eventPayload: TaskCreatedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    taskId: task.id,
    leadId,
    titulo,
    tipo,
    fechaVencimiento,
    asignadoA,
  };
  eventBus.emitEvent(EVENTS.TASK_CREATED, eventPayload);

  // 4. Retornar resultado
  return task;
}

/**
 * Completar una tarea
 */
export async function completeTask(input: CompleteTaskInput) {
  const { taskId, tenantId, userId, source = 'app' } = input;

  // 1. Validación
  if (!taskId) throw new Error('taskId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');

  // Verificar que la tarea existe
  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId },
  });
  if (!task) {
    throw new Error('Tarea no encontrada');
  }

  // 2. Actualizar en Core
  const completedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      completada: true,
      fechaCompletado: new Date(),
    },
  });

  // 3. Emitir evento
  const eventPayload: TaskCompletedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    taskId,
    leadId: task.leadId ?? '',
    completadoPor: userId ?? '',
  };
  eventBus.emitEvent(EVENTS.TASK_COMPLETED, eventPayload);

  // 4. Retornar resultado
  return completedTask;
}

/**
 * Reprogramar una tarea (nueva fecha de vencimiento)
 */
export interface RescheduleTaskInput {
  taskId: string;
  tenantId: string;
  fechaVencimiento: Date;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export async function rescheduleTask(input: RescheduleTaskInput) {
  const { taskId, tenantId, fechaVencimiento, userId, source = 'webhook' } = input;

  if (!taskId) throw new Error('taskId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!fechaVencimiento || isNaN(fechaVencimiento.getTime())) {
    throw new Error('fechaVencimiento es requerida');
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId },
  });
  if (!task) throw new Error('Tarea no encontrada');
  if (task.completada) throw new Error('No puedo reprogramar una tarea ya completada.');

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { fechaVencimiento },
  });

  const eventPayload: TaskCreatedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    taskId,
    leadId: task.leadId ?? '',
    titulo: task.titulo,
    tipo: (task as any).tipo ?? 'recordatorio',
    fechaVencimiento,
  };
  eventBus.emitEvent(EVENTS.TASK_CREATED, eventPayload);

  return updated;
}

/**
 * Crear una nota
 */
export async function createNote(input: CreateNoteInput) {
  const { tenantId, leadId, contenido, userId, source = 'app' } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!leadId) throw new Error('leadId es requerido');
  if (!contenido) throw new Error('contenido es requerido');

  // Verificar que el lead existe
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
  });
  if (!lead) {
    throw new Error('Lead no encontrado');
  }

  // 2. Crear en Core
  const note = await prisma.note.create({
    data: {
      leadId,
      contenido,
      creadoPor: userId,
    },
  });

  // 3. Emitir evento
  const eventPayload: NoteCreatedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    noteId: note.id,
    leadId,
    contenido,
  };
  eventBus.emitEvent(EVENTS.NOTE_CREATED, eventPayload);

  // 4. Retornar resultado
  return note;
}

/**
 * Obtener tareas de un lead
 */
export async function getTasksByLead(leadId: string, tenantId: string) {
  const tasks = await prisma.task.findMany({
    where: { leadId, tenantId },
    orderBy: { fechaVencimiento: 'asc' },
  });
  return tasks;
}

/**
 * Obtener tareas pendientes de un usuario
 */
export async function getPendingTasksByUser(userId: string, tenantId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      tenantId,
      asignadoA: userId,
      completada: false,
    },
    orderBy: { fechaVencimiento: 'asc' },
    include: {
      lead: {
        select: { nombre: true, email: true },
      },
    },
  });
  return tasks;
}

/**
 * Obtener únicamente las tareas VENCIDAS de un usuario (fecha de vencimiento
 * anterior a ahora y sin completar), con la antigüedad del retraso para
 * priorizar. Excluye tareas sin fecha (nunca pueden estar vencidas).
 */
export async function getOverdueTasksByUser(userId: string, tenantId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      tenantId,
      asignadoA: userId,
      completada: false,
    },
    orderBy: { fechaVencimiento: 'asc' },
    include: {
      lead: {
        select: { nombre: true, email: true },
      },
    },
  });

  const now = Date.now();
  return tasks
    .filter((t: any) => t.fechaVencimiento && new Date(t.fechaVencimiento).getTime() < now)
    .map((t: any) => ({
      ...t,
      diasVencida: Math.max(1, Math.floor((now - new Date(t.fechaVencimiento).getTime()) / 86400000)),
    }));
}

/**
 * Obtener notas de un lead
 */
export async function getNotesByLead(leadId: string) {
  const notes = await prisma.note.findMany({
    where: { leadId },
    orderBy: { fechaCreacion: 'desc' },
    include: {
      creador: {
        select: { name: true },
      },
    },
  });
  return notes;
}
