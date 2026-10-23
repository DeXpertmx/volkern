/**
 * Cotejo de precios del vínculo automático (peaje del canal de seguridad).
 *
 * El operador que va a confirmar un vínculo `pendiente_revision` no solo
 * necesita ver que la unidad apunta a la habitación correcta: le falta la otra
 * mitad del cotejo — que el precio que el canal YA VENDIÓ (la reserva que trajo
 * el vínculo) encaje con la tarifa que tenemos configurada. Si el canal vendió
 * por debajo de nuestra tarifa, confirmar el vínculo tal cual significa seguir
 * publicando un precio con pérdidas: eso es lo que este módulo saca a la luz.
 *
 * Reglas del cotejo (§0.1: nada se inventa):
 *  - El precio del canal sale de la reserva real (amountAfterTax / noches).
 *    Reserva ausente → `canal: null` y veredicto `sin_reserva` (no se adivina).
 *  - Nuestro precio cotiza el MISMO rango con el plan vinculado —la MISMA
 *    llamada del motor de reservas (capa 1: temporada/fin de semana; la capa 2
 *    no entra porque el push a canales empuja la capa 1)— o la tarifa base de
 *    la unidad. Sin precio → veredicto `sin_precio`.
 *  - La limpieza no entra: el canal a veces la desglosa y a veces no; sumarla
 *    de un lado y no del otro compararía peras con peras.
 *  - Tolerancia: un canal que vendió ≥95% de nuestra tarifa media es `ok` (las
 *    OTAs rondan lo que les empujamos con sus propios redondeos). Por debajo,
 *    `canal_bajo` — una alarma para el operador, no un bloqueo: el peaje sigue
 *    siendo confirmar o deshacer.
 */

import { prisma } from '@/lib/db';
import { cotizarEstancia, type Cotizacion } from './pricing';
import { PROVIDER_CONECTIVIDAD } from './incidencias';

/** Tolerancia del veredicto `ok` (fracción). 5% abajo ya es `canal_bajo`. */
export const TOLERANCIA_COTEJO = 0.95;

export type VeredictoCotejo = 'ok' | 'canal_bajo' | 'sin_reserva' | 'sin_precio';

export interface CotejoDeVinculo {
  unitId: string | null;
  unit: string | null;
  roomCode: string | null;
  rateplanCode: string | null;
  motivo: string | null;
  creadoEn: string;
  /** Solo informe: automático VIEJO (`activo` + metadata webhook), no bloquea nada. */
  soloInformativo: boolean;
  /**
   * La reserva que trajo el vínculo, con lo que el canal cobró de verdad y el
   * desglose por noche del payload cuando la reserva lo guardó.
   */
  canal: {
    bookingId: string | null;
    channel: string | null;
    checkIn: string | null;
    checkOut: string | null;
    noches: number | null;
    /** Total que el canal cobró (amountAfterTax). */
    importe: number | null;
    moneda: string | null;
    /** Media por noche que el canal cobró (importe / noches). */
    porNoche: number | null;
  } | null;
  /** Lo que nuestra tarifa cotiza para ese mismo rango (o solo la media). */
  nuestro: {
    porNoche: number | null;
    total: number | null;
    moneda: string | null;
    fuente: 'plan_vinculado' | 'plan_activo' | 'tarifa_base' | 'sin_precio';
  };
  /** Porcentaje: 100 = el canal cobró exactamente nuestra tarifa media. */
  porcentaje: number | null;
  veredicto: VeredictoCotejo;
}

/** Resumen del cotejo de la propiedad (para la banda y el modal). */
export interface ResultadoCotejo {
  ok: boolean;
  propertyId: string;
  hotelCode: string | null;
  vinculos: CotejoDeVinculo[];
  /** Cuántos veredictos con alerta tiene que mirar una persona (peaje). */
  conAlerta: number;
}

const DIAS_MS = 86_400_000;

function nochesEntre(desde: Date, hasta: Date): number {
  // La reserva del canal viaja en medianoche del huso del hotel (mismo criterio
  // que el motor): la cuenta es de días de calendario, redonda.
  return Math.round((hasta.getTime() - desde.getTime()) / DIAS_MS);
}

interface PlanPrecio {
  tarifa: number;
  moneda: string;
  temporadas: unknown;
  finDeSemana: unknown;
}

/**
 * Precio del lado nuestro: plan vinculado → plan activo de la unidad → tarifa
 * base de la unidad. La misma precedencia que `tarifaPorNocheDe`, pero
 * devolviendo también la capa 1 del plan elegido (es la que viaja al canal).
 */
