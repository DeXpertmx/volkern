/**
 * Herramientas nativas del agente CRM.
 *
 * Viven aquí —y no en el agente— porque el registro de herramientas
 * (`tool-registry.ts`) las compone junto al catálogo MCP y las skills: el
 * agente sólo consume el registro.
 *
 * Son las operaciones que no tenían un contrato MCP propio y que el chat
 * resuelve con la búsqueda de personas del CRM como paso previo.
 */

import { prisma } from '@/lib/db';
import type { OpenRouterTool } from '@/lib/assistant/openrouter-client';

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
      name: 'buscar_propiedades',
      description:
        'Busca inmuebles del catálogo por operación, tipo, zona, habitaciones, precio máximo y terraza. Si el usuario afina una búsqueda anterior ("que tengan terraza", "y más baratas", "sólo en el centro"), vuelve a llamarla con TODOS los criterios de antes más el nuevo: el filtro se acumula, no se reinicia.',
      parameters: {
        type: 'object',
        properties: {
          operacion: { type: 'string', enum: ['venta', 'alquiler'], description: 'Tipo de operación' },
          tipo: {
            type: 'string',
            enum: ['casa', 'departamento', 'oficina', 'local', 'terreno'],
            description: 'Tipo de inmueble',
          },
          zona: { type: 'string', description: 'Ciudad, barrio o colonia' },
          habitaciones: { type: 'integer', description: 'Mínimo de habitaciones' },
          precioMax: { type: 'number', description: 'Precio máximo' },
          terraza: { type: 'boolean', description: 'Sólo inmuebles con terraza' },
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

/** Ejecuta una herramienta nativa con el contexto del tenant y el usuario. */
export async function ejecutarHerramientaCrm(
  nombre: string,
  args: Record<string, any>,
  ctx: { tenantId: string; userId: string }
): Promise<any> {
  const { skills } = await import('@/lib/skills');
  const { tenantId, userId } = ctx;

  switch (nombre) {
    case 'buscar_persona':
      return buscarPersona(tenantId, args.nombre, args.email);

    case 'buscar_propiedades': {
      // Se reutiliza la búsqueda natural del catálogo inmobiliario (la misma que
      // usa el chatbot del portal) y se afina el resultado en memoria.
      const { searchPropertiesByNaturalFilters } = await import('@/lib/skills/real-estate-skills');
      const { properties } = await searchPropertiesByNaturalFilters({
        tenantId,
        tipo_operacion: args.operacion,
        tipo_inmueble: args.tipo,
        zona: args.zona,
        habitaciones: args.habitaciones,
        precio_max: args.precioMax,
        limit: 50,
      });
      const inmuebles = (args.terraza === true
        ? properties.filter((p: any) => p.hasTerrace)
        : properties
      )
        .slice(0, 5)
        .map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          precio: p.precioBase,
          zona: p.city,
          habitaciones: p.bedrooms,
          terraza: p.hasTerrace,
        }));
      return { propiedades: inmuebles };
    }

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
