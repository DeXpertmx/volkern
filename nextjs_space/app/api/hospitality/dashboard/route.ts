export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { startOfDay, ventanaDeDiaLocal } from '@/lib/hospitality/calendar';
import { esMovimientoDelDia, esReservaViva, estadosSinMovimiento } from '@/lib/hospitality/estados';
import {
  ACCION_AUDIT_HOLD_CADUCADO,
  ACCION_AUDIT_HOLD_CONFIRMADO,
} from '@/lib/hospitality/holds';
import { metricasHoldsAbandonados } from '@/lib/hospitality/holds-metrics';
import { metricasPartesViajeros } from '@/lib/hospitality/partes-metrics';
import {
  alertaRespuestaPreguntas,
  metricasRespuestaPreguntas,
} from '@/lib/hospitality/preguntas-metrics';
import { metricasResenas } from '@/lib/hospitality/resenas-metrics';
import { monedaEfectiva } from '@/lib/moneda';
import {
  comparacionIdiomasDirectas,
  lecturaComparacionIdiomas,
} from '@/lib/hospitality/booking-metrics';
import {
  perPropertyOccupancy,
  perChannelRevenueTrend,
  kpisVentana,
  mixDeCanales,
  ocupacionPorDia,
  llegadasDelDia,
  salidasDelDia,
  type AnalyticsReservationInput,
} from '@/lib/hospitality/analytics';

/**
 * GET /api/hospitality/dashboard — KPIs operativos del módulo (plan §23).
 *
 * Lectura pura (sin escrituras): ocupación, llegadas/salidas de hoy, reservas
 * activas, cancelaciones, ingresos, ADR, mix de canales, próximos 7 días,
 * operaciones (limpieza/mantenimiento), holds abandonados, partes de viajeros
 * sin reintentar y reservas directas por idioma.
 *
 * Parámetros: dias (período de ingresos, default 30).
 */
/**
 * Nombre visible del huésped desde guestData (la misma regla que la pantalla
 * de reservas): nombre y apellido si el canal los manda; si no, fallback
 * honesto en vez de una fila vacía.
 */