async function precioNuestro(
  tenantId: string,
  mapping: { unitId: string | null; externalRatePlanCode: string | null },
  unit: { tarifaBase: number | null; moneda: string } | null
): Promise<{
  tarifa: number | null;
  moneda: string | null;
  estacionalidad: unknown;
  fuente: CotejoDeVinculo['nuestro']['fuente'];
}> {
  let plan: PlanPrecio | null = null;
  let fuente: CotejoDeVinculo['nuestro']['fuente'] = 'tarifa_base';

  if (mapping.unitId) {
    if (mapping.externalRatePlanCode) {
      plan = await prisma.hospitalityRatePlan.findFirst({
        where: { tenantId, unitId: mapping.unitId, activo: true, codigo: mapping.externalRatePlanCode },
        select: { tarifa: true, moneda: true, temporadas: true, finDeSemana: true },
      });
      if (plan) fuente = 'plan_vinculado';
    }
    if (!plan) {
      plan = await prisma.hospitalityRatePlan.findFirst({
        where: { tenantId, unitId: mapping.unitId, activo: true },
        orderBy: { fechaCreacion: 'asc' as const },
        select: { tarifa: true, moneda: true, temporadas: true, finDeSemana: true },
      });
      if (plan && fuente !== 'plan_vinculado') fuente = 'plan_activo';
    }
  }

  const tarifa = plan?.tarifa ?? (typeof unit?.tarifaBase === 'number' ? unit.tarifaBase : null);
  if (tarifa == null || !(tarifa > 0)) return { tarifa: null, moneda: null, estacionalidad: null, fuente: 'sin_precio' };

  return {
    tarifa,
    moneda: (plan?.moneda ?? unit?.moneda ?? '').toUpperCase() || null,
    // Misma forma cruda que pasa el motor de reservas al cotizar.
    estacionalidad: plan ? plan.temporadas ?? plan.finDeSemana : null,
    fuente,
  };
}

function cotizacionSilenciosa(entrada: {
  checkIn: Date;
  checkOut: Date;
  tarifa: number;
  estacionalidad: unknown;
  moneda: string | null;
}): { total: number; porNoche: number; moneda: string } | null {
  try {
    const c = cotizarEstancia({
      checkIn: entrada.checkIn,
      checkOut: entrada.checkOut,
      tarifaPorNoche: entrada.tarifa,
      estacionalidad: entrada.estacionalidad,
      // Sin limpieza ni ajustes: el push a canales empuja alojamiento de
      // capa 1, y el desglose de limpieza del canal no es comparable.
      limpieza: 0,
      moneda: entrada.moneda ?? '',
    });
    return { total: c.alojamiento, porNoche: c.tarifaPorNoche, moneda: c.moneda };
  } catch {
    // Rango imposible (sin noches) o noches sin precio: cotejo sin costado
    // nuestro — el veredicto queda en el resto de los datos.
    return null;
  }
}

/**
 * Coteja TODOS los vínculos pendientes de revisión de la propiedad (más, en
 * modo solo-informativo, los automáticos viejos que siguen activo): lo que
 * vendió el canal contra nuestra tarifa, con veredicto.
 */
