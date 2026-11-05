export const dynamic = 'force-dynamic';

/**
 * Rendimiento de los CÓDIGOS PROMOCIONALES (comparativa entre códigos).
 *
 * GET /api/hospitality/promos/rendimiento?desde&hasta
 *
 * Devuelve, por código, cuánto descuento concedió y cuánto ingreso neto trajo,
 * más los totales del periodo. Es de solo lectura y todo el cálculo vive en el
 * módulo puro `lib/hospitality/promos-rendimiento.ts`: aquí solo se leen las
 * reservas con línea de descuento y el catálogo de códigos.
 *
 * La ventana por defecto son los ÚLTIMOS 12 MESES, no el mes en curso: una
 * promoción de temporada se juzga con su temporada entera, y con el mes en curso
 * la tabla saldría casi siempre vacía. Se puede acotar con `desde`/`hasta`
 * (`YYYY-MM-DD`, sobre la fecha de ENTRADA, como el resto de Hospitality).
 *
 * El gasto de dinero es un dato financiero: la capacidad es `finanzas.ver`.
 *
 * Además de las reservas se leen las CONSULTAS del código registradas por la web
 * pública. Son el denominador de la conversión: una reserva dice que el código
 * funcionó; la consulta que no reservó dice cuánta gente lo probó y se fue. Se
 * filtran por la MISMA fecha de entrada que las reservas, para que numerador y
 * denominador hablen de las mismas estancias.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import {
  diaLocal,
  rendimientoPromociones,
  resolverVentanaPromos,
  type ReservaConPromocion,
} from '@/lib/hospitality/promos-rendimiento';
import { CONSULTA_APLICADA } from '@/lib/hospitality/promos-consultas';
import {
  CONVERSION_MINIMA_PCT,
  MINIMO_CONSULTAS_ALERTA,
  contarConsultas,
  desdeVentanaAlertas,
  evaluarAlertasPromocion,
} from '@/lib/hospitality/promos-alertas';

/** Noches de la estancia; una reserva con fechas invertidas cuenta 0. */
function nochesDe(checkIn: Date, checkOut: Date): number {
  const noches = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
  return Number.isFinite(noches) && noches > 0 ? noches : 0;
}

/** Código declarado en el payload de la reserva (`payload.promocion.codigo`). */
function codigoDelPayload(payload: unknown): string | null {
  const promocion = (payload as { promocion?: { codigo?: unknown } } | null)?.promocion;
  const codigo = promocion?.codigo;
  return typeof codigo === 'string' && codigo.trim() ? codigo.trim() : null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.ver');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const { searchParams } = new URL(req.url);
    const { desde, hasta } = resolverVentanaPromos({
      desde: searchParams.get('desde'),
      hasta: searchParams.get('hasta'),
    });

    // Solo reservas CON línea de descuento: son las únicas que se pueden
    // atribuir a un código, y leer el resto del histórico sería traer ventas que
    // ningún código explica.
    const [reservas, codigos, consultas] = await Promise.all([
      prisma.hospitalityReservation.findMany({
        where: {
          tenantId,
          checkIn: { gte: desde, lt: hasta },
          items: { some: { tipo: 'descuento' } },
        },
        select: {
          id: true,
          estado: true,
          checkIn: true,
          checkOut: true,
          currency: true,
          commission: true,
          payload: true,
          items: {
            select: {
              tipo: true,
              concepto: true,
              cantidad: true,
              importeUnitario: true,
              importeTotal: true,
            },
          },
        },
        orderBy: { checkIn: 'desc' },
        take: 5000,
      }),
      prisma.hospitalityPromoCode.findMany({
        where: { tenantId },
        select: { codigo: true, moneda: true, usos: true, activo: true, maxUsos: true },
      }),
      // Solo lo que hace falta para contar: ni importes ni datos del huésped.
      // El tope acota una cuenta con muchísimo tráfico; el informe es una
      // comparativa, no un libro de auditoría.
      prisma.hospitalityPromoConsulta.findMany({
        where: { tenantId, checkIn: { gte: desde, lt: hasta } },
        select: { codigo: true, resultado: true, reservationId: true, sesionId: true },
        orderBy: { fecha: 'desc' },
        take: 20_000,
      }),
    ]);

    // Las alertas NO usan la ventana de la tabla. La tabla compara estancias
    // (check-in); la alerta juzga la actividad reciente del código, y una
    // consulta para dentro de seis meses es un intento de hoy. Se lee por
    // `fecha` de registro, los últimos `DIAS_VENTANA_ALERTA` días.
    const alertasDesde = desdeVentanaAlertas();
    const consultasRecientes = await prisma.hospitalityPromoConsulta.findMany({
      where: { tenantId, fecha: { gte: alertasDesde }, resultado: CONSULTA_APLICADA },
      select: { codigo: true, reservationId: true },
      take: 50_000,
    });
    const alertas = evaluarAlertasPromocion(
      contarConsultas(
        codigos.map((codigo) => ({
          tenantId,
          codigo: codigo.codigo,
          activo: codigo.activo,
        })),
        consultasRecientes.map((consulta) => ({
          tenantId,
          codigo: consulta.codigo,
          reservationId: consulta.reservationId,
        }))
      )
    );

    const entradas: ReservaConPromocion[] = reservas.map((reserva) => ({
      id: reserva.id,
      estado: reserva.estado,
      checkIn: reserva.checkIn,
      noches: nochesDe(reserva.checkIn, reserva.checkOut),
      moneda: reserva.currency,
      lineas: reserva.items,
      comisionOta: reserva.commission || 0,
      codigo: codigoDelPayload(reserva.payload),
    }));

    const informe = rendimientoPromociones(entradas, codigos, consultas);

    return NextResponse.json({
      // Fechas en día local: es la ventana de días de entrada, no un instante.
      desde: diaLocal(desde),
      hasta: diaLocal(new Date(hasta.getTime() - 86_400_000)),
      ...informe,
      // Códigos que se prueban y no venden, con su propia ventana de registro.
      // El panel los pinta como aviso y el cron avisa al equipo del hotel con
      // la MISMA regla (`promos-alertas`): un solo criterio para las dos cosas.
      alertas,
      ventanaAlertas: {
        desde: diaLocal(alertasDesde),
        hasta: diaLocal(new Date()),
        minimoConsultas: MINIMO_CONSULTAS_ALERTA,
        conversionMinimaPct: CONVERSION_MINIMA_PCT,
      },
    });
  } catch (error) {
    console.error('[Hospitality Promos] Error calculando el rendimiento:', error);
    return NextResponse.json({ error: 'Error al calcular el rendimiento de los códigos' }, { status: 500 });
  }
}
