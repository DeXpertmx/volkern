/**
 * Booking Engine de Hospitality (FASE 3.D): cotizar y crear la reserva directa.
 *
 * Este módulo NO tiene motor propio, y eso es el punto entero del diseño:
 *
 * - **La disponibilidad la dice el Availability Engine** (`./availability`), el
 *   mismo que alimenta el planning y los pushes a los canales. Aquí no se compara
 *   ni una fecha contra una reserva: se pregunta si la unidad está vendible y se
 *   respeta la respuesta.
 * - **La reserva entra por el mismo camino que una de canal**: se resuelve el
 *   huésped contra el CRM con `upsertGuest` (el mismo que usa el webhook), se
 *   escribe la reserva, se emiten los eventos del EventBus, se dispara la
 *   comunicación y se empuja la disponibilidad a los canales. Una reserva de la
 *   web es indistinguible de una de OTA en planning, operaciones, CRM,
 *   automatizaciones y finanzas (criterio 1 de la FASE 3).
 *
 * Las dos garantías que sí son propias de este camino:
 *
 * 1. **No se vende dos veces la misma unidad.** La creación toma un bloqueo de
 *    fila sobre la unidad dentro de una transacción y vuelve a comprobar la
 *    disponibilidad con el bloqueo tomado, así que dos solicitudes simultáneas
 *    del mismo rango se serializan en vez de colarse las dos (una ventana de
 *    milisegundos es suficiente para sobrevender en una web pública).
 * 2. **El precio que se guarda es el que se cotizó**, calculado por `./pricing`
 *    sobre la tarifa (y la estacionalidad) del plan, no por una aritmética propia.
 *    Con temporadas/fin de semana configurados, el importe se suma noche a noche
 *    (la noche cuesta la tarifa de su fecha) y la línea de alojamiento lo explica:
 *    "4 noches (desglose por temporada)".
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { unitUnavailableOnDay, loadAvailabilityContext, ocupacionPorNoche } from './availability';
import { nightsBetween, startOfDay, toIsoDate } from './calendar';
import {
  conceptoAlojamiento,
  cotizarEstancia,
  tarifaPorNocheDe,
  validarEstancia,
  type Cotizacion,
  type NocheCotizada,
} from './pricing';
import { reglasDeVentaDeLlegada, tieneEstacionalidad } from './estacionalidad';
import { normalizarDetalleUnidad } from './unit-detalle';
import { upsertGuest, type WebhookReservationPayload } from './reservations';
import { emitReservationCreated } from './events';
import { dispararComunicacionReserva } from './comunicaciones';
import { dispatchConnectivityPush } from './sync';
import { leerConfigPorSlug, monedaPublicada, type ConfigBooking } from './booking-config';
import { idiomaDeValor } from './booking-i18n';
// Extras comprables y registro de viajeros: vivían solo en la página antigua
// (`/booking/<id>`); al unificar la reserva pública en un único flujo tienen que
// seguir existiendo aquí, o el huésped dejaría de poder contratarlos y el parte
// de viajeros perdería la documentación que ya dejaba al reservar.
import { resolverExtras, filasDeItemsExtras, type ExtraCatalogo } from './booking-extras';
import { normalizarViajero, type ViajeroCheckin } from './guest-checkin';
import { asegurarTokenCheckin, enlaceCheckin } from './checkin-service';
// Las fotos del alojamiento se leen con el mismo módulo que el editor que las
// escribió: el Json guarda `{ url, titulo?, portada? }` y aquí solo interesan
// las URLs, con la portada delante (ver `urlsFotosHospedaje`).
import { urlsFotosHospedaje } from './property-editor-config';

/** Canal de las reservas que llegan por la página pública del tenant. */
export const CANAL_DIRECTO = 'Directa';

/** Estados de unidad que no se publican: fuera de servicio no es vendible. */
const ESTADOS_NO_VENDIBLES = ['maintenance', 'out_of_service'];

