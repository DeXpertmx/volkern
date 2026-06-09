/**
 * Deal Skills
 * API funcional para gestión de deals/pipeline
 * 
 * Arquitectura:
 * App/Agent/Automation → Skill → Core (Prisma) → EventBus
 */

import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';

// ============== TIPOS ==============

export interface CreateDealInput {
  tenantId: string;
  titulo: string;
  valor: number;
  moneda?: string;
  leadId?: string;
  contactId?: string;
  descripcion?: string;
  etapa?: string;
  probabilidad?: number;
  prioridad?: string;
  fechaEstimadaCierre?: string;
  origen?: string;
  tags?: string[];
  usuarioAsignadoId?: string;
  pipelineId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface UpdateDealInput {
  dealId: string;
  tenantId: string;
  titulo?: string;
  valor?: number;
  etapa?: string;
  probabilidad?: number;
  prioridad?: string;
  descripcion?: string;
  fechaEstimadaCierre?: string;
  tags?: string[];
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface PrequalifyLeadInput {
  tenantId: string;
  leadId: string;
  noteText: string;
  dealValue?: number;
  catalogSearch?: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

// ============== SKILLS ==============

export async function createDeal(input: CreateDealInput) {
  const { tenantId, titulo, valor, moneda = 'EUR', leadId, contactId, descripcion, etapa = 'calificacion', probabilidad = 25, prioridad = 'media', fechaEstimadaCierre, origen, tags, usuarioAsignadoId, pipelineId, source = 'app' } = input;

  if (!titulo || valor === undefined || valor === null) {
    throw new Error('Título y valor son requeridos para crear un deal');
  }

  const deal = await prisma.deal.create({
    data: {
      tenantId,
      titulo,
      descripcion,
      valor,
      moneda,
      etapa,
      probabilidad,
      prioridad,
      leadId: leadId || undefined,
      contactId: contactId || undefined,
      usuarioAsignadoId: usuarioAsignadoId || undefined,
      fechaEstimadaCierre: fechaEstimadaCierre ? new Date(fechaEstimadaCierre) : undefined,
      origen,
      tags: tags ? tags.join(',') : undefined,
      pipelineId: pipelineId || undefined,
    },
  });

  // Emitir evento
  eventBus.emitEvent(EVENTS.DEAL_CREATED, {
    tenantId,
    timestamp: new Date(),
    source: source || 'app',
    dealId: deal.id,
    valor: deal.valor,
    etapa: deal.etapa,
    leadId: deal.leadId || undefined,
    contactId: deal.contactId || undefined,
  });

  return deal;
}

export async function updateDeal(input: UpdateDealInput) {
  const { dealId, tenantId, source = 'app', ...updateData } = input;

  const existing = await prisma.deal.findFirst({
    where: { id: dealId, tenantId },
  });

  if (!existing) {
    throw new Error('Deal no encontrado');
  }

  const previousEtapa = existing.etapa;
  const data: any = {};
  if (updateData.titulo !== undefined) data.titulo = updateData.titulo;
  if (updateData.valor !== undefined) data.valor = updateData.valor;
  if (updateData.etapa !== undefined) data.etapa = updateData.etapa;
  if (updateData.probabilidad !== undefined) data.probabilidad = updateData.probabilidad;
  if (updateData.prioridad !== undefined) data.prioridad = updateData.prioridad;
  if (updateData.descripcion !== undefined) data.descripcion = updateData.descripcion;
  if (updateData.fechaEstimadaCierre !== undefined) data.fechaEstimadaCierre = new Date(updateData.fechaEstimadaCierre);
  if (updateData.tags !== undefined) data.tags = updateData.tags;

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data,
  });

  // Emitir evento de cambio de etapa si aplica
  if (updateData.etapa && updateData.etapa !== previousEtapa) {
    eventBus.emitEvent(EVENTS.DEAL_STAGE_CHANGED, {
      tenantId,
      timestamp: new Date(),
      source,
      dealId: deal.id,
      previousStage: previousEtapa,
      newStage: deal.etapa,
      valor: deal.valor,
    });

    if (deal.etapa === 'ganado') {
      (eventBus as any).emitEvent(EVENTS.DEAL_WON, {
        tenantId,
        timestamp: new Date(),
        source,
        dealId: deal.id,
        titulo: deal.titulo,
        valor: deal.valor,
      });
    } else if (deal.etapa === 'perdido') {
      (eventBus as any).emitEvent(EVENTS.DEAL_LOST, {
        tenantId,
        timestamp: new Date(),
        source,
        dealId: deal.id,
        titulo: deal.titulo,
        valor: deal.valor,
      });
    }
  }

  return deal;
}

export async function getDeal(dealId: string, tenantId: string) {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, tenantId },
    include: {
      lead: { select: { id: true, nombre: true, email: true, empresa: true } },
      cotizaciones: { select: { id: true, numero: true, titulo: true, total: true, estado: true } },
    },
  });

  if (!deal) {
    throw new Error('Deal no encontrado');
  }

  return deal;
}

