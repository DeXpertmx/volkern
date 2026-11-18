/**
 * Agente de CRM con herramientas (tool calling)
 *
 * El clasificador por intents resuelve bien una acción por mensaje, pero un
 * comercial escribe cosas como «Iris no pudo ver el demo, quedó de verlo, hoy
 * tiene dos CRM, prepara un email para el jueves de la siguiente semana»: son
 * varias acciones descritas en lenguaje libre. En vez de añadir una regla por
 * frase, aquí el LLM elige y ejecuta las herramientas del CRM, y devuelve el
 * resumen de lo que realmente quedó guardado.
 */

import { prisma } from '@/lib/db';
import {
  callAssistantWithToolLoop,
  type OpenRouterMessage,
  type OpenRouterTool,
} from '@/lib/assistant/openrouter-client';

export interface AgenteCrmInput {
  message: string;
  tenantId: string;
  userId: string;
  /** Presupuesto total de la conversación con herramientas (ms). */
  timeoutMs?: number;
}

export interface AgenteCrmResultado {
  /** Texto para el chat (vacío si no se ejecutó ninguna herramienta). */
  texto: string;
  /** Nombres de las herramientas ejecutadas, en orden. */
  herramientas: string[];
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Fechas de referencia (hoy + 21 días) para que el modelo no improvise fechas. */
function calendarioDeReferencia(timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const hoyIso = fmt.format(new Date());
  const [y, m, d] = hoyIso.split('-').map(Number);

  const lineas: string[] = [];
  for (let i = 0; i < 22; i++) {
    const fecha = new Date(Date.UTC(y, m - 1, d + i));
    const iso = fecha.toISOString().slice(0, 10);
    const nombre = `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;
    lineas.push(`${iso} — ${nombre}${i === 0 ? ' (HOY)' : ''}`);
  }
  return lineas.join('\n');
}

/** Herramientas expuestas al modelo. */
export const HERRAMIENTAS: OpenRouterTool[] = [
  {
    type: 'function',
    function: {
      name: 'buscar_persona',
      description:
        'Busca un lead o contacto del CRM por nombre o correo y devuelve sus datos, tareas pendientes e interacciones recientes. Úsala antes de registrar cualquier cambio para confirmar de quién se habla.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre completo o parcial de la persona' },
          email: { type: 'string', description: 'Correo electrónico, si se conoce' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_lead',
      description:
        'Da de alta una ficha nueva de lead en el CRM. Úsala sólo cuando buscar_persona no encuentre a nadie (ni por nombre ni por correo). El nombre es obligatorio; el correo es opcional pero conviene pedirlo. No inventes el email: si no lo sabes, omítelo.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre completo de la persona' },
          email: { type: 'string', description: 'Correo electrónico, sólo si se conoce' },
          telefono: { type: 'string', description: 'Teléfono, si se conoce' },
          empresa: { type: 'string', description: 'Empresa donde trabaja' },
          cargo: { type: 'string', description: 'Puesto o cargo' },
          direccion: { type: 'string', description: 'Dirección postal' },
          fuente: { type: 'string', description: 'Origen del contacto (web, referido, feria, chat…)' },
          notas: { type: 'string', description: 'Contexto de negocio inicial para la ficha' },
        },
        required: ['nombre'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_interaccion',
      description:
        'Registra una interacción ya ocurrida con la persona (llamada, whatsapp, email, reunión, nota interna). No envía nada: sólo deja constancia en el historial.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre o correo de la persona' },
          tipo: {
            type: 'string',
            enum: ['llamada', 'email', 'whatsapp', 'reunion', 'nota_interna'],
            description: 'Canal por el que ocurrió',
          },
          contenido: { type: 'string', description: 'Qué pasó, en una o dos frases claras' },
          resultado: { type: 'string', description: 'Resultado breve, si aplica (ej. "sin respuesta", "pidió propuesta")' },
        },
        required: ['nombre', 'tipo', 'contenido'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_nota',
      description:
        'Añade una nota interna a la ficha de la persona. Úsala para contexto de negocio (qué necesita, qué herramientas usa, objeciones), no para acciones futuras.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre o correo de la persona' },
          contenido: { type: 'string', description: 'Texto de la nota' },
        },
        required: ['nombre', 'contenido'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description:
        'Crea una tarea pendiente para la persona (llamada, email, reunión, seguimiento, recordatorio). Usa fechaVencimiento en formato YYYY-MM-DD.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre o correo de la persona' },
          titulo: { type: 'string', description: 'Título corto y accionable de la tarea' },
          tipo: {
            type: 'string',
            enum: ['llamada', 'email', 'reunion', 'seguimiento', 'otro'],
            description: 'Tipo de tarea',
          },
          descripcion: { type: 'string', description: 'Detalle de qué hay que hacer' },
          fechaVencimiento: { type: 'string', description: 'Fecha límite en formato YYYY-MM-DD' },
        },
        required: ['nombre', 'titulo', 'fechaVencimiento'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'completar_tarea',
      description: 'Marca como completada una tarea pendiente de la persona.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre o correo de la persona' },
          titulo: { type: 'string', description: 'Título (o parte del título) de la tarea a completar' },
        },
        required: ['nombre', 'titulo'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reprogramar_tarea',
      description: 'Cambia la fecha de vencimiento de una tarea pendiente. Usa YYYY-MM-DD.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre o correo de la persona' },
          titulo: { type: 'string', description: 'Título (o parte del título) de la tarea' },
          fecha: { type: 'string', description: 'Nueva fecha en formato YYYY-MM-DD' },
        },
        required: ['nombre', 'titulo', 'fecha'],
        additionalProperties: false,
      },
    },
  },
];

/** Normaliza para comparar nombres sin acentos ni mayúsculas. */
function normalizar(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Búsqueda de personas con contexto útil para el modelo. */
async function buscarPersona(tenantId: string, nombre?: string, email?: string) {
  if (email) {
    const lead = await prisma.lead.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, nombre: true, email: true, telefono: true, empresa: true, estado: true },
    });
    if (lead) return { tipo: 'lead', persona: lead, tareas: await tareasDe(tenantId, lead.id) };

    const contacto = await prisma.contact.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
    if (contacto) return { tipo: 'contacto', persona: contacto, tareas: [] };
    return { encontrado: false };
  }

  if (!nombre) return { encontrado: false, motivo: 'Falta el nombre o el correo' };

  const leads = await prisma.lead.findMany({
    where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } },
    take: 5,
    select: { id: true, nombre: true, email: true, telefono: true, empresa: true, estado: true },
  });
  if (leads.length === 1) {
    return { tipo: 'lead', persona: leads[0], tareas: await tareasDe(tenantId, leads[0].id) };
  }
  if (leads.length > 1) return { tipo: 'lead', candidatos: leads };

  const contactos = await prisma.contact.findMany({
    where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } },
    take: 5,
    select: { id: true, nombre: true, email: true, telefono: true },
  });
  if (contactos.length === 1) return { tipo: 'contacto', persona: contactos[0], tareas: [] };
  if (contactos.length > 1) return { tipo: 'contacto', candidatos: contactos };

  // Último intento: por palabras sueltas del nombre (acentos/mayúsculas aparte).
  const buscado = normalizar(nombre);
  const todos = await prisma.lead.findMany({
    where: { tenantId },
    take: 2000,
    select: { id: true, nombre: true, email: true, telefono: true, empresa: true, estado: true },
  });
  const coincidencias = todos.filter((l) =>
    normalizar(l.nombre)
      .split(/\s+/)
      .some((t) => t.length > 2 && buscado.includes(t))
  );
  if (coincidencias.length === 1) {
    return { tipo: 'lead', persona: coincidencias[0], tareas: await tareasDe(tenantId, coincidencias[0].id) };
  }
  if (coincidencias.length > 1) return { tipo: 'lead', candidatos: coincidencias.slice(0, 5) };

  return { encontrado: false };
}

async function tareasDe(tenantId: string, leadId: string) {
  return prisma.task.findMany({
    where: { tenantId, leadId, completada: false },
    orderBy: { fechaVencimiento: 'asc' },
    take: 5,
    select: { id: true, titulo: true, tipo: true, fechaVencimiento: true },
  });
}

/** Ejecuta una herramienta con el contexto del tenant y el usuario. */
async function ejecutarHerramienta(
  nombre: string,
  args: Record<string, any>,
  ctx: { tenantId: string; userId: string }
): Promise<any> {
  const { skills } = await import('@/lib/skills');
  const { tenantId, userId } = ctx;

  switch (nombre) {
    case 'buscar_persona':
      return buscarPersona(tenantId, args.nombre, args.email);

    case 'crear_lead': {
      const nombre = String(args.nombre || '').trim();
      const email = String(args.email || '').trim();
      if (!nombre) throw new Error('Falta el nombre del lead');

      // Evita duplicados aunque el modelo no haya buscado antes: mismo correo,
      // o mismo nombre exacto cuando no hay correo con el que comparar.
      const existente = email
        ? await prisma.lead.findFirst({
            where: { tenantId, email: { equals: email, mode: 'insensitive' } },
            select: { id: true, nombre: true, email: true },
          })
        : await prisma.lead.findFirst({
            where: { tenantId, nombre: { equals: nombre, mode: 'insensitive' } },
            select: { id: true, nombre: true, email: true },
          });
      if (existente) {
        return { ok: true, yaExistia: true, id: existente.id, nombre: existente.nombre, email: existente.email };
      }

      const lead = await (skills as any).create_lead({
        tenantId,
        userId,
        nombre,
        email: email || undefined,
        telefono: args.telefono,
        empresa: args.empresa,
        cargo: args.cargo,
        direccion: args.direccion,
        fuente: args.fuente || 'chat',
        notas: args.notas,
      });
      return {
        ok: true,
        id: lead.id,
        nombre: lead.nombre,
        email: lead.email,
        // Sin correo, la skill guarda uno de respaldo: hay que avisarlo.
        emailReal: Boolean(email),
      };
    }

    case 'registrar_interaccion': {
      const { createInteraction } = await import('@/lib/skills/interaction-skills');
      const persona: any = await buscarPersona(tenantId, args.nombre, args.email);
      const leadId = persona?.tipo === 'lead' ? persona.persona?.id : undefined;
      const contactId = persona?.tipo === 'contacto' ? persona.persona?.id : undefined;
      if (!leadId && !contactId) throw new Error(`No encontré a "${args.nombre}" en el CRM`);
      const interaccion = await createInteraction({
        tenantId,
        leadId,
        contactId,
        tipo: args.tipo || 'nota_interna',
        contenido: args.contenido,
        resultado: args.resultado,
        userId,
        source: 'app',
      });
      return { ok: true, id: interaccion.id, tipo: interaccion.tipo };
    }

    case 'crear_nota': {
      const persona: any = await buscarPersona(tenantId, args.nombre, args.email);
      if (persona?.tipo !== 'lead') throw new Error(`No encontré una ficha de lead para "${args.nombre}"`);
      const nota = await (skills as any).create_note({
        tenantId,
        leadId: persona.persona.id,
        contenido: args.contenido,
        userId,
      });
      return { ok: true, id: nota.id };
    }

    case 'crear_tarea': {
      const tarea = await (skills as any).create_task({
        tenantId,
        nombre: args.nombre,
        titulo: args.titulo,
        tipo: args.tipo || 'seguimiento',
        descripcion: args.descripcion,
        fechaVencimiento: args.fechaVencimiento,
        userId,
      });
      return { ok: true, id: tarea.id, titulo: tarea.titulo, fecha: tarea.fechaVencimiento };
    }

    case 'completar_tarea': {
      const tarea = await (skills as any).complete_task({
        tenantId,
        nombre: args.nombre,
        titulo: args.titulo,
        userId,
      });
      return { ok: true, id: tarea.id, titulo: tarea.titulo };
    }

    case 'reprogramar_tarea': {
      const tarea = await (skills as any).reschedule_task({
        tenantId,
        nombre: args.nombre,
        titulo: args.titulo,
        fecha: args.fecha,
        userId,
      });
      return { ok: true, id: tarea.id, fecha: tarea.fechaVencimiento };
    }

    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

/**
 * Ejecuta el agente con herramientas. Sólo devuelve texto si el modelo llegó a
 * ejecutar alguna: si no, el orquestador sigue su camino normal.
 */
export async function ejecutarAgenteCrm(input: AgenteCrmInput): Promise<AgenteCrmResultado> {
  const { message, tenantId, userId } = input;

  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, name: true } });
  const timezone = usuario?.timezone || 'America/Mexico_City';

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: construirSistema(timezone) },
    { role: 'user', content: message },
  ];

  const ejecutadas: string[] = [];
  // Cinco vueltas como máximo: buscar a la persona (o darla de alta si no
  // existe), registrar lo ocurrido, dejar la nota y crear la tarea pendiente.
  // El presupuesto total acota la espera del chat aunque el modelo encadene
  // llamadas.
  const respuesta = await callAssistantWithToolLoop(messages, HERRAMIENTAS, async (nombre, args) => {
    try {
      const resultado = await ejecutarHerramienta(nombre, args, { tenantId, userId });
      if (resultado?.ok !== false) ejecutadas.push(nombre);
      const serializado = JSON.stringify(resultado ?? { ok: true }).slice(0, 2000);
      console.log(`[AgenteCRM] ${nombre}(${JSON.stringify(args).slice(0, 160)}) → ${serializado.slice(0, 200)}`);
      return serializado;
    } catch (error: any) {
      console.warn(`[AgenteCRM] ${nombre} falló:`, error?.message || error);
      return JSON.stringify({ ok: false, error: error?.message || 'Error ejecutando la herramienta' });
    }
  }, 5, input.timeoutMs ?? 20000);

  const texto = respuesta?.choices?.[0]?.message?.content?.trim() || '';
  return {
    texto: ejecutadas.length > 0 ? texto : '',
    herramientas: ejecutadas,
  };
}

/** Prompt del sistema, con el calendario de referencia para las fechas. */
export function construirSistema(timezone: string, ahora = new Date()): string {
  return `Eres Gemma, la asistente de CRM de Volkern. Hoy es ${ahora.toLocaleDateString('es-MX', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })} (zona horaria ${timezone}).

Tu trabajo es convertir lo que cuenta el comercial en cambios reales del CRM usando las herramientas. Un mensaje puede pedir VARIAS acciones: ejecuta todas, en orden, y no pidas confirmación salvo que falte el nombre de la persona o haya ambigüedad real.

Reglas:
- Primero llama a buscar_persona para confirmar de quién se habla. Si devuelve varios candidatos, pregunta cuál es.
- Si buscar_persona no encuentra a nadie y hay que dejar constancia de una persona nueva (o el usuario pide darla de alta), usa crear_lead con los datos que haya dado: nombre, email, teléfono, empresa, cargo, dirección y origen. No inventes el correo: si no lo tiene, créala sin email y avísale de que la ficha quedó sin correo real. Si crear_lead devuelve yaExistia, no crees otra: sigue trabajando sobre esa ficha y dilo.
- Lo que YA ocurrió (una llamada, un WhatsApp enviado, que no pudo ver el demo, que tiene otras herramientas) se registra con registrar_interaccion; el contexto de negocio (por qué le interesa Volkern, qué usa hoy) con crear_nota.
- Lo que queda PENDIENTE se crea con crear_tarea (tipo llamada/email/reunion/seguimiento) y la fecha que pida el usuario.
- Si dice que una tarea ya está hecha, usa completar_tarea con el TÍTULO EXACTO que devolvió buscar_persona (no inventes ni copies a medias el título).
- Fechas: usa SIEMPRE las del calendario de referencia y el formato YYYY-MM-DD. "El jueves" es el próximo jueves; "el jueves de la siguiente semana" es el jueves de la semana que viene, no el de esta.
- No inventes datos, importes ni fechas que el usuario no haya dicho.
- No envíes correos ni mensajes reales: sólo registra en el CRM.
- Al terminar, responde en español con un resumen breve en viñetas de lo que quedó guardado (tarea completada, nota, interacción, tarea creada con su fecha). Si algo no se pudo hacer, dilo.

Calendario de referencia:
${calendarioDeReferencia(timezone)}`;
}
