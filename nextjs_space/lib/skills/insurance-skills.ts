/**
 * Insurance Skills
 *
 * Skills del módulo de seguros (vertical Insurance): pólizas, renovaciones,
 * aseguradoras, productos y cartera IA.
 *
 * Usan prisma directo (mismo patrón que real-estate-skills.ts y el resto de
 * skills de Volkern). Los ids de aseguradora/producto se resuelven por nombre
 * para que la IA pueda operar con lenguaje natural.
 */

import { prisma } from '@/lib/db';
import { monedaEscritura } from '@/lib/moneda';
import { convertLead } from './contact-skills';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseFecha(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function normalizarNumero(value?: string | number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return isNaN(value) ? undefined : value;
  // Formato europeo: "1.500,50 €" → 1500.50. Normalizar separadores locales.
  let s = String(value).trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',')) {
    // Si hay coma, es el separador decimal (ej: 1.500,50).
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    // Múltiples puntos → separador de miles (ej: 1.500.000)
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

/**
 * Resuelve el userId que crea el registro. El motor inyecta userId, pero si
 * no llega, se usa el primer usuario del tenant (evita FKs rotas con 'system').
 */
async function resolveCreator(tenantId: string, userId?: string): Promise<string> {
  if (userId) return userId;
  const first = await prisma.user.findFirst({ where: { tenantId }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (first) return first.id;
  throw new Error('No se pudo identificar el usuario que crea la póliza.');
}

async function findCliente(tenantId: string, input: { cliente?: string; nombre?: string; email?: string }): Promise<{ id: string; nombre: string; email: string | null } | null> {
  // El email puede llegar en `email` o dentro de `cliente`/`nombre`
  // (el clasificador a veces mapea "juan@mail.com" a cliente en vez de email).
  const rawCliente = (input.cliente || input.nombre || '').trim();
  const esEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawCliente);
  const email = (input.email?.trim() || (esEmail ? rawCliente : '')).trim();

  if (email) {
    const byEmail = await prisma.contact.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' }, tipo: { not: 'company' } } });
    if (byEmail) return { id: byEmail.id, nombre: byEmail.nombre, email: byEmail.email };
    const lead = await prisma.lead.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } } });
    if (lead) {
      // Idempotencia: si el lead ya fue convertido, resolver el contacto existente
      if (lead.estado === 'convertido' && lead.convertedToContactId) {
        const yaConvertido = await prisma.contact.findFirst({ where: { id: lead.convertedToContactId, tenantId } });
        if (yaConvertido) return { id: yaConvertido.id, nombre: yaConvertido.nombre, email: yaConvertido.email };
      }
      // Reutilizar la conversión canónica del CRM (evita duplicados y mantiene convenciones)
      // convertLead devuelve { lead, contact, deal } y reusa un contacto existente por email.
      const convertido = await convertLead({ leadId: lead.id, tenantId });
      return { id: convertido.contact.id, nombre: convertido.contact.nombre, email: convertido.contact.email };
    }
  }

  const nombre = esEmail ? '' : rawCliente;
  if (nombre) {
    const byName = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' }, tipo: { not: 'company' } } });
    if (byName) return { id: byName.id, nombre: byName.nombre, email: byName.email };
  }
  return null;
}

async function findAseguradora(tenantId: string, nombre?: string): Promise<{ id: string; nombre: string } | null> {
  if (!nombre) return null;
  const ase = await prisma.aseguradora.findFirst({ where: { tenantId, nombre: { contains: nombre.trim(), mode: 'insensitive' } } });
  return ase ? { id: ase.id, nombre: ase.nombre } : null;
}

async function findProducto(tenantId: string, aseguradoraId: string | undefined, input: { producto?: string; ramo?: string }): Promise<{ id: string; nombre: string; ramo: string } | null> {
  const nombre = input.producto?.trim();
  const ramo = input.ramo?.trim().toUpperCase();

  if (nombre) {
    const prod = await prisma.productoSeguro.findFirst({
      where: { tenantId, ...(aseguradoraId ? { aseguradoraId } : {}), nombre: { contains: nombre, mode: 'insensitive' } },
    });
    if (prod) return { id: prod.id, nombre: prod.nombre, ramo: prod.ramo };
  }
  if (ramo) {
    const prod = await prisma.productoSeguro.findFirst({ where: { tenantId, ...(aseguradoraId ? { aseguradoraId } : {}), ramo: ramo as any } });
    if (prod) return { id: prod.id, nombre: prod.nombre, ramo: prod.ramo };
  }
  return null;
}

// ─── 1. Crear póliza ────────────────────────────────────────────────────────

