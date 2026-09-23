/**
 * Cambia la moneda del tenant "Demo Real Estate" a euros en todo Hospitality.
 *
 * El esquema trae `'MXN'` como valor por defecto en cada campo de moneda, así
 * que un tenant español queda con pesos si nadie lo ajusta. El cliente de la
 * demo factura en euros, y su cuenta de Stripe es ES/EUR.
 *
 * Se cambia TODO lo que lleva moneda para que no queden datos incoherentes:
 *   Tenant.moneda            (la fuente de la que deberían colgar los defaults)
 *   hospitality_units.moneda
 *   hospitality_rate_plans.moneda
 *   hospitality_reservations.currency
 *   hospitality_reservation_items.moneda
 *   hospitality_payments.moneda
 *   hospitality_payment_accounts.moneda  (la cuenta de cobro del tenant)
 *
 * Es idempotente: fija el valor, no lo incrementa. Re-ejecutarlo no cambia nada.
 * Solo actúa sobre el tenant indicado y no toca importes.
 *
 * Uso (dentro del contenedor de la aplicación):
 *   docker exec -w /app <contenedor> node /app/_moneda.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT = 'Demo Real Estate';
const MONEDA = 'EUR';

async function contar(tenantId) {
  const [unidades, tarifas, reservas, lineas, pagos, cuentas] = await Promise.all([
    prisma.hospitalityUnit.count({ where: { tenantId, moneda: { not: MONEDA } } }),
    prisma.hospitalityRatePlan.count({ where: { tenantId, moneda: { not: MONEDA } } }),
    prisma.hospitalityReservation.count({ where: { tenantId, currency: { not: MONEDA } } }),
    prisma.hospitalityReservationItem.count({ where: { tenantId, moneda: { not: MONEDA } } }),
    prisma.hospitalityPayment.count({ where: { tenantId, moneda: { not: MONEDA } } }),
    prisma.hospitalityPaymentAccount.count({ where: { tenantId, moneda: { not: MONEDA } } }),
  ]);
  return { unidades, tarifas, reservas, lineas, pagos, cuentas };
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { nombre: TENANT },
    select: { id: true, nombre: true, moneda: true },
  });
  if (!tenant) throw new Error(`No existe el tenant "${TENANT}"`);

  const antes = await contar(tenant.id);
  console.log(`Tenant: ${tenant.nombre} (${tenant.id})`);
  console.log(`Moneda del tenant antes: ${tenant.moneda}`);
  console.log(
    `Filas que no estaban en ${MONEDA}: unidades=${antes.unidades} tarifas=${antes.tarifas} ` +
      `reservas=${antes.reservas} lineas=${antes.lineas} pagos=${antes.pagos} cuentas=${antes.cuentas}`
  );

  // Importes intactos: solo se mueve la etiqueta de divisa.
  await prisma.tenant.update({ where: { id: tenant.id }, data: { moneda: MONEDA } });
  await prisma.hospitalityUnit.updateMany({ where: { tenantId: tenant.id }, data: { moneda: MONEDA } });
  await prisma.hospitalityRatePlan.updateMany({ where: { tenantId: tenant.id }, data: { moneda: MONEDA } });
  await prisma.hospitalityReservation.updateMany({ where: { tenantId: tenant.id }, data: { currency: MONEDA } });
  await prisma.hospitalityReservationItem.updateMany({ where: { tenantId: tenant.id }, data: { moneda: MONEDA } });
  await prisma.hospitalityPayment.updateMany({ where: { tenantId: tenant.id }, data: { moneda: MONEDA } });
  await prisma.hospitalityPaymentAccount.updateMany({ where: { tenantId: tenant.id }, data: { moneda: MONEDA } });

  const despues = await contar(tenant.id);
  const pendientes =
    despues.unidades + despues.tarifas + despues.reservas + despues.lineas + despues.pagos + despues.cuentas;

  console.log('\nEstado tras el cambio:');
  const [unidades, tarifas, reservas, lineas, pagos, cuentas, tenantFinal] = await Promise.all([
    prisma.hospitalityUnit.count({ where: { tenantId: tenant.id } }),
    prisma.hospitalityRatePlan.count({ where: { tenantId: tenant.id } }),
    prisma.hospitalityReservation.count({ where: { tenantId: tenant.id } }),
    prisma.hospitalityReservationItem.count({ where: { tenantId: tenant.id } }),
    prisma.hospitalityPayment.count({ where: { tenantId: tenant.id } }),
    prisma.hospitalityPaymentAccount.count({ where: { tenantId: tenant.id } }),
    prisma.tenant.findUnique({ where: { id: tenant.id }, select: { moneda: true } }),
  ]);
  console.log(`  tenant.moneda = ${tenantFinal.moneda}`);
  console.log(`  en ${MONEDA}: unidades=${unidades}/${unidades} tarifas=${tarifas} reservas=${reservas} lineas=${lineas} pagos=${pagos} cuentas=${cuentas}`);

  // Comprobación de que no quedó dinero mal etiquetado en ninguna fila.
  if (pendientes !== 0) {
    throw new Error(`Quedaron ${pendientes} filas sin actualizar`);
  }

  // Los importes no se tocan: se informa para que quede constancia.
  const totales = await prisma.hospitalityReservation.aggregate({
    where: { tenantId: tenant.id, estado: { notIn: ['cancelled', 'no_show'] } },
    _sum: { amountAfterTax: true, commission: true },
  });
  console.log(
    `\nImportes intactos (ventas): bruto ${totales._sum.amountAfterTax} ${MONEDA} · ` +
      `comisiones ${totales._sum.commission} ${MONEDA}`
  );
}

main()
  .catch((error) => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
