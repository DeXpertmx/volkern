/**
 * Volkern Skills Registry
 * Punto de entrada para todos los skills del sistema
 * 
 * Arquitectura:
 * App/Agent/Automation → Skills → Core → EventBus
 * 
 * Uso:
 * import { skills } from '@/lib/skills';
 * await skills.create_contact(payload);
 * 
 * Para MCP/Agentes:
 * await skills[skillName](payload);
 */

// ============== IMPORTS ==============

import * as contactSkills from './contact-skills';
import * as conversationSkills from './conversation-skills';
import * as taskSkills from './task-skills';
import * as diagnosisSkills from './diagnosis-skills';
import * as bookingSkills from './booking-skills';
import * as catalogSkills from './catalog-skills';
import * as dealSkills from './deal-skills';
import * as chatbotSkills from './chatbot-skill';
import * as chatwootSyncSkills from './chatwoot-sync-skill';
import * as webCreatorSkills from './web-creator-skills';
import * as proactivitySkills from './proactivity-skills';
import * as trainingSkills from './training-skills';
import * as financeSkills from './finance-skills';
import * as inventorySkills from './inventory-skills';
import * as inventoryWatchdogSkills from './inventory-watchdog';
import * as projectSkills from './project-skills';
import * as consolidationSkills from './financial-consolidation-skills';
import * as productionSkills from './production-management-skills';
import * as qualitySkills from './quality-management-skills';
import * as hrSkills from './hr-management-skills';
import * as auditSkills from './audit-skills';
import * as vaultPayrollSkills from './vault-payroll-skills';
import * as operationalSkills from './operational-skills';
import * as marketingSkills from './marketing-skills';
import * as adSkills from './ads-skills';
import * as realEstateSkills from './real-estate-skills';
import * as insuranceSkills from './insurance-skills';
import * as siniestrosSkills from './siniestros-skills';
import * as logisticsSkills from './logistics-skills';
import * as interactionSkills from './interaction-skills';
import * as billingSkills from './billing-skills';
import { eventBus, EVENTS } from './event-bus';
import { fromZonedTime } from 'date-fns-tz';

// ============== SKILL REGISTRY ==============

/**
 * Registry de todos los skills disponibles
 * Permite invocación dinámica desde MCP/Agentes
 */
// Wrappers para funciones con argumentos posicionales
const findContactByEmailWrapper = (input: { email: string; tenantId: string }) => 
  contactSkills.findContactByEmail(input.email, input.tenantId);

const findLeadByEmailWrapper = async (input: { email?: string; nombre?: string; tenantId: string }) => {
  const { email, nombre, tenantId } = input;
  if (!email && !nombre) throw new Error('Se requiere un email o nombre para buscar el lead.');

  // 1. Buscar por email exacto si viene
  let lead = null;
  if (email) {
    lead = await contactSkills.findLeadByEmail(email, tenantId);
  }

  // 2. Fallback por nombre ("busca el lead Juan Pérez") — búsqueda insensible a
  // mayúsculas para que funcione aunque el usuario escriba el nombre a medias.
  if (!lead && nombre) {
    const { prisma } = await import('@/lib/db');
    lead = await prisma.lead.findFirst({
      where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } },
    });
  }

  if (!lead) {
    throw new Error(
      `No encontré ningún lead${email ? ` con el email ${email}` : ''}${nombre ? ` con el nombre "${nombre}"` : ''}.`
    );
  }

  return lead;
};

/**
 * Wrapper convert_lead: el skill core exige leadId, pero el orquestador solo
 * pasa email/nombre desde el chatbot. Resuelve el lead (por email exacto o por
 * nombre insensible a mayúsculas) y evita reconvertir leads ya convertidos.
 */
const convertLeadWrapper = async (input: { email?: string; nombre?: string; tenantId: string; userId?: string }) => {
  const { email, nombre, tenantId, userId } = input;
  if (!email && !nombre) throw new Error('Se requiere un email o nombre para identificar el lead a convertir.');

  const { prisma } = await import('@/lib/db');
  let lead = email ? await contactSkills.findLeadByEmail(email, tenantId) : null;
  if (!lead && nombre) {
    lead = await prisma.lead.findFirst({
      where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' }, estado: { not: 'convertido' } },
    });
  }

  if (!lead) {
    throw new Error(
      `No encontré ningún lead${email ? ` con el email ${email}` : ''}${nombre ? ` con el nombre "${nombre}"` : ''} para convertir.`
    );
  }
  if (lead.estado === 'convertido') {
    throw new Error(`El lead ${lead.nombre} ya fue convertido a contacto.`);
  }

  return contactSkills.convertLead({ leadId: lead.id, tenantId, userId, source: 'webhook' });
};

const createNoteWrapper = async (input: { tenantId: string; leadId?: string; email?: string; nombre?: string; contenido: string; userId?: string }) => {
  const { tenantId, leadId, email, nombre, contenido } = input;
  if (!contenido) throw new Error('contenido es requerido');
  const userId = await resolveRealUserId(tenantId, input.userId);

  let resolvedLeadId = leadId;
  if (!resolvedLeadId) {
    const { prisma } = await import('@/lib/db');
    const lead = email
      ? await prisma.lead.findFirst({ where: { tenantId, email } })
      : nombre
        ? await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } })
        : null;
    if (!lead) throw new Error(`No encontré ningún lead${email ? ` con el email ${email}` : nombre ? ` con el nombre "${nombre}"` : ''} para la nota.`);
    resolvedLeadId = lead.id;
  }

  return taskSkills.createNote({ tenantId, leadId: resolvedLeadId, contenido, userId, source: 'webhook' });
};

const getConversationWrapper = (input: { conversationId: string; tenantId: string }) => 
  conversationSkills.getConversation(input.conversationId, input.tenantId);

const getTasksByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  taskSkills.getTasksByLead(input.leadId, input.tenantId);

const getPendingTasksWrapper = async (input: { userId: string; tenantId: string; email?: string; nombre?: string }) => {
  const { tenantId, userId, email, nombre } = input;
  // "tareas pendientes de juan@x.com" → filtrar por ese lead/contacto
  if (email || nombre) {
    const { prisma } = await import('@/lib/db');
    const lead = email
      ? await prisma.lead.findFirst({ where: { tenantId, email } })
      : await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (lead) return taskSkills.getTasksByLead(lead.id, tenantId);
    const contact = email
      ? await prisma.contact.findFirst({ where: { tenantId, email } })
      : await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (contact) return taskSkills.getTasksByLead(contact.id, tenantId);
    throw new Error(`No encontré ningún lead o contacto${email ? ` con el email ${email}` : ` con el nombre "${nombre}"`}.`);
  }
  return taskSkills.getPendingTasksByUser(userId, tenantId);
};

/**
 * Wrapper complete_task: el skill core exige taskId, pero el orquestador pasa
 * titulo/email desde el chatbot. Resuelve la tarea pendiente por título
 * (insensible a mayúsculas, opcionalmente filtrada por lead/contacto).
 */
const completeTaskWrapper = async (input: {
  tenantId: string;
  titulo?: string;
  email?: string;
  nombre?: string;
  taskId?: string;
  userId?: string;
}) => {
  const { tenantId, titulo, email, nombre, taskId, userId } = input;
  const { prisma } = await import('@/lib/db');

  if (taskId) return taskSkills.completeTask({ taskId, tenantId, userId });
  if (!titulo) throw new Error('Indica qué tarea quieres completar (su título).');

  let leadId: string | undefined;
  let contactId: string | undefined;
  if (email) {
    const lead = await prisma.lead.findFirst({ where: { tenantId, email } });
    if (lead) leadId = lead.id;
    else {
      const contact = await prisma.contact.findFirst({ where: { tenantId, email } });
      if (contact) contactId = contact.id;
    }
  } else if (nombre) {
    const lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (lead) leadId = lead.id;
    else {
      const contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
      if (contact) contactId = contact.id;
    }
  }

  const where: any = { tenantId, completada: false, titulo: { contains: titulo, mode: 'insensitive' } };
  if (leadId) where.leadId = leadId;
  if (contactId) where.contactId = contactId;

  const task = await prisma.task.findFirst({ where, orderBy: { fechaVencimiento: 'asc' } });
  if (!task) {
    throw new Error(`No encontré ninguna tarea pendiente con el título "${titulo}"${email ? ` de ${email}` : ''}.`);
  }
  return taskSkills.completeTask({ taskId: task.id, tenantId, userId });
};

const getNotesByLeadWrapper = async (input: { leadId?: string; email?: string; nombre?: string; tenantId: string }) => {
  const { leadId, email, nombre, tenantId } = input;
  let resolvedId = leadId;
  if (!resolvedId && (email || nombre)) {
    const { prisma } = await import('@/lib/db');
    const lead = email
      ? await prisma.lead.findFirst({ where: { tenantId, email } })
      : await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (!lead) throw new Error(`No encontré ningún lead${email ? ` con el email ${email}` : ` con el nombre "${nombre}"`}.`);
    resolvedId = lead.id;
  }
  if (!resolvedId) throw new Error('Se requiere el email o nombre del lead para ver sus notas.');
  return taskSkills.getNotesByLead(resolvedId);
};

const getDiagnosisByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  diagnosisSkills.getDiagnosisByLead(input.leadId, input.tenantId);

const getBookingsByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  bookingSkills.getBookingsByLead(input.leadId, input.tenantId);

const getUpcomingBookingsWrapper = (input: { tenantId: string; limit?: number; userId?: string; date?: string; timezone?: string }) => 
  bookingSkills.getUpcomingBookings(input.tenantId, input.limit, input.userId, input.date, input.timezone);

const getDealWrapper = (input: { dealId: string; tenantId: string }) =>
  dealSkills.getDeal(input.dealId, input.tenantId);

