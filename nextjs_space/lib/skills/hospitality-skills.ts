/**
 * Hospitality Skills
 *
 * Skills del módulo de Hospitality (vertical PMS + Booking Engine): la IA
 * (Gemma) y el MCP pueden consultar ocupación, llegadas/salidas, reservas y
 * rentabilidad sin abrir el panel.
 *
 * Usan prisma directo (mismo patrón que insurance-skills.ts) y REUTILIZAN los
 * módulos puros de `lib/hospitality` para decidir — no recalculan:
 *
 *  - `estados.ts`: qué cuenta como producción (cancelada/no-show no suman).
 *  - `analytics.ts`: resumen de reservas (reservas/noches/ingresos).
 *  - `calendar.ts`: ventanas del día local y `nightsBetween`.
 *  - `finance.ts`: rentabilidad de una reserva (bruto, comisiones, margen).
 *
 * Regla de la vertical: una consulta auxiliar fallida degrada elegante
 * (respuesta vacía con el motivo), nunca tumba la conversación.
 */

import { prisma } from '@/lib/db';
import { aportaProduccion } from '@/lib/hospitality/estados';
import { resumenReservas } from '@/lib/hospitality/analytics';
import { nightsBetween, startOfDay } from '@/lib/hospitality/calendar';
import {
  calcularRentabilidad,
  lineasDesdeImporteExterno,
  type LineaReserva,
  type PagoReserva,
} from '@/lib/hospitality/finance';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseFecha(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function nombreHuesped(guestData: unknown): string {
  if (!guestData || typeof guestData !== 'object') return 'Sin nombre';
  const g = guestData as Record<string, unknown>;
  const nombre = (g.guestName || g.nombre || g.name) as string | undefined;
  return typeof nombre === 'string' && nombre.trim() ? nombre.trim() : 'Sin nombre';
}

/** Suma los días indicados a un día local empezando a medianoche. */
function diaMas(hoy: Date, dias: number): Date {
  const d = startOfDay(hoy);
  d.setDate(d.getDate() + dias);
  return d;
}

/**
 * Ventana [inicio, fin) que cubre las estancias que tocan un día: la reserva
 * entra si su rango cruza la fecha pedida (la misma regla del planning).
 */
function ventanaDeDia(dia: Date): { inicio: Date; fin: Date } {
  const inicio = startOfDay(dia);
  const fin = diaMas(inicio, 1);
  return { inicio, fin };
}

// ─── 1. Ocupación y movimiento del día (el «qué tal va la casa») ───────────

export async function estado_del_dia(input: { tenantId: string; dias?: number }) {
  const dias = Math.max(1, Math.min(90, input.dias || 7));
  const hoy = startOfDay(new Date());
  const { inicio: inicioHoy, fin: finHoy } = ventanaDeDia(hoy);
  const manana = diaMas(hoy, 1);
  const { inicio: inicioManana, fin: finManana } = ventanaDeDia(manana);
  const finVentana = diaMas(hoy, dias);

  const [unidades, llegadasHoy, salidasHoy, enCasa, llegadasManana, salidasManana, ventana] =
    await Promise.all([
      prisma.hospitalityUnit.count({ where: { tenantId: input.tenantId } }),
      prisma.hospitalityReservation.findMany({
        where: { tenantId: input.tenantId, checkIn: { gte: inicioHoy, lt: finHoy }, estado: { notIn: ['cancelled'] } },
        select: { id: true, estado: true, checkIn: true, checkOut: true, guestData: true, unit: { select: { nombre: true } }, property: { select: { nombre: true } } },
      }),
      prisma.hospitalityReservation.findMany({
        where: { tenantId: input.tenantId, checkOut: { gte: inicioHoy, lt: finHoy }, estado: { notIn: ['cancelled'] } },
        select: { id: true, estado: true, checkIn: true, checkOut: true, guestData: true, unit: { select: { nombre: true } } },
      }),
      prisma.hospitalityReservation.findMany({
        where: { tenantId: input.tenantId, checkIn: { lt: finHoy }, checkOut: { gt: inicioHoy }, estado: { in: ['confirmed', 'checked_in'] } },
        select: { id: true, unitId: true },
      }),
      prisma.hospitalityReservation.findMany({
        where: { tenantId: input.tenantId, checkIn: { gte: inicioManana, lt: finManana }, estado: { notIn: ['cancelled'] } },
        select: { id: true, guestData: true, unit: { select: { nombre: true } }, property: { select: { nombre: true } } },
      }),
      prisma.hospitalityReservation.findMany({
        where: { tenantId: input.tenantId, checkOut: { gte: inicioManana, lt: finManana }, estado: { notIn: ['cancelled'] } },
        select: { id: true, guestData: true, unit: { select: { nombre: true } } },
      }),
      prisma.hospitalityReservation.findMany({
        where: { tenantId: input.tenantId, checkIn: { lt: finVentana }, checkOut: { gt: inicioHoy }, estado: { notIn: ['cancelled', 'no_show'] } },
        select: { estado: true, checkIn: true, checkOut: true, amountAfterTax: true },
      }),
    ]);

  const unidadesOcupadas = new Set(enCasa.map((r) => r.unitId)).size;
  const ocupacionHoy = unidades > 0 ? Math.round((unidadesOcupadas / unidades) * 100) : 0;
  const resumen = resumenReservas(ventana);

  return {
    fecha: hoy.toISOString().slice(0, 10),
    totalUnidades: unidades,
    ocupacionHoyPct: ocupacionHoy,
    unidadesOcupadas,
    hoy: {
      llegadas: llegadasHoy.length,
      salidas: salidasHoy.length,
      detalleLlegadas: llegadasHoy.map((r) => ({
        huesped: nombreHuesped(r.guestData),
        unidad: r.unit?.nombre || 'Sin asignar',
        propiedad: r.property?.nombre || null,
      })),
      detalleSalidas: salidasHoy.map((r) => ({
        huesped: nombreHuesped(r.guestData),
        unidad: r.unit?.nombre || 'Sin asignar',
      })),
    },
    manana: {
      llegadas: llegadasManana.map((r) => ({ huesped: nombreHuesped(r.guestData), unidad: r.unit?.nombre || 'Sin asignar' })),
      salidas: salidasManana.map((r) => ({ huesped: nombreHuesped(r.guestData), unidad: r.unit?.nombre || 'Sin asignar' })),
    },
    ventanaDias: dias,
    proximosDias: { reservas: resumen.reservas, noches: resumen.noches, ingresos: Math.round(resumen.ingresos) },
  };
}

// ─── 2. Reservas con filtros sencillos (lenguaje natural → consulta) ───────

export async function buscar_reservas(input: {
  tenantId: string;
  estado?: string;
  canal?: string;
  huesped?: string;
  dias?: number;
  limit?: number;
}) {
  const limit = Math.min(50, Math.max(1, input.limit || 15));
  const where: Record<string, unknown> = { tenantId: input.tenantId };

  if (input.estado) where.estado = input.estado;
  if (input.canal) where.channel = { contains: input.canal, mode: 'insensitive' };
  if (input.huesped) {
    // guestData es Json libre: el filtro por texto crudo del JSON es el único
    // que no se rompe con variantes del campo (guestName, nombre, viajeros).
    where.guestData = { string_contains: input.huesped };
  }

  const dias = Math.max(1, Math.min(365, input.dias || 30));
  where.checkIn = { gte: new Date(Date.now() - dias * 24 * 60 * 60 * 1000) };

  const reservas = await prisma.hospitalityReservation.findMany({
    where,
    orderBy: { checkIn: 'desc' },
    take: limit,
    select: {
      id: true,
      externalBookingId: true,
      channel: true,
      estado: true,
      checkIn: true,
      checkOut: true,
      amountAfterTax: true,
      currency: true,
      guestData: true,
      unit: { select: { nombre: true } },
      property: { select: { nombre: true } },
    },
  });

  return {
    total: reservas.length,
    reservas: reservas.map((r) => ({
      referencia: r.externalBookingId,
      canal: r.channel,
      estado: r.estado,
      huesped: nombreHuesped(r.guestData),
      unidad: r.unit?.nombre || null,
      propiedad: r.property?.nombre || null,
      entrada: r.checkIn,
      salida: r.checkOut,
      noches: nightsBetween(new Date(r.checkIn), new Date(r.checkOut)),
      importe: r.amountAfterTax,
      moneda: r.currency,
    })),
  };
}

// ─── 3. Rentabilidad de una reserva (por referencia o id) ──────────────────

export async function rentabilidad_reserva(input: { tenantId: string; referencia: string }) {
  const ref = (input.referencia || '').trim();
  if (!ref) throw new Error('Indica la referencia de la reserva.');

  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { tenantId: input.tenantId, OR: [{ externalBookingId: ref }, { id: ref }] },
    include: {
      items: { select: { tipo: true, concepto: true, cantidad: true, importeUnitario: true, importeTotal: true } },
      payments: { select: { importe: true, estado: true, metodo: true } },
      unit: { select: { nombre: true } },
      property: { select: { nombre: true } },
    },
  });

  if (!reserva) {
    return { encontrado: false, mensaje: `No hay ninguna reserva con la referencia «${ref}».` };
  }

  // Las líneas viven en la reserva; si la OTA no mandó desglose, se construyen
  // desde el importe externo (una sola línea de alojamiento — nunca inventar).
  const lineas: LineaReserva[] =
    reserva.items.length > 0
      ? reserva.items.map((i) => ({
          tipo: i.tipo,
          concepto: i.concepto,
          cantidad: i.cantidad,
          importeUnitario: i.importeUnitario,
          importeTotal: i.importeTotal,
        }))
      : lineasDesdeImporteExterno(reserva.amountAfterTax || 0);

  const pagos: PagoReserva[] = reserva.payments.map((p) => ({ importe: p.importe, estado: p.estado, metodo: p.metodo }));

  const rentabilidad = calcularRentabilidad({
    lineas,
    pagos,
    comisionOta: reserva.commission ?? undefined,
    moneda: reserva.currency || undefined,
  });

  return {
    encontrado: true,
    referencia: reserva.externalBookingId,
    canal: reserva.channel,
    estado: reserva.estado,
    huesped: nombreHuesped(reserva.guestData),
    unidad: reserva.unit?.nombre || null,
    propiedad: reserva.property?.nombre || null,
    entrada: reserva.checkIn,
    salida: reserva.checkOut,
    rentabilidad,
  };
}