export interface UnidadPublica {
  id: string;
  propertyId: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  capacidad: number;
  descripcion: string | null;
  /** Precio por noche ya resuelto (plan activo o tarifa base). */
  tarifaPorNoche: number;
  /** Fotos de la unidad o, si no tiene, de la propiedad. */
  fotos: string[];
  amenidades: string[];
  /**
   * Distribución declarada de ESTA unidad (habitaciones y camas por id del
   * catálogo del editor). Cada unidad del complejo tiene la suya; `null` si
   * el operador no la declaró.
   */
  detalle: { habitaciones: Record<string, number>; camas: Record<string, number> } | null;
}

export interface PropiedadPublica {
  id: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  descripcion: string | null;
  /**
   * Fotos de la FICHA del alojamiento, con la portada delante: la galería de la
   * página pública las enseña arriba (plantilla clásica) o de cabecera
   * (moderna). Cada unidad lleva además las suyas —o estas— en `unidades`.
   */
  fotos: string[];
  unidades: UnidadPublica[];
}

function aLista(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/**
 * Propiedades y unidades publicables de un tenant.
 *
 * Solo lo que el tenant catalogó para su página y solo las unidades vendibles:
 * una unidad en mantenimiento aparece en el planning pero no puede reservarse
 * desde la web. Nada de aquí expone datos internos (huéspedes, importes ajenos,
 * identificadores externos).
 */
export async function listarPropiedadesPublicables(
  tenantId: string,
  config: Pick<ConfigBooking, 'propiedadesPublicadas'>
): Promise<PropiedadPublica[]> {
  const publicadas = config.propiedadesPublicadas || [];
  if (publicadas.length === 0) return [];

  const propiedades = await prisma.hospitalityProperty.findMany({
    where: { tenantId, id: { in: publicadas } },
    include: {
      units: {
        where: { estado: { notIn: ESTADOS_NO_VENDIBLES } },
        include: {
          ratePlans: { where: { activo: true }, orderBy: { tarifa: 'asc' }, take: 1 },
        },
        orderBy: { nombre: 'asc' },
      },
    },
    orderBy: { nombre: 'asc' },
  });

  return propiedades.map((propiedad) => {
    const fotosPropiedad = urlsFotosHospedaje(propiedad.fotos);
    const unidades = propiedad.units
      .map((unidad) => {
        const plan = unidad.ratePlans[0] || null;
        const tarifa = tarifaPorNocheDe({
          plan,
          tarifaBase: unidad.tarifaBase,
        });
        return { unidad, plan, tarifa };
      })
      // Sin precio no se publica: vender a cero sería peor que no vender.
      .filter((fila): fila is { unidad: typeof fila.unidad; plan: typeof fila.plan; tarifa: number } => fila.tarifa !== null)
      .map(({ unidad, plan, tarifa }) => {
        const fotosUnidad = urlsFotosHospedaje(unidad.fotos);
        return {
          id: unidad.id,
          propertyId: unidad.propertyId,
          nombre: unidad.nombre,
          codigo: unidad.codigo,
          tipo: unidad.tipo,
          capacidad: unidad.capacidad,
          descripcion: unidad.descripcion,
          tarifaPorNoche: tarifa,
          tarifaDesde: plan && tieneEstacionalidad(plan.temporadas ?? plan.finDeSemana) ? tarifa : null,
          // Fotos de la unidad o, si no tiene, las de la propiedad: una unidad
          // sin fotos propias enseña la del alojamiento (y su portada) en lugar
          // de un hueco, que es lo que hacía con el Json rico sin leer.
          fotos: fotosUnidad.length ? fotosUnidad : fotosPropiedad,
          amenidades: aLista(unidad.amenidades),
          // Distribución de ESTA unidad (habitaciones/camas), normalizada por el
          // módulo puro: la ficha pública nunca expone un JSONB corrupto.
          detalle: normalizarDetalleUnidad(unidad.detalleAlojamiento),
        };
      });

    return {
      id: propiedad.id,
      nombre: propiedad.nombre,
      ciudad: propiedad.ciudad,
      direccion: propiedad.direccion,
      descripcion: propiedad.descripcion,
      fotos: fotosPropiedad,
      unidades,
    };
  });
}

export interface UnidadCotizada {
  unitId: string;
  propertyId: string;
  nombre: string;
  tipo: string;
  capacidad: number;
  tarifaPorNoche: number;
  /**
   * Noche a noche del rango cuando la estancia no cuesta la tarifa plana
   * (estacionalidad y/o ajustes): el "desde" ya no basta y la media no es un
   * precio que nadie pague.
   */
  desgloseNoches: NocheCotizada[] | null;
  cotizacion: Cotizacion;
}

export type ResultadoCotizacion =
  | { ok: true; noches: number; moneda: string; unidades: UnidadCotizada[] }
  | { ok: false; motivo: string; mensaje: string };

/**
 * Cotiza qué unidades pueden venderse en un rango y a qué precio.
 *
 * Devuelve también el caso de "ninguna unidad libre": es una respuesta legítima
 * que la página tiene que poder explicar, no un error.
 */
export async function cotizarDisponibilidad(params: {
  tenantId: string;
  config: ConfigBooking;
  monedaTenant: string | null | undefined;
  propertyId: string;
  unitId?: string | null;
  checkIn: Date;
  checkOut: Date;
  adultos: number;
  ninos: number;
  moneda: string;
}): Promise<ResultadoCotizacion> {
  const { tenantId, config, checkIn, checkOut, propertyId, unitId } = params;
  const huespedes = Math.max(1, params.adultos) + Math.max(0, params.ninos);

  // La disponibilidad la responde el motor central, con las reservas y los
  // bloqueos reales del rango. No hay otra consulta de disponibilidad aquí.
  const contexto = await loadAvailabilityContext(prisma, tenantId, propertyId, checkIn, checkOut);

  // Ocupación por noche: la demanda que consume la capa 2 del precio. Se mide
  // con la regla única del Availability Engine sobre TODO el inventario de la
  // propiedad (no solo las unidades de este catálogo) porque el porcentaje
  // responde "cómo de llena está la propiedad esa noche", no "cuántas
  // unidades hay publicadas".
  const ocupacion = ocupacionPorNoche(
    contexto.units,
    checkIn,
    checkOut,
    contexto.reservations,
    contexto.blocks
  );
  const nochesDelRango = [];
  for (let cursor = startOfDay(checkIn); cursor.getTime() < startOfDay(checkOut).getTime(); cursor.setDate(cursor.getDate() + 1)) {
    nochesDelRango.push(new Date(cursor));
  }

  const unidades = await prisma.hospitalityUnit.findMany({
    where: {
      tenantId,
      propertyId,
      ...(unitId ? { id: unitId } : {}),
      estado: { notIn: ESTADOS_NO_VENDIBLES },
    },
    include: {
      ratePlans: { where: { activo: true }, orderBy: { tarifa: 'asc' } },
    },
    orderBy: { nombre: 'asc' },
  });

  const disponibles: UnidadCotizada[] = [];
  let ultimoMotivo: Extract<ResultadoCotizacion, { ok: false }> | null = null;

  for (const unidad of unidades) {
    if (unidad.capacidad < huespedes) {
      ultimoMotivo = {
        ok: false,
        motivo: 'capacidad',
        mensaje: 'Esas fechas no están disponibles para el número de huéspedes indicado.',
      };
      continue;
    }

    const plan = unidad.ratePlans[0] || null;
    const tarifa = tarifaPorNocheDe({ plan, tarifaBase: unidad.tarifaBase });
    if (tarifa === null) continue;

    const estancia = validarEstancia({
      checkIn,
      checkOut,
      restricciones: plan
        ? {
            // Las reglas de la temporada que contiene la llegada reemplazan,
            // campo a campo, a las generales del plan (una sola regla, la de
            // `estacionalidad`): la misma que aplica la web pública y la que
            // viaja al canal.
            ...reglasDeVentaDeLlegada({
              fecha: startOfDay(checkIn),
              estacionalidad: plan.temporadas ?? plan.finDeSemana,
              plan,
            }),
          }
        : null,
    });
    if (!estancia.ok) {
      ultimoMotivo = { ok: false, motivo: estancia.motivo, mensaje: estancia.mensaje };
      continue;
    }

    const libre = nochesDelRango.every(
      (dia) => !unitUnavailableOnDay(unidad.id, dia, contexto.reservations, contexto.blocks)
    );
    if (!libre) {
      ultimoMotivo = {
        ok: false,
        motivo: 'no_disponible',
        mensaje: 'Esas fechas ya no están disponibles para esta unidad.',
      };
      continue;
    }

    const cotizacion = cotizarEstancia({
      checkIn,
      checkOut,
      tarifaPorNoche: tarifa,
      estacionalidad: plan ? plan.temporadas ?? plan.finDeSemana : null,
      ajustes: plan?.ajustes ?? null,
      ocupacionPorNoche: ocupacion,
      limpieza: config.tarifaLimpieza,
      anticipoPorcentaje: config.anticipoPorcentaje,
      moneda: params.moneda,
    });
    disponibles.push({
      unitId: unidad.id,
      propertyId: unidad.propertyId,
      nombre: unidad.nombre,
      tipo: unidad.tipo,
      capacidad: unidad.capacidad,
      tarifaPorNoche: tarifa,
      desgloseNoches: cotizacion.desgloseNoches,
      cotizacion,
    });
  }

  if (disponibles.length === 0) {
    return (
      ultimoMotivo || {
        ok: false,
        motivo: 'sin_unidades',
        mensaje: 'No hay unidades publicadas para esas fechas.',
      }
    );
  }

  return {
    ok: true,
    noches: nightsBetween(checkIn, checkOut),
    moneda: disponibles[0].cotizacion.moneda,
    unidades: disponibles,
  };
}

export interface HuespedDirecto {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  notas?: string | null;
  /**
   * Documento del titular tal como lo envía el formulario (`tipoDocumento`,
   * `numeroDocumento`, `fechaNacimiento`, `nacionalidad`…). Es opcional: el
   * huésped puede dejarlo para el enlace de check-in.
   */
  documento?: Record<string, unknown> | null;
}

export interface EntradaReservaDirecta {
  tenantId: string;
  config: ConfigBooking;
  propertyId: string;
  unitId: string;
  checkIn: Date;
  checkOut: Date;
  adultos: number;
  ninos: number;
  huesped: HuespedDirecto;
  /** Divisa con la que se cotizó y se guardará la reserva. */
  moneda: string;
  /**
   * Identificador de la solicitud generado por quien reserva. Es la clave de
   * idempotencia: reintentar el mismo formulario devuelve la reserva ya creada
   * en vez de crear otra.
   */
  solicitudId: string;
  /**
   * Idioma en que reservó el huésped (`?lang` de la página pública). Se guarda en
   * `guestData.idioma`, que es lo que leen las comunicaciones automáticas (L-21)
   * para mandarle confirmación, pre-llegada y post-estancia en su idioma. Un valor
   * ausente o desconocido cae a español.
   */
  idioma?: string | null;
  /**
   * Extras elegidos en la web (`[{ extraId, cantidad }]`). Es una SELECCIÓN: el
   * precio lo pone el catálogo activo del servidor, nunca el navegador.
   */
  extras?: unknown;
}

export type ResultadoReservaDirecta =
  | {
      ok: true;
      reservaId: string;
      referencia: string;
      estado: string;
      /** Total de la reserva: estancia + extras. */
      total: number;
      moneda: string;
      noches: number;
      /** Anticipo de la estancia (0 = se cobra el total). */
      anticipo: number;
      /** Suma de las líneas de extras seleccionadas. */
      totalExtras: number;
      /** Enlace de check-in del huésped (null si no se pudo preparar). */
      checkinUrl: string | null;
      yaExistia: boolean;
    }
  | { ok: false; motivo: 'no_disponible' | 'datos' | 'sin_precio' | 'sin_solicitud'; mensaje: string };

/**
 * Crea la reserva directa por el Reservation Engine.
 *
 * Orden de los pasos, y por qué:
 * 1. Se valida la estancia contra las restricciones del plan (y se cotiza) antes
 *    de tocar nada, para poder rechazar con la causa exacta.
 * 2. Se toma el bloqueo de fila de la unidad y se vuelve a comprobar la
 *    disponibilidad. La cotización que vio el huésped puede tener minutos: lo que
 *    decide es el estado en el momento de escribir.
 * 3. El huésped se resuelve contra el CRM con el mismo `upsertGuest` del webhook.
 * 4. La reserva nace `pending` si el tenant exige cobro online y `confirmed` si
 *    no: una solicitud sin pagar no puede aparecer como confirmada.
 */
export async function crearReservaDirecta(
  entrada: EntradaReservaDirecta
): Promise<ResultadoReservaDirecta> {
  const { tenantId, config, propertyId, unitId, checkIn, checkOut, moneda } = entrada;

  if (!entrada.solicitudId || entrada.solicitudId.length < 8) {
    return { ok: false, motivo: 'sin_solicitud', mensaje: 'Falta el identificador de la solicitud.' };
  }
  if (!entrada.huesped?.nombre?.trim()) {
    return { ok: false, motivo: 'datos', mensaje: 'Falta el nombre de quien reserva.' };
  }

  const referencia = `WEB-${entrada.solicitudId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)}`;

  // Reintento del mismo formulario: la clave única de la reserva
  // (`tenantId + channel + externalBookingId`) ya lo resolvió, así que se
  // devuelve la reserva existente en lugar de crear una segunda.
  const previa = await prisma.hospitalityReservation.findUnique({
    where: {
      tenantId_channel_externalBookingId: { tenantId, channel: CANAL_DIRECTO, externalBookingId: referencia },
    },
  });
  if (previa) {
    return {
      ok: true,
      reservaId: previa.id,
      referencia: previa.externalBookingId,
      estado: previa.estado,
      total: Number(previa.amountAfterTax) || 0,
      moneda: previa.currency || moneda,
      noches: nightsBetween(previa.checkIn, previa.checkOut),
      // Un reintento del formulario no vuelve a cotizar ni a cobrar: devuelve la
      // misma reserva y su enlace de check-in (el que el huésped ya tiene).
      anticipo: 0,
      totalExtras: 0,
      checkinUrl: await enlaceDeCheckinDe(previa, entrada.idioma),
      yaExistia: true,
    };
  }

  const unidad = await prisma.hospitalityUnit.findFirst({
    where: { id: unitId, tenantId, propertyId, estado: { notIn: ESTADOS_NO_VENDIBLES } },
    include: { ratePlans: { where: { activo: true }, orderBy: { tarifa: 'asc' } } },
  });
  if (!unidad) {
    return { ok: false, motivo: 'no_disponible', mensaje: 'Esa unidad no está disponible para reservar.' };
  }

  const plan = unidad.ratePlans[0] || null;
  const tarifa = tarifaPorNocheDe({ plan, tarifaBase: unidad.tarifaBase });
  if (tarifa === null) {
    return { ok: false, motivo: 'sin_precio', mensaje: 'Esa unidad no tiene precio publicado.' };
  }

  const estancia = validarEstancia({
    checkIn,
    checkOut,
    restricciones: plan
      ? {
          // Igual que en la cotización: las reglas de la temporada de la llegada
          // son restricciones más de la estancia que se va a crear.
          ...reglasDeVentaDeLlegada({
            fecha: startOfDay(checkIn),
            estacionalidad: plan.temporadas ?? plan.finDeSemana,
            plan,
          }),
        }
      : null,
  });
  if (!estancia.ok) {
    return { ok: false, motivo: 'datos', mensaje: estancia.mensaje };
  }

  // Ocupación del momento de reservar: es la lectura que consumen los tramos de
  // la capa 2 para fijar el precio. La estancia se vuelve a comprobar dentro de
  // la transacción, bajo el bloqueo de la unidad, y eso es lo que decide si se
  // puede vender; esto solo decide cuánto. Una lectura más, a cambio de que el
  // precio guardado salga de las mismas reglas que vio el huésped.
  const contextoPrecio = await loadAvailabilityContext(prisma, tenantId, propertyId, checkIn, checkOut);
  const ocupacion = ocupacionPorNoche(
    contextoPrecio.units,
    checkIn,
    checkOut,
    contextoPrecio.reservations,
    contextoPrecio.blocks
  );

  const cotizacion = cotizarEstancia({
    checkIn,
    checkOut,
    tarifaPorNoche: tarifa,
    estacionalidad: plan ? plan.temporadas ?? plan.finDeSemana : null,
    ajustes: plan?.ajustes ?? null,
    ocupacionPorNoche: ocupacion,
    limpieza: config.tarifaLimpieza,
    anticipoPorcentaje: config.anticipoPorcentaje,
    moneda,
  });

  const huespedes = Math.max(1, entrada.adultos) + Math.max(0, entrada.ninos);
  if (unidad.capacidad < huespedes) {
    return {
      ok: false,
      motivo: 'datos',
      mensaje: `La unidad admite hasta ${unidad.capacidad} huéspedes.`,
    };
  }

  // Extras: la selección del huésped se resuelve contra el catálogo ACTIVO de la
  // propiedad, que es el único que fija el precio (el navegador solo nombra el
  // extra). Se lee antes de escribir porque el importe que se guarda y el que se
  // cobra ya los incluyen: la reserva nace con su desglose completo.
  const catalogo = await catalogoDeExtras(propertyId);
  const seleccionExtras = resolverExtras(entrada.extras, catalogo, cotizacion.noches);
  const lineasExtras = seleccionExtras.ok ? seleccionExtras.lineas : [];
  const totalExtras = seleccionExtras.ok ? seleccionExtras.total : 0;
  if (!seleccionExtras.ok) {
    console.error('[BookingEngine] Selección de extras inválida:', seleccionExtras.error);
  } else if (seleccionExtras.ignorados.length > 0) {
    console.log('[BookingEngine] Extras ignorados en la reserva directa:', seleccionExtras.ignorados);
  }
  const total = Math.round((cotizacion.total + totalExtras) * 100) / 100;

  // Registro de viajeros (RD 933/2021): el documento que el huésped deja al
  // reservar se guarda YA, en el formato que lee el parte; lo que falte lo
  // completa él mismo desde el enlace de check-in.
  const viajeros = viajerosDelTitular({
    documento: entrada.huesped.documento,
    nombre: entrada.huesped.nombre,
    email: entrada.huesped.email,
    telefono: entrada.huesped.telefono,
  });

  const payloadHuésped: WebhookReservationPayload = {
    action: 'book',
    hotelCode: 'directo',
    channel: CANAL_DIRECTO,
    bookingId: referencia,
    checkin: checkIn.toISOString(),
    checkout: checkOut.toISOString(),
    guest: {
      firstName: entrada.huesped.nombre.trim(),
      email: entrada.huesped.email?.trim() || null,
      phone: entrada.huesped.telefono?.trim() || null,
      address:
        entrada.huesped.pais || entrada.huesped.ciudad
          ? {
              city: entrada.huesped.ciudad?.trim() || null,
              country: entrada.huesped.pais?.trim() || null,
            }
          : null,
    },
    specialRequests: entrada.huesped.notas?.trim() || null,
  };

  const estadoInicial = config.requierePagoOnline ? 'pending' : 'confirmed';

  const creada = await prisma.$transaction(async (tx) => {
    // Bloqueo de fila sobre la unidad: serializa las reservas de la misma unidad
    // para que dos solicitudes simultáneas no pasen las dos la comprobación.
    await tx.$queryRaw`SELECT id FROM hospitality_units WHERE id = ${unitId} FOR UPDATE`;

    const contexto = await loadAvailabilityContext(tx as unknown as typeof prisma, tenantId, propertyId, checkIn, checkOut);
    for (let cursor = startOfDay(checkIn); cursor.getTime() < startOfDay(checkOut).getTime(); cursor.setDate(cursor.getDate() + 1)) {
      if (unitUnavailableOnDay(unitId, cursor, contexto.reservations, contexto.blocks)) {
        return null;
      }
    }

    const contactId = await upsertGuest(tenantId, payloadHuésped, tx as unknown as typeof prisma);

    const reserva = await tx.hospitalityReservation.create({
      data: {
        tenantId,
        propertyId,
        unitId,
        contactId,
        channel: CANAL_DIRECTO,
        externalBookingId: referencia,
        action: 'book',
        estado: estadoInicial,
        checkIn,
        checkOut,
        bookedOn: new Date(),
        segment: CANAL_DIRECTO,
        specialRequests: payloadHuésped.specialRequests ?? null,
        pah: false,
        amountAfterTax: total,
        amountBeforeTax: total,
        tax: 0,
        currency: moneda,
        commission: 0,
        occupancyAdults: Math.max(1, entrada.adultos),
        occupancyChildren: Math.max(0, entrada.ninos),
        guestData: {
          firstName: payloadHuésped.guest?.firstName ?? null,
          lastName: null,
          email: payloadHuésped.guest?.email ?? null,
          phone: payloadHuésped.guest?.phone ?? null,
          idioma: idiomaDeValor(entrada.idioma),
          origen: 'booking_engine',
          ...(viajeros.length ? { viajeros } : {}),
        } as Prisma.InputJsonValue,
        payload: {
          origen: 'booking_engine',
          solicitudId: entrada.solicitudId,
          cotizacion,
          extras: lineasExtras,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // Desglose real de la reserva: el propietario ve de dónde sale el importe, y
    // el informe financiero suma líneas, no el total del encabezado.
    await tx.hospitalityReservationItem.createMany({
      data: [
        {
          tenantId,
          reservationId: reserva.id,
          propertyId,
          unitId,
          tipo: 'alojamiento',
          // La tarifa puede no ser plana (temporada, ajustes o las dos): la
          // línea dice de dónde sale el importe y el detalle fecha a fecha
          // queda en `payload.cotizacion.desgloseNoches` de la reserva. La
          // frase es la misma que escribe el otro motor (`conceptoAlojamiento`).
          concepto: conceptoAlojamiento(cotizacion),
          cantidad: cotizacion.noches,
          importeUnitario: cotizacion.tarifaPorNoche,
          importeTotal: cotizacion.alojamiento,
          moneda,
        },
        ...(cotizacion.limpieza > 0
          ? [
              {
                tenantId,
                reservationId: reserva.id,
                propertyId,
                unitId,
                tipo: 'limpieza',
                concepto: 'Limpieza final de estancia',
                cantidad: 1,
                importeUnitario: cotizacion.limpieza,
                importeTotal: cotizacion.limpieza,
                moneda,
              },
            ]
          : []),
        // Cada extra es una línea tipo `extra` del MISMO desglose que suma
        // Finanzas: la selección del huésped entra en el margen de la reserva.
        ...filasDeItemsExtras(lineasExtras, {
          tenantId,
          reservationId: reserva.id,
          propertyId,
          unitId,
        }),
      ],
    });

    return reserva;
  });

  if (!creada) {
    return {
      ok: false,
      motivo: 'no_disponible',
      mensaje: 'Esas fechas acaban de ocuparse. Prueba con otras fechas o unidad.',
    };
  }

  // A partir de aquí no se bloquea nada: la reserva ya existe y es lo que el
  // huésped tiene que ver. Un fallo de mensajería o de push no puede convertirla
  // en un error para él.
  //
  // El enlace de check-in se prepara ANTES de disparar nada que lo renderice: la
  // confirmación arma su propio enlace y, si la reserva todavía no tiene token,
  // generaría otro —dejando sin valor el que ve el huésped al reservar—.
  const checkinUrl = await enlaceDeCheckinDe(creada, entrada.idioma);

  emitReservationCreated({
    tenantId,
    reservationId: creada.id,
    propertyId,
    unitId,
    contactId: creada.contactId,
    channel: CANAL_DIRECTO,
    externalBookingId: referencia,
    estado: estadoInicial,
    checkIn,
    checkOut,
    guestData: creada.guestData,
  });

  if (estadoInicial === 'confirmed') {
    dispararComunicacionReserva({ tenantId, reservationId: creada.id, evento: 'confirmacion' }).catch(
      (e: unknown) => console.error('[Hospitality] Error en comunicación de confirmación (directa):', e)
    );
  }

  try {
    await dispatchConnectivityPush(tenantId, propertyId, 'reserva_creada', { skipRates: true });
  } catch (e) {
    console.error('[Hospitality] Error en push tras reserva directa:', e);
  }

  return {
    ok: true,
    reservaId: creada.id,
    referencia,
    estado: estadoInicial,
    total,
    moneda,
    noches: cotizacion.noches,
    anticipo: cotizacion.anticipo,
    totalExtras,
    checkinUrl,
    yaExistia: false,
  };
}

/**
 * Catálogo activo de extras de la propiedad.
 *
 * Auxiliar a propósito: si la lectura falla, la reserva se vende sin extras en
 * lugar de caerse. El huésped nunca ve un error por un catálogo que no carga.
 */
async function catalogoDeExtras(propertyId: string): Promise<ExtraCatalogo[]> {
  try {
    return await prisma.hospitalityExtra.findMany({ where: { propertyId, activo: true } });
  } catch (e) {
    console.error('[BookingEngine] No se pudo leer el catálogo de extras:', e);
    return [];
  }
}

/**
 * Viajeros que deja documentados el titular al reservar.
 *
 * Solo se guarda si hay documentación de verdad: el nombre suelto no es un
 * parte. Lo que falte lo completa el huésped desde su enlace de check-in.
 */
function viajerosDelTitular(params: {
  documento?: Record<string, unknown> | null;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
}): ViajeroCheckin[] {
  const crudo = (params.documento || {}) as Record<string, unknown>;
  const titular = normalizarViajero({
    ...crudo,
    // Si el huésped no repitió su nombre en el bloque del documento, vale el que
    // ya escribió arriba: es la misma persona.
    nombre: crudo.nombre || params.nombre,
    correo: crudo.correo || params.email,
    telefono: crudo.telefono || params.telefono,
  });
  if (!titular) return [];
  const documentaAlgo = Boolean(
    titular.tipoDocumento ||
      titular.numeroDocumento ||
      titular.fechaNacimiento ||
      titular.direccion
  );
  return documentaAlgo ? [titular] : [];
}

/**
 * Enlace de check-in de una reserva recién creada (o recuperada).
 *
 * No bloquea la venta: si el token no se puede preparar, la reserva existe y el
 * huésped recibe el enlace por el email de pre-llegada, que lo genera al vuelo.
 */
async function enlaceDeCheckinDe(
  reserva: { id: string; tokenCheckin?: string | null },
  idioma?: unknown
): Promise<string | null> {
  try {
    const token = await asegurarTokenCheckin(reserva);
    return enlaceCheckin(token, idioma);
  } catch (e) {
    console.error('[BookingEngine] No se pudo preparar el enlace de check-in:', e);
    return null;
  }
}

/** Fechas ISO del rango, para mostrarlas sin depender del locale del servidor. */
export function rangoPublico(checkIn: Date, checkOut: Date): { desde: string; hasta: string } {
  return { desde: toIsoDate(checkIn), hasta: toIsoDate(checkOut) };
}

export interface PaginaPublicaResuelta {
  config: ConfigBooking;
  tenant: { id: string; nombre: string };
  moneda: string;
  propiedades: PropiedadPublica[];
}

export type ResultadoPaginaPublica =
  | ({ ok: true } & PaginaPublicaResuelta)
  | { ok: false; motivo: 'no_existe' | 'inactiva'; mensaje: string };

/**
 * Resuelve la página pública de un tenant por su slug.
 *
 * Una configuración desactivada no se sirve aunque el enlace siga circulando: es
 * la forma que tiene el tenant de retirar su página sin borrarla.
 */
export async function resolverPaginaPublica(slug: string): Promise<ResultadoPaginaPublica> {
  const fila = await leerConfigPorSlug(slug);
  if (!fila) {
    return { ok: false, motivo: 'no_existe', mensaje: 'Esta página de reservas no existe.' };
  }
  if (!fila.activo) {
    return {
      ok: false,
      motivo: 'inactiva',
      mensaje: 'Este alojamiento ha desactivado su página de reservas.',
    };
  }

  const config = fila as unknown as ConfigBooking;
  const moneda = monedaPublicada(config, fila.tenant?.moneda);
  const propiedades = await listarPropiedadesPublicables(fila.tenantId, config);

  return {
    ok: true,
    config,
    tenant: { id: fila.tenant.id, nombre: fila.tenant.nombre },
    moneda,
    propiedades,
  };
}

/**
 * Tarificación y restricciones de venta del motor (API del desplegado: la usa
 * la ruta pública que atiende el flujo directo del hotel). Vive en su propio
 * módulo —`booking-rates.ts`— para que este fichero siga siendo el motor de
 * reserva directa que vigila la guardia del Booking Engine, sin dos
 * implementaciones mezcladas en un mismo archivo.
 */
export * from './booking-rates';