export async function listDeals(tenantId: string, filters?: { etapa?: string; prioridad?: string; leadId?: string; contactId?: string; search?: string; page?: number; limit?: number }) {
  const where: any = { tenantId };
  if (filters?.etapa) where.etapa = filters.etapa;
  if (filters?.prioridad) where.prioridad = filters.prioridad;
  if (filters?.leadId) where.leadId = filters.leadId;
  if (filters?.contactId) where.contactId = filters.contactId;
  if (filters?.search) {
    where.titulo = { contains: filters.search, mode: 'insensitive' };
  }

  const page = filters?.page || 1;
  const limit = Math.min(filters?.limit || 50, 100);

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
      },
      orderBy: { fechaCreacion: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deal.count({ where }),
  ]);

  return { deals, total, page, limit };
}

/**
 * Escucha Activa & Pre-calificación
 * Orquesta: Nota inteligante + Actualización de Valor + Búsqueda en Catálogo
 */
export async function prequalifyLead(input: PrequalifyLeadInput) {
  const { tenantId, leadId, noteText, dealValue, catalogSearch, userId, source = 'app' } = input;

  // 1. Registrar Nota (Escucha Activa)
  const note = await prisma.note.create({
    data: {
      tenantId,
      leadId,
      contenido: noteText,
      creadoPor: userId,
      metadata: {
        fuente: 'Gemma4-ActiveListening',
        sentimiento: 'urgente',
        fechaProcesamiento: new Date().toISOString()
      }
    }
  });

  // 2. Actualizar Valor del Negocio (Ventas)
  let deal = null;
  if (dealValue) {
    const existingDeal = await prisma.deal.findFirst({
      where: { leadId, tenantId },
      orderBy: { fechaCreacion: 'desc' }
    });

    if (existingDeal) {
      deal = await prisma.deal.update({
        where: { id: existingDeal.id },
        data: { valor: dealValue }
      });
      
      // Emitir evento de actualización
      eventBus.emitEvent(EVENTS.DEAL_UPDATED, {
        tenantId,
        timestamp: new Date(),
        source,
        dealId: deal.id,
        valor: deal.valor
      });
    }
  }

  // 3. Consultar Catálogo
  let catalogItems = [];
  if (catalogSearch) {
    catalogItems = await prisma.catalogoItem.findMany({
      where: {
        tenantId,
        activo: true,
        OR: [
          { nombre: { contains: catalogSearch, mode: 'insensitive' } },
          { descripcion: { contains: catalogSearch, mode: 'insensitive' } },
        ]
      },
      take: 3,
      select: {
        id: true,
        nombre: true,
        precioBase: true,
        sku: true
      }
    });
  }

  return {
    success: true,
    noteId: note.id,
    dealUpdated: !!deal,
    catalogMatches: catalogItems,
    summary: `Nota registrada. ${deal ? 'Valor de negocio actualizado a ' + dealValue : ''} Encontrados ${catalogItems.length} ítems relevantes en catálogo.`
  };
}
