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
 * Posponer el recordatorio de una tarea sin cambiar su fecha real de
 * vencimiento. El campo `recordatorioPospuestoHasta` silencia el aviso
 * (cron de vencidas) y saca la tarea de las listas de "vence hoy"/"vencidas"
 * hasta la fecha dada; al expirar, vuelve a aparecer y a avisarse.
 */
export interface SnoozeTaskInput {
  taskId: string;
  tenantId: string;
  hasta: Date;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export async function snoozeTask(input: SnoozeTaskInput) {
  const { taskId, tenantId, hasta, source = 'webhook' } = input;

  if (!taskId) throw new Error('taskId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!hasta || isNaN(hasta.getTime())) throw new Error('hasta es requerida');

  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId },
  });
  if (!task) throw new Error('Tarea no encontrada');
  if (task.completada) throw new Error('No puedo posponer el recordatorio de una tarea ya completada.');

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { recordatorioPospuestoHasta: hasta },
  });

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
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      tenantId,
      // Igual que Tareas Globales: el usuario ve sus tareas y las que aún
      // no tienen responsable, especialmente importante en tenants pequeños.
      AND: [{ OR: [{ asignadoA: userId }, { asignadoA: null }] }],
      completada: false,
      // Excluir tareas cuyo recordatorio fue pospuesto (snooze activo)
      OR: [
        { recordatorioPospuestoHasta: null },
        { recordatorioPospuestoHasta: { lte: now } },
      ],
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
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      tenantId,
      // Igual que Tareas Globales: el usuario ve sus tareas y las que aún
      // no tienen responsable, especialmente importante en tenants pequeños.
      AND: [{ OR: [{ asignadoA: userId }, { asignadoA: null }] }],
      completada: false,
      // Excluir tareas cuyo recordatorio fue pospuesto (snooze activo)
      OR: [
        { recordatorioPospuestoHasta: null },
        { recordatorioPospuestoHasta: { lte: now } },
      ],
    },
    orderBy: { fechaVencimiento: 'asc' },
    include: {
      lead: {
        select: { nombre: true, email: true },
      },
    },
  });

  const nowMs = Date.now();
  return tasks
    .filter((t: any) => t.fechaVencimiento && new Date(t.fechaVencimiento).getTime() < nowMs)
    .map((t: any) => ({
      ...t,
      diasVencida: Math.max(1, Math.floor((nowMs - new Date(t.fechaVencimiento).getTime()) / 86400000)),
    }));
}

/**
 * Instantes UTC de inicio y fin del día calendario actual en la zona
 * horaria dada. Sonda al mediodía UTC para evitar cortes por DST.
 */
function tzDayRangeMs(tz: string, ref = new Date()): { start: number; end: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref).split('-').map(Number);

  const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
  const hms = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(noonUtc));
  const get = (t: string) => Number(hms.find((p) => p.type === t)?.value || '0');
  const tzTimeMs = get('hour') * 3600000 + get('minute') * 60000 + get('second') * 1000;
  const offsetMs = noonUtc - (Date.UTC(y, m - 1, d, 0, 0, 0) + tzTimeMs);
  const start = Date.UTC(y, m - 1, d) - offsetMs;
  return { start, end: start + 86400000 };
}

/**
 * Obtener únicamente las tareas que VENCEN HOY de un usuario (fecha de
 * vencimiento dentro del día calendario actual en su zona horaria, sin
 * completar). Complementa a getOverdueTasksByUser.
 */
export async function getTasksDueTodayByUser(userId: string, tenantId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone || 'America/Mexico_City';
  const { start, end } = tzDayRangeMs(tz);

  return prisma.task.findMany({
    where: {
      tenantId,
      // Igual que Tareas Globales: el usuario ve sus tareas y las que aún
      // no tienen responsable, especialmente importante en tenants pequeños.
      AND: [{ OR: [{ asignadoA: userId }, { asignadoA: null }] }],
      completada: false,
      fechaVencimiento: { gte: new Date(start), lt: new Date(end) },
      // Excluir tareas cuyo recordatorio fue pospuesto (snooze activo)
      OR: [
        { recordatorioPospuestoHasta: null },
        { recordatorioPospuestoHasta: { lte: new Date() } },
      ],
    },
    orderBy: { fechaVencimiento: 'asc' },
    include: {
      lead: {
        select: { nombre: true, email: true },
      },
    },
  });
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