const listDealsWrapper = async (input: {
  tenantId: string;
  etapa?: string;
  prioridad?: string;
  email?: string;
  nombre?: string;
  leadId?: string;
  contactId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const { tenantId, email, nombre, ...filters } = input;
  // "qué deals tengo con juan@x.com" → resolver el email/nombre a lead/contacto
  // para filtrar el pipeline por esa persona (si no, listaría todos).
  if ((email || nombre) && !filters.leadId && !filters.contactId) {
    const { prisma } = await import('@/lib/db');
    const lead = email
      ? await prisma.lead.findFirst({ where: { tenantId, email } })
      : await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (lead) filters.leadId = lead.id;
    else {
      const contact = email
        ? await prisma.contact.findFirst({ where: { tenantId, email } })
        : await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
      if (contact) filters.contactId = contact.id;
    }
  }
  return dealSkills.listDeals(tenantId, filters);
};

/**
 * Wrapper create_deal: el skill core exige titulo+valor y leadId/contactId,
 * pero el orquestador pasa email/nombre/monto desde el chatbot. Resuelve el
 * lead o contacto, mapea monto→valor y sintetiza el título si no vino.
 */
const createDealWrapper = async (input: {
  tenantId: string;
  email?: string;
  nombre?: string;
  monto?: number | string;
  titulo?: string;
  etapa?: string;
  prioridad?: string;
}) => {
  const { tenantId, email, nombre, monto, titulo, etapa, prioridad } = input;
  if (!email && !nombre) throw new Error('Se requiere un email o nombre para crear el negocio.');

  const { prisma } = await import('@/lib/db');
  let leadId: string | undefined;
  let contactId: string | undefined;

  const findLead = async (e?: string, n?: string) => {
    if (e) {
      const lead = await prisma.lead.findFirst({ where: { tenantId, email: e } });
      if (lead) return lead.id;
      const contact = await prisma.contact.findFirst({ where: { tenantId, email: e } });
      if (contact) return { contactId: contact.id };
    }
    if (n) {
      const lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: n, mode: 'insensitive' } } });
      if (lead) return lead.id;
      const contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: n, mode: 'insensitive' } } });
      if (contact) return { contactId: contact.id };
    }
    return null;
  };

  const resolved = await findLead(email, nombre);
  if (typeof resolved === 'string') leadId = resolved;
  else if (resolved) contactId = resolved.contactId;

  const valor = monto !== undefined && monto !== null && monto !== '' ? Number(monto) : NaN;
  if (!Number.isFinite(valor)) {
    throw new Error('Se requiere un monto para crear el negocio (ej: por 5000€).');
  }

  return dealSkills.createDeal({
    tenantId,
    titulo: titulo || `Negocio - ${nombre || email}`,
    valor,
    leadId,
    contactId,
    etapa,
    prioridad,
    source: 'webhook',
  });
};

/**
 * Wrapper update_deal: resuelve el deal más reciente del lead/contacto
 * (por email o nombre) y aplica los cambios de etapa/monto/prioridad/título.
 */
const updateDealWrapper = async (input: {
  tenantId: string;
  email?: string;
  nombre?: string;
  etapa?: string;
  monto?: number | string;
  prioridad?: string;
  titulo?: string;
}) => {
  const { tenantId, email, nombre, ...updates } = input;
  if (!email && !nombre) throw new Error('Se requiere un email o nombre para identificar el negocio.');

  const { prisma } = await import('@/lib/db');
  let leadId: string | undefined;
  let contactId: string | undefined;

  if (email) {
    const lead = await prisma.lead.findFirst({ where: { tenantId, email } });
    if (lead) leadId = lead.id;
    else {
      const contact = await prisma.contact.findFirst({ where: { tenantId, email } });
      if (contact) contactId = contact.id;
    }
  }
  if (!leadId && !contactId && nombre) {
    const lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (lead) leadId = lead.id;
    else {
      const contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
      if (contact) contactId = contact.id;
    }
  }
  if (!leadId && !contactId) throw new Error(`No encontré ningún lead o contacto con ${email ? `el email ${email}` : `el nombre "${nombre}"`}.`);

  const deal = await prisma.deal.findFirst({
    where: leadId ? { tenantId, leadId } : { tenantId, contactId },
    orderBy: { fechaCreacion: 'desc' },
  });
  if (!deal) throw new Error(`No encontré ningún negocio abierto para ${email || nombre}.`);

  const data: any = {};
  if (updates.etapa) data.etapa = updates.etapa;
  if (updates.monto !== undefined && updates.monto !== '') {
    const valor = Number(updates.monto);
    if (!Number.isFinite(valor)) throw new Error('El monto no es un número válido.');
    data.valor = valor;
  }
  if (updates.prioridad) data.prioridad = updates.prioridad;
  if (updates.titulo) data.titulo = updates.titulo;
  if (Object.keys(data).length === 0) {
    throw new Error('Indica qué quieres actualizar del negocio (etapa, monto, prioridad o título).');
  }

  return dealSkills.updateDeal({ dealId: deal.id, tenantId, ...data, source: 'webhook' });
};

/**
 * Wrapper prequalify_lead: resuelve leadId desde email/nombre antes de
 * delegar al skill compuesto (Escucha Activa).
 */
const prequalifyLeadWrapper = async (input: { tenantId: string; email?: string; nombre?: string; nota?: string; userId?: string }) => {
  const { tenantId, email, nombre, nota } = input;
  const userId = await resolveRealUserId(tenantId, input.userId);
  if (!email && !nombre) throw new Error('Se requiere un email o nombre para precalificar el lead.');
  const { prisma } = await import('@/lib/db');
  let lead = email ? await prisma.lead.findFirst({ where: { tenantId, email } }) : null;
  if (!lead && nombre) {
    lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
  }
  if (!lead) {
    throw new Error(`No encontré ningún lead con ${email ? `el email ${email}` : `el nombre "${nombre}"`} para precalificar.`);
  }
  return dealSkills.prequalifyLead({ tenantId, leadId: lead.id, noteText: nota || '', userId, source: 'webhook' });
};

const updateLeadWrapper = async (input: { tenantId: string; email?: string; nombre?: string; telefono?: string; empresa?: string; contexto?: string; notas?: string }) => {
  const { tenantId, email, nombre, contexto, notas, ...dataToUpdate } = input;
  const { prisma } = await import('@/lib/db');
  
  let targetEmail = email;
  let targetNombre = nombre;

  // 1. Si no hay email, intentar buscar por nombre
  if (!targetEmail && targetNombre) {
    const found = await prisma.lead.findFirst({ 
      where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
    }) || await prisma.contact.findFirst({ 
      where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
    });
    
    if (found) {
      targetEmail = found.email!;
      if (!targetNombre) targetNombre = found.nombre ?? '';
    }
  }

  if (!targetEmail) throw new Error('Se requiere un email o nombre válido para identificar al contacto');

  const finalNotas = contexto || notas;
  
  // 2. Buscar si es Lead
  const lead = await contactSkills.findLeadByEmail(targetEmail, tenantId);
  if (lead) {
    return await prisma.lead.update({
      where: { id: lead.id },
      data: {
        nombre: targetNombre !== undefined ? targetNombre : undefined,
        telefono: dataToUpdate.telefono !== undefined ? dataToUpdate.telefono : undefined,
        empresa: dataToUpdate.empresa !== undefined ? dataToUpdate.empresa : undefined,
        notas: finalNotas !== undefined ? finalNotas : undefined
      }
    });
  }

  // 3. Buscar si es Contacto
  const contact = await contactSkills.findContactByEmail(targetEmail, tenantId);
  if (contact) {
    return await prisma.contact.update({
      where: { id: contact.id },
      data: {
        nombre: targetNombre !== undefined ? targetNombre : undefined,
        telefono: dataToUpdate.telefono !== undefined ? dataToUpdate.telefono : undefined,
        notas: finalNotas !== undefined ? finalNotas : undefined
      }
    });
  }

  throw new Error(`No se encontró ningún contacto ni lead para actualizar.`);
};

const createLeadWrapper = async (input: { tenantId: string; nombre: string; email: string; telefono?: string; notas?: string; contexto?: string; empresa?: string; origen?: string; fuente?: string; cargo?: string }) => {
  const { contexto, notas, origen, cargo, ...rest } = input;
  return contactSkills.createLead({
    ...rest,
    fuente: origen || rest.fuente,
    cargo: cargo,
    notas: contexto || notas
  });
};

/**
 * Wrapper create_contact: mapea params español del chatbot y, si se indica
 * una empresa, la busca o crea (contacto tipo company) para vincularla.
 */
const createContactWrapper = async (input: {
  tenantId: string;
  nombre: string;
  email: string;
  telefono?: string;
  cargo?: string;
  empresa?: string;
  contexto?: string;
  notas?: string;
  linkedin?: string;
  ubicacion?: string;
  tags?: string;
  userId?: string;
}) => {
  const { tenantId, nombre, email, telefono, cargo, empresa, contexto, notas, linkedin, ubicacion, tags, userId } = input;

  let companyId: string | undefined;
  if (empresa && empresa.trim()) {
    const { prisma } = await import('@/lib/db');
    let company = await prisma.contact.findFirst({
      where: { tenantId, tipo: 'company', nombre: { equals: empresa.trim(), mode: 'insensitive' } },
    });
    if (!company) {
      company = await prisma.contact.create({
        data: {
          tenantId,
          nombre: empresa.trim(),
          email: `empresa-${empresa.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${Date.now()}@volkern.app`,
          tipo: 'company',
          notas: 'Empresa creada automáticamente desde el chatbot',
        },
      });
    }
    companyId = company.id;
  }

  return contactSkills.createContact({
    tenantId,
    nombre,
    email,
    telefono,
    cargo,
    linkedin,
    ubicacion,
    tags,
    notas: contexto || notas,
    companyId,
    userId,
    source: 'webhook',
  });
};

/**
 * Wrapper create_company: crea una empresa (contacto tipo company).
 * Si no llega email, genera uno corporativo de respaldo (mismo patrón que la
 * conversión de leads en app/api/leads/[id]/convert/route.ts).
 */
const createCompanyWrapper = async (input: {
  tenantId: string;
  nombre: string;
  email?: string;
  telefono?: string;
  contexto?: string;
  notas?: string;
  ubicacion?: string;
  linkedin?: string;
  tags?: string;
  userId?: string;
}) => {
  const { tenantId, nombre, email, telefono, contexto, notas, ubicacion, linkedin, tags, userId } = input;

  // Idempotencia por nombre: si ya existe una empresa con ese nombre, no duplicar
  const { prisma } = await import('@/lib/db');
  const existing = await prisma.contact.findFirst({
    where: { tenantId, tipo: 'company', nombre: { equals: nombre.trim(), mode: 'insensitive' } },
  });
  if (existing) {
    return existing;
  }

  const finalEmail = email?.trim() || `empresa-${nombre.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${Date.now()}@volkern.app`;

  return contactSkills.createContact({
    tenantId,
    nombre,
    email: finalEmail,
    telefono,
    tipo: 'company',
    ubicacion,
    linkedin,
    tags,
    notas: contexto || notas,
    userId,
    source: 'webhook',
  });
};

