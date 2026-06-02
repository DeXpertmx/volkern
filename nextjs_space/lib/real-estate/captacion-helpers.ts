/**
 * Volkern Real Estate Module — Captación (Listing/Acquisition) Helpers
 *
 * Gestión de contratos de captación inmobiliaria con exclusividad
 * y comisiones de captación. Una captación representa el acuerdo
 * entre el propietario de un inmueble y la agencia para comercializarlo.
 */

import { prisma } from '@/lib/db';
import type { Captacion, Contact, CatalogoItem } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CaptacionTipo = 'exclusiva' | 'compartida' | 'mandato';
export type CaptacionEstado = 'borrador' | 'activa' | 'vencida' | 'cancelada' | 'cerrada';

export interface CaptacionInput {
  propiedadId?: string;
  contactoPropietarioId?: string;
  tipoCaptacion: CaptacionTipo;
  estado?: CaptacionEstado;
  fechaInicio: string;       // ISO date
  fechaFin: string;          // ISO date
  fechaFirma?: string;
  fechaVencimiento?: string;
  esExclusiva?: boolean;
  clausulasExclusividad?: string;
  precioOferta?: number;
  precioMinimo?: number;
  comisionPorcentaje?: number;
  comisionFija?: number;
  comisionMoneda?: string;
  comisionCondiciones?: string;
  comisionNotas?: string;
  condicionesPago?: string;
  documentoUrl?: string;
  documentoHash?: string;
  notasCliente?: string;
  notasInternas?: string;
  metadata?: Record<string, any>;
}

export interface CaptacionResponse extends Captacion {
  propiedad?: Pick<CatalogoItem, 'id' | 'nombre' | 'precioBase' | 'moneda' | 'media'> | null;
  contactoPropietario?: Pick<Contact, 'id' | 'nombre' | 'email' | 'telefono'> | null;
  creador?: { id: string; name: string | null; email: string } | null;
}

export interface CaptacionStats {
  total: number;
  activas: number;
  borrador: number;
  vencidas: number;
  canceladas: number;
  cerradas: number;
  exclusivas: number;
  comisionPromedio: number;
  valorPromedio: number;
}

// ─── Serializer ───────────────────────────────────────────────────────────────

