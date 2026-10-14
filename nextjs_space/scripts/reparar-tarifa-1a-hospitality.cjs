/**
 * Reparación de datos: plan de tarifa que falta para la unidad 1A de
 * "Ciudad Patio Cuarenta" (tenant manuel-mart-n, hotel externo 75fdbbce2e).
 *
 * Por qué: 1B, 2A y 2B tienen cada una su plan con el código de tarifa del
 * proveedor (`1b-d-ep`, `2a-d-ep`, `2b-d-ep`), y 1A no tenía ninguno. Consecuencia
 * medida en producción el 14-oct 2026: en el push de `rates_restrictions` viajaban
 * 3 pares (1b, 2a, 2b) y la 1A se quedaba fuera («no tiene plan de tarifa con
 * código del proveedor»), así que sus reglas de venta (estancia mínima, cierre de
 * llegada/salida) nunca llegaban al canal; y en `rates` viajaba por el respaldo del
 * vínculo, con la tarifa base plana, sin la estacionalidad que sí tienen las otras
 * tres.
 *
 * El plan se crea ESPEJO de los otros tres (mismos 120 EUR, estancia mínima 2,
 * misma "Tarifa de Verano"), porque son los cuatro apartamentos de la misma
 * propiedad y así queda también gestionable desde el panel de Tarifas.
 *
 * Idempotente: si la unidad ya tiene plan, no escribe nada.
 * Ejecutar dentro del contenedor de la app:  node /tmp/repara-tarifa-1a.cjs
 */
const { PrismaClient } = require('/app/node_modules/@prisma/client');

const TENANT_ID = 'cmuy1wvzk002lmi01pie3kp40';
const PROPERTY_ID = 'c95a662e0130cdac7147b57da';
const UNIT_ID = 'cmv6gpnfo00c6my01rzqfif22'; // Apartamento centro ciudad patio cuarenta 1A
const CODIGO = '1a-d-ep'; // código de tarifa del vínculo del proveedor para esa unidad

const TEMPORADAS = [
  { desde: '2027-06-17', hasta: '2027-08-31', nombre: 'Tarifa de Verano', tarifa: 140, minNoches: 3 },
];

(async () => {
  const prisma = new PrismaClient();
  try {
    const existentes = await prisma.hospitalityRatePlan.findMany({
      where: { unitId: UNIT_ID },
      select: { id: true, nombre: true, codigo: true },
    });
    if (existentes.length > 0) {
      console.log('SIN CAMBIOS: la unidad 1A ya tiene plan(es):', JSON.stringify(existentes));
      return;
    }

    const plan = await prisma.hospitalityRatePlan.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        nombre: 'Tarifa 1A',
        codigo: CODIGO,
        tarifa: 120,
        moneda: 'EUR',
        minNoches: 2,
        maxNoches: null,
        temporadas: TEMPORADAS,
        activo: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: TENANT_ID,
        accion: 'DATA_REPAIR',
        entidad: 'hospitality_rate_plan',
        entidadId: plan.id,
        descripcion:
          'Plan de tarifa creado para la unidad 1A (faltaba): sin él sus restricciones de venta no viajaban al canal',
        cambiosDespues: {
          nombre: plan.nombre,
          codigo: plan.codigo,
          tarifa: plan.tarifa,
          moneda: plan.moneda,
          minNoches: plan.minNoches,
          temporadas: TEMPORADAS,
          unitId: UNIT_ID,
        },
        metadata: { origen: 'reparacion-asistida', codigoExterno: CODIGO },
      },
    });

    console.log(
      'CREADO:',
      JSON.stringify({ id: plan.id, nombre: plan.nombre, codigo: plan.codigo, tarifa: plan.tarifa, moneda: plan.moneda, minNoches: plan.minNoches }),
    );
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('FALLO:', e && e.message ? e.message : e);
  process.exit(1);
});