const createTaskWrapper = async (input: { 
  tenantId: string; 
  titulo: string; 
  email?: string; 
  nombre?: string;
  leadId?: string;
  contactId?: string;
  descripcion?: string; 
  fechaVencimiento?: string | Date; 
  prioridad?: string; 
  userId?: string; 
  asignadoAId?: string;
  timezone?: string;
  tipo?: string;
}) => {
  const { tenantId, email, nombre, leadId, contactId, titulo, descripcion, fechaVencimiento, userId, asignadoAId, timezone, tipo } = input;
  
  let lead = null;
  let contact = null;
  const { prisma } = await import('@/lib/db');

  if (email) {
    // Buscar lead o contacto
    lead = await contactSkills.findLeadByEmail(email, tenantId);
    if (!lead) {
      contact = await contactSkills.findContactByEmail(email, tenantId);
    }
    
    if (!lead && !contact) {
      throw new Error(`No se encontró ningún lead o contacto con el correo ${email}`);
    }
  } else if (nombre) {
    // "crea una tarea con Alejandra" → resolver el lead/contacto por nombre
    lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (!lead) {
      contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    }
    if (!lead && !contact) {
      throw new Error(`No se encontró ningún lead o contacto con el nombre "${nombre}"`);
    }
  } else if (leadId) {
    lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) {
      throw new Error(`No se encontró ningún lead con el id ${leadId}`);
    }
  } else if (contactId) {
    contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) {
      throw new Error(`No se encontró ningún contacto con el id ${contactId}`);
    }
  }

  // Parsear fecha usando timezone del usuario si está disponible
  let fecha = new Date();
  if (fechaVencimiento) {
    try {
      const parsed = new Date(fechaVencimiento);
      if (!isNaN(parsed.getTime())) {
        // Si tenemos timezone, convertir la fecha local del usuario a UTC
        if (timezone && timezone !== 'UTC') {
          fecha = fromZonedTime(
            typeof fechaVencimiento === 'string'
              ? fechaVencimiento.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '')
              : fechaVencimiento.toISOString().replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, ''),
            timezone
          );
        } else {
          fecha = parsed;
        }
      }
    } catch {
      fecha = new Date(fechaVencimiento);
      if (isNaN(fecha.getTime())) fecha = new Date();
    }
  } else {
    fecha.setDate(fecha.getDate() + 1); // Por defecto mañana si no viene
  }

  // Validar y normalizar el tipo de tarea
  const tiposValidos = ['llamada', 'email', 'reunion', 'recordatorio'];
  let tipoFinal = tipo?.toLowerCase() || 'recordatorio';
  if (tipoFinal === 'seguimiento') tipoFinal = 'recordatorio';
  if (!tiposValidos.includes(tipoFinal)) {
    tipoFinal = 'recordatorio';
  }

  const task = await prisma.task.create({
    data: {
      tenantId,
      leadId: lead ? lead.id : null,
      contactId: contact ? contact.id : null,
      titulo,
      tipo: tipoFinal,
      descripcion,
      fechaVencimiento: fecha,
      asignadoA: asignadoAId || userId,
      completada: false,
    }
  });

  const { eventBus, EVENTS } = await import('./event-bus');
  eventBus.emitEvent(EVENTS.TASK_CREATED, {
    tenantId,
    userId,
    timestamp: new Date(),
    source: 'app',
    taskId: task.id,
    leadId: task.leadId ?? '',
    titulo: task.titulo,
    tipo: task.tipo ?? '',
    fechaVencimiento: task.fechaVencimiento,
  });

  return task;
};

/**
 * Valida que un userId corresponda a un usuario REAL del tenant antes de usarlo
 * en campos con FK (creadoPor → User). Los canales tipo WhatsApp pueden pasar
 * leadId o ids ficticios como userId, lo que rompía la creación de interacciones
 * y notas con error de foreign key. Devuelve undefined si no es un usuario real
 * (el campo creadoPor es nullable, así que se guarda sin creador).
 */
async function resolveRealUserId(tenantId: string, userId?: string): Promise<string | undefined> {
  if (!userId) return undefined;
  const { prisma } = await import('@/lib/db');
  // 1. Usuario del tenant (caso normal)
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true },
  });
  if (user) return user.id;
  // 2. Fallback: usuarios de plataforma con tenantId null (el id es único global)
  const platformUser = await prisma.user.findFirst({
    where: { id: userId, tenantId: null },
    select: { id: true },
  });
  return platformUser?.id;
}

const registerInteractionWrapper = async (input: { tenantId: string; email?: string; nombre?: string; tipo: any; contenido: string; resultado?: string; userId?: string }) => {
  const { tenantId, email, nombre, tipo, contenido, resultado } = input;
  const userId = await resolveRealUserId(tenantId, input.userId);
  
  const { prisma } = await import('@/lib/db');
  
  let lead = null;
  let contact = null;

  if (email) {
    lead = await contactSkills.findLeadByEmail(email, tenantId);
    if (!lead) contact = await contactSkills.findContactByEmail(email, tenantId);
  } else if (nombre) {
    lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (!lead) contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
  }

  if (!lead && !contact) {
    throw new Error('No se encontró el contacto o lead para registrar la interacción');
  }

  const contactEmail = lead?.email || contact?.email

  // ── Si es un email, enviarlo realmente por SES ──
  if (tipo === 'email' && contactEmail) {
    try {
      const { sendEmail } = await import('@/lib/ses-email');
      const emailResult = await sendEmail({
        to: contactEmail,
        subject: `Mensaje de Volkern: ${contenido.substring(0, 100)}`,
        text: contenido,
        html: contenido.replace(/\n/g, '<br>'),
      }).catch((e: any) => {
        console.warn('[Interaction] Error enviando email real (no crítico):', e?.message);
        return null;
      });
      
      if (emailResult) {
        console.log(`[Interaction] Email enviado a ${contactEmail}: ${contenido.substring(0, 50)}...`);
      }
    } catch (e) {
      // No crítico - la interacción se registra igual
      console.warn('[Interaction] No se pudo enviar el email real:', (e as any)?.message);
    }
  }

  return interactionSkills.createInteraction({
    tenantId,
    leadId: lead?.id,
    contactId: contact?.id,
    tipo,
    contenido,
    resultado,
    userId
  });
};

const getPhoneByNameWrapper = async (input: { tenantId: string; nombre: string }) => {
  const { tenantId, nombre } = input;
  const { prisma } = await import('@/lib/db');
  
  const lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
  if (lead?.telefono) return { nombre: lead.nombre, telefono: lead.telefono, tipo: 'lead' };
  
  const contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
  if (contact?.telefono) return { nombre: contact.nombre, telefono: contact.telefono, tipo: 'contact' };
  
  throw new Error(`No se encontró teléfono para el nombre "${nombre}"`);
};

const createBookingWrapper = async (input: { 
  tenantId: string; 
  email?: string; 
  nombre?: string; 
  fecha?: string; 
  hora?: string; 
  titulo?: string;
  tipo?: string;
  ubicacion?: string;
  userId?: string;
}) => {
  const { tenantId, email, nombre, fecha, hora, titulo, tipo, ubicacion, userId } = input;
  const { prisma } = await import('@/lib/db');

  // ── Limpiar nombre: extraer solo el nombre real ──
  // La IA a veces incluye "cita con", "reunión con", etc.
  function cleanNombre(raw: string): string {
    let cleaned = raw.trim()
    // Remover TODO lo que venga antes de "con" + el "con"
    // Esto cubre: "cita con X", "reunión con X", "haz una cita con X", etc.
    cleaned = cleaned.replace(/^.+\bcon\s+/i, '')
    // Remover prefijos remanentes: "agendar", "programar", "crear" al inicio
    cleaned = cleaned.replace(/^(?:agendar|programar|crear|hacer|haz|poner|una|la|el|un|para)\s+/i, '')
    return cleaned.trim()
  }

  let targetNombre = nombre ? cleanNombre(nombre) : nombre

  // ── Validar nombre ──
  if (targetNombre && targetNombre.trim()) {
    const nameWords = targetNombre.trim().split(/\s+/)
    const hasMinWords = nameWords.length >= 2
    // Solo rechazar si claramente no es un nombre (puro verbo o comando)
    const isCompleteCommand = /^(?:cita|agendar|crear|registrar|buscar|listar|eliminar|seguimiento)$/i.test(targetNombre.trim())
    
    if (!hasMinWords || isCompleteCommand) {
      throw new Error(
        `El nombre "${targetNombre}" no parece un nombre válido. Proporciona nombre y apellido del contacto.`
      )
    }
  }

  let targetEmail = email

  // ── Buscar contacto existente ──
  if (targetNombre) {
    const lead = await prisma.lead.findFirst({ 
      where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
    });
    
    if (lead) {
      targetEmail = targetEmail || lead.email
      targetNombre = lead.nombre
    } else {
      const contact = await prisma.contact.findFirst({ 
        where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
      });
      if (contact) {
        targetEmail = targetEmail || contact.email
        targetNombre = contact.nombre
      }
    }
  }

  // ── Si no hay email, pedir al usuario ──
  // (No generar emails placeholder. La IA preguntará en el siguiente turno)
  if (!targetEmail) {
    throw new Error(`EMAIL_REQUIRED: No tengo el email de ${targetNombre || 'este contacto'}. ¿Me lo puedes proporcionar?`)
  }
  if (!targetNombre) targetNombre = targetEmail.split('@')[0]

  // 3. Procesar fecha y hora de forma robusta
  //    Soporta formatos: "10:00", "10:00am", "2pm", "10:00 AM", "2:30 PM"
  function parseHora(horaStr: string): { h: number; min: number } | null {
    if (!horaStr || typeof horaStr !== 'string') return null
    
    // Detectar am/pm
    const isPM = /pm|p\.m\./i.test(horaStr)
    const isAM = /am|a\.m\./i.test(horaStr)
    
    // Extraer números: puede ser "10:00" o "10" o "2"
    const nums = horaStr.match(/(\d{1,2})(?:[:\.](\d{2}))?/)
    if (!nums) return null
    
    let h = parseInt(nums[1], 10)
    const min = nums[2] ? parseInt(nums[2], 10) : 0
    
    // Ajustar am/pm
    if (isPM && h !== 12) h += 12
    if (isAM && h === 12) h = 0
    
    return { h, min }
  }

  let dt: Date
  try {
    if (fecha && hora) {
      // Intentar parsear YYYY-MM-DD o DD/MM/YYYY
      const fechaRegex = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/
      const fechaMatch = typeof fecha === 'string' ? fecha.match(fechaRegex) : null
      if (fechaMatch) {
        const [y, m, d] = [fechaMatch[1], fechaMatch[2], fechaMatch[3]].map(Number)
        const horaParsed = parseHora(hora)
        if (horaParsed) {
          dt = new Date(y, m - 1, d, horaParsed.h, horaParsed.min, 0, 0)
        } else {
          dt = new Date(y, m - 1, d, 12, 0, 0, 0)
        }
      } else {
        // Fallback: new Date con string completo
        dt = new Date(`${fecha}T${hora}:00`)
        if (isNaN(dt.getTime())) dt = new Date()
      }
    } else if (fecha && !hora) {
      dt = new Date(fecha)
      if (isNaN(dt.getTime())) dt = new Date()
    } else {
      // Sin fecha ni hora — NO asumir default, usar mañana 10am como fallback
      dt = new Date()
      dt.setDate(dt.getDate() + 1)
      dt.setHours(10, 0, 0, 0)
    }
  } catch {
    dt = new Date()
    dt.setDate(dt.getDate() + 1)
    dt.setHours(10, 0, 0, 0)
  }

  // Validar que la fecha sea válida
  if (isNaN(dt.getTime())) {
    dt = new Date()
    dt.setDate(dt.getDate() + 1)
    dt.setHours(10, 0, 0, 0)
  }

  // 4. Determinar ubicación según el tipo de cita
  let ubicacionFinal = ubicacion
  let linkReunion: string | undefined
  
  if (tipo && /videollamada|video|meet|virtual|en línea|online|zoom|google/i.test(tipo)) {
    ubicacionFinal = 'Google Meet (Virtual)'
    linkReunion = 'https://meet.google.com/new'
  } else if (tipo && /presencial|oficina|domicilio|casa/i.test(tipo)) {
    ubicacionFinal = ubicacion || 'Por confirmar ubicación'
  }

  return bookingSkills.createBooking({
    tenantId,
    email: targetEmail,
    nombre: targetNombre,
    titulo: titulo || 'Cita de Seguimiento',
    fechaHora: dt,
    descripcion: tipo ? `Tipo: ${tipo}` : undefined,
    userId,
    linkReunion,
    ubicacion: ubicacionFinal,
    source: 'app'
  });
};

