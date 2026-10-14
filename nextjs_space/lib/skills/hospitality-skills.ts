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
import { aportaProduccion, esEstadoValido, ESTADOS_RESERVA, type EstadoReserva } from '@/lib/hospitality/estados';
import { resumenReservas } from '@/lib/hospitality/analytics';
import { nightsBetween, startOfDay } from '@/lib/hospitality/calendar';
import { esTipoBloqueoValido } from '@/lib/hospitality/block-types';
import { conflictoDeBloqueo } from '@/lib/hospitality/bloqueos-guarda';
import { datosDeSalida } from '@/lib/hospitality/checkout';
import {
  calcularRentabilidad,
  lineasDesdeImporteExterno,
  redondear,
  type LineaReserva,
  type PagoReserva,
} from '@/lib/hospitality/finance';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseFecha(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Nombre del huésped para listados humanos (briefing, estado del día).
 *
 * La forma CANÓNICA con la que escriben los canales (conectividad/webhook) es
 * `firstName` + `lastName` — la misma que ya respetan money-query.ts y
 * guests.ts. `guestName`/`nombre`/`name` son variantes del formulario público
 * y de seeds. Leer solo estas últimas pintaba «Sin nombre» para cualquier
 * reserva que llegara por OTA aunque trajera nombre completo.
 * (Exportada para tests.)
 */
export function nombreHuesped(guestData: unknown): string {
  if (!guestData || typeof guestData !== 'object') return 'Sin nombre';
  const g = guestData as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const nombre = [texto(g.firstName), texto(g.lastName)].filter(Boolean).join(' ')
    || texto(g.guestName) || texto(g.nombre) || texto(g.name);
  return nombre || 'Sin nombre';
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

// ─── 6. Escritura: registrar una incidencia (unidad fuera de venta) ────────

/**
 * «Incidencia» en el vocabulario del PMS = bloqueo de mantenimiento de la
 * unidad (HospitalityUnitBlock, tipo `mantenimiento`): la unidad deja de
 * venderse mientras se arregla. Es el mismo mecanismo del planning, con la
 * misma guarda anti-solape que la API de bloques.
 */
export async function registrar_incidencia(input: {
  tenantId: string;
  unidad: string;
  descripcion: string;
  dias?: number;
  tipo?: string;
}) {
  const descripcion = (input.descripcion || '').trim();
  if (!descripcion) throw new Error('Describe la incidencia: qué pasa en la unidad.');

  const clave = (input.unidad || '').trim();
  if (!clave) throw new Error('Indica la unidad afectada.');
  const tipo = esTipoBloqueoValido(input.tipo) ? input.tipo : 'mantenimiento';

  // El operador habla de «Loft Marina», no de cuids: resolver por id o nombre.
  const unidad = await prisma.hospitalityUnit.findFirst({
    where: { tenantId: input.tenantId, OR: [{ id: clave }, { nombre: { equals: clave, mode: 'insensitive' } }] },
    select: { id: true, nombre: true },
  });
  if (!unidad) {
    return { ok: false, mensaje: `No encuentro ninguna unidad «${input.unidad}».` };
  }

  const inicio = startOfDay(new Date());
  const dias = Math.max(1, Math.min(30, input.dias || 1));
  const fin = diaMas(inicio, dias);

  // Misma guarda que la API de bloques: no duplicar bloqueos activos que se
  // solapen; el solape de bloqueos rompe el cálculo de disponibilidad.
  const solape = await prisma.hospitalityUnitBlock.findFirst({
    where: {
      tenantId: input.tenantId,
      unitId: unidad.id,
      estado: 'activo',
      fechaInicio: { lt: fin },
      fechaFin: { gt: inicio },
    },
    select: { tipo: true, fechaFin: true },
  });
  if (solape) {
    return {
      ok: false,
      mensaje: `La unidad ${unidad.nombre} ya está bloqueada (${solape.tipo}) hasta ${solape.fechaFin.toISOString().slice(0, 10)}. Ajusta ese bloqueo desde el planning.`,
    };
  }

  // Y tampoco se cierran noches ya contratadas: la unidad puede estar libre de
  // bloqueos y tener una reserva confirmada encima. Misma guarda que la API
  // (`bloqueos-guarda`), para que el chat no pueda hacer lo que el planning no
  // deja.
  const conflicto = await conflictoDeBloqueo(input.tenantId, unidad.id, inicio, fin);
  if (conflicto) {
    return { ok: false, mensaje: conflicto.error };
  }

  const bloqueo = await prisma.hospitalityUnitBlock.create({
    data: {
      tenantId: input.tenantId,
      unitId: unidad.id,
      fechaInicio: inicio,
      fechaFin: fin,
      tipo,
      motivo: descripcion,
      estado: 'activo',
    },
    select: { id: true, fechaInicio: true, fechaFin: true },
  });

  return {
    ok: true,
    bloqueoId: bloqueo.id,
    unidad: unidad.nombre,
    tipo,
    desde: bloqueo.fechaInicio.toISOString().slice(0, 10),
    hasta: bloqueo.fechaFin.toISOString().slice(0, 10),
    dias,
    mensaje: `Unidad ${unidad.nombre} fuera de venta ${dias} día(s) (${tipo}): ${descripcion}`,
  };
}

// ─── 7. Escritura: cambiar el estado de una reserva ─────────────────────────

/**
 * Las mismas transiciones que permite la UI (una cancelada o terminada no se
 * reabre desde el chat; el check-out cierra la estancia). El estado manda,
 * los efectos colaterales acompañan.
 */
const TRANSICIONES_PERMITIDAS: Record<string, readonly string[]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  no_show: [],
};

export async function cambiar_estado_reserva(input: { tenantId: string; referencia: string; estado: string }) {
  if (!esEstadoValido(input.estado)) {
    throw new Error(`Estado inválido «${input.estado}». Válidos: ${ESTADOS_RESERVA.join(', ')}.`);
  }
  const estado = input.estado as EstadoReserva;
  const ref = (input.referencia || '').trim();
  if (!ref) throw new Error('Indica la referencia de la reserva.');

  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { tenantId: input.tenantId, OR: [{ externalBookingId: ref }, { id: ref }] },
    select: { id: true, externalBookingId: true, estado: true, checkOut: true, propertyId: true, channel: true },
  });
  if (!reserva) {
    return { ok: false, encontrado: false, mensaje: `No hay ninguna reserva con la referencia «${ref}».` };
  }

  if (reserva.estado === estado) {
    return { ok: true, sinCambio: true, referencia: reserva.externalBookingId, estado, mensaje: `La reserva ya estaba en ${estado}.` };
  }

  const permitidas = TRANSICIONES_PERMITIDAS[reserva.estado] || [];
  if (!permitidas.includes(estado)) {
    return {
      ok: false,
      mensaje: `No se puede pasar de «${reserva.estado}» a «${estado}». Transiciones posibles desde aquí: ${permitidas.length ? permitidas.join(', ') : 'ninguna'}.`,
    };
  }

  // Salida anticipada: misma opción B que el check-out operativo — el checkOut
  // real se guarda aparte y las noches vendidas quedan intactas.
  const datos: { estado: EstadoReserva; checkOut?: Date; checkOutReal?: Date } = { estado };
  if (estado === 'checked_out') {
    const property = await prisma.hospitalityProperty.findFirst({
      where: { id: reserva.propertyId, tenantId: input.tenantId },
      select: { politicaSalidaAnticipada: true },
    });
    Object.assign(datos, datosDeSalida(property?.politicaSalidaAnticipada, { checkOutPrevisto: new Date(reserva.checkOut) }));
  }

  const actualizada = await prisma.hospitalityReservation.update({
    where: { id: reserva.id },
    data: datos,
    select: { id: true, estado: true, checkOutReal: true },
  });

  // Efectos colaterales de la UI, cada uno degrada solo: un push o una traza
  // fallida no deshace el cambio de estado que ya está hecho.
  if (reserva.estado === 'pending' && estado === 'confirmed') {
    const { registrarHoldConfirmado } = await import('@/lib/hospitality/holds-audit');
    await registrarHoldConfirmado({
      tenantId: input.tenantId,
      reservationId: reserva.id,
      propertyId: reserva.propertyId,
      channel: reserva.channel,
      origen: 'operador',
    }).catch(() => {});
  }

  let penalizacion: { emitida: boolean; importe: number; moneda: string } | null = null;
  if (estado === 'no_show') {
    const { aplicarPenalizacionNoShow } = await import('@/lib/hospitality/penalizaciones');
    const p = await aplicarPenalizacionNoShow(input.tenantId, reserva.id).catch(() => null);
    if (p) penalizacion = { emitida: p.emitida, importe: p.importe, moneda: p.moneda };
  }

  const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
  await dispatchConnectivityPush(input.tenantId, reserva.propertyId, 'reserva_modificada', { skipRates: true }).catch(() => {});

  return {
    ok: true,
    referencia: reserva.externalBookingId,
    estadoAnterior: reserva.estado,
    estado: actualizada.estado,
    checkOutReal: actualizada.checkOutReal,
    penalizacion,
    mensaje: `Reserva ${reserva.externalBookingId}: ${reserva.estado} → ${actualizada.estado}.`,
  };
}