// ─── 4. Estado de la web de reservas directa (Booking Engine) ──────────────

export async function estado_booking_engine(input: { tenantId: string }) {
  const [config, propiedades, reservasDirectas] = await Promise.all([
    prisma.hospitalityBookingConfig.findUnique({
      where: { tenantId: input.tenantId },
      select: { slug: true, activo: true, moneda: true, propiedadesPublicadas: true, requierePagoOnline: true },
    }),
    prisma.hospitalityProperty.findMany({
      where: { tenantId: input.tenantId },
      select: { id: true, nombre: true, estado: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.hospitalityReservation.findMany({
      where: { tenantId: input.tenantId, channel: 'Directa', checkIn: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      select: { estado: true, checkIn: true, checkOut: true, amountAfterTax: true },
    }),
  ]);

  const conTarifa = await prisma.hospitalityUnit.count({
    where: { tenantId: input.tenantId, tarifaBase: { not: null }, estado: { notIn: ['maintenance', 'out_of_service'] } },
  });

  const resumen = resumenReservas(reservasDirectas);

  return {
    webPublica: config?.activo && (config?.slug ? `${process.env.NEXTAUTH_URL || ''}/reservar/${config.slug}` : null) || null,
    activa: config?.activo ?? false,
    moneda: config?.moneda || null,
    propiedades: propiedades.map((p) => ({
      nombre: p.nombre,
      estado: p.estado,
      publicada: p.estado === 'conectada' && (config?.propiedadesPublicadas || []).includes(p.id),
    })),
    unidadesConTarifa: conTarifa,
    requierePagoOnline: config?.requierePagoOnline ?? false,
    ultimos30Dias: { reservas: resumen.reservas, noches: resumen.noches, ingresos: Math.round(resumen.ingresos) },
  };
}

// ─── 5. Reservas de hoy, resumidas para la conversación ────────────────────

export async function llegadas_salidas_hoy(input: { tenantId: string }) {
  const estado = await estado_del_dia({ tenantId: input.tenantId, dias: 1 });
  return {
    fecha: estado.fecha,
    llegadasHoy: estado.hoy.llegadas,
    salidasHoy: estado.hoy.salidas,
    detalleLlegadas: estado.hoy.detalleLlegadas,
    detalleSalidas: estado.hoy.detalleSalidas,
    ocupacionHoyPct: estado.ocupacionHoyPct,
  };
}

// ─── Guardia de producción: todo skill respeta la regla de estados ─────────

/** Verificable en tests: los totales excluyen canceladas y no-show. */
export function soloProducen(estado: string): boolean {
  return aportaProduccion(estado);
}