function nombreHuesped(guestData: unknown): string {
  const gd = (guestData && typeof guestData === 'object' ? guestData : {}) as Record<string, unknown>;
  const nombre = [gd.firstName, gd.lastName]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .trim();
  return nombre || 'Huésped';
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const dias = Math.min(Math.max(parseInt(searchParams.get('dias') || '30') || 30, 1), 90);

    const hoy = startOfDay(new Date());
    const finPeriodo = new Date(hoy);
    finPeriodo.setDate(finPeriodo.getDate() + dias);
    const inicioPeriodo = new Date(hoy);
    inicioPeriodo.setDate(inicioPeriodo.getDate() - dias);

    const tenantId = auth.tenant!.id;

    // ── Unidades, propiedades y reservas del período ──
    const [units, properties, reservations] = await Promise.all([
      prisma.hospitalityUnit.findMany({
        where: { tenantId },
        select: { id: true, estado: true, propertyId: true },
      }),
      prisma.hospitalityProperty.findMany({
        where: { tenantId },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      prisma.hospitalityReservation.findMany({
        where: {
          tenantId,
          checkIn: { lt: finPeriodo },
          checkOut: { gt: inicioPeriodo },
        },
        select: {
          id: true,
          propertyId: true,
          unitId: true,
          channel: true,
          estado: true,
          checkIn: true,
          checkOut: true,
          checkOutReal: true,
          bookedOn: true,
          amountAfterTax: true,
          currency: true,
          guestData: true,
          respuestasCheckin: true,
        },
      }),
    ]);

    const totalUnidades = units.length;
    const unidadesPorEstado: Record<string, number> = {};
    for (const u of units) unidadesPorEstado[u.estado] = (unidadesPorEstado[u.estado] || 0) + 1;

    // ── Analítica: TODO sale del módulo puro ──
    // La ruta no compara fechas ni divide por unidades: ocupación (§8 por
    // días, la misma regla que el motor de disponibilidad) y llegadas/salidas
    // del día salen de `lib/hospitality/analytics`. Antes había aquí tres
    // variantes de la regla de ocupación (dos por instantes, una por días) que
    // daban números distintos para el mismo día.
    const reservasAnalytics: AnalyticsReservationInput[] = reservations.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      unitId: r.unitId,
      channel: r.channel,
      estado: r.estado,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      checkOutReal: r.checkOutReal,
      amountAfterTax: r.amountAfterTax,
      currency: r.currency,
    }));
    const unidadesAnalytics = units.map((u) => ({ id: u.id, propertyId: u.propertyId }));

    // Llegadas/salidas de hoy: «movimiento del día», no «ocupa». Un no-show fue
    // un huésped esperado y debe aparecer aquí igual que en el KPI de Reportes
    // (`kpisVentana.llegadas`) y en el panel de operaciones; antes este listado
    // lo excluía y el mismo día daba dos cifras distintas.
    const conMovimiento = reservations.filter((r) => esMovimientoDelDia(r.estado));
    const llegadasHoy = llegadasDelDia(conMovimiento, hoy);
    const salidasHoy = salidasDelDia(conMovimiento, hoy);

    const ocupacionHoySerie = ocupacionPorDia({
      units: unidadesAnalytics,
      reservations: reservasAnalytics,
      dias: 1,
      desde: hoy,
    });
    const ocupacionHoy = ocupacionHoySerie.puntos[0]?.ocupacion ?? 0;
    const ocupadasHoy = ocupacionHoySerie.puntos[0]?.ocupadas ?? 0;

    // ── Reservas activas y cancelaciones del período ──
    const reservasActivas = reservations.filter((r) => esReservaViva(r.estado)).length;
    const cancelaciones = reservations.filter((r) => r.estado === 'cancelled').length;

    // ── Divisa del informe (H11/H22) ──
    // Los importes de este panel se suman SOLO en esta divisa; los de las demás
    // no se convierten y se informan aparte (`multimoneda`), porque sumar
    // divisas distintas da un número que no es dinero de ningún sitio.
    const monedaInforme = monedaEfectiva(
      reservations.map((r) => r.currency),
      auth.tenant?.moneda
    );

    // ── Mix de canales (módulo puro) ──
    const mixCanales = mixDeCanales(reservasAnalytics, monedaInforme);

    // ── Próximos 7 días: ocupación por día (módulo puro) ──
    // Las etiquetas `dia`/`mes` son presentación; el cálculo es del módulo.
    const proximos7 = ocupacionPorDia({
      units: unidadesAnalytics,
      reservations: reservasAnalytics,
      dias: 7,
      desde: hoy,
    }).puntos.map((p) => {
      const fecha = new Date(`${p.fecha}T00:00:00`);
      return { ...p, dia: fecha.getDate(), mes: fecha.toLocaleDateString('es-MX', { month: 'short' }) };
    });

    // ── Operaciones: limpieza y mantenimiento ──
    const [cleaningTasks, maintenanceTasks] = await Promise.all([
      prisma.hospitalityCleaningTask.groupBy({
        by: ['estado'],
        where: { tenantId },
        _count: { _all: true },
      }),
      prisma.hospitalityMaintenanceTask.groupBy({
        by: ['estado'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);
    const limpiezaPorEstado: Record<string, number> = {};
    for (const t of cleaningTasks) limpiezaPorEstado[t.estado] = t._count._all;
    const mantenimientoPorEstado: Record<string, number> = {};
    for (const t of maintenanceTasks) mantenimientoPorEstado[t.estado] = t._count._all;

    // ── Drill-downs (plan §23): ocupación por propiedad e ingresos por canal ──
    // Ocupación global del período: el MISMO cálculo día a día que la de cada
    // propiedad, no una media de medias (que pesa igual una propiedad de 2
    // unidades que una de 200).
    const ocupacionGlobal = ocupacionPorDia({
      units: unidadesAnalytics,
      reservations: reservasAnalytics,
      dias,
      hasta: hoy,
    });
    const ocupacionPropiedades = perPropertyOccupancy({
      properties: properties.map((p) => ({ id: p.id, nombre: p.nombre })),
      units: units.map((u) => ({ id: u.id, propertyId: u.propertyId })),
      reservations: reservasAnalytics,
      dias,
    });
    const ingresosPorCanal = perChannelRevenueTrend({
      reservations: reservasAnalytics,
      dias,
      monedaInforme,
    });

    // ── KPIs de Reportes (FASE 3.E) — TODO el cálculo sale del módulo puro
    // (kpisVentana): ingresos, noches vendidas/disponibles, ADR, RevPAR,
    // estancia media, no-shows y antelación. La ruta no lleva aritmética de
    // analítica: una sola definición de cada KPI para dashboard y reportes.
    const reportesKpis = kpisVentana({
      reservations: reservations.map((r) => ({ ...r, bookedOn: r.bookedOn ?? null })),
      totalUnidades,
      dias,
      hasta: hoy,
      monedaTenant: auth.tenant?.moneda,
    });
    // Compatibilidad con el dashboard existente: ingresos/noches/ADR ahora son
    // los del módulo puro (ADR coherente: sus noches son las de las reservas
    // que producen los ingresos, no las de TODAS las activas).
    const { ingresos, nochesVendidas, adr } = reportesKpis;

    // ── Holds abandonados: el ciclo del hold, caducados frente a confirmados ──
    // Los dos desenlaces posibles de un hold son eventos de auditoría: el
    // barrido escribe el caducado y la confirmación (operador o canal) escribe
    // el confirmado. Aquí solo se cuentan en la ventana; la tasa (y su lectura)
    // la define el módulo puro, para que Reportes y el panel de plataforma no
    // puedan dar cifras distintas del mismo mes.
    const [holdsCaducados, holdsConfirmados] = await Promise.all([
      prisma.auditLog.count({
        where: {
          tenantId,
          accion: ACCION_AUDIT_HOLD_CADUCADO,
          fechaCreacion: { gte: inicioPeriodo },
        },
      }),
      prisma.auditLog.count({
        where: {
          tenantId,
          accion: ACCION_AUDIT_HOLD_CONFIRMADO,
          fechaCreacion: { gte: inicioPeriodo },
        },
      }),
    ]);
    const holds = metricasHoldsAbandonados({
      caducados: holdsCaducados,
      confirmados: holdsConfirmados,
    });

    // ── Partes de viajeros sin reintentar: el mismo abandono que ve el
    //    operador de plataforma, en el panel del hotel ── Un parte abandonado
    //    (rechazado con los intentos agotados) es una estancia que se quedó sin
    //    comunicar al Ministerio, y no lo cuenta ningún otro contador. La
    //    ventana es la de la traza (`fechaEdicion`): es cuando el parte se movió
    //    por última vez y, por tanto, cuando el barrido gastó el último intento.
    //    La clasificación y la tasa salen del módulo puro —el mismo que usa el
    //    panel del registro de viajeros, sin ventana— para que el hotel no lea
    //    dos cifras distintas de su propio abandono según la pantalla.
    const trazasDelPeriodo = await prisma.hospitalityGuestRegistryCommunication.findMany({
      where: { tenantId, fechaEdicion: { gte: inicioPeriodo } },
      select: { estado: true, intentos: true },
    });
    const partes = metricasPartesViajeros(trazasDelPeriodo);

    // ── Tasa de respuesta de las preguntas obligatorias: ¿funcionan los
    //    recordatorios? ── El par del ciclo completo: cada (reserva del
    //    período, pregunta obligatoria activa) está respondida o pendiente. La
    //    definición de «pendiente» es LA MISMA que rellena
    //    {{preguntas_pendientes}} en la pre-llegada (módulo puro), así que
    //    Reportes y el email al huésped no pueden discrepar. La sección es
    //    AUXILIAR: su consulta (activas y requeridas del tenant, solo la
    //    identidad) vive dentro de la guarda — si falla, el dashboard sigue en
    //    pie con la sección vacía.
    let preguntasRespuesta: ReturnType<typeof metricasRespuestaPreguntas> = {
      respuestas: 0,
      pendientes: 0,
      sinContacto: 0,
      tasaRespuesta: null,
      lectura:
        'Sin preguntas obligatorias activas en el período: no has definido ninguna, o las reservas del período son anteriores a la primera.',
    };
    let avisoPreguntas: string | null = null;
    try {
      // Preguntas obligatorias ACTIVAS del tenant (solo identidad: el conteo
      // es de pares). Las desactivadas no se preguntan en el formulario ni
      // entran aquí — por coherencia con el formulario y con los recordatorios.
      const preguntasObligatorias = await prisma.hospitalityCheckinPregunta.findMany({
        where: { tenantId, activa: true, requerida: true },
        select: { id: true },
      });
      preguntasRespuesta = metricasRespuestaPreguntas({
        reservas: reservations.map((r) => ({
          guestData: r.guestData,
          respuestasCheckin: r.respuestasCheckin,
        })),
        preguntas: preguntasObligatorias,
      });
      avisoPreguntas = alertaRespuestaPreguntas(preguntasRespuesta);
    } catch (err) {
      console.error('No se pudieron contar las respuestas de las preguntas del check-in:', err);
    }

    // ── Reseñas de huéspedes: ¿cómo puntuán, dónde y mejora? ── Media y
    //    volumen por propiedad y canal, y evolución mensual por fecha de
    //    ESTANCIA. Ambos orígenes cuentan (ciclo §21 por token e histórico
    //    importado de OTAs): lo que ve el visitante es la prueba social. La
    //    sección es AUXILIAR: si la consulta falla, el dashboard sigue en pie
    //    con la sección vacía.
    let metricasResenasPeriodo: ReturnType<typeof metricasResenas> | null = null;
    try {
      const propiedadesLista = await prisma.hospitalityProperty.findMany({
        where: { tenantId },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      });
      const resenasPublicadas = await prisma.hospitalityReview.findMany({
        where: { tenantId, estado: 'publicada', fechaEstancia: { gte: inicioPeriodo } },
        select: {
          propertyId: true,
          canal: true,
          puntuacion: true,
          fechaEstancia: true,
          reservation: { select: { checkIn: true } },
        },
        take: 5000,
      });
      metricasResenasPeriodo = metricasResenas(resenasPublicadas, propiedadesLista);
    } catch (err) {
      console.error('No se pudieron calcular las métricas de reseñas:', err);
    }

    // ── Movimiento de MAÑANA: el tablón para preparar el día siguiente ──
    // Con nombre de huésped, unidad y propiedad — no solo el recuento — porque
    // su trabajo es PREPARAR: saber quién llega, a qué unidad y qué toca
    // limpiar. Con movimiento (la cancelada no llega ni se va, la regla del
    // módulo de estados) y con la MISMA ventana de día local que el filtro de
    // «hoy» de reservas (ventanaDeDiaLocal, la unidad de día del módulo). La
    // sección es AUXILIAR: si falla, el dashboard sigue en pie sin el tablón.
    let movimientoManana: {
      llegadas: Array<{ id: string; huesped: string; unidad: string; propiedad: string }>; 
      salidas: Array<{ id: string; huesped: string; unidad: string; propiedad: string }>;
    } | null = null;
    try {
      const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
      const { inicio, fin } = ventanaDeDiaLocal(manana);
      const base = { tenantId, estado: { notIn: estadosSinMovimiento() } };
      const [llegadas, salidas] = await Promise.all([
        prisma.hospitalityReservation.findMany({
          where: { ...base, checkIn: { gte: inicio, lt: fin } },
          select: {
            id: true,
            guestData: true,
            externalBookingId: true,
            unit: { select: { nombre: true } },
            property: { select: { nombre: true } },
          },
          orderBy: [{ checkIn: 'asc' }],
          take: 50,
        }),
        prisma.hospitalityReservation.findMany({
          where: { ...base, checkOut: { gte: inicio, lt: fin } },
          select: {
            id: true,
            guestData: true,
            externalBookingId: true,
            unit: { select: { nombre: true } },
            property: { select: { nombre: true } },
            checkOutReal: true,
          },
          orderBy: [{ checkOut: 'asc' }],
          take: 50,
        }),
      ]);
      movimientoManana = {
        llegadas: llegadas.map((r) => ({
          id: r.id,
          huesped: nombreHuesped(r.guestData),
          unidad: r.unit?.nombre || '—',
          propiedad: r.property?.nombre || '—',
        })),
        salidas: salidas.map((r) => ({
          id: r.id,
          huesped: nombreHuesped(r.guestData),
          unidad: r.unit?.nombre || '—',
          propiedad: r.property?.nombre || '—',
        })),
      };
    } catch (err) {
      console.error('No se pudo calcular el movimiento de mañana:', err);
    }

    // ── Reservas directas por idioma (ES vs EN): ¿convierte la web
    //    internacional? ── El filtro de ventana ya lo hizo la consulta; la
    //    regla (solo canal Directa que produjo, 'es' como respaldo de las
    //    reservas anteriores al inglés) vive en el módulo puro, para que la
    //    cifra no pueda distinguirse entre dashboard, Reportes y CSV.
    const comparacionIdiomas = comparacionIdiomasDirectas(reservations);
    const lecturaIdiomas = lecturaComparacionIdiomas(comparacionIdiomas);

    return NextResponse.json({
      // La divisa con la que se escriben los importes de este informe: la de las
      // reservas del período (si hay más de una, la predominante) y, si no hay
      // ninguna, la moneda de reporte del tenant. Las pantallas no escriben
      // dinero: piden la divisa aquí y formatean con `formatearImporte`.
      moneda: monedaInforme,
      // Multimoneda sin conversión: cuántas reservas quedan fuera de los
      // totales, en qué divisas y con qué ingresos (H11/H22).
      multimoneda: reportesKpis.multimoneda,
      porMoneda: reportesKpis.porMoneda,
      kpis: {
        totalUnidades,
        unidadesPorEstado,
        ocupacionHoy,
        ocupadasHoy,
        llegadasHoy: llegadasHoy.length,
        salidasHoy: salidasHoy.length,
        reservasActivas,
        cancelaciones,
        ingresos,
        nochesVendidas,
        adr,
      },
      mixCanales,
      proximos7,
      ocupacionGlobal,
      ocupacionPropiedades,
      ingresosPorCanal,
      reportesKpis,
      holds,
      partes,
      preguntas: { ...preguntasRespuesta, aviso: avisoPreguntas },
      resenas: metricasResenasPeriodo,
      movimientoManana,
      idiomas: { ...comparacionIdiomas, lectura: lecturaIdiomas },
      operaciones: {
        limpieza: limpiezaPorEstado,
        mantenimiento: mantenimientoPorEstado,
      },
    });
  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    return NextResponse.json({ error: 'Error al obtener dashboard' }, { status: 500 });
  }
}