// ─── 8. Escritura: anotar un pago (el cobro lo deriva el módulo de finanzas) ─

const METODOS_PAGO = ['stripe', 'transferencia', 'efectivo', 'manual', 'otro'];
const ESTADOS_PAGO = ['pendiente', 'pagado', 'parcial', 'reembolsado', 'fallido'];

export async function anotar_pago(input: {
  tenantId: string;
  referencia: string;
  importe: number;
  metodo?: string;
  estado?: string;
  notas?: string;
}) {
  const ref = (input.referencia || '').trim();
  if (!ref) throw new Error('Indica la referencia de la reserva.');
  const importe = Number(input.importe);
  if (!Number.isFinite(importe) || importe <= 0) throw new Error('El importe debe ser mayor que cero.');

  const metodo = input.metodo || 'manual';
  if (!METODOS_PAGO.includes(metodo)) {
    throw new Error(`Método inválido «${metodo}». Válidos: ${METODOS_PAGO.join(', ')}.`);
  }
  const estadoPago = input.estado || 'pagado';
  if (!ESTADOS_PAGO.includes(estadoPago)) {
    throw new Error(`Estado de pago inválido «${estadoPago}». Válidos: ${ESTADOS_PAGO.join(', ')}.`);
  }

  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { tenantId: input.tenantId, OR: [{ externalBookingId: ref }, { id: ref }] },
    select: { id: true, externalBookingId: true, propertyId: true, unitId: true, currency: true, amountAfterTax: true },
  });
  if (!reserva) {
    return { ok: false, encontrado: false, mensaje: `No hay ninguna reserva con la referencia «${ref}».` };
  }

  const pago = await prisma.hospitalityPayment.create({
    data: {
      tenantId: input.tenantId,
      reservationId: reserva.id,
      propertyId: reserva.propertyId,
      unitId: reserva.unitId,
      importe: redondear(importe),
      moneda: reserva.currency,
      metodo,
      estado: estadoPago,
      fechaPago: estadoPago === 'pagado' ? new Date() : null,
      notas: input.notas || null,
    },
    select: { id: true, importe: true, moneda: true, metodo: true, estado: true },
  });

  // El cobro resultante lo decide el módulo de finanzas con TODOS los pagos,
  // no este skill: aquí solo se informa (cobrado/pendiente/estadoCobro).
  const [pagos, lineasInfo] = await Promise.all([
    prisma.hospitalityPayment.findMany({
      where: { reservationId: reserva.id, tenantId: input.tenantId },
      select: { importe: true, estado: true, metodo: true },
    }),
    Promise.resolve(lineasDesdeImporteExterno(reserva.amountAfterTax || 0)),
  ]);
  const rentabilidad = calcularRentabilidad({
    lineas: lineasInfo,
    pagos: pagos.map((p) => ({ importe: p.importe, estado: p.estado, metodo: p.metodo })),
    moneda: reserva.currency,
  });

  return {
    ok: true,
    pagoId: pago.id,
    reserva: reserva.externalBookingId,
    pago: { importe: pago.importe, moneda: pago.moneda, metodo: pago.metodo, estado: pago.estado },
    cobro: { cobrado: rentabilidad.cobrado, pendiente: rentabilidad.pendiente, estadoCobro: rentabilidad.estadoCobro },
    mensaje: `Pago de ${pago.importe} ${pago.moneda} (${pago.metodo}) anotado en ${reserva.externalBookingId}. Cobro: ${rentabilidad.estadoCobro}, pendiente ${rentabilidad.pendiente} ${pago.moneda}.`,
  };
}