// ─── Wrapper para registrar gasto: mapea params español → inglés y busca/crea proveedor ──────

const createExpenseWrapper = async (input: {
  tenantId: string;
  userId?: string;
  monto?: number;
  amount?: number;
  concepto?: string;
  description?: string;
  proveedor?: string;
  categoria?: string;
  category?: string;
  fecha?: string;
  date?: string;
}) => {
  const { tenantId, userId, monto, amount, concepto, description, proveedor, categoria, category, fecha, date } = input;
  const { prisma } = await import('@/lib/db');
  
  // Mapear params español → inglés
  const finalAmount = amount ?? monto;
  const finalDescription = description || concepto || 'Gasto registrado por Gemma';
  const finalCategory = category || categoria || 'General';
  
  if (!finalAmount) {
    throw new Error('El monto es requerido para registrar el gasto.');
  }

  // Buscar o crear proveedor por nombre
  let supplierId: string;
  if (proveedor) {
    let supplier = await prisma.supplier.findFirst({
      where: {
        tenantId,
        name: { contains: proveedor, mode: 'insensitive' }
      }
    });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          tenantId,
          name: proveedor,
          category: finalCategory,
          active: true,
        }
      });
    }
    supplierId = supplier.id;
  } else {
    // Proveedor por defecto: "Gastos Varios"
    let defaultSupplier = await prisma.supplier.findFirst({
      where: { tenantId, name: 'Gastos Varios' }
    });
    if (!defaultSupplier) {
      defaultSupplier = await prisma.supplier.create({
        data: {
          tenantId,
          name: 'Gastos Varios',
          category: 'General',
          active: true,
        }
      });
    }
    supplierId = defaultSupplier.id;
  }

  const parsedDate = fecha || date ? new Date(fecha || date || '') : undefined;

  return financeSkills.createExpense({
    tenantId,
    createdById: userId || 'system',
    supplierId,
    description: finalDescription,
    amount: Number(finalAmount),
    category: finalCategory,
    date: parsedDate,
    status: 'PAID',
  });
};

// ─── Wrappers de Proveedores: mapean params español → inglés y añaden
// default de categoría (createSupplier core exige category). list_suppliers no
// existía como skill → wrapper directo a la BD ──────────────────────────────

const createSupplierWrapper = async (input: {
  tenantId: string;
  nombre?: string;
  name?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  categoria?: string;
  category?: string;
}) => {
  const name = (input.nombre || input.name || '').trim();
  if (!name) throw new Error('El nombre del proveedor es requerido.');

  return financeSkills.createSupplier({
    tenantId: input.tenantId,
    name,
    email: input.email,
    phone: input.telefono,
    streetName: input.direccion,
    category: input.categoria || input.category || 'General',
  });
};

const listSuppliersWrapper = async (input: { tenantId: string; categoria?: string }) => {
  const { tenantId, categoria } = input;
  const { prisma } = await import('@/lib/db');
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId, active: true, ...(categoria ? { category: { contains: categoria, mode: 'insensitive' } } : {}) },
    orderBy: { name: 'asc' },
    take: 50,
  });
  return { suppliers, total: suppliers.length };
};

// ─── Wrappers de Inventario: aceptan nombre de producto O id real ────────────

/**
 * Normaliza la referencia al ítem: si ya es un id cuid (viene de la API),
 * se usa directo; si es un nombre (viene del chatbot), se resuelve contra el
 * catálogo por búsqueda insensible a mayúsculas.
 */
const resolveCatalogoItemId = async (tenantId: string, ref?: string): Promise<string> => {
  if (!ref) throw new Error('Necesito saber a qué producto se refiere.');
  // Los cuid de Prisma son ~25 chars alfanuméricos empezando por 'c' — los ids
  // reales (API, MCP) NO deben buscarse por nombre.
  if (/^c[a-z0-9]{20,}$/i.test(ref)) return ref;
  const { prisma } = await import('@/lib/db');
  const item = await prisma.catalogoItem.findFirst({
    where: {
      tenantId,
      OR: [
        { nombre: { contains: ref, mode: 'insensitive' as const } },
        { sku: { contains: ref, mode: 'insensitive' as const } },
      ],
    },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true },
  });
  if (!item) throw new Error(`No encontré ningún producto llamado "${ref}" en tu catálogo.`);
  return item.id;
};

/**
 * Ajustar stock: acepta el shape del chatbot (producto nombre + cantidad +
 * tipo) y el de la API (catalogoItemId id + type + quantity + referenceId +
 * targetWarehouseId). Pasa al skill core con catalogoItemId resuelto.
 */
const adjustStockWrapper = async (input: {
  tenantId: string;
  producto?: string;
  productId?: string;
  catalogoItemId?: string;
  cantidad?: number | string;
  quantity?: number;
  tipo?: string;
  type?: string;
  almacenId?: string;
  warehouseId?: string;
  reason?: string;
  userId?: string;
  referenceId?: string;
  targetWarehouseId?: string;
}) => {
  const { tenantId } = input;
  const ref = input.producto || input.productId || input.catalogoItemId;
  const id = await resolveCatalogoItemId(tenantId, ref);
  const cantidad = Number(input.cantidad ?? input.quantity);
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('La cantidad debe ser un número mayor que 0.');
  const tipo = (input.tipo || input.type || 'IN').toUpperCase() as 'IN' | 'OUT' | 'TRANSFER';
  return inventorySkills.adjustStock({
    tenantId,
    catalogoItemId: id,
    type: tipo,
    quantity: cantidad,
    reason: input.reason || `Ajuste vía chatbot (${tipo})`,
    warehouseId: input.warehouseId || input.almacenId,
    userId: input.userId,
    referenceId: input.referenceId,
    targetWarehouseId: input.targetWarehouseId,
  });
};

/**
 * Salud de inventario: producto opcional → catalogoItemId.
 */
const getInventoryHealthWrapper = async (input: {
  tenantId: string;
  producto?: string;
  catalogoItemId?: string;
}) => {
  const id = input.catalogoItemId || (input.producto ? await resolveCatalogoItemId(input.tenantId, input.producto) : undefined);
  return inventorySkills.getInventoryHealth({ tenantId: input.tenantId, catalogoItemId: id });
};

/**
 * Consumo de inventario: acepta producto nombre (chatbot) o productId id
 * (API). Pasa al skill core con productId resuelto.
 */
const processInventoryConsumptionWrapper = async (input: {
  tenantId: string;
  producto?: string;
  productId?: string;
  cantidad?: number | string;
  quantity?: number;
  almacenId?: string;
  warehouseId?: string;
  userId?: string;
}) => {
  const { tenantId } = input;
  const ref = input.producto || input.productId;
  const id = await resolveCatalogoItemId(tenantId, ref);
  const cantidad = Number(input.cantidad ?? input.quantity);
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('La cantidad debe ser un número mayor que 0.');
  return inventorySkills.processInventoryConsumption({
    tenantId,
    productId: id,
    quantity: cantidad,
    warehouseId: input.warehouseId || input.almacenId,
    userId: input.userId,
  });
};

// ─── Cancel Booking Wrapper: busca por nombre/email si no hay bookingId ──────