export async function create_poliza(input: {
  tenantId: string;
  numeroPoliza: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  cliente?: string;
  nombre?: string;
  email?: string;
  aseguradora?: string;
  producto?: string;
  ramo?: string;
  primaAnual?: string | number;
  sumaAsegurada?: string | number;
  formaPago?: string;
  moneda?: string;
  notas?: string;
  userId?: string;
}) {
  const { tenantId, numeroPoliza } = input;

  if (!numeroPoliza || !numeroPoliza.trim()) {
    throw new Error('El número de póliza es requerido');
  }

  const fechaInicio = parseFecha(input.fechaInicio) || new Date();
  const fechaVencimiento = parseFecha(input.fechaVencimiento);
  if (!fechaVencimiento) {
    throw new Error('La fecha de vencimiento es requerida (ej: "2026-12-31")');
  }

  // Cliente
  const cliente = await findCliente(tenantId, input);
  if (!cliente) {
    throw new Error(
      `No encontré el cliente${input.email ? ` con email ${input.email}` : ''}${input.nombre ? ` con nombre "${input.nombre}"` : ''}. ` +
      `Proporciona el nombre o email del cliente asegurado.`
    );
  }

  // Aseguradora: requerida (evita crear pólizas bajo "Otros" sin querer)
  const aseguradora = await findAseguradora(tenantId, input.aseguradora);
  if (!aseguradora) {
    throw new Error(`No encontré la aseguradora "${input.aseguradora || ''}". Indica una aseguradora válida (ej: AXA, MAPFRE, Qualitas) o regístrala primero.`);
  }

  // Producto (opcional pero recomendado)
  const producto = await findProducto(tenantId, aseguradora?.id, input);

  // Idempotencia por número
  const existing = await prisma.poliza.findFirst({ where: { tenantId, numeroPoliza: numeroPoliza.trim() } });
  if (existing) {
    throw new Error(`Ya existe una póliza con el número ${numeroPoliza}`);
  }

  const formaPagoValida = ['ANUAL', 'SEMESTRAL', 'TRIMESTRAL', 'MENSUAL'] as const;
  const formaPagoRaw = input.formaPago?.trim().toUpperCase();
  const formaPago = formaPagoRaw && (formaPagoValida as readonly string[]).includes(formaPagoRaw) ? formaPagoRaw as any : undefined;

  // Producto: si no llega, buscar por ramo o crear un genérico bajo esa aseguradora
  const productoFinal = producto || (await ensureProducto(tenantId, aseguradora.id));
  if (!productoFinal?.id) {
    throw new Error('No fue posible resolver el producto del seguro.');
  }

  const poliza = await prisma.poliza.create({
    data: {
      tenantId,
      numeroPoliza: numeroPoliza.trim(),
      clienteId: cliente.id,
      aseguradoraId: aseguradora.id,
      productoSeguroId: productoFinal.id,
      fechaInicio,
      fechaVencimiento,
      primaAnual: normalizarNumero(input.primaAnual),
      sumaAsegurada: normalizarNumero(input.sumaAsegurada),
      formaPago,
      // Divisa de la póliza: la que pida quien la crea y, si no, la de reporte
      // del tenant —la que ese broker usa de verdad—. Antes caía a un literal
      // fijo, así que una correduría mexicana que no dijera la divisa guardaba
      // la póliza en euros.
      moneda: monedaEscritura(input.moneda?.toUpperCase(), await monedaDelTenant(tenantId)),
      notas: input.notas,
      createdById: await resolveCreator(tenantId, input.userId),
      estado: 'ACTIVA',
    },
    include: {
      cliente: { select: { id: true, nombre: true, email: true } },
      aseguradora: { select: { id: true, nombre: true } },
      productoSeguro: { select: { id: true, nombre: true, ramo: true } },
    },
  });

  return { poliza, message: `Póliza ${poliza.numeroPoliza} creada para ${cliente.nombre}` };
}

/**
 * Moneda de reporte del tenant: la divisa con la que se escriben sus registros
 * cuando quien los crea no indica otra.
 */
async function monedaDelTenant(tenantId: string): Promise<string | undefined> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { moneda: true },
  });
  return tenant?.moneda ?? undefined;
}

// Helpers de respaldo: crean aseguradora/producto por defecto si la IA no los especifica
async function ensureAseguradora(tenantId: string, nombre?: string): Promise<{ id: string } | null> {
  if (nombre) {
    const existing = await findAseguradora(tenantId, nombre);
    if (existing) return existing;
    const created = await prisma.aseguradora.create({ data: { tenantId, nombre: nombre.trim() } });
    return { id: created.id };
  }
  const def = await prisma.aseguradora.findFirst({ where: { tenantId, nombre: 'Otros' } });
  if (def) return { id: def.id };
  const created = await prisma.aseguradora.create({ data: { tenantId, nombre: 'Otros' } });
  return { id: created.id };
}

async function ensureProducto(tenantId: string, aseguradoraId?: string): Promise<{ id: string } | null> {
  const ase = aseguradoraId || (await ensureAseguradora(tenantId, undefined))?.id;
  if (!ase) return null;
  const existing = await prisma.productoSeguro.findFirst({ where: { tenantId, aseguradoraId: ase } });
  if (existing) return { id: existing.id };
  const created = await prisma.productoSeguro.create({
    data: { tenantId, aseguradoraId: ase, nombre: 'Seguro General', ramo: 'OTROS' },
  });
  return { id: created.id };
}

