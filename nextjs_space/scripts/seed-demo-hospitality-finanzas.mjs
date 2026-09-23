/**
 * Siembra de datos financieros de demostración — tenant "Demo Real Estate".
 *
 * Deja las cuatro reservas del tenant con un caso de cada situación que la
 * sección Finanzas debe saber contar:
 *
 *   hres_d01  Airbnb       cobro PARCIAL   (7.450 de 12.450)
 *   hres_d03  Airbnb       PAGADA al completo
 *   hres_d02  Booking.com  PENDIENTE, sin ningún pago
 *   hres_d04  Booking.com  CANCELADA con devolución del importe completo
 *
 * Garantías del script:
 *  - Solo actúa sobre el tenant "Demo Real Estate" y sobre esas cuatro reservas.
 *    Si alguna no existe, aborta antes de escribir nada.
 *  - Es IDEMPOTENTE: usa `upsert` con ids deterministas (`hitem_*`, `hpay_*`),
 *    así que re-ejecutarlo actualiza en vez de duplicar.
 *  - Comprueba que la suma de las líneas coincide con el importe ya registrado
 *    en la reserva. Si no cuadra, aborta: el informe no debe cambiar sus
 *    importes por sembrar un desglose.
 *
 * Uso (dentro del contenedor de la aplicación, que tiene Node y el cliente Prisma):
 *   docker exec -w /app <contenedor> node /app/_seed.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT = 'Demo Real Estate';

const redondear = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

const PLAN = [
  {
    reserva: 'hres_d01',
    lineas: [
      { clave: 'd01_aloj', tipo: 'alojamiento', concepto: 'Alojamiento 5 noches', cantidad: 5, importeUnitario: 2400 },
      { clave: 'd01_limp', tipo: 'limpieza', concepto: 'Limpieza final de estancia', cantidad: 1, importeUnitario: 450 },
    ],
    pagos: [
      { clave: 'd01_p1', importe: 7450, metodo: 'stripe', estado: 'pagado', referencia: 'DEMO-D01-1', fecha: '2026-09-07', notas: 'Anticipo de demostración' },
    ],
  },
  {
    reserva: 'hres_d03',
    lineas: [
      { clave: 'd03_aloj', tipo: 'alojamiento', concepto: 'Alojamiento 8 noches', cantidad: 8, importeUnitario: 3600 },
      { clave: 'd03_limp', tipo: 'limpieza', concepto: 'Limpieza final de estancia', cantidad: 1, importeUnitario: 900 },
      { clave: 'd03_extra', tipo: 'extra', concepto: 'Traslado aeropuerto', cantidad: 1, importeUnitario: 2300 },
    ],
    pagos: [
      { clave: 'd03_p1', importe: 32000, metodo: 'stripe', estado: 'pagado', referencia: 'DEMO-D03-1', fecha: '2026-09-08', notas: 'Cobro completo de demostración' },
    ],
  },
  {
    reserva: 'hres_d02',
    lineas: [
      { clave: 'd02_aloj', tipo: 'alojamiento', concepto: 'Alojamiento 5 noches', cantidad: 5, importeUnitario: 3300 },
      { clave: 'd02_limp', tipo: 'limpieza', concepto: 'Limpieza final de estancia', cantidad: 1, importeUnitario: 700 },
      { clave: 'd02_extra', tipo: 'extra', concepto: 'Cuna de viaje', cantidad: 1, importeUnitario: 1700 },
    ],
    // Sin pagos a propósito: es el caso pendiente de cobro.
    pagos: [],
  },
  {
    reserva: 'hres_d04',
    lineas: [
      { clave: 'd04_aloj', tipo: 'alojamiento', concepto: 'Alojamiento 7 noches', cantidad: 7, importeUnitario: 1000 },
      { clave: 'd04_limp', tipo: 'limpieza', concepto: 'Limpieza final de estancia', cantidad: 1, importeUnitario: 1200 },
    ],
    pagos: [
      { clave: 'd04_p1', importe: 8200, metodo: 'stripe', estado: 'pagado', referencia: 'DEMO-D04-1', fecha: '2026-09-04', notas: 'Cobro de demostración' },
      { clave: 'd04_p2', importe: 8200, metodo: 'stripe', estado: 'reembolsado', referencia: 'DEMO-D04-R1', fecha: '2026-09-05', notas: 'Devolución completa por cancelación' },
    ],
  },
];

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { nombre: TENANT }, select: { id: true, nombre: true } });
  if (!tenant) throw new Error(`No existe el tenant "${TENANT}"`);

  // ── Validación previa: nada se escribe si algo no cuadra ──
  const reservas = new Map();
  for (const entrada of PLAN) {
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id: entrada.reserva, tenantId: tenant.id },
      select: { id: true, channel: true, estado: true, currency: true, propertyId: true, unitId: true, amountAfterTax: true, externalBookingId: true },
    });
    if (!reserva) throw new Error(`La reserva ${entrada.reserva} no existe en el tenant demo`);

    const totalLineas = redondear(
      entrada.lineas.reduce((t, l) => t + redondear(l.cantidad * l.importeUnitario), 0)
    );
    const importeReserva = redondear(reserva.amountAfterTax || 0);
    if (totalLineas !== importeReserva) {
      throw new Error(
        `${entrada.reserva}: las líneas suman ${totalLineas} y la reserva tiene ${importeReserva}. ` +
          'No se escribe nada para no alterar los importes del informe.'
      );
    }
    reservas.set(entrada.reserva, reserva);
  }

  console.log(`Tenant: ${tenant.nombre} (${tenant.id})`);

  // ── Escritura idempotente ──
  for (const entrada of PLAN) {
    const reserva = reservas.get(entrada.reserva);

    for (const linea of entrada.lineas) {
      const importeTotal = redondear(linea.cantidad * linea.importeUnitario);
      const datos = {
        tenantId: tenant.id,
        reservationId: reserva.id,
        propertyId: reserva.propertyId,
        unitId: reserva.unitId,
        tipo: linea.tipo,
        concepto: linea.concepto,
        cantidad: linea.cantidad,
        importeUnitario: linea.importeUnitario,
        importeTotal,
        moneda: reserva.currency,
      };
      await prisma.hospitalityReservationItem.upsert({
        where: { id: `hitem_${linea.clave}` },
        update: datos,
        create: { id: `hitem_${linea.clave}`, ...datos },
      });
    }

    for (const pago of entrada.pagos) {
      const datos = {
        tenantId: tenant.id,
        reservationId: reserva.id,
        propertyId: reserva.propertyId,
        unitId: reserva.unitId,
        importe: pago.importe,
        moneda: reserva.currency,
        metodo: pago.metodo,
        estado: pago.estado,
        referenciaExterna: pago.referencia,
        fechaPago: new Date(`${pago.fecha}T12:00:00`),
        notas: pago.notas,
      };
      await prisma.hospitalityPayment.upsert({
        where: { id: `hpay_${pago.clave}` },
        update: datos,
        create: { id: `hpay_${pago.clave}`, ...datos },
      });
    }
  }

  // ── Resumen de lo escrito, con el mismo criterio de la sección Finanzas ──
  console.log('\nReserva   Canal        Estado       Líneas    Cobrado   Reembolsado  Situación');
  const totales = { bruto: 0, cobrado: 0, pendiente: 0, reembolsado: 0, comisiones: 0 };
  let parciales = 0;
  let pagadas = 0;
  let pendientes = 0;

  for (const entrada of PLAN) {
    const reserva = reservas.get(entrada.reserva);
    const lineas = await prisma.hospitalityReservationItem.findMany({ where: { reservationId: reserva.id } });
    const pagos = await prisma.hospitalityPayment.findMany({ where: { reservationId: reserva.id } });

    const bruto = redondear(lineas.reduce((t, l) => t + l.importeTotal, 0));
    const cobrado = redondear(
      pagos.reduce((t, p) => {
        if (p.estado === 'pagado' || p.estado === 'parcial') return t + p.importe;
        if (p.estado === 'reembolsado') return t - Math.abs(p.importe);
        return t;
      }, 0)
    );
    const reembolsado = redondear(
      pagos.filter((p) => p.estado === 'reembolsado').reduce((t, p) => t + Math.abs(p.importe), 0)
    );

    const esVenta = reserva.estado !== 'cancelled' && reserva.estado !== 'no_show';
    let situacion = reserva.estado;
    if (esVenta) {
      if (cobrado <= 0) { situacion = 'pendiente'; pendientes += 1; }
      else if (cobrado + 0.01 < bruto) { situacion = 'parcial'; parciales += 1; }
      else { situacion = 'pagado'; pagadas += 1; }
    }

    if (esVenta) {
      totales.bruto += bruto;
      totales.cobrado += cobrado;
      totales.pendiente += Math.max(0, bruto - cobrado);
    }
    totales.reembolsado += reembolsado;

    console.log(
      `${reserva.id}  ${reserva.channel.padEnd(11)}  ${reserva.estado.padEnd(11)}  ${String(bruto).padStart(7)}  ${String(cobrado).padStart(7)}  ${String(reembolsado).padStart(10)}  ${situacion}`
    );
  }

  console.log('\nTotales que debe mostrar Finanzas (solo ventas):');
  console.log(`  bruto       ${redondear(totales.bruto)}`);
  console.log(`  cobrado     ${redondear(totales.cobrado)}`);
  console.log(`  pendiente   ${redondear(totales.pendiente)}`);
  console.log(`  reembolsado ${redondear(totales.reembolsado)} (fuera de ventas)`);
  console.log(`  situaciones parcial=${parciales} pagado=${pagadas} pendiente=${pendientes}`);
}

main()
  .catch((error) => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