export function serializeCaptacion(
  c: Captacion & {
    propiedad?: Pick<CatalogoItem, 'id' | 'nombre' | 'precioBase' | 'moneda' | 'media'> | null;
    contactoPropietario?: Pick<Contact, 'id' | 'nombre' | 'email' | 'telefono'> | null;
    creador?: { id: string; name: string | null; email: string } | null;
  }
): CaptacionResponse {
  return {
    ...c,
    propiedad: c.propiedad || null,
    contactoPropietario: c.contactoPropietario || null,
    creador: c.creador || null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula el monto de comisión de captación
 */
export function calcularComisionCaptacion(
  precioOferta: number,
  porcentaje?: number | null,
  montoFijo?: number | null
): number {
  if (porcentaje && porcentaje > 0) {
    return precioOferta * (porcentaje / 100);
  }
  return montoFijo || 0;
}

/**
 * Determina si una captación está vigente según sus fechas
 */
export function isCaptacionVigente(captacion: { fechaInicio: Date; fechaFin: Date; estado: string }): boolean {
  const ahora = new Date();
  return (
    captacion.estado === 'activa' &&
    ahora >= captacion.fechaInicio &&
    ahora <= captacion.fechaFin
  );
}

/**
 * Obtiene todas las captaciones activas para una propiedad
 */
export async function getCaptacionesActivasPorPropiedad(
  tenantId: string,
  propiedadId: string
): Promise<CaptacionResponse[]> {
  const captaciones = await prisma.captacion.findMany({
    where: {
      tenantId,
      propiedadId,
      estado: 'activa',
      fechaInicio: { lte: new Date() },
      fechaFin: { gte: new Date() },
    },
    include: {
      contactoPropietario: { select: { id: true, nombre: true, email: true, telefono: true } },
      creador: { select: { id: true, name: true, email: true } },
    },
    orderBy: { fechaCreacion: 'desc' },
  });

  return captaciones.map(serializeCaptacion);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const CAPTACION_INCLUDE = {
  propiedad: { select: { id: true, nombre: true, precioBase: true, moneda: true, media: true } },
  contactoPropietario: { select: { id: true, nombre: true, email: true, telefono: true } },
  creador: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Lista captaciones con filtros y paginación
 */
export async function listCaptaciones(
  tenantId: string,
  filters: {
    estado?: CaptacionEstado;
    tipoCaptacion?: CaptacionTipo;
    propiedadId?: string;
    contactoPropietarioId?: string;
    creadoPor?: string;
    desde?: string;
    hasta?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ captaciones: CaptacionResponse[]; total: number }> {
  const {
    estado,
    tipoCaptacion,
    propiedadId,
    contactoPropietarioId,
    creadoPor,
    desde,
    hasta,
    search,
    limit = 20,
    offset = 0,
  } = filters;

  const where: any = { tenantId };

  if (estado) where.estado = estado;
  if (tipoCaptacion) where.tipoCaptacion = tipoCaptacion;
  if (propiedadId) where.propiedadId = propiedadId;
  if (contactoPropietarioId) where.contactoPropietarioId = contactoPropietarioId;
  if (creadoPor) where.creadoPor = creadoPor;

  if (desde || hasta) {
    where.fechaCreacion = {};
    if (desde) where.fechaCreacion.gte = new Date(desde);
    if (hasta) {
      const hastaDate = new Date(hasta);
      hastaDate.setHours(23, 59, 59, 999);
      where.fechaCreacion.lte = hastaDate;
    }
  }

  if (search) {
    where.OR = [
      { notasCliente: { contains: search, mode: 'insensitive' } },
      { notasInternas: { contains: search, mode: 'insensitive' } },
      { comisionCondiciones: { contains: search, mode: 'insensitive' } },
      { condicionesPago: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [captaciones, total] = await Promise.all([
    prisma.captacion.findMany({
      where,
      include: CAPTACION_INCLUDE,
      orderBy: { fechaCreacion: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.captacion.count({ where }),
  ]);

  return {
    captaciones: captaciones.map(serializeCaptacion),
    total,
  };
}

/**
 * Obtiene una captación por ID
 */
export async function getCaptacionById(
  tenantId: string,
  captacionId: string
): Promise<CaptacionResponse | null> {
  const captacion = await prisma.captacion.findFirst({
    where: { id: captacionId, tenantId },
    include: CAPTACION_INCLUDE,
  });

  return captacion ? serializeCaptacion(captacion) : null;
}

/**
 * Crea una nueva captación
 */
export async function createCaptacion(
  tenantId: string,
  creadoPor: string,
  data: CaptacionInput
): Promise<CaptacionResponse> {
  const captacion = await prisma.captacion.create({
    data: {
      tenantId,
      creadoPor,
      propiedadId: data.propiedadId || null,
      contactoPropietarioId: data.contactoPropietarioId || null,
      tipoCaptacion: data.tipoCaptacion,
      estado: data.estado || 'borrador',
      fechaInicio: new Date(data.fechaInicio),
      fechaFin: new Date(data.fechaFin),
      fechaFirma: data.fechaFirma ? new Date(data.fechaFirma) : null,
      fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
      esExclusiva: data.esExclusiva ?? true,
      clausulasExclusividad: data.clausulasExclusividad || null,
      precioOferta: data.precioOferta || null,
      precioMinimo: data.precioMinimo || null,
      comisionPorcentaje: data.comisionPorcentaje || null,
      comisionFija: data.comisionFija || null,
      comisionMoneda: data.comisionMoneda || 'EUR',
      comisionCondiciones: data.comisionCondiciones || null,
      comisionNotas: data.comisionNotas || null,
      condicionesPago: data.condicionesPago || null,
      documentoUrl: data.documentoUrl || null,
      documentoHash: data.documentoHash || null,
      notasCliente: data.notasCliente || null,
      notasInternas: data.notasInternas || null,
      metadata: data.metadata || null,
    },
    include: CAPTACION_INCLUDE,
  });

  return serializeCaptacion(captacion);
}

/**
 * Actualiza una captación
 */
export async function updateCaptacion(
  tenantId: string,
  captacionId: string,
  data: Partial<CaptacionInput>
): Promise<CaptacionResponse | null> {
  const existing = await prisma.captacion.findFirst({
    where: { id: captacionId, tenantId },
  });

  if (!existing) return null;

  const updateData: any = {};

  if (data.propiedadId !== undefined) updateData.propiedadId = data.propiedadId || null;
  if (data.contactoPropietarioId !== undefined) updateData.contactoPropietarioId = data.contactoPropietarioId || null;
  if (data.tipoCaptacion) updateData.tipoCaptacion = data.tipoCaptacion;
  if (data.estado) updateData.estado = data.estado;
  if (data.fechaInicio) updateData.fechaInicio = new Date(data.fechaInicio);
  if (data.fechaFin) updateData.fechaFin = new Date(data.fechaFin);
  if (data.fechaFirma !== undefined) updateData.fechaFirma = data.fechaFirma ? new Date(data.fechaFirma) : null;
  if (data.fechaVencimiento !== undefined) updateData.fechaVencimiento = data.fechaVencimiento ? new Date(data.fechaVencimiento) : null;
  if (data.esExclusiva !== undefined) updateData.esExclusiva = data.esExclusiva;
  if (data.clausulasExclusividad !== undefined) updateData.clausulasExclusividad = data.clausulasExclusividad;
  if (data.precioOferta !== undefined) updateData.precioOferta = data.precioOferta;
  if (data.precioMinimo !== undefined) updateData.precioMinimo = data.precioMinimo;
  if (data.comisionPorcentaje !== undefined) updateData.comisionPorcentaje = data.comisionPorcentaje;
  if (data.comisionFija !== undefined) updateData.comisionFija = data.comisionFija;
  if (data.comisionMoneda) updateData.comisionMoneda = data.comisionMoneda;
  if (data.comisionCondiciones !== undefined) updateData.comisionCondiciones = data.comisionCondiciones;
  if (data.comisionNotas !== undefined) updateData.comisionNotas = data.comisionNotas;
  if (data.condicionesPago !== undefined) updateData.condicionesPago = data.condicionesPago;
  if (data.documentoUrl !== undefined) updateData.documentoUrl = data.documentoUrl;
  if (data.documentoHash !== undefined) updateData.documentoHash = data.documentoHash;
  if (data.notasCliente !== undefined) updateData.notasCliente = data.notasCliente;
  if (data.notasInternas !== undefined) updateData.notasInternas = data.notasInternas;
  if (data.metadata !== undefined) updateData.metadata = data.metadata;

  const captacion = await prisma.captacion.update({
    where: { id: captacionId },
    data: updateData,
    include: CAPTACION_INCLUDE,
  });

  return serializeCaptacion(captacion);
}

/**
 * Elimina una captación
 */
export async function deleteCaptacion(
  tenantId: string,
  captacionId: string
): Promise<boolean> {
  const existing = await prisma.captacion.findFirst({
    where: { id: captacionId, tenantId },
    select: { id: true },
  });

  if (!existing) return false;

  await prisma.captacion.delete({ where: { id: captacionId } });
  return true;
}

/**
 * Obtiene estadísticas de captación
 */
export async function getCaptacionStats(tenantId: string): Promise<CaptacionStats> {
  const [
    total,
    activas,
    borrador,
    vencidas,
    canceladas,
    cerradas,
    exclusivas,
    comisionAgg,
    precioAgg,
  ] = await Promise.all([
    prisma.captacion.count({ where: { tenantId } }),
    prisma.captacion.count({ where: { tenantId, estado: 'activa' } }),
    prisma.captacion.count({ where: { tenantId, estado: 'borrador' } }),
    prisma.captacion.count({ where: { tenantId, estado: 'vencida' } }),
    prisma.captacion.count({ where: { tenantId, estado: 'cancelada' } }),
    prisma.captacion.count({ where: { tenantId, estado: 'cerrada' } }),
    prisma.captacion.count({ where: { tenantId, esExclusiva: true } }),
    prisma.captacion.aggregate({
      where: { tenantId, comisionPorcentaje: { not: null } },
      _avg: { comisionPorcentaje: true },
    }),
    prisma.captacion.aggregate({
      where: { tenantId, precioOferta: { not: null } },
      _avg: { precioOferta: true },
    }),
  ]);

  return {
    total,
    activas,
    borrador,
    vencidas,
    canceladas,
    cerradas,
    exclusivas,
    comisionPromedio: comisionAgg._avg.comisionPorcentaje || 0,
    valorPromedio: precioAgg._avg.precioOferta || 0,
  };
}