// ─── 2. Listar pólizas ──────────────────────────────────────────────────────

export async function list_polizas(input: {
  tenantId: string;
  estado?: string;
  cliente?: string;
  nombre?: string;
  email?: string;
  ramo?: string;
  aseguradora?: string;
  page?: number;
  limit?: number;
}) {
  const { tenantId } = input;
  const page = Math.max(1, input.page || 1);
  const limit = Math.min(100, Math.max(1, input.limit || 20));

  const where: any = { tenantId };
  if (input.estado) where.estado = input.estado.toUpperCase();
  if (input.ramo) {
    where.productoSeguro = { ramo: input.ramo.toUpperCase() as any };
  }
  if (input.aseguradora) {
    where.aseguradora = { nombre: { contains: input.aseguradora, mode: 'insensitive' } };
  }
  const clienteName = (input.cliente || input.nombre)?.trim();
  if (input.email) {
    where.cliente = { email: { equals: input.email, mode: 'insensitive' } };
  } else if (clienteName) {
    where.cliente = { nombre: { contains: clienteName, mode: 'insensitive' } };
  }

  const [polizas, total] = await Promise.all([
    prisma.poliza.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, email: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.poliza.count({ where }),
  ]);

  return { polizas, total, page, totalPages: Math.ceil(total / limit) };
}

// ─── 3. Pólizas por vencer ──────────────────────────────────────────────────

export async function polizas_por_vencer(input: { tenantId: string; dias?: number; limit?: number }) {
  const { tenantId } = input;
  const dias = Math.max(1, Math.min(365, input.dias || 30));
  const limit = Math.min(100, Math.max(1, input.limit || 20));
  const hoy = new Date();
  const limite = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);

  const polizas = await prisma.poliza.findMany({
    where: {
      tenantId,
      estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] },
      fechaVencimiento: { gte: hoy, lte: limite },
    },
    include: {
      cliente: { select: { id: true, nombre: true, email: true } },
      aseguradora: { select: { id: true, nombre: true } },
      productoSeguro: { select: { id: true, nombre: true, ramo: true } },
    },
    orderBy: { fechaVencimiento: 'asc' },
    take: limit,
  });

  return { polizas, dias, total: polizas.length };
}

// ─── 4. Renovaciones pendientes ─────────────────────────────────────────────

export async function renovaciones_pendientes(input: { tenantId: string; estado?: string; riesgo?: boolean; limit?: number }) {
  const { tenantId } = input;
  const limit = Math.min(100, Math.max(1, input.limit || 20));

  const estadosActivos = ['PENDIENTE', 'CONTACTO_INICIAL', 'REVISION', 'OFERTA_ENVIADA'] as const;
  const estado = input.estado?.toUpperCase();
  const estadoValido = estado && (estadosActivos as readonly string[]).includes(estado) ? estado as any : undefined;

  const where: any = {
    tenantId,
    ...(estadoValido ? { estado: estadoValido } : { estado: { in: [...estadosActivos] as any } }),
    ...(input.riesgo !== undefined ? { riesgoPerdida: input.riesgo } : {}),
  };

  const renovaciones = await prisma.renovacion.findMany({
    where,
    include: {
      poliza: {
        select: {
          id: true,
          numeroPoliza: true,
          cliente: { select: { id: true, nombre: true, email: true } },
          aseguradora: { select: { id: true, nombre: true } },
          productoSeguro: { select: { id: true, nombre: true, ramo: true } },
          fechaVencimiento: true,
        },
      },
    },
    orderBy: { periodoFin: 'asc' },
    take: limit,
  });

  return { renovaciones, total: renovaciones.length };
}

// ─── 5. Clientes sin contacto ───────────────────────────────────────────────

export async function clientes_sin_contacto(input: { tenantId: string; dias?: number; limit?: number }) {
  const { tenantId } = input;
  const dias = Math.max(1, Math.min(1825, input.dias || 180)); // default 6 meses
  const limit = Math.min(100, Math.max(1, input.limit || 20));
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  // Contactos con al menos una póliza activa y sin interacciones recientes.
  // { none: { fechaCreacion: { gte: corte } } } ya incluye clientes con 0 interacciones.
  const clientes = await prisma.contact.findMany({
    where: {
      tenantId,
      tipo: { not: 'company' },
      polizasSeguro: { some: { estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } } },
      Interaction: { none: { fechaCreacion: { gte: corte } } },
    },
    include: {
      polizasSeguro: {
        where: { estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } },
        select: {
          id: true,
          numeroPoliza: true,
          aseguradora: { select: { nombre: true } },
          productoSeguro: { select: { nombre: true, ramo: true } },
          fechaVencimiento: true,
        },
        take: 3,
      },
      _count: { select: { Interaction: { where: { fechaCreacion: { gte: corte } } } } },
    },
    orderBy: { fechaActualizacion: 'asc' },
    take: limit,
  });

  return { clientes, dias, total: clientes.length };
}