const cancelBookingWrapper = async (input: {
  tenantId: string;
  bookingId?: string;
  citaId?: string;
  nombre?: string;
  email?: string;
  fecha?: string;
  motivo?: string;
  userId?: string;
}) => {
  const { tenantId, bookingId, citaId, nombre, email, fecha, motivo, userId } = input;
  const id = bookingId || citaId

  // Si hay ID directo, cancelar sin búsqueda
  if (id) {
    return bookingSkills.cancelBooking({ bookingId: id, tenantId, motivo, userId })
  }

  // Sin ID: buscar por nombre/email
  if (!nombre && !email) {
    throw new Error('Para cancelar una cita necesito el nombre o email del contacto. ¿De quién es la cita?')
  }

  const { prisma } = await import('@/lib/db')

  // 1. Buscar lead/contacto por nombre o email
  const leadIds: string[] = []

  if (email) {
    const lead = await prisma.lead.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } } })
    if (lead) leadIds.push(lead.id)
    const contact = await prisma.contact.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } } })
    if (contact) leadIds.push(contact.id)
  }

  if (nombre && leadIds.length === 0) {
    const leads = await prisma.lead.findMany({
      where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } },
      select: { id: true, nombre: true, email: true },
    })
    leadIds.push(...leads.map(l => l.id))

    const contacts = await prisma.contact.findMany({
      where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } },
      select: { id: true, nombre: true, email: true },
    })
    leadIds.push(...contacts.map(c => c.id))
  }

  if (leadIds.length === 0) {
    throw new Error(`No encontré ningún contacto con${nombre ? ` nombre "${nombre}"` : ''}${email ? ` email "${email}"` : ''}. ¿Tienes otro dato?`)
  }

  // 2. Buscar citas activas (pendiente/confirmada) del lead
  const fechaFilter: any = {}
  if (fecha) {
    const d = new Date(fecha)
    if (!isNaN(d.getTime())) {
      const start = new Date(d)
      start.setHours(0, 0, 0, 0)
      const end = new Date(d)
      end.setHours(23, 59, 59, 999)
      fechaFilter.fechaHora = { gte: start, lte: end }
    }
  }

  const citas = await prisma.cita.findMany({
    where: {
      tenantId,
      leadId: { in: leadIds },
      estado: { in: ['pendiente', 'confirmada', 'Pendiente', 'Confirmada'] },
      ...fechaFilter,
    },
    include: {
      lead: { select: { nombre: true, email: true } },
    },
    orderBy: { fechaHora: 'asc' },
  })

  if (citas.length === 0) {
    const fechaMsg = fecha ? ` para esa fecha` : ''
    throw new Error(`No encontré citas activas${fechaMsg} de ${nombre || email}.`)
  }

  if (citas.length > 1) {
    const lista = citas.map((c, i) => {
      const f = c.fechaHora.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `  ${i + 1}. ${f} — ${c.titulo || 'Sin título'}`
    }).join('\n')
    throw new Error(
      `Encontré varias citas de ${citas[0].lead?.nombre || nombre}:\n\n${lista}\n\n¿Cuál quieres cancelar? Puedes darme más detalles como la fecha exacta.`
    )
  }

  // 3. Cancelar la cita encontrada
  const cita = citas[0]
  return bookingSkills.cancelBooking({ bookingId: cita.id, tenantId, motivo, userId })
}


// ─── Wrappers de Siniestros: el orquestador pasa números/nombres en español;
// el skill core exige ids y enum EstadoSiniestro en mayúsculas ───────────────

const ESTADOS_SINIESTRO = ['REPORTADO', 'EN_TRAMITE', 'ABIERTO', 'PAGADO', 'RECHAZADO', 'CERRADO'] as const;
type EstadoSiniestro = (typeof ESTADOS_SINIESTRO)[number];

const ESTADO_SINIESTRO_ALIAS: Record<string, EstadoSiniestro> = {
  'reportado': 'REPORTADO',
  'en tramite': 'EN_TRAMITE',
  'en trámite': 'EN_TRAMITE',
  'tramite': 'EN_TRAMITE',
  'trámite': 'EN_TRAMITE',
  'abierto': 'ABIERTO',
  'pagado': 'PAGADO',
  'rechazado': 'RECHAZADO',
  'cerrado': 'CERRADO',
};

function normalizeEstadoSiniestro(raw?: string): EstadoSiniestro | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  if ((ESTADOS_SINIESTRO as readonly string[]).includes(upper)) return upper as EstadoSiniestro;
  return ESTADO_SINIESTRO_ALIAS[raw.trim().toLowerCase().replace(/\s+/g, ' ')];
}

/**
 * Resuelve la póliza por id cuid (API) o por número (chatbot).
 */
async function resolvePolizaId(tenantId: string, ref?: string): Promise<string> {
  if (!ref) throw new Error('Necesito saber a qué póliza se refiere (su número).');
  if (/^c[a-z0-9]{20,}$/i.test(ref)) return ref;
  const { prisma } = await import('@/lib/db');
  const poliza = await prisma.poliza.findFirst({
    where: { tenantId, numeroPoliza: { contains: ref, mode: 'insensitive' as const } },
    orderBy: { fechaVencimiento: 'desc' },
    select: { id: true, numeroPoliza: true },
  });
  if (!poliza) throw new Error(`No encontré ninguna póliza "${ref}" en tu cartera.`);
  return poliza.id;
}

/**
 * Resuelve el siniestro por id cuid o por numeroSiniestro (chatbot).
 */
async function resolveSiniestroId(tenantId: string, ref?: string): Promise<string> {
  if (!ref) throw new Error('Necesito saber a qué siniestro te refieres (su nº de siniestro).');
  if (/^c[a-z0-9]{20,}$/i.test(ref)) return ref;
  const { prisma } = await import('@/lib/db');
  const siniestro = await prisma.siniestro.findFirst({
    where: { tenantId, numeroSiniestro: { contains: ref, mode: 'insensitive' as const } },
    orderBy: { fechaSuceso: 'desc' },
    select: { id: true, numeroSiniestro: true },
  });
  if (!siniestro) throw new Error(`No encontré ningún siniestro "${ref}".`);
  return siniestro.id;
}

const createSiniestroWrapper = async (input: {
  tenantId: string;
  poliza?: string;
  polizaId?: string;
  descripcion?: string;
  numeroSiniestro?: string;
  fechaSuceso?: string;
  fechaReporte?: string;
  montoReclamado?: number | string;
  deducible?: number | string;
  moneda?: string;
  estado?: string;
  notas?: string;
  userId?: string;
}) => {
  if (!input.descripcion || !String(input.descripcion).trim()) {
    throw new Error('Describe brevemente el siniestro para poder reportarlo.');
  }
  const polizaId = input.polizaId || (input.poliza ? await resolvePolizaId(input.tenantId, input.poliza) : undefined);
  if (!polizaId) throw new Error('Necesito saber contra qué póliza es el siniestro.');

  return siniestrosSkills.createSiniestro({
    tenantId: input.tenantId,
    polizaId,
    descripcion: String(input.descripcion),
    numeroSiniestro: input.numeroSiniestro,
    fechaSuceso: input.fechaSuceso,
    fechaReporte: input.fechaReporte,
    montoReclamado: input.montoReclamado !== undefined && input.montoReclamado !== '' ? Number(input.montoReclamado) : undefined,
    deducible: input.deducible !== undefined && input.deducible !== '' ? Number(input.deducible) : undefined,
    moneda: input.moneda,
    estado: normalizeEstadoSiniestro(input.estado),
    notas: input.notas,
    createdById: input.userId,
  });
};

const listSiniestrosWrapper = async (input: {
  tenantId: string;
  estado?: string;
  cliente?: string;
  aseguradora?: string;
  page?: number;
  limit?: number;
}) => {
  const { tenantId } = input;
  const { prisma } = await import('@/lib/db');
  let clienteId: string | undefined;
  let aseguradoraId: string | undefined;
  if (input.cliente) {
    const c = await prisma.contact.findFirst({
      where: { tenantId, nombre: { contains: input.cliente, mode: 'insensitive' as const } },
      select: { id: true },
    });
    if (!c) throw new Error(`No encontré ningún cliente llamado "${input.cliente}".`);
    clienteId = c.id;
  }
  if (input.aseguradora) {
    const a = await prisma.aseguradora.findFirst({
      where: { tenantId, nombre: { contains: input.aseguradora, mode: 'insensitive' as const } },
      select: { id: true },
    });
    if (!a) throw new Error(`No encontré ninguna aseguradora llamada "${input.aseguradora}".`);
    aseguradoraId = a.id;
  }
  return siniestrosSkills.listSiniestros({
    tenantId: input.tenantId,
    estado: normalizeEstadoSiniestro(input.estado),
    clienteId,
    aseguradoraId,
    page: input.page,
    limit: input.limit,
  });
};

const updateSiniestroWrapper = async (input: {
  tenantId: string;
  siniestro?: string;
  id?: string;
  estado?: string;
  montoIndemnizado?: number | string;
  motivoRechazo?: string;
  notas?: string;
  fechaCierre?: string;
}) => {
  const estado = normalizeEstadoSiniestro(input.estado);
  if (!estado) {
    throw new Error(
      'Indica el estado al que quieres pasar el siniestro (en trámite, abierto, pagado, rechazado o cerrado).',
    );
  }
  const id = input.id || (input.siniestro ? await resolveSiniestroId(input.tenantId, input.siniestro) : undefined);
  if (!id) throw new Error('Necesito saber a qué siniestro te refieres.');

  return siniestrosSkills.updateEstadoSiniestro({
    tenantId: input.tenantId,
    id,
    estado,
    montoIndemnizado:
      input.montoIndemnizado !== undefined && input.montoIndemnizado !== ''
        ? Number(input.montoIndemnizado)
        : undefined,
    motivoRechazo: input.motivoRechazo,
    notas: input.notas,
    fechaCierre: input.fechaCierre,
  });
};

// ─── Wrappers de Facturación (Décimo entrenamiento): el core exige ids y
// amount, pero el chatbot pasa cliente (email/nombre), monto y número de
// factura ───────────────────────────────────────────────────────────────────

/**
 * Resuelve el cliente fiscal por email o nombre → leadId/contactId. Si el ref
 * parece un email busca por email; si no, por nombre (contains, insensitive).
 */
async function resolveClienteFiscal(tenantId: string, ref?: string): Promise<{ leadId?: string; contactId?: string }> {
  if (!ref || !String(ref).trim()) {
    throw new Error('Necesito saber a quién facturar: el nombre o email del cliente (requerido).')
  }
  const { prisma } = await import('@/lib/db')
  const refClean = String(ref).trim()
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(refClean)
  const where = isEmail
    ? { tenantId, email: { equals: refClean, mode: 'insensitive' as const } }
    : { tenantId, nombre: { contains: refClean, mode: 'insensitive' as const } }
  const lead = await prisma.lead.findFirst({ where: where as any, select: { id: true } })
  if (lead) return { leadId: lead.id }
  const contact = await prisma.contact.findFirst({ where: where as any, select: { id: true } })
  if (contact) return { contactId: contact.id }
  throw new Error(`No encontré ningún cliente "${refClean}". ¿Tienes otro dato (email o nombre)?`)
}

/**
 * Resuelve la factura por id cuid (API) o por número (chatbot): "FAC-001",
 * "#123", "MOCK-1754…".
 */