export async function cotejarVinculosPropiedad(input: {
  tenantId: string;
  propertyId: string;
}): Promise<ResultadoCotejo> {
  const prop = await prisma.hospitalityProperty.findFirst({
    where: { id: input.propertyId, tenantId: input.tenantId },
    select: {
      id: true,
      mappings: {
        where: { provider: PROVIDER_CONECTIVIDAD, unitId: null },
        select: { externalPropertyId: true },
        take: 1,
      },
    },
  });
  if (!prop) {
    return { ok: false, propertyId: input.propertyId, hotelCode: null, vinculos: [], conAlerta: 0 };
  }

  const mappings = await prisma.connectivityMapping.findMany({
    where: {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      provider: PROVIDER_CONECTIVIDAD,
      OR: [
        // NUEVOS: nacieron del webhook y nadie los confirmó (el peaje).
        { estado: 'pendiente_revision' },
        // VIEJOS: automáticos de antes del peaje, siguen activo pero nadie
        // confirmó su precio — van como informe, no bloquean.
        {
          estado: 'activo',
          metadata: { path: ['origen'], equals: 'vinculacion_automatica_webhook' },
        },
      ],
    },
    orderBy: { fechaCreacion: 'desc' as const },
    select: {
      estado: true,
      externalUnitCode: true,
      externalRatePlanCode: true,
      metadata: true,
      fechaCreacion: true,
      unitId: true,
      unit: { select: { nombre: true, tarifaBase: true, moneda: true } },
    },
  });

  const vinculos: CotejoDeVinculo[] = [];

  for (const m of mappings) {
    const meta = (m.metadata ?? null) as Record<string, unknown> | null;
    const reserva = m.unitId
      ? await prisma.hospitalityReservation.findFirst({
          where: {
            tenantId: input.tenantId,
            unitId: m.unitId,
            estado: { not: 'cancelled' },
            // La reserva que TRAJO el vínculo es el cotejo objetivo: la
            // identifica el bookingId del webhook que la creó. Sin bookingId
            // (metadatos viejos), la última de la unidad es lo más honesto.
            ...(meta?.bookingId ? { externalBookingId: meta.bookingId as string } : {}),
          },
          orderBy: { checkIn: 'desc' as const },
          select: {
            externalBookingId: true,
            channel: true,
            checkIn: true,
            checkOut: true,
            amountAfterTax: true,
            currency: true,
          },
        })
      : null;

    const { tarifa, moneda, estacionalidad, fuente } = await precioNuestro(
      input.tenantId,
      { unitId: m.unitId, externalRatePlanCode: m.externalRatePlanCode },
      m.unit ? { tarifaBase: m.unit.tarifaBase, moneda: m.unit.moneda } : null
    );

    const noches = reserva ? nochesEntre(reserva.checkIn, reserva.checkOut) : null;
    const importeCanal = reserva?.amountAfterTax ?? null;
    const porNocheCanal =
      importeCanal != null && noches != null && noches > 0 ? importeCanal / noches : null;

    // El rango a cotizar es el de la reserva del canal; sin reserva no hay
    // rango, así que el precio nuestro queda solo informativo (tarifa plana).
    let totalNuestro: number | null = null;
    let porNocheNuestro: number | null = tarifa;
    let monedaNuestro: string | null = moneda;
    if (tarifa != null && reserva && reserva.checkOut > reserva.checkIn) {
      const cotizado = cotizacionSilenciosa({
        checkIn: reserva.checkIn,
        checkOut: reserva.checkOut,
        tarifa,
        estacionalidad,
        moneda,
      });
      if (cotizado) {
        totalNuestro = cotizado.total;
        porNocheNuestro = cotizado.porNoche;
        monedaNuestro = cotizado.moneda || moneda;
      }
    }

    const porcentaje =
      porNocheNuestro != null &&
      porNocheCanal != null
        ? Math.round((porNocheCanal / porNocheNuestro) * 100)
        : null;

    let veredicto: VeredictoCotejo;
    if (fuente === 'sin_precio' || porNocheNuestro == null) veredicto = 'sin_precio';
    else if (porNocheCanal == null) veredicto = 'sin_reserva';
    else veredicto = porNocheCanal >= porNocheNuestro * TOLERANCIA_COTEJO ? 'ok' : 'canal_bajo';

    vinculos.push({
      unitId: m.unitId,
      unit: m.unit?.nombre ?? null,
      roomCode: m.externalUnitCode,
      rateplanCode: m.externalRatePlanCode,
      motivo: typeof meta?.motivo === 'string' ? meta.motivo : null,
      creadoEn: m.fechaCreacion.toISOString(),
      soloInformativo: m.estado !== 'pendiente_revision',
      canal: reserva
        ? {
            bookingId: reserva.externalBookingId,
            channel: reserva.channel,
            checkIn: reserva.checkIn.toISOString(),
            checkOut: reserva.checkOut.toISOString(),
            noches,
            importe: importeCanal,
            moneda: reserva.currency,
            porNoche: porNocheCanal,
          }
        : null,
      nuestro: {
        porNoche: porNocheNuestro,
        total: totalNuestro,
        moneda: monedaNuestro ?? m.unit?.moneda ?? null,
        fuente,
      },
      porcentaje,
      veredicto,
    });
  }

  const conAlerta = vinculos.filter(
    (v) => (v.veredicto === 'canal_bajo' || v.veredicto === 'sin_precio') && !v.soloInformativo
  ).length;

  return { ok: true, propertyId: input.propertyId, hotelCode: prop.mappings[0]?.externalPropertyId ?? null, vinculos, conAlerta };
}
