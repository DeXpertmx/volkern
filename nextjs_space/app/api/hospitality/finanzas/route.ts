export const dynamic = 'force-dynamic';

/**
 * Finanzas de hospitality (FASE 3.B del plan de Booking Engine + Payments).
 *
 * GET /api/hospitality/finanzas — desglose por reserva, vista de cobros y
 *   resumen (bruto, comisiones, neto, margen, cobrado/pendiente, por canal).
 *   TODO el cálculo vive en el módulo puro `lib/hospitality/finance.ts`: aquí
 *   solo se leen líneas y pagos y se los pasamos. Nada de aritmética suelta.
 *
 * POST /api/hospitality/finanzas — registrar un pago de una reserva
 *   (transferencia, efectivo, manual…). El cobro por Stripe Connect llega por
 *   webhook (FASE 3.C) y usa este mismo modelo.
 *
 * Reglas del plan que aquí se cumplen:
 * - Ingreso bruto = suma de las líneas de la reserva (`HospitalityReservationItem`).
 * - Si una reserva de canal no tiene líneas, se construye una única línea de
 *   alojamiento desde `amountAfterTax` (`lineasDesdeImporteExterno`): la reserva
 *   no deja de tener rentabilidad por no tener desglose, sin inventar conceptos.
 * - El estado de cobro se DERIVA de los pagos, nunca se guarda.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { monedaEscritura } from '@/lib/moneda';
import { logAuditAction } from '@/lib/permissions';
import {
  calcularRentabilidad,
  lineasDesdeImporteExterno,
  normalizarLinea,
  redondear,
  type GastoImputado,
  type LineaReserva,
  type PagoReserva,
} from '@/lib/hospitality/finance';
import { estadosConProduccion } from '@/lib/hospitality/estados';
import { TIPO_LINEA_PENALIZACION } from '@/lib/hospitality/penalizaciones';

const METODOS_PAGO = ['stripe', 'transferencia', 'efectivo', 'manual', 'otro'];
const ESTADOS_PAGO = ['pendiente', 'pagado', 'parcial', 'reembolsado', 'fallido'];

function parseDateOnly(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// GET /api/hospitality/finanzas?propertyId&estadoCobro&canal&from&to&q
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.ver');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');
    const canal = searchParams.get('canal');
    const estadoCobroFiltro = searchParams.get('estadoCobro');
    const q = searchParams.get('q');
    const from = parseDateOnly(searchParams.get('from')); // checkOut >= from
    const to = parseDateOnly(searchParams.get('to')); // checkIn < to
    const limit = Math.min(parseInt(searchParams.get('limit') || '500') || 500, 1000);

    const where: any = { tenantId };
    const filtros: any[] = [];

    // Las canceladas y no-show no aportan ingreso de alojamiento: fuera del
    // desglose. La lista de «produce» sale de la definición única
    // (`aportaProduccion`), no de una copia local.
    //
    // Pero una reserva sin producción **sí entra** si tiene una penalización
    // emitida: es un cargo pendiente de cobrar, no producción. Sin esto, un
    // no-show quedaba fuera de Finanzas y el cargo no se podía ni ver ni cobrar
    // (su bruto es 0; el importe vive en `penalizacion`).
    filtros.push({
      OR: [
        { estado: { in: estadosConProduccion() } },
        { items: { some: { tipo: TIPO_LINEA_PENALIZACION } } },
      ],
    });

    if (propertyId) where.propertyId = propertyId;
    if (canal) where.channel = { contains: canal, mode: 'insensitive' };
    if (q) {
      filtros.push({
        OR: [
          { externalBookingId: { contains: q, mode: 'insensitive' } },
          { guestData: { path: ['firstName'], string_contains: q } },
          { guestData: { path: ['lastName'], string_contains: q } },
          { contact: { nombre: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    where.AND = filtros;
    if (from) where.checkOut = { gte: from };
    if (to) where.checkIn = { lt: to };

    const reservations = await prisma.hospitalityReservation.findMany({
      where,
      include: {
        items: true,
        payments: true,
        // Gastos del ERP imputados a la reserva (FASE 3.B, enlace ERP):
        // limpieza externa, incidencias, consumibles… con su desglose fiscal.
        expenses: {
          select: {
            id: true,
            description: true,
            amount: true,
            currency: true,
            category: true,
            taxableBase: true,
            vatRate: true,
            vatAmount: true,
            supplier: { select: { name: true } },
          },
        },
        unit: { select: { id: true, nombre: true, codigo: true } },
        property: { select: { id: true, nombre: true } },
      },
      orderBy: [{ checkIn: 'asc' }],
      take: limit,
    });

    const rows = reservations.map((r: any) => {
      // Líneas guardadas; si la reserva no tiene desglose, una sola línea de
      // alojamiento desde el importe externo de la OTA.
      const items: any[] = r.items ?? [];
      const lineas: LineaReserva[] = items.length
        ? items.map((item: any) =>
            normalizarLinea({
              tipo: item.tipo,
              concepto: item.concepto,
              cantidad: item.cantidad,
              importeUnitario: item.importeUnitario,
              importeTotal: item.importeTotal,
            })
          )
        : lineasDesdeImporteExterno(r.amountAfterTax || 0);

      const pagos: PagoReserva[] = (r.payments ?? []).map((p: any) => ({
        importe: p.importe,
        estado: p.estado,
        metodo: p.metodo,
      }));

      // Enlace ERP (FASE 3.B): los gastos imputados entran al cálculo como
      // otrosGastos del módulo puro — el neto y el margen reflejan el coste
      // real. El IVA soportado viaja informativo (gastosErp), no descuenta.
      const otrosGastos: GastoImputado[] = (r.expenses ?? []).map((g: any) => ({
        concepto: g.description,
        importe: g.amount,
      }));

      const rent = calcularRentabilidad({
        lineas,
        pagos,
        comisionOta: r.commission || 0,
        // La comisión de pasarela se conocerá con los fees reales de Stripe.
        comisionPasarela: 0,
        otrosGastos,
        moneda: r.currency,
      });

      return {
        id: r.id,
        externalBookingId: r.externalBookingId,
        channel: r.channel,
        estado: r.estado,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        unitNombre: r.unit?.nombre || null,
        propertyId: r.propertyId,
        propertyNombre: r.property?.nombre || null,
        huesped:
          [r.guestData?.firstName, r.guestData?.lastName].filter(Boolean).join(' ') ||
          r.contact?.nombre ||
          'Huésped',
        amountAfterTax: r.amountAfterTax,
        // Desglose completo calculado por el módulo puro (incluye moneda).
        ...rent,
        // Gastos ERP atribuidos, con su desglose fiscal (IVA soportado).
        gastosErp: (r.expenses ?? []).map((g: any) => ({
          id: g.id,
          descripcion: g.description,
          importe: g.amount,
          moneda: g.currency,
          categoria: g.category,
          proveedor: g.supplier?.name || null,
          baseImponible: g.taxableBase,
          ivaPct: g.vatRate,
          ivaCuota: g.vatAmount,
        })),
        lineas,
        pagos: (r.payments ?? []).map((p: any) => ({
          id: p.id,
          importe: p.importe,
          moneda: p.moneda,
          metodo: p.metodo,
          estado: p.estado,
          referenciaExterna: p.referenciaExterna,
          fechaPago: p.fechaPago,
          notas: p.notas,
        })),
      };
    });

    const filtradas = estadoCobroFiltro
      ? rows.filter((r) => r.estadoCobro === estadoCobroFiltro)
      : rows;

    // Resumen agregado: por moneda (una propiedad suele operar en una) y por canal.
    const porMoneda: Record<string, { bruto: number; descuento: number; penalizacion: number; comisionOta: number; neto: number; cobrado: number; pendiente: number; reservas: number }> = {};
    const porCanal: Record<string, { bruto: number; neto: number; reservas: number }> = {};
    const porEstadoCobro: Record<string, number> = {};
    for (const r of filtradas) {
      const m = (porMoneda[r.moneda] ||= { bruto: 0, descuento: 0, penalizacion: 0, comisionOta: 0, neto: 0, cobrado: 0, pendiente: 0, reservas: 0 });
      m.bruto = redondear(m.bruto + r.bruto);
      // Rebajas del período (códigos promocionales). Va en negativo y aparte de
      // «otro»: así el propietario ve cuánto está dejando en promociones sin
      // confundirlo con un ingreso ni con un cargo.
      m.descuento = redondear(m.descuento + (r.desglose?.descuento || 0));
      // Se agrega aparte del bruto a propósito: es un cargo, no alojamiento.
      m.penalizacion = redondear(m.penalizacion + r.penalizacion);
      m.comisionOta = redondear(m.comisionOta + r.comisionOta);
      m.neto = redondear(m.neto + r.neto);
      m.cobrado = redondear(m.cobrado + r.cobrado);
      m.pendiente = redondear(m.pendiente + r.pendiente);
      m.reservas += 1;

      const c = (porCanal[r.channel] ||= { bruto: 0, neto: 0, reservas: 0 });
      c.bruto = redondear(c.bruto + r.bruto);
      c.neto = redondear(c.neto + r.neto);
      c.reservas += 1;

      porEstadoCobro[r.estadoCobro] = (porEstadoCobro[r.estadoCobro] || 0) + 1;
    }

    return NextResponse.json({
      reservas: filtradas,
      resumen: { porMoneda, porCanal, porEstadoCobro, total: filtradas.length },
    });
  } catch (error) {
    console.error('Error obteniendo finanzas:', error);
    return NextResponse.json({ error: 'Error al obtener finanzas' }, { status: 500 });
  }
}

// POST /api/hospitality/finanzas — registrar un pago de una reserva.
// Body: { reservationId, importe, moneda?, metodo?, estado?, referenciaExterna?, fechaPago?, notas? }
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json();
    const { reservationId, importe, moneda, metodo, estado, referenciaExterna, fechaPago, notas } = body || {};

    if (!reservationId) return NextResponse.json({ error: 'La reserva es requerida' }, { status: 400 });

    const importeNum = Number(importe);
    if (!Number.isFinite(importeNum) || importeNum <= 0) {
      return NextResponse.json({ error: 'El importe debe ser un número mayor que cero' }, { status: 400 });
    }
    if (metodo && !METODOS_PAGO.includes(metodo)) {
      return NextResponse.json({ error: `Método de pago inválido (usa: ${METODOS_PAGO.join(', ')})` }, { status: 400 });
    }
    if (estado && !ESTADOS_PAGO.includes(estado)) {
      return NextResponse.json({ error: `Estado de pago inválido (usa: ${ESTADOS_PAGO.join(', ')})` }, { status: 400 });
    }

    // La reserva debe existir y ser del tenant (aislamiento multi-tenant).
    const reservation = await prisma.hospitalityReservation.findFirst({
      where: { id: reservationId, tenantId },
      select: { id: true, propertyId: true, unitId: true, currency: true, externalBookingId: true },
    });
    if (!reservation) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

    const estadoFinal = estado || 'pagado';
    const pago = await prisma.hospitalityPayment.create({
      data: {
        tenantId,
        reservationId: reservation.id,
        propertyId: reservation.propertyId,
        unitId: reservation.unitId,
        importe: importeNum,
        // Divisa del pago, por precedencia: la indicada gana sobre la de la
        // reserva, y sin ninguna de las dos cae a la moneda de reporte del
        // tenant. El valor del esquema es la red de seguridad de la escritura.
        moneda: monedaEscritura(moneda, reservation.currency, auth.tenant!.moneda),
        metodo: metodo || 'manual',
        estado: estadoFinal,
        referenciaExterna: referenciaExterna || null,
        // Un pago cobrado sin fecha explícita se cobró hoy.
        fechaPago: fechaPago ? new Date(fechaPago) : ['pagado', 'parcial'].includes(estadoFinal) ? new Date() : null,
        notas: notas || null,
      },
    });

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'crear',
      'hospitality_payment',
      pago.id,
      `Pago de ${importeNum} ${pago.moneda} (${pago.metodo}/${pago.estado}) en reserva ${reservation.externalBookingId}`
    ).catch(() => {});

    // El nuevo estado de cobro de la reserva, derivado otra vez por el módulo puro.
    const [items, payments] = await Promise.all([
      prisma.hospitalityReservationItem.findMany({ where: { reservationId: reservation.id, tenantId } }),
      prisma.hospitalityPayment.findMany({ where: { reservationId: reservation.id, tenantId } }),
    ]);
    const lineas: LineaReserva[] = items.length
      ? items.map((item: any) =>
          normalizarLinea({
            tipo: item.tipo,
            concepto: item.concepto,
            cantidad: item.cantidad,
            importeUnitario: item.importeUnitario,
            importeTotal: item.importeTotal,
          })
        )
      : lineasDesdeImporteExterno((reservation as any).amountAfterTax || 0);
    const rent = calcularRentabilidad({
      lineas,
      pagos: payments.map((p: any) => ({ importe: p.importe, estado: p.estado, metodo: p.metodo })),
      moneda: reservation.currency,
    });

    return NextResponse.json({ pago, estadoCobro: rent.estadoCobro, cobrado: rent.cobrado, pendiente: rent.pendiente }, { status: 201 });
  } catch (error) {
    console.error('Error registrando pago:', error);
    return NextResponse.json({ error: 'Error al registrar el pago' }, { status: 500 });
  }
}
