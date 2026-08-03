/**
 * Siniestros Skills (Fase 5.1)
 *
 * Skills del ciclo de vida de un siniestro: alta, actualización de estado,
 * listado paginado y consulta individual. Patrón idéntico a
 * insurance-skills.ts y el resto de skills Volkern: prisma directo,
 * helpers de validación, parseo de fechas y números seguros.
 *
 * Estados válidos y transiciones:
 *   REPORTADO → EN_TRAMITE → ABIERTO → (PAGADO | RECHAZADO) → CERRADO
 *
 * Reglas de transición que enforceSkills (no API):
 *   - PAGADO requiere montoIndemnizado > 0
 *   - RECHAZADO requiere motivoRechazo no-vacío
 *   - CERRADO requiere fechaCierre
 *   - No se puede saltar de REPORTADO directamente a PAGADO/RECHAZADO/CERRADO
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type EstadoSiniestro =
  | 'REPORTADO'
  | 'EN_TRAMITE'
  | 'ABIERTO'
  | 'PAGADO'
  | 'RECHAZADO'
  | 'CERRADO';

export interface CreateSiniestroInput {
  tenantId: string;
  polizaId: string;
  /** Opcional: el sistema lo resuelve via la poliza si no llega. */
  clienteId?: string;
  /** Opcional: idem. */
  aseguradoraId?: string;
  descripcion: string;
  /** ISO string o Date. Default: hoy. */
  fechaSuceso?: string | Date;
  fechaReporte?: string | Date;
  numeroSiniestro?: string;
  montoReclamado?: number;
  deducible?: number;
  moneda?: string;
  estado?: EstadoSiniestro;
  motivoRechazo?: string;
  notas?: string;
  /** Inyectado por el orchestrator. Si falta, se resuelve el primer user del tenant. */
  createdById?: string;
}

export interface UpdateEstadoSiniestroInput {
  tenantId: string;
  id: string;
  estado: EstadoSiniestro;
  montoIndemnizado?: number;
  motivoRechazo?: string;
  notas?: string;
  fechaCierre?: string | Date;
}

export interface ListSiniestrosInput {
  tenantId: string;
  estado?: EstadoSiniestro;
  clienteId?: string;
  polizaId?: string;
  aseguradoraId?: string;
  page?: number;
  limit?: number;
}

