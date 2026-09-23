/**
 * Carga de datos para Finanzas y Reportes (FASE 3.B / 3.E).
 *
 * Es la única capa que lee reservas con sus líneas y pagos para informar de
 * dinero, para que Finanzas y Reportes no construyan cada uno su propia
 * consulta y acaben contando cosas distintas.
 *
 * Lectura pura: no escribe nada. Los agregados y el cálculo viven en los
 * módulos puros (`finance.ts`, `finance-summary.ts`, `reportes.ts`).
 */

import { prisma } from '@/lib/db';
import { lineasDesdeImporteExterno } from './finance';
import type { ReservaFinanciera } from './finance-summary';

export interface PropiedadBasica {
  id: string;
  nombre: string;
}

export interface UnidadBasica {
  id: string;
  propertyId: string;
  estado: string;
}

export interface DatosFinancieros {
  reservas: ReservaFinanciera[];
  propiedades: PropiedadBasica[];
  unidades: UnidadBasica[];
}

/** Nombre del huésped: primero los datos de la OTA, después el contacto del CRM. */
function nombreHuesped(
  guestData: unknown,
  contacto: { nombre: string | null } | null
): string | null {
  const datos = (guestData || {}) as Record<string, unknown>;
  const nombre = [datos.firstName, datos.lastName]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' ');
  if (nombre) return nombre;
  return contacto?.nombre || null;
}

/**
 * Reservas del período con su desglose y sus pagos.
 *
 * Una reserva de OTA puede no traer líneas (el proveedor manda un importe
 * total). En ese caso se construye una única línea de alojamiento con el
 * importe recibido, para que tenga rentabilidad sin inventar conceptos.
 */
export async function cargarDatosFinancieros(params: {
  tenantId: string;
  desde: Date;
  hasta: Date;
  propertyId?: string | null;
  canal?: string | null;
  limite?: number;
}): Promise<DatosFinancieros> {
  const where: Record<string, unknown> = {
    tenantId: params.tenantId,
    checkIn: { lt: params.hasta },
    checkOut: { gt: params.desde },
  };
  if (params.propertyId) where.propertyId = params.propertyId;
  if (params.canal) where.channel = { contains: params.canal, mode: 'insensitive' };

  const [reservations, properties, units] = await Promise.all([
    prisma.hospitalityReservation.findMany({
      where,
      select: {
        id: true,
        propertyId: true,
        unitId: true,
        channel: true,
        estado: true,
        checkIn: true,
        checkOut: true,
        bookedOn: true,
        amountAfterTax: true,
        currency: true,
        commission: true,
        guestData: true,
        unit: { select: { nombre: true } },
        property: { select: { nombre: true } },
        contact: { select: { nombre: true } },
        items: {
          select: {
            tipo: true,
            concepto: true,
            cantidad: true,
            importeUnitario: true,
            importeTotal: true,
          },
        },
        payments: { select: { importe: true, estado: true, metodo: true } },
      },
      orderBy: { checkIn: 'desc' },
      take: Math.min(Math.max(params.limite || 2000, 1), 5000),
    }),
    prisma.hospitalityProperty.findMany({
      where: { tenantId: params.tenantId },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.hospitalityUnit.findMany({
      where: { tenantId: params.tenantId },
      select: { id: true, propertyId: true, estado: true },
    }),
  ]);

  const reservas: ReservaFinanciera[] = reservations.map((reserva) => {
    const lineas =
      reserva.items.length > 0
        ? reserva.items.map((item) => ({
            tipo: item.tipo,
            concepto: item.concepto,
            cantidad: item.cantidad,
            importeUnitario: item.importeUnitario,
            importeTotal: item.importeTotal,
          }))
        : lineasDesdeImporteExterno(reserva.amountAfterTax || 0);

    return {
      id: reserva.id,
      channel: reserva.channel,
      estado: reserva.estado,
      checkIn: reserva.checkIn,
      checkOut: reserva.checkOut,
      bookedOn: reserva.bookedOn,
      propertyId: reserva.propertyId,
      propertyNombre: reserva.property?.nombre || null,
      unitId: reserva.unitId,
      unidadNombre: reserva.unit?.nombre || null,
      huesped: nombreHuesped(reserva.guestData, reserva.contact),
      moneda: reserva.currency,
      lineas,
      pagos: reserva.payments.map((pago) => ({
        importe: pago.importe,
        estado: pago.estado,
        metodo: pago.metodo,
      })),
      comisionOta: reserva.commission || 0,
      comisionPasarela: 0,
      otrosGastos: 0,
    };
  });

  return { reservas, propiedades: properties, unidades: units };
}

/**
 * Rango del informe a partir de los parámetros de la URL.
 * Por defecto, el mes en curso. `hasta` se devuelve exclusivo (día siguiente).
 */
export function resolverRango(searchParams: URLSearchParams): { desde: Date; hasta: Date } {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const desdeParam = searchParams.get('desde');
  const hastaParam = searchParams.get('hasta');

  let desde: Date;
  if (desdeParam) {
    desde = new Date(`${desdeParam}T00:00:00`);
  } else {
    desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }
  if (isNaN(desde.getTime())) desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  let hastaExclusivo: Date;
  if (hastaParam) {
    const hasta = new Date(`${hastaParam}T00:00:00`);
    if (isNaN(hasta.getTime())) {
      hastaExclusivo = new Date(desde);
      hastaExclusivo.setMonth(hastaExclusivo.getMonth() + 1);
    } else {
      hastaExclusivo = new Date(hasta);
      hastaExclusivo.setDate(hastaExclusivo.getDate() + 1);
    }
  } else {
    hastaExclusivo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  }

  if (hastaExclusivo.getTime() <= desde.getTime()) {
    hastaExclusivo = new Date(desde);
    hastaExclusivo.setDate(hastaExclusivo.getDate() + 1);
  }

  return { desde, hasta: hastaExclusivo };
}
