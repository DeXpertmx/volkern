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

const findLeadByEmailWrapper = (input: { email: string; tenantId: string }) => 
  contactSkills.findLeadByEmail(input.email, input.tenantId);

const getConversationWrapper = (input: { conversationId: string; tenantId: string }) => 
  conversationSkills.getConversation(input.conversationId, input.tenantId);

const getTasksByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  taskSkills.getTasksByLead(input.leadId, input.tenantId);

const getPendingTasksWrapper = (input: { userId: string; tenantId: string }) => 
  taskSkills.getPendingTasksByUser(input.userId, input.tenantId);

const getNotesByLeadWrapper = (input: { leadId: string }) => 
  taskSkills.getNotesByLead(input.leadId);

const getDiagnosisByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  diagnosisSkills.getDiagnosisByLead(input.leadId, input.tenantId);

const getBookingsByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  bookingSkills.getBookingsByLead(input.leadId, input.tenantId);

const getUpcomingBookingsWrapper = (input: { tenantId: string; limit?: number; userId?: string; date?: string; timezone?: string }) => 
  bookingSkills.getUpcomingBookings(input.tenantId, input.limit, input.userId, input.date, input.timezone);

const getDealWrapper = (input: { dealId: string; tenantId: string }) =>
  dealSkills.getDeal(input.dealId, input.tenantId);

const listDealsWrapper = (input: { tenantId: string; etapa?: string; prioridad?: string; leadId?: string; contactId?: string; search?: string; page?: number; limit?: number }) =>
  dealSkills.listDeals(input.tenantId, input);

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

const createLeadWrapper = async (input: { tenantId: string; nombre: string; email: string; telefono?: string; notas?: string; contexto?: string; empresa?: string; origen?: string; fuente?: string }) => {
  const { contexto, notas, origen, ...rest } = input;
  return contactSkills.createLead({
    ...rest,
    fuente: origen || rest.fuente,
    notas: contexto || notas
  });
};

const createTaskWrapper = async (input: { 
  tenantId: string; 
  titulo: string; 
  email?: string; 
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
  const { tenantId, email, leadId, contactId, titulo, descripcion, fechaVencimiento, userId, asignadoAId, timezone, tipo } = input;
  
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

const registerInteractionWrapper = async (input: { tenantId: string; email?: string; nombre?: string; tipo: any; contenido: string; resultado?: string; userId?: string }) => {
  const { tenantId, email, nombre, tipo, contenido, resultado, userId } = input;
  
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


export const skills = {
  // Contactos
  create_contact: contactSkills.createContact,
  update_contact: contactSkills.updateContact,
  get_contact: contactSkills.getContact,
  find_contact_by_email: findContactByEmailWrapper,
  list_contacts: contactSkills.listContacts,
  
  // Leads
  create_lead: createLeadWrapper,
  update_lead: updateLeadWrapper,
  get_lead: contactSkills.getLead,
  find_lead_by_email: findLeadByEmailWrapper,
  convert_lead: contactSkills.convertLead,
  list_leads: contactSkills.listLeads,
  obtener_telefono: getPhoneByNameWrapper,
  registrar_interaccion: registerInteractionWrapper,
  
  // Facturación & Veri*factu
  create_invoice: billingSkills.create_invoice,
  rectify_invoice: billingSkills.rectify_invoice,
  cancel_invoice: billingSkills.cancel_invoice,
  get_invoice_fiscal_status: billingSkills.get_invoice_fiscal_status,
  
  // Conversaciones
  create_conversation: conversationSkills.createConversation,
  get_conversation: getConversationWrapper,
  get_or_create_conversation: conversationSkills.getOrCreateConversation,
  send_message: conversationSkills.sendMessage,
  close_conversation: conversationSkills.closeConversation,
  
  // Tareas
  create_task: createTaskWrapper,
  complete_task: taskSkills.completeTask,
  get_tasks_by_lead: getTasksByLeadWrapper,
  get_pending_tasks: getPendingTasksWrapper,
  
  // Notas
  create_note: taskSkills.createNote,
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
  create_deal: dealSkills.createDeal,
  update_deal: dealSkills.updateDeal,
  get_deal: getDealWrapper,
  list_deals: listDealsWrapper,
  prequalify_lead: dealSkills.prequalifyLead,
  
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
  create_supplier: financeSkills.createSupplier,
  create_expense: createExpenseWrapper,
  register_expense_vision: financeSkills.registerExpenseVision,
  analyze_burn_rate: financeSkills.analyzeBurnRate,
  
  // ERP Inventario
  adjust_stock: inventorySkills.adjustStock,
  get_inventory_health: inventorySkills.getInventoryHealth,
  process_inventory_consumption: inventorySkills.processInventoryConsumption,
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

  // ERP Logística
  get_shipment_status: logisticsSkills.getShipmentStatus,
  check_fleet_health: logisticsSkills.checkFleetHealth,
  optimize_route: logisticsSkills.optimizeRoute,
  suggest_warehouse_reorg: logisticsSkills.suggestWarehouseReorganization,
  track_order: logisticsSkills.trackOrder,

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
