/**
 * Contact Skills
 * API funcional para gestión de contactos
 * 
 * Arquitectura:
 * App/Agent/Automation → Skill → Core (Prisma) → EventBus
 * 
 * Reglas:
 * 1. Validar input
 * 2. Llamar al core
 * 3. Emitir evento
 * 4. Retornar resultado
 */

import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';
import type { ContactCreatedEvent, ContactUpdatedEvent, LeadCreatedEvent, LeadConvertedEvent } from '@/lib/types/events';

// ============== TIPOS ==============

export interface CreateContactInput {
  tenantId: string;
  nombre: string;
  email: string;
  telefono?: string;
  tipo?: 'person' | 'company';
  cargo?: string;
  ubicacion?: string;
  linkedin?: string;
  notas?: string;
  tags?: string;
  companyId?: string;
  // Metadata del skill
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface UpdateContactInput {
  contactId: string;
  tenantId: string;
  data: Partial<Omit<CreateContactInput, 'tenantId'>>;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface CreateLeadInput {
  tenantId: string;
  nombre: string;
  email: string;
  telefono?: string;
  notas?: string;
  fuente?: string;
  cargo?: string;
  empresa?: string;
  linkedin?: string;
  asignadoA?: string;
  // Metadata
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface ConvertLeadInput {
  leadId: string;
  tenantId: string;
  createDeal?: boolean;
  dealValor?: number;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

// ============== SKILLS ==============

/**
 * Crear un nuevo contacto
 */
export async function createContact(input: CreateContactInput) {
  const { tenantId, nombre, email, telefono, tipo, cargo, ubicacion, linkedin, notas, tags, companyId, userId, source = 'app' } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!nombre) throw new Error('nombre es requerido');
  if (!email) throw new Error('email es requerido');

  // Verificar email duplicado
  const existingContact = await prisma.contact.findFirst({
    where: { tenantId, email },
  });
  if (existingContact) {
    throw new Error(`Ya existe un contacto con el email ${email}`);
  }

  // 2. Crear en Core (Prisma)
  const contact = await prisma.contact.create({
    data: {
      tenantId,
      nombre,
      email,
      telefono,
      tipo: tipo || 'person',
      cargo,
      ubicacion,
      linkedin,
      notas,
      tags,
      companyId,
    },
  });

  // 3. Emitir evento
  const eventPayload: ContactCreatedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    contactId: contact.id,
    email: contact.email,
    nombre: contact.nombre,
    telefono: contact.telefono || undefined,
  };
  eventBus.emitEvent(EVENTS.CONTACT_CREATED, eventPayload);

  // 4. Retornar resultado
  return contact;
}

/**
 * Actualizar un contacto existente
 */
export async function updateContact(input: UpdateContactInput) {
  const { contactId, tenantId, data, userId, source = 'app' } = input;

  // 1. Validación
  if (!contactId) throw new Error('contactId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');

  // Obtener contacto actual para comparar cambios
  const currentContact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
  });
  if (!currentContact) {
    throw new Error('Contacto no encontrado');
  }

  // 2. Actualizar en Core
  const updatedContact = await prisma.contact.update({
    where: { id: contactId },
    data: {
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      tipo: data.tipo,
      cargo: data.cargo,
      ubicacion: data.ubicacion,
      linkedin: data.linkedin,
      notas: data.notas,
      tags: data.tags,
      companyId: data.companyId,
    },
  });

  // 3. Calcular cambios para el evento
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(data) as Array<keyof typeof data>) {
    if (data[key] !== undefined && (currentContact as Record<string, unknown>)[key] !== data[key]) {
      changes[key] = {
        old: (currentContact as Record<string, unknown>)[key],
        new: data[key],
      };
    }
  }

  // Emitir evento solo si hay cambios
  if (Object.keys(changes).length > 0) {
    const eventPayload: ContactUpdatedEvent = {
      tenantId,
      userId,
      timestamp: new Date(),
      source,
      contactId,
      changes,
    };
    eventBus.emitEvent(EVENTS.CONTACT_UPDATED, eventPayload);
  }

  // 4. Retornar resultado
  return updatedContact;
}