async function resolveInvoiceId(tenantId: string, ref?: string): Promise<string> {
  if (!ref) throw new Error('Necesito saber de qué factura se trata (su número).')
  const refClean = String(ref).trim().replace(/^#/, '')
  if (/^c[a-z0-9]{20,}$/i.test(refClean)) return refClean
  const { prisma } = await import('@/lib/db')
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, numero: { contains: refClean, mode: 'insensitive' as const } },
    orderBy: { fechaEmision: 'desc' },
    select: { id: true, numero: true },
  })
  if (!invoice) throw new Error(`No encontré ninguna factura "${refClean}" en tu historial.`)
  return invoice.id
}

const createInvoiceWrapper = async (input: {
  tenantId: string;
  email?: string;
  nombre?: string;
  cliente?: string;
  leadId?: string;
  contactId?: string;
  monto?: number | string;
  amount?: number | string;
  concepto?: string;
  description?: string;
  moneda?: string;
  userId?: string;
}) => {
  // Monto obligatorio (el clasificador lo exige; aquí se valida por si llega vacío)
  const amountRaw = input.amount !== undefined && input.amount !== '' ? input.amount : input.monto
  const amount = amountRaw !== undefined && amountRaw !== '' ? Number(amountRaw) : NaN
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Indica el monto de la factura para poder generarla (requerido).')
  }
  // Cliente: prioridad al id explícito; si no, resolver por email/nombre
  const clienteRef = input.cliente || input.email || input.nombre
  let leadId = input.leadId
  let contactId = input.contactId
  if (!leadId && !contactId) {
    const resolved = await resolveClienteFiscal(input.tenantId, clienteRef)
    leadId = resolved.leadId
    contactId = resolved.contactId
  }
  if (!leadId && !contactId) {
    throw new Error('Necesito saber a quién facturar: el nombre o email del cliente (requerido).')
  }
  return billingSkills.create_invoice({
    tenantId: input.tenantId,
    leadId,
    contactId,
    amount,
    currency: input.moneda || 'EUR',
    description: input.concepto || input.description,
    items: [],
  } as any);
};

const cancelInvoiceWrapper = async (input: {
  tenantId: string;
  factura?: string;
  invoiceId?: string;
  motivo?: string;
}) => {
  const invoiceId = input.invoiceId || (input.factura ? await resolveInvoiceId(input.tenantId, input.factura) : undefined)
  if (!invoiceId) throw new Error('Necesito saber qué factura quieres cancelar (su número).')
  return billingSkills.cancel_invoice({ tenantId: input.tenantId, invoiceId });
};

const getInvoiceFiscalStatusWrapper = async (input: {
  tenantId: string;
  factura?: string;
  invoiceId?: string;
}) => {
  const invoiceId = input.invoiceId || (input.factura ? await resolveInvoiceId(input.tenantId, input.factura) : undefined)
  if (!invoiceId) throw new Error('Necesito saber de qué factura quieres el estado fiscal (su número).')
  return billingSkills.get_invoice_fiscal_status({ tenantId: input.tenantId, invoiceId });
};

const rectifyInvoiceWrapper = async (input: {
  tenantId: string;
  factura?: string;
  invoiceId?: string;
  razon?: string;
  motivo?: string;
  monto?: number | string;
  amount?: number | string;
}) => {
  if (!input.razon && !input.motivo) {
    throw new Error('Indica el motivo de la rectificación para poder corregir la factura (requerido).')
  }
  const invoiceId = input.invoiceId || (input.factura ? await resolveInvoiceId(input.tenantId, input.factura) : undefined)
  if (!invoiceId) throw new Error('Necesito saber qué factura quieres rectificar (su número).')
  const amountRaw = input.monto !== undefined && input.monto !== '' ? input.monto : input.amount
  const amount = amountRaw !== undefined && amountRaw !== '' ? Number(amountRaw) : undefined
  return billingSkills.rectify_invoice({
    tenantId: input.tenantId,
    invoiceId,
    reason: String(input.razon || input.motivo),
    amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
  });
};

// ─── Wrappers de Logística (Undécimo entrenamiento): el chatbot habla de
// "tracking", "pedido #ORD-456", "vehículo VEH-001" y "almacén principal";
// el core espera trackingNumber / orderRef / warehouseId ─────────────────────

const getShipmentStatusWrapper = async (input: {
  tenantId: string;
  tracking?: string;
  trackingNumber?: string;
  envio?: string;
  shipmentId?: string;
}) => {
  return logisticsSkills.getShipmentStatus({
    tenantId: input.tenantId,
    trackingNumber: input.trackingNumber || input.tracking || input.envio,
    shipmentId: input.shipmentId,
  });
};

const trackOrderWrapper = async (input: {
  tenantId: string;
  pedidoId?: string;
  orderRef?: string;
  tracking?: string;
  trackingNumber?: string;
}) => {
  return logisticsSkills.trackOrder({
    tenantId: input.tenantId,
    orderRef: input.orderRef || input.pedidoId,
    trackingNumber: input.trackingNumber || input.tracking,
  });
};

const checkFleetHealthWrapper = async (input: {
  tenantId: string;
  vehiculoId?: string;
  vehiculo?: string;
}) => {
  const result = await logisticsSkills.checkFleetHealth({ tenantId: input.tenantId });
  const ref = String(input.vehiculoId || input.vehiculo || '').trim();
  if (!ref) return result;
  const match = (v: any) =>
    (v.plate && String(v.plate).toLowerCase().includes(ref.toLowerCase())) ||
    (v.id && String(v.id).toLowerCase() === ref.toLowerCase()) ||
    (v.vehicleId && String(v.vehicleId).toLowerCase() === ref.toLowerCase());
  const maintenanceDue = (result.maintenanceDue || []).filter(match);
  const expiringItv = (result.expiringItv || []).filter(match);
  if (maintenanceDue.length === 0 && expiringItv.length === 0) {
    return {
      ...result,
      maintenanceDue: [],
      expiringItv: [],
      message: `No encontré el vehículo "${ref}" con mantenimientos pendientes ni ITV próxima a vencer.`,
    };
  }
  return { ...result, maintenanceDue, expiringItv };
};

const optimizeRouteWrapper = async (input: {
  tenantId: string;
  origin?: string;
  destination?: string;
  priority?: string;
  fecha?: string;
  vehiculoId?: string;
}) => {
  return logisticsSkills.optimizeRoute({
    tenantId: input.tenantId,
    origin: input.origin,
    destination: input.destination,
    priority: input.priority,
  });
};

const suggestWarehouseReorgWrapper = async (input: {
  tenantId: string;
  almacenId?: string;
  warehouseId?: string;
}) => {
  return logisticsSkills.suggestWarehouseReorganization({
    tenantId: input.tenantId,
    warehouseId: input.warehouseId || input.almacenId,
  });
};