// ─── 9. Briefing matutino: la foto del día para empezar la jornada ─────────

/**
 * El resumen que el propietario pide con el café: qué hay hoy, qué vino de
 * anoche (incidencias) y qué dinero falta (cobros). Reutiliza `estado_del_dia`
 * para la operación del día y añade dos consultas propias — bloques activos
 * (incidencias/mantenimiento/propietario/administrativo) y saldos pendientes —
 * sin duplicar ninguna regla del módulo.
 */
export async function resumen_diario(input: { tenantId: string }) {
  const dia = await estado_del_dia({ tenantId: input.tenantId, dias: 1 });

  const hoy = startOfDay(new Date());
  const [bloques, rentabilidades] = await Promise.all([
    prisma.hospitalityUnitBlock.findMany({
      where: { tenantId: input.tenantId, estado: 'activo', fechaInicio: { lte: diaMas(hoy, 1) }, fechaFin: { gt: hoy } },
      select: { tipo: true, motivo: true, fechaInicio: true, fechaFin: true, unit: { select: { nombre: true } } },
      orderBy: { fechaInicio: 'asc' },
    }),
    // Cobros pendientes: rentabilidad de las reservas con producción en la
    // ventana (la misma consulta que el briefing de operaciones pide dos
    // veces). Los estados sin producción no se cobran: regla del módulo.
    prisma.hospitalityReservation.findMany({
      where: {
        tenantId: input.tenantId,
        checkIn: { lt: diaMas(hoy, 1) },
        checkOut: { gt: hoy },
        estado: { notIn: ['cancelled', 'no_show'] },
      },
      select: { id: true, externalBookingId: true, currency: true, amountAfterTax: true, commission: true, items: { select: { tipo: true, concepto: true, cantidad: true, importeUnitario: true, importeTotal: true } }, payments: { select: { importe: true, estado: true, metodo: true } } },
      take: 200,
      orderBy: { checkIn: 'asc' },
    }),
  ]);

  // Incidencias activas: bloqueos que tocan hoy (cualquier tipo — una
  // incidencia registrada ayer para 3 días sigue siendo hoy una unidad
  // fuera de venta).
  const incidencias = bloques.map((b) => ({
    unidad: b.unit?.nombre || 'Sin asignar',
    tipo: b.tipo,
    motivo: b.motivo,
    desde: b.fechaInicio.toISOString().slice(0, 10),
    hasta: b.fechaFin.toISOString().slice(0, 10),
  }));

  // Cobros: la rentabilidad la calcula el módulo de finanzas con TODOS los
  // pagos de cada reserva; aquí solo se clasifica lo que queda pendiente.
  const cobrosPendientes = rentabilidades
    .map((r) => {
      const lineas = r.items.length > 0 ? r.items : lineasDesdeImporteExterno(r.amountAfterTax || 0);
      const rentabilidad = calcularRentabilidad({
        lineas,
        pagos: r.payments.map((p) => ({ importe: p.importe, estado: p.estado, metodo: p.metodo })),
        comisionOta: r.commission ?? undefined,
        moneda: r.currency || undefined,
      });
      return {
        referencia: r.externalBookingId,
        moneda: r.currency,
        pendiente: rentabilidad.pendiente,
        estadoCobro: rentabilidad.estadoCobro,
      };
    })
    .filter((c) => c.pendiente > 0)
    .sort((a, b) => b.pendiente - a.pendiente)
    .slice(0, 10);

  return {
    fecha: dia.fecha,
    ocupacionHoyPct: dia.ocupacionHoyPct,
    totalUnidades: dia.totalUnidades,
    unidadesOcupadas: dia.unidadesOcupadas,
    llegadasHoy: dia.hoy.llegadas,
    salidasHoy: dia.hoy.salidas,
    detalleLlegadas: dia.hoy.detalleLlegadas,
    detalleSalidas: dia.hoy.detalleSalidas,
    llegadasManana: dia.manana.llegadas.length,
    salidasManana: dia.manana.salidas.length,
    incidenciasAbiertas: incidencias.length,
    incidencias,
    cobrosPendientes: cobrosPendientes.length,
    mayoresPendientes: cobrosPendientes,
    totalPendientePorMoneda: cobrosPendientes.reduce<Record<string, number>>((acc, c) => {
      const moneda = c.moneda || '—';
      acc[moneda] = (acc[moneda] || 0) + c.pendiente;
      return acc;
    }, {}),
  };
}

// ─── Guardia de producción: todo skill respeta la regla de estados ─────────

/** Verificable en tests: los totales excluyen canceladas y no-show. */
export function soloProducen(estado: string): boolean {
  return aportaProduccion(estado);
}