/**
 * Crear un nuevo lead
 */
export async function createLead(input: CreateLeadInput) {
  const { tenantId, nombre, email, telefono, notas, fuente, cargo, empresa, linkedin, asignadoA, userId, source = 'app' } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!nombre) throw new Error('nombre es requerido');
  if (!email) throw new Error('email es requerido');

  // 2. Crear en Core
  const lead = await prisma.lead.create({
    data: {
      tenantId,
      nombre,
      email,
      telefono,
      notas,
      fuente,
      cargo,
      empresa,
      linkedin,
      asignadoA,
      estado: 'nuevo',
    },
  });

  // 3. Emitir evento
  const eventPayload: LeadCreatedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    leadId: lead.id,
    email: lead.email,
    nombre: lead.nombre,
    telefono: lead.telefono || undefined,
    fuente: lead.fuente || undefined,
  };
  eventBus.emitEvent(EVENTS.LEAD_CREATED, eventPayload);

  // 4. Retornar resultado
  return lead;
}

/**
 * Convertir lead a contacto
 */
export async function convertLead(input: ConvertLeadInput) {
  const { leadId, tenantId, createDeal = false, dealValor = 0, userId, source = 'app' } = input;

  // 1. Validación
  if (!leadId) throw new Error('leadId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');

  // Obtener lead
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
  });
  if (!lead) {
    throw new Error('Lead no encontrado');
  }

  // Verificar si ya existe contacto con ese email
  const existingContact = await prisma.contact.findFirst({
    where: { tenantId, email: lead.email },
  });

  let contact;
  if (existingContact) {
    contact = existingContact;
  } else {
    // 2. Crear contacto
    contact = await prisma.contact.create({
      data: {
        tenantId,
        nombre: lead.nombre,
        email: lead.email,
        telefono: lead.telefono,
        cargo: lead.cargo,
        linkedin: lead.linkedin,
        notas: lead.notas,
        tipo: 'person',
      },
    });
  }

  // 3. Actualizar lead
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      estado: 'convertido',
      convertedToContactId: contact.id,
    },
  });

  // 4. Crear deal si se solicita
  let deal = null;
  if (createDeal) {
    const defaultStage = await prisma.pipelineStage.findFirst({
      where: { tenantId },
      orderBy: { orden: 'asc' },
    });

    deal = await prisma.deal.create({
      data: {
        tenantId,
        titulo: `Deal - ${lead.nombre}`,
        valor: dealValor,
        etapa: defaultStage?.nombre || 'Nuevo',
        leadId,
        contactId: contact.id,
        probabilidad: defaultStage?.probabilidad || 10,
      },
    });
  }

  // 5. Emitir evento
  const eventPayload: LeadConvertedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    leadId,
    contactId: contact.id,
    dealId: deal?.id,
  };
  eventBus.emitEvent(EVENTS.LEAD_CONVERTED, eventPayload);

  // 6. Retornar resultado
  return { lead, contact, deal };
}

/**
 * Obtener contacto por ID
 */
export async function getContact(input: { contactId: string; tenantId: string }) {
  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, tenantId: input.tenantId },
  });
  return contact;
}

/**
 * Obtener lead por ID
 */
export async function getLead(input: { leadId: string; tenantId: string }) {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, tenantId: input.tenantId },
  });
  return lead;
}

/**
 * Buscar lead por email
 */
export async function findLeadByEmail(email: string, tenantId: string) {
  const lead = await prisma.lead.findFirst({
    where: { email, tenantId },
  });
  return lead;
}

/**
 * Buscar contacto por email
 */
export async function findContactByEmail(email: string, tenantId: string) {
  const contact = await prisma.contact.findFirst({
    where: { email, tenantId },
  });
  return contact;
}