export const skills = {
  // Contactos
  create_contact: createContactWrapper,
  update_contact: contactSkills.updateContact,
  get_contact: contactSkills.getContact,
  find_contact_by_email: findContactByEmailWrapper,
  list_contacts: contactSkills.listContacts,

  // Empresas (contactos tipo company)
  create_company: createCompanyWrapper,
  
  // Leads
  create_lead: createLeadWrapper,
  update_lead: updateLeadWrapper,
  get_lead: contactSkills.getLead,
  find_lead_by_email: findLeadByEmailWrapper,
  convert_lead: convertLeadWrapper,
  list_leads: contactSkills.listLeads,
  obtener_telefono: getPhoneByNameWrapper,
  registrar_interaccion: registerInteractionWrapper,
  
  // Facturación & Veri*factu (wrappers: resuelven cliente por email/nombre y
  // factura por número para el chatbot — el core exige ids y amount)
  create_invoice: createInvoiceWrapper,
  rectify_invoice: rectifyInvoiceWrapper,
  cancel_invoice: cancelInvoiceWrapper,
  get_invoice_fiscal_status: getInvoiceFiscalStatusWrapper,
  
  // Conversaciones
  create_conversation: conversationSkills.createConversation,
  get_conversation: getConversationWrapper,
  get_or_create_conversation: conversationSkills.getOrCreateConversation,
  send_message: conversationSkills.sendMessage,
  close_conversation: conversationSkills.closeConversation,
  
  // Tareas
  create_task: createTaskWrapper,
  complete_task: completeTaskWrapper,
  get_tasks_by_lead: getTasksByLeadWrapper,
  get_pending_tasks: getPendingTasksWrapper,
  
  // Notas
  create_note: createNoteWrapper,
  get_notes_by_lead: getNotesByLeadWrapper,
  
  // Diagnósticos (skill compuesto)
  complete_diagnosis: diagnosisSkills.completeDiagnosis,
  get_diagnosis_by_lead: getDiagnosisByLeadWrapper,
  
  // Bookings/Citas (skill compuesto)
  create_booking: createBookingWrapper,
  confirm_booking: bookingSkills.confirmBooking,
  cancel_booking: cancelBookingWrapper,
  get_bookings_by_lead: getBookingsByLeadWrapper,
  get_upcoming_bookings: getUpcomingBookingsWrapper,
  auto_schedule: bookingSkills.autoScheduleAppointment,
  
  // Deals / Pipeline
  create_deal: createDealWrapper,
  update_deal: updateDealWrapper,
  get_deal: getDealWrapper,
  list_deals: listDealsWrapper,
  prequalify_lead: prequalifyLeadWrapper,
  
  // Catálogo
  export_catalog: catalogSkills.exportCatalog,
  get_catalog_field_definitions: catalogSkills.getFieldDefinitions,
  get_catalog_item: catalogSkills.getCatalogItem,
  search_catalog: catalogSkills.searchCatalog,
  buscar_catalogo: catalogSkills.buscarCatalogo,
  
  // WebCreator AI
  generate_landing_draft: webCreatorSkills.generateLandingDraft,
  
  // Proactividad & Training
  detect_ghosting: proactivitySkills.detectGhosting,
  generate_success_path: proactivitySkills.generateSuccessPath,
  generate_customer_response: trainingSkills.generateCustomerResponse,
  generate_post_mortem: trainingSkills.generatePostMortem,
  
  // AI & Chatbot
  execute_chatbot_response: chatbotSkills.executeChatbotResponse,
  
  // Sincronización Chatwoot
  sync_chatwoot_incoming: chatwootSyncSkills.syncIncomingChatwootMessage,
  sync_chatwoot_outgoing: chatwootSyncSkills.syncOutgoingChatwootMessage,
  
  // ERP Finanzas
  create_supplier: createSupplierWrapper,
  list_suppliers: listSuppliersWrapper,
  create_expense: createExpenseWrapper,
  register_expense_vision: financeSkills.registerExpenseVision,
  analyze_burn_rate: financeSkills.analyzeBurnRate,
  
  // ERP Inventario
  adjust_stock: adjustStockWrapper,
  get_inventory_health: getInventoryHealthWrapper,
  process_inventory_consumption: processInventoryConsumptionWrapper,
  inventory_watchdog: inventoryWatchdogSkills.inventoryWatchdog,
  
  // ERP Proyectos
  get_project_profitability: projectSkills.getProjectProfitability,
  detect_project_drifting: projectSkills.detectProjectDrifting,
  
  // ERP Consolidación (The Financial Brain)
  analyze_global_profitability: consolidationSkills.analyzeGlobalProfitability,
  audit_expense_integrity: consolidationSkills.auditExpenseIntegrity,
  project_financial_forecast: consolidationSkills.projectFinancialForecast,
  tax_prospector: consolidationSkills.taxProspector,
  
  // ERP Producción (MRP)
  calculate_production_cost: productionSkills.calculate_production_cost,
  verify_waste_integrity: productionSkills.verify_waste_integrity,

  // ERP Calidad (QC)
  detect_quality_anomalies: qualitySkills.detect_quality_anomalies,
  register_qc_inspection: qualitySkills.register_qc_inspection,

  // ERP RRHH (HRM)
  talent_retention_risk: hrSkills.talent_retention_risk,
  get_employee_confidential_data: hrSkills.get_employee_confidential_data,
  get_hr_daily_brief: hrSkills.get_hr_daily_brief,
  authorize_bulk_expenses: hrSkills.authorize_bulk_expenses,
  approve_vacation_voice: hrSkills.approve_vacation_voice,
  orchestrate_asset_transfer: hrSkills.orchestrate_asset_transfer,
  mcp_access_watchdog: hrSkills.mcp_access_watchdog,
  generate_offboarding_security_kit: hrSkills.generate_offboarding_security_kit,
  confirm_digital_seal: hrSkills.confirm_digital_seal,
  access_security_audit: hrSkills.access_security_audit,

  // Agentic Skills (Gemma 4 Optimized)
  audit_finance_integrity: auditSkills.audit_finance_integrity,
  orchestrate_secure_payroll: vaultPayrollSkills.orchestrate_secure_payroll,
  get_field_activity: operationalSkills.get_field_activity,
  audit_material_leaks: operationalSkills.audit_material_leaks,
  
  // Real Estate
  generate_property_description: realEstateSkills.generate_property_description,
  suggest_price_based_on_market: realEstateSkills.suggest_price_based_on_market,
  calculate_property_quality_score: realEstateSkills.calculate_property_quality_score,
  search_properties_by_filters: realEstateSkills.search_properties_by_filters,
  recommend_properties: realEstateSkills.recommend_properties,

  // Insurance / Seguros
  create_poliza: insuranceSkills.create_poliza,
  list_polizas: insuranceSkills.list_polizas,
  polizas_por_vencer: insuranceSkills.polizas_por_vencer,
  renovaciones_pendientes: insuranceSkills.renovaciones_pendientes,
  clientes_sin_contacto: insuranceSkills.clientes_sin_contacto,
  create_siniestro: createSiniestroWrapper,
  list_siniestros: listSiniestrosWrapper,
  update_siniestro: updateSiniestroWrapper,

  // ERP Logística
  // Logística (wrappers: mapean tracking/pedidoId/vehiculoId/almacenId del
  // chatbot a trackingNumber/orderRef/warehouseId del core)
  get_shipment_status: getShipmentStatusWrapper,
  check_fleet_health: checkFleetHealthWrapper,
  optimize_route: optimizeRouteWrapper,
  suggest_warehouse_reorg: suggestWarehouseReorgWrapper,
  track_order: trackOrderWrapper,

  // Marketing Hub
  generate_marketing_copy: marketingSkills.generate_marketing_copy,
  analyze_marketing_sentiment: marketingSkills.analyze_marketing_sentiment,
  suggest_campaign_optimization: marketingSkills.suggest_campaign_optimization,
  generate_web_creator_block: marketingSkills.generate_web_creator_block,
  generate_seo_metadata: marketingSkills.generate_seo_metadata,
  advise_on_automation_rules: marketingSkills.advise_on_automation_rules,

  // ─── ADS Skills ───────────────────────────────────────────────────
  create_ad_schedule: adSkills.create_ad_schedule,
  list_ad_schedules: adSkills.list_ad_schedules,
  toggle_ad_schedule: adSkills.toggle_ad_schedule,
  delete_ad_schedule: adSkills.delete_ad_schedule,
  create_ab_test: adSkills.create_ab_test,
  start_ab_test: adSkills.start_ab_test,
  calculate_ab_test_significance: adSkills.calculate_ab_test_significance,
  declare_ab_test_winner: adSkills.declare_ab_test_winner,
} as const;

export type SkillName = keyof typeof skills;

/**
 * Ejecutar un skill por nombre (para MCP/Agentes)
 */
