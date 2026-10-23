/**
 * Mueve la unidad «Apartamento Centro Ciudad» (`ACC`) de la propiedad suelta
 * «Apartamento centro ciudad» a «Ciudad Patio Cuarenta» (tenant
 * `cmuy1wvzk002lmi01pie3kp40`), y deja la propiedad de origen inactiva porque
 * se queda sin unidades.
 *
 * Medido el 17-oct-2026 antes de escribir esto (solo lectura, BD del VPS):
 *  - «Apartamento centro ciudad» (cmv6ifce400j8my01a2yp0rlw) tiene UNA unidad,
 *    `ACC` (cmv9ph3a2009fmh01j9riqlzi), con 0 reservas y sin vínculo de canal.
 *  - La propiedad de origen no tiene NADA más colgando: 0 planes de tarifa,
 *    0 reservas e ítems, 0 pagos, 0 reseñas, 0 extras, 0 conversaciones,
 *    0 logs de sincronización y 0 mappings de conectividad.
 *  - El motor directo publica solo `c95a662e...` (Ciudad Patio Cuarenta), así
 *    que mover la unidad no la saca ni la mete en la web pública.
 *
 * Lo que este script NO puede hacer: vender ACC por Booking. El proveedor
 * publica cuatro habitaciones (`2b`, `2a`, `1a`, `1b`) y `ACC` no está en su
 * catálogo; sin código de habitación no hay vínculo ni tarifa que empujar.
 *
 * Idempotente: si ACC ya está en la propiedad destino, no toca nada.
 * Deja rastro en AuditLog. Ejecutar dentro del contenedor de la app:
 *   node /tmp/mover-unidad-acc-a-patio-cuarenta.cjs
 */
const { PrismaClient } = require('/app/node_modules/@prisma/client');

const TENANT_ID = 'cmuy1wvzk002lmi01pie3kp40';
const PROPIEDAD_ORIGEN = 'cmv6ifce400j8my01a2yp0rlw'; // Apartamento centro ciudad
const PROPIEDAD_DESTINO = 'c95a662e0130cdac7147b57da'; // Ciudad Patio Cuarenta
const UNIDAD_ACC = 'cmv9ph3a2009fmh01j9riqlzi'; // Apartamento Centro Ciudad (ACC)

(async () => {
  const prisma = new PrismaClient();
  try {
    const [origen, destino, unidad] = await Promise.all([
      prisma.hospitalityProperty.findFirst({
        where: { id: PROPIEDAD_ORIGEN, tenantId: TENANT_ID },
        select: { id: true, nombre: true, estado: true },
      }),
      prisma.hospitalityProperty.findFirst({
        where: { id: PROPIEDAD_DESTINO, tenantId: TENANT_ID },
        select: { id: true, nombre: true, estado: true },
      }),
      prisma.hospitalityUnit.findFirst({
        where: { id: UNIDAD_ACC, tenantId: TENANT_ID },
        select: { id: true, nombre: true, codigo: true, propertyId: true, estado: true },
      }),
    ]);
    if (!origen) throw new Error('Propiedad de origen no encontrada en el tenant');
    if (!destino) throw new Error('Propiedad destino no encontrada en el tenant');
    if (!unidad) throw new Error('Unidad ACC no encontrada en el tenant');

    console.log('ANTES:', JSON.stringify({ origen, destino, unidad }));

    if (unidad.propertyId === PROPIEDAD_DESTINO) {
      console.log('SIN CAMBIOS: ACC ya pertenece a', destino.nombre);
    } else {
      if (unidad.propertyId !== PROPIEDAD_ORIGEN) {
        throw new Error(`ACC no está en la propiedad de origen esperada (está en ${unidad.propertyId})`);
      }

      // Una noche vendida no se muda de propiedad a espaldas de nadie.
      const reservas = await prisma.hospitalityReservation.findFirst({
        where: { tenantId: TENANT_ID, unitId: UNIDAD_ACC, estado: { not: 'cancelled' } },
        select: { id: true, externalBookingId: true, checkIn: true, checkOut: true, estado: true },
      });
      if (reservas) throw new Error(`ACC tiene reservas activas: ${JSON.stringify(reservas)}`);

      // Si algún día ACC tuviera vínculo con un canal, mover la propiedad
      // dejaría el mapping apuntando a un hotel distinto: se aborta a propósito.
      const mappings = await prisma.connectivityMapping.count({
        where: { tenantId: TENANT_ID, unitId: UNIDAD_ACC, estado: 'activo' },
      });
      if (mappings > 0) throw new Error(`ACC tiene ${mappings} mapping(s) de canal activos; revisar antes de mover`);

      const movida = await prisma.hospitalityUnit.update({
        where: { id: UNIDAD_ACC },
        data: { propertyId: PROPIEDAD_DESTINO },
        select: { id: true, nombre: true, codigo: true, propertyId: true },
      });
      console.log('UNIDAD MOVIDA:', JSON.stringify(movida));

      await prisma.auditLog.create({
        data: {
          tenantId: TENANT_ID,
          accion: 'ACTUALIZAR',
          entidad: 'hospitality_unit',
          entidadId: UNIDAD_ACC,
          descripcion: `Unidad "${unidad.nombre}" (${unidad.codigo}) movida de "${origen.nombre}" a "${destino.nombre}"`,
          cambiosAntes: { propertyId: PROPIEDAD_ORIGEN, propiedad: origen.nombre },
          cambiosDespues: { propertyId: PROPIEDAD_DESTINO, propiedad: destino.nombre },
          metadata: { origen: 'consolidacion-propiedades' },
        },
      });
    }

    // Propiedad de origen: si se quedó sin unidades, se inactiva (no se borra:
    // reversible y sin perder su ficha). Si aún tiene alguna, no se toca.
    const restantes = await prisma.hospitalityUnit.count({
      where: { tenantId: TENANT_ID, propertyId: PROPIEDAD_ORIGEN },
    });
    if (restantes === 0 && origen.estado !== 'inactiva') {
      await prisma.hospitalityProperty.update({
        where: { id: PROPIEDAD_ORIGEN },
        data: { estado: 'inactiva' },
      });
      await prisma.auditLog.create({
        data: {
          tenantId: TENANT_ID,
          accion: 'ACTUALIZAR',
          entidad: 'hospitality_property',
          entidadId: PROPIEDAD_ORIGEN,
          descripcion: `Propiedad "${origen.nombre}" inactivada: se quedó sin unidades tras mover ACC a "${destino.nombre}"`,
          cambiosAntes: { estado: origen.estado },
          cambiosDespues: { estado: 'inactiva' },
          metadata: { origen: 'consolidacion-propiedades' },
        },
      });
      console.log('PROPIEDAD ORIGEN INACTIVADA:', PROPIEDAD_ORIGEN);
    } else {
      console.log('PROPIEDAD ORIGEN SIN TOCAR: unidades restantes =', restantes, '· estado =', origen.estado);
    }

    const despues = await prisma.hospitalityUnit.findMany({
      where: { tenantId: TENANT_ID },
      select: { codigo: true, nombre: true, property: { select: { nombre: true, estado: true } } },
      orderBy: [{ propertyId: 'asc' }, { codigo: 'asc' }],
    });
    console.log('DESPUÉS:');
    for (const u of despues) {
      console.log(`  ${u.property.nombre} [${u.property.estado}] · ${u.codigo} · ${u.nombre}`);
    }
    console.log('OK');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('FALLO:', e && e.message ? e.message : e);
  process.exit(1);
});