export interface GetSiniestroByIdInput {
  tenantId: string;
  id: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseFecha(raw?: string | Date | null): Date | null {
  if (raw === undefined || raw === null) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function normalizarNumero(value?: number | string | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  // Formato europeo: "1.500,50 €" → 1500.50. Normalizar separadores locales.
  let s = String(value).trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',')) {
    // Si hay coma, es el separador decimal (ej: 1.500,50).
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    // Múltiples puntos → separador de miles (ej: 1.500.000).
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const TRANSICIONES_VALIDAS: Record<EstadoSiniestro, EstadoSiniestro[]> = {
  REPORTADO: ['EN_TRAMITE', 'RECHAZADO', 'CERRADO'],
  EN_TRAMITE: ['ABIERTO', 'RECHAZADO', 'CERRADO'],
  ABIERTO: ['PAGADO', 'RECHAZADO', 'CERRADO'],
  PAGADO: ['CERRADO'],
  RECHAZADO: ['CERRADO'],
  CERRADO: [],
};

function validarTransicionEstado(actual: EstadoSiniestro, nuevo: EstadoSiniestro): void {
  if (actual === nuevo) {
    // Permitido: idempotente (ej. refrescar PAGADO con montoIndemnizado).
    return;
  }
  const permitidas = TRANSICIONES_VALIDAS[actual] ?? [];
  if (!permitidas.includes(nuevo)) {
    throw new Error(
      `Transición de estado no permitida: ${actual} → ${nuevo}. ` +
      `Transiciones válidas desde ${actual}: ${permitidas.join(', ') || '(ninguna, estado terminal)'}.`,
    );
  }
}

function validarReglasPorEstado(
  estado: EstadoSiniestro,
  payload: { montoIndemnizado?: number | null; motivoRechazo?: string; fechaCierre?: Date | null },
): void {
  if (estado === 'PAGADO') {
    if (!payload.montoIndemnizado || payload.montoIndemnizado <= 0) {
      throw new Error('Para pasar a PAGADO, montoIndemnizado debe ser > 0.');
    }
  }
  if (estado === 'RECHAZADO') {
    if (!payload.motivoRechazo || !payload.motivoRechazo.trim()) {
      throw new Error('Para pasar a RECHAZADO, motivoRechazo es obligatorio.');
    }
  }
  if (estado === 'CERRADO') {
    if (!payload.fechaCierre) {
      throw new Error('Para pasar a CERRADO, fechaCierre es obligatorio.');
    }
  }
}

async function resolveCreator(tenantId: string, userId?: string): Promise<string> {
  if (userId) return userId;
  const first = await prisma.user.findFirst({
    where: { tenantId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (first) return first.id;
  throw new Error('No se pudo identificar el usuario que crea el siniestro.');
}

// ─── createSiniestro ─────────────────────────────────────────────────────────

export async function createSiniestro(rawInput: CreateSiniestroInput) {
  const input = rawInput;

  if (!input.tenantId) throw new Error('tenantId es obligatorio.');
  if (!input.polizaId) throw new Error('polizaId es obligatorio.');
  if (!input.descripcion || !input.descripcion.trim()) {
    throw new Error('descripcion es obligatoria.');
  }

  const poliza = await prisma.poliza.findFirst({
    where: { id: input.polizaId, tenantId: input.tenantId },
    select: { id: true, clienteId: true, aseguradoraId: true, moneda: true },
  });
  if (!poliza) {
    throw new Error(`No se encontró la póliza ${input.polizaId} para este tenant.`);
  }

  const clienteId = input.clienteId ?? poliza.clienteId;
  const aseguradoraId = input.aseguradoraId ?? poliza.aseguradoraId;
  const moneda = input.moneda ?? poliza.moneda ?? 'EUR';
  const fechaSuceso = parseFecha(input.fechaSuceso) ?? new Date();
  const fechaReporte = parseFecha(input.fechaReporte) ?? new Date();
  const createdById = await resolveCreator(input.tenantId, input.createdById);

  const estado: EstadoSiniestro = input.estado ?? 'REPORTADO';
  validarReglasPorEstado(estado, {
    montoIndemnizado: normalizarNumero(input.montoReclamado),
    motivoRechazo: input.motivoRechazo,
    fechaCierre: parseFecha(input.fechaReporte),
  });

  const data: Prisma.SiniestroUncheckedCreateInput = {
    tenantId: input.tenantId,
    polizaId: input.polizaId,
    clienteId,
    aseguradoraId,
    descripcion: input.descripcion.trim(),
    fechaSuceso,
    fechaReporte,
    montoReclamado: normalizarNumero(input.montoReclamado) ?? undefined,
    deducible: normalizarNumero(input.deducible) ?? undefined,
    moneda,
    estado,
    motivoRechazo: input.motivoRechazo?.trim() || null,
    notas: input.notas?.trim() || null,
    numeroSiniestro: input.numeroSiniestro?.trim() || null,
    createdById,
  };

  const siniestro = await prisma.siniestro.create({ data });

  return {
    siniestro,
    message: `Siniestro ${siniestro.id} creado en estado ${siniestro.estado} para póliza ${input.polizaId}.`,
  };
}

// ─── updateEstadoSiniestro ───────────────────────────────────────────────────

export async function updateEstadoSiniestro(rawInput: UpdateEstadoSiniestroInput) {
  const input = rawInput;

  if (!input.tenantId) throw new Error('tenantId es obligatorio.');
  if (!input.id) throw new Error('id es obligatorio.');

  const existing = await prisma.siniestro.findFirst({
    where: { id: input.id, tenantId: input.tenantId },
    select: { id: true, estado: true },
  });
  if (!existing) {
    throw new Error(`No se encontró el siniestro ${input.id} para este tenant.`);
  }

  validarTransicionEstado(existing.estado as EstadoSiniestro, input.estado);

  // Resolver fechaCierre efectiva ANTES de validar reglas: aunque no venga
  // explícita, la autocompletamos al transicionar a CERRADO/PAGADO.
  const fcParsed = parseFecha(input.fechaCierre);
  const fechaCierreEfectiva: Date =
    fcParsed ?? ((input.estado === 'CERRADO' || input.estado === 'PAGADO') ? new Date() : (null as any));

  validarReglasPorEstado(input.estado, {
    montoIndemnizado: normalizarNumero(input.montoIndemnizado),
    motivoRechazo: input.motivoRechazo,
    fechaCierre: fechaCierreEfectiva,
  });

  const data: Prisma.SiniestroUpdateInput = {
    estado: input.estado,
  };
  if (input.montoIndemnizado !== undefined) {
    const m = normalizarNumero(input.montoIndemnizado);
    if (m !== null) data.montoIndemnizado = m;
  }
  if (input.motivoRechazo !== undefined) {
    data.motivoRechazo = input.motivoRechazo.trim() || null;
  }
  if (input.notas !== undefined) {
    data.notas = input.notas.trim() || null;
  }
  if (fechaCierreEfectiva) data.fechaCierre = fechaCierreEfectiva;

  const updated = await prisma.siniestro.update({
    where: { id: input.id },
    data,
  });

  return {
    siniestro: updated,
    message: `Siniestro ${updated.id}: ${existing.estado} → ${updated.estado}.`,
  };
}

// ─── listSiniestros ──────────────────────────────────────────────────────────

export async function listSiniestros(input: ListSiniestrosInput) {
  if (!input.tenantId) throw new Error('tenantId es obligatorio.');

  const page = input.page && input.page > 0 ? input.page : 1;
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 100) : 20;

  const where: Prisma.SiniestroWhereInput = { tenantId: input.tenantId };
  if (input.estado) where.estado = input.estado;
  if (input.clienteId) where.clienteId = input.clienteId;
  if (input.polizaId) where.polizaId = input.polizaId;
  if (input.aseguradoraId) where.aseguradoraId = input.aseguradoraId;

  const [siniestros, total] = await Promise.all([
    prisma.siniestro.findMany({
      where,
      orderBy: [{ fechaSuceso: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        poliza: { select: { id: true, numeroPoliza: true } },
        cliente: { select: { id: true, nombre: true } },
        aseguradora: { select: { id: true, nombre: true } },
      },
    }),
    prisma.siniestro.count({ where }),
  ]);

  return {
    siniestros,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── getSiniestroById ────────────────────────────────────────────────────────

export async function getSiniestroById(input: GetSiniestroByIdInput) {
  if (!input.tenantId) throw new Error('tenantId es obligatorio.');
  if (!input.id) throw new Error('id es obligatorio.');

  const siniestro = await prisma.siniestro.findFirst({
    where: { id: input.id, tenantId: input.tenantId },
    include: {
      poliza: {
        select: {
          id: true,
          numeroPoliza: true,
          fechaVencimiento: true,
          productoSeguro: {
            select: {
              ramo: true,
              nombre: true,
            },
          },
        },
      },
      cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
      aseguradora: { select: { id: true, nombre: true, telefono: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!siniestro) {
    throw new Error(`No se encontró el siniestro ${input.id} para este tenant.`);
  }
  return { siniestro };
}