export async function executeSkill<T extends SkillName>(
  skillName: T,
  payload: Parameters<typeof skills[T]>[0]
): Promise<ReturnType<typeof skills[T]>> {
  const skill = skills[skillName];
  if (!skill) {
    throw new Error(`Skill "${skillName}" no encontrado`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return skill(payload as any) as ReturnType<typeof skills[T]>;
}

/**
 * Listar skills disponibles (para MCP)
 */
export function listSkills(): Array<{ name: SkillName; description: string; category: string }> {
  return [
    // Contactos
    { name: 'create_contact', description: 'Crear un nuevo contacto', category: 'contacts' },
    { name: 'update_contact', description: 'Actualizar un contacto existente', category: 'contacts' },
    { name: 'get_contact', description: 'Obtener contacto por ID', category: 'contacts' },
    { name: 'find_contact_by_email', description: 'Buscar contacto por email', category: 'contacts' },
    { name: 'list_contacts', description: 'Listar todos los contactos del tenant, con paginación', category: 'contacts' },
    // Empresas
    { name: 'create_company', description: 'Crear una nueva empresa (contacto tipo company)', category: 'companies' },
    // Leads
    { name: 'create_lead', description: 'Crear un nuevo lead', category: 'leads' },
    { name: 'get_lead', description: 'Obtener lead por ID', category: 'leads' },
    { name: 'find_lead_by_email', description: 'Buscar lead por email', category: 'leads' },
    { name: 'convert_lead', description: 'Convertir lead a contacto', category: 'leads' },
    { name: 'list_leads', description: 'Listar todos los leads del tenant, con filtro por estado y paginación', category: 'leads' },
    // Conversaciones
    { name: 'create_conversation', description: 'Crear una nueva conversación', category: 'conversations' },
    { name: 'get_conversation', description: 'Obtener conversación por ID', category: 'conversations' },
    { name: 'get_or_create_conversation', description: 'Obtener o crear conversación', category: 'conversations' },
    { name: 'send_message', description: 'Enviar mensaje en una conversación', category: 'conversations' },
    { name: 'close_conversation', description: 'Cerrar una conversación', category: 'conversations' },
    // Tareas
    { name: 'create_task', description: 'Crear una nueva tarea', category: 'tasks' },
    { name: 'complete_task', description: 'Marcar tarea como completada', category: 'tasks' },
    { name: 'get_tasks_by_lead', description: 'Obtener tareas de un lead', category: 'tasks' },
    { name: 'get_pending_tasks', description: 'Obtener tareas pendientes de un usuario', category: 'tasks' },
    // Notas
    { name: 'create_note', description: 'Crear una nota en un lead', category: 'notes' },
    { name: 'get_notes_by_lead', description: 'Obtener notas de un lead', category: 'notes' },
    // Diagnósticos
    { name: 'complete_diagnosis', description: 'Completar flujo de diagnóstico completo', category: 'diagnosis' },
    { name: 'get_diagnosis_by_lead', description: 'Obtener diagnósticos de un lead', category: 'diagnosis' },
    // Bookings
    { name: 'create_booking', description: 'Crear una reserva/cita completa', category: 'bookings' },
    { name: 'confirm_booking', description: 'Confirmar una cita', category: 'bookings' },
    { name: 'cancel_booking', description: 'Cancelar una cita', category: 'bookings' },
    { name: 'get_bookings_by_lead', description: 'Obtener citas de un lead', category: 'bookings' },
    { name: 'get_upcoming_bookings', description: 'Obtener próximas citas', category: 'bookings' },
    // Deals
    { name: 'create_deal', description: 'Crear un nuevo deal en el pipeline', category: 'deals' },
    { name: 'update_deal', description: 'Actualizar un deal existente', category: 'deals' },
    { name: 'get_deal', description: 'Obtener deal por ID', category: 'deals' },
    { name: 'list_deals', description: 'Listar deals con filtros', category: 'deals' },
    // Catálogo
    { name: 'export_catalog', description: 'Exportar catálogo completo con custom fields (JSON/CSV)', category: 'catalog' },
    { name: 'get_catalog_field_definitions', description: 'Obtener definiciones de campos personalizados del catálogo', category: 'catalog' },
    { name: 'get_catalog_item', description: 'Obtener un ítem del catálogo por ID', category: 'catalog' },
    { name: 'search_catalog', description: 'Buscar en el catálogo con filtros', category: 'catalog' },
    { name: 'buscar_catalogo', description: 'Buscar en el catálogo con filtros dinámicos (precio, tipo, ciudad) para el chatbot', category: 'catalog' },
    // AI
    { name: 'execute_chatbot_response', description: 'Procesar mensaje del chatbot y responder', category: 'ai' },
    // Advanced composite skills
    { name: 'prequalify_lead', description: 'Registrar nota, actualizar deal y buscar en catálogo (Escucha Activa)', category: 'advanced' },
    { name: 'auto_schedule', description: 'Agendar cita automáticamente verificando disponibilidad y notificando al cliente', category: 'advanced' },
    { name: 'generate_landing_draft', description: 'Generar borrador de landing page personalizado con IA', category: 'advanced' },
    // Proactivity & Training
    { name: 'detect_ghosting', description: 'Detectar leads inactivos en etapas calientes', category: 'proactivity' },
    { name: 'generate_success_path', description: 'Generar sugerencia estratégica para un lead basada en patrones de cierre', category: 'proactivity' },
    { name: 'generate_customer_response', description: 'Simular respuesta de cliente en roleplay de negociación', category: 'training' },
    { name: 'generate_post_mortem', description: 'Generar reporte de retroalimentación tras una sesión de roleplay', category: 'training' },
    // Facturación & Veri*factu
    { name: 'create_invoice', description: 'Generar una factura legal (Veri*factu)', category: 'billing' },
    { name: 'rectify_invoice', description: 'Rectificar una factura existente', category: 'billing' },
    { name: 'cancel_invoice', description: 'Anular una factura', category: 'billing' },
    { name: 'get_invoice_fiscal_status', description: 'Consultar estado fiscal e integridad de una factura', category: 'billing' },
    // ERP Finanzas
    { name: 'create_supplier', description: 'Registrar un nuevo proveedor', category: 'finance' },
    { name: 'list_suppliers', description: 'Listar proveedores registrados del tenant', category: 'finance' },
    { name: 'create_expense', description: 'Registrar un nuevo gasto u egreso', category: 'finance' },
    { name: 'register_expense_vision', description: 'Registrar gasto mediante procesamiento de visión', category: 'finance' },
    { name: 'analyze_burn_rate', description: 'Analizar relación ingresos vs gastos y salud financiera', category: 'finance' },
    // ERP Inventario
    { name: 'adjust_stock', description: 'Ajustar niveles de stock (Entrada/Salida/Transferencia)', category: 'inventory' },
    { name: 'get_inventory_health', description: 'Analizar salud del inventario y predicción de rupturas', category: 'inventory' },
    { name: 'process_inventory_consumption', description: 'Descontar producto o componentes (BoM) automáticamente', category: 'inventory' },
    { name: 'inventory_watchdog', description: 'Vigilante de IA para puntos de reorden y alertas de stock', category: 'inventory' },
    // ERP Proyectos
    { name: 'get_project_profitability', description: 'Calcular rentabilidad real de un proyecto vinculando ingresos y costos', category: 'projects' },
    { name: 'detect_project_drifting', description: 'Detectar desviaciones presupuestarias o cronológicas vía IA', category: 'projects' },
    // ERP Consolidación (The Financial Brain)
    { name: 'analyze_global_profitability', description: 'Calcula el EBITDA, margen real y salud financiera cruzando ventas, gastos y proyectos', category: 'finance' },
    { name: 'audit_expense_integrity', description: 'Verifica si los gastos registrados coinciden con los hashes de seguridad y detecta anomalías', category: 'finance' },
    { name: 'project_financial_forecast', description: 'Predice el flujo de caja (Cash Flow) basado en el pipeline de ventas y gastos fijos', category: 'finance' },
    { name: 'tax_prospector', description: 'Proyección fiscal regional (MX, ES, US-LLC)', category: 'finance' },
    // ERP Producción (MRP)
    { name: 'calculate_production_cost', description: 'Calcula el costo proyectado de fabricación (BoM + Mano de Obra)', category: 'production' },
    { name: 'verify_waste_integrity', description: 'Auditoría visual de mermas e integridad de planta vía Gemma Vision', category: 'production' },
    // ERP Calidad (QC)
    { name: 'detect_quality_anomalies', description: 'Analizar anomalías de calidad cruzando materiales y proveedores', category: 'quality' },
    { name: 'register_qc_inspection', description: 'Registrar inspección con firma criptográfica SHA-256', category: 'quality' },
    // ERP RRHH (HRM)
    { name: 'talent_retention_risk', description: 'Analizar riesgo de rotación cruzando carga de proyectos y compromiso', category: 'hr' },
    { name: 'get_employee_confidential_data', description: 'Acceso auditado a datos cifrados de nómina en The Vault 2.0', category: 'hr' },
    { name: 'get_hr_daily_brief', description: 'Resumen ejecutivo narrativo (Briefing Militar) del estado de RRHH', category: 'hr' },
    { name: 'authorize_bulk_expenses', description: 'Autorización masiva con validación GPS VISION-LOCK', category: 'hr' },
    { name: 'approve_vacation_voice', description: 'Aprobar vacaciones con nota personalizada vía voz', category: 'hr' },
    { name: 'orchestrate_asset_transfer', description: 'Gestionar traspaso o devolución de activos críticos de personal', category: 'hr' },
    { name: 'mcp_access_watchdog', description: 'Watchdog de seguridad: detecta silos de conocimiento y concentración de poder digital', category: 'hr' },
    { name: 'generate_offboarding_security_kit', description: 'Generar roadmap de revocación de accesos (Kill-Switch) ante una baja', category: 'hr' },
    { name: 'confirm_digital_seal', description: 'Autorizar y sellar digitalmente actas de entrega o vacaciones vía voz', category: 'hr' },
    { name: 'access_security_audit', description: 'Auditoría de seguridad digital: detecta silos de conocimiento y riesgos de acceso', category: 'hr' },
    
    // Agentic Skills
    { name: 'audit_finance_integrity', description: 'Auditoría forense automatizada: verifica brechas en Veri*factu y dispara el Protocolo de Desconfianza', category: 'advanced' },
    { name: 'orchestrate_secure_payroll', description: 'Orquestación de nómina cruzando Vault y Veri*factu. Requiere rol OWNER.', category: 'advanced' },
    { name: 'get_field_activity', description: 'Localiza técnicos y activos en campo mediante VISION-LOCK', category: 'advanced' },
    { name: 'audit_material_leaks', description: 'Detecta desviaciones y mermas industriales cruzando stock y producción', category: 'advanced' },
    
    // Real Estate
    { name: 'generate_property_description', description: 'Generar descripción comercial atractiva para una propiedad usando IA', category: 'real_estate' },
    { name: 'suggest_price_based_on_market', description: 'Sugerir precio de venta/alquiler basado en propiedades similares en la misma zona', category: 'real_estate' },
    { name: 'calculate_property_quality_score', description: 'Calcular score de calidad (0-100) basado en completitud de datos e imágenes', category: 'real_estate' },
    { name: 'search_properties_by_filters', description: 'Buscar propiedades por filtros en lenguaje natural (para chatbot)', category: 'real_estate' },
    { name: 'recommend_properties', description: 'Recomendar propiedades basado en preferencias del usuario', category: 'real_estate' },

    // ERP Logística
    { name: 'get_shipment_status', description: 'Consultar estado de un envío por tracking o referencia', category: 'logistics' },
    { name: 'check_fleet_health', description: 'Analizar estado de la flota, mantenimientos pendientes e ITVs próximas a vencer', category: 'logistics' },
    { name: 'optimize_route', description: 'Optimizar ruta de reparto basada en pedidos pendientes y destinos', category: 'logistics' },
    { name: 'suggest_warehouse_reorg', description: 'Sugerir reorganización de almacén basada en rotación de productos', category: 'logistics' },
    { name: 'track_order', description: 'Tracking público de pedido para cliente con timeline de eventos', category: 'logistics' },

    // Marketing Hub
    { name: 'generate_marketing_copy', description: 'Generar copy publicitario o social con IA', category: 'marketing' },
    { name: 'analyze_marketing_sentiment', description: 'Analizar sentimiento de feedback social', category: 'marketing' },
    { name: 'suggest_campaign_optimization', description: 'Sugerencias de optimización basadas en datos', category: 'marketing' },
    { name: 'generate_web_creator_block', description: 'Generar bloques HTML para Web Creator con IA', category: 'marketing' },
    { name: 'generate_seo_metadata', description: 'Generar metadatos SEO con IA', category: 'marketing' },
    { name: 'advise_on_automation_rules', description: 'Analizar tenant y sugerir reglas de automatización', category: 'marketing' },

    // ADS Skills
    { name: 'create_ad_schedule', description: 'Crear programación horaria para campaña', category: 'marketing' },
    { name: 'list_ad_schedules', description: 'Listar programaciones de campañas', category: 'marketing' },
    { name: 'toggle_ad_schedule', description: 'Activar o desactivar una programación', category: 'marketing' },
    { name: 'delete_ad_schedule', description: 'Eliminar una programación', category: 'marketing' },
    { name: 'create_ab_test', description: 'Crear un test A/B para campaña publicitaria', category: 'marketing' },
    { name: 'start_ab_test', description: 'Iniciar un test A/B', category: 'marketing' },
    { name: 'calculate_ab_test_significance', description: 'Calcular significancia estadística de un test A/B', category: 'marketing' },
    { name: 'declare_ab_test_winner', description: 'Declarar ganador de un test A/B', category: 'marketing' },
  ];
}

// ============== RE-EXPORTS ==============

// Event Bus
export { eventBus, EVENTS };

// Tipos
export * from '@/lib/types/events';

// Skills individuales (para importación directa si se necesita)
export { createContact, updateContact, createLead, convertLead, listContacts, listLeads } from './contact-skills';
export { createConversation, sendMessage, closeConversation } from './conversation-skills';
export { createTask, completeTask, createNote } from './task-skills';
export { completeDiagnosis } from './diagnosis-skills';
export { createBooking, confirmBooking, cancelBooking } from './booking-skills';
export { createDeal, updateDeal, getDeal, listDeals } from './deal-skills';
export { exportCatalog, getFieldDefinitions, getCatalogItem, searchCatalog, buscarCatalogo } from './catalog-skills';

// ============== COMPONENTES DE MADUREZ ==============

// Skill Context
export {
  SkillContext,
  createContextFromSession,
  createContextFromApiKey,
  createContextFromMCP,
  createContextFromWebhook,
  createContextFromAutomation,
  createSystemContext,
  runWithContext,
  getCurrentContext,
  requireContext,
} from './context';
export type { SkillContextData, SkillSource, PermissionLevel, SkillPermissions } from './context';

// Event Metadata
export {
  EventBuilder,
  createEvent,
  createSimpleEvent,
  createDerivedEvent,
  generateIdempotencyKey,
  extractMetadataForLog,
} from './event-metadata';
export type { EventMetadata, EnrichedEvent } from './event-metadata';

// Idempotency
export {
  default as idempotencyService,
  withIdempotency,
  skillIdempotencyKey,
  automationIdempotencyKey,
} from './idempotency';
export type { IdempotencyRecord, IdempotencyOptions } from './idempotency';

// Observability
export {
  skillsLogger,
  automationLogger,
  eventBusLogger,
  mcpLogger,
  webhookLogger,
  metrics,
  spans,
  createLogger,
  trackSkillExecution,
  trackAutomationExecution,
  trackEvent,
  getHealthStatus,
} from './observability';
export type { StructuredLog, MetricPoint, SpanInfo, HealthStatus, LogLevel } from './observability';

// Notification Layer
export {
  notificationService,
  notifyByEmail,
  notifyByWhatsApp,
  notifyUser,
  notifyLead,
} from './notification-layer';
export type {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationRecipient,
  NotificationContent,
  NotificationOptions,
  NotificationResult,
} from './notification-layer';
