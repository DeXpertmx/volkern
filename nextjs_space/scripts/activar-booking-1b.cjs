/**
 * Activación del Booking Engine para "Ciudad Patio Cuarenta" (tenant
 * manuel-mart-n / `cmuy1wvzk002lmi01pie3kp40`, hotel externo 75fdbbce2e).
 *
 * Qué hace, y por qué:
 *  1. Crea la configuración del motor directo (el tenant nunca la tuvo: no había
 *     página pública ni forma de reservar online). Publica la propiedad
 *     "Ciudad Patio Cuarenta" y deja visibles SOLO la unidad 1B; 1A, 2A y 2B
 *     quedan excluidas de la web, pero siguen vendiéndose en Booking.com y
 *     ocupando el planning (la exclusión es solo del canal directo).
 *  2. Cierra la unidad 1B del 6-oct-2026 al 30-abr-2027 (fechaFin EXCLUSIVA:
 *     la última noche bloqueada es el 30 de abril y la salida sería el 1 de
 *     mayo). Antes comprueba que no haya reservas vendidas en ese rango: las
 *     fechas contratadas no se pisan.
 *
 * Idempotente: si la config ya existe, solo actualiza lo que gestiona; si el
 * bloqueo ya cubre el rango, no crea otro. Deja rastro en AuditLog.
 *
 * Ejecutar dentro del contenedor de la app:  node /tmp/activar-booking-1b.cjs
 */
const { PrismaClient } = require('/app/node_modules/@prisma/client');

const TENANT_ID = 'cmuy1wvzk002lmi01pie3kp40';
const PROPERTY_ID = 'c95a662e0130cdac7147b57da'; // Ciudad Patio Cuarenta
const UNIT_1B = 'cmv6fthv300aumy01cvz3uci3'; // Apartamento centro ciudad patio cuarenta 1B
// 1A, 2A, 2B: siguen en el canal y en el planning, fuera de la web directa.
const UNIDADES_EXCLUIDAS = [
  'cmv6gpnfo00c6my01rzqfif22', // 1A
  'cmv6faxbl009omy013gzd93k8', // 2A
  'c2b706a6c4fc21e9876c1270d', // 2B
  'cmv9p0pcf008fmh01ze8s5w9z', // BAJO
];
const SLUG = 'patio-cuarenta';
const INICIO = new Date('2026-10-06T00:00:00.000Z');
const FIN = new Date('2027-05-01T00:00:00.000Z'); // exclusiva: última noche 30-abr
const MOTIVO = 'Cierre solicitado: 1B no disponible del 6-oct-2026 al 30-abr-2027';

(async () => {
  const prisma = new PrismaClient();
  try {
    const [tenant, propiedad, unidad] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true, nombre: true, moneda: true } }),
      prisma.hospitalityProperty.findFirst({ where: { id: PROPERTY_ID, tenantId: TENANT_ID }, select: { id: true, nombre: true } }),
      prisma.hospitalityUnit.findFirst({ where: { id: UNIT_1B, tenantId: TENANT_ID }, select: { id: true, nombre: true } }),
    ]);
    if (!tenant) throw new Error('Tenant no encontrado');
    if (!propiedad) throw new Error('Propiedad no encontrada en el tenant');
    if (!unidad) throw new Error('Unidad 1B no encontrada en el tenant');

    const slugOcupado = await prisma.hospitalityBookingConfig.findFirst({
      where: { slug: SLUG, tenantId: { not: TENANT_ID } },
      select: { tenantId: true },
    });
    if (slugOcupado) throw new Error(`El slug "${SLUG}" ya lo usa otro tenant`);

    // ── 1. Configuración del motor directo ────────────────────────────────
    const campos = {
      slug: SLUG,
      titulo: 'Apartamentos Ciudad Patio Cuarenta',
      moneda: tenant.moneda || 'EUR',
      propiedadesPublicadas: [PROPERTY_ID],
      unidadesExcluidas: UNIDADES_EXCLUIDAS,
      activo: true,
    };
    const config = await prisma.hospitalityBookingConfig.upsert({
      where: { tenantId: TENANT_ID },
      create: { tenantId: TENANT_ID, ...campos },
      update: campos,
    });
    console.log('CONFIG:', JSON.stringify({
      id: config.id,
      slug: config.slug,
      activo: config.activo,
      propiedadesPublicadas: config.propiedadesPublicadas,
      unidadesExcluidas: config.unidadesExcluidas,
    }));

    // ── 2. Bloqueo de 1B (sin pisar noches vendidas) ─────────────────────
    const existente = await prisma.hospitalityUnitBlock.findFirst({
      where: {
        tenantId: TENANT_ID,
        unitId: UNIT_1B,
        estado: 'activo',
        fechaInicio: { lt: FIN },
        fechaFin: { gt: INICIO },
      },
      select: { id: true, fechaInicio: true, fechaFin: true, motivo: true },
    });

    if (existente) {
      console.log('BLOQUEO: ya existe, sin cambios:', JSON.stringify(existente));
    } else {
      // La misma regla que `bloqueos-guarda`: solo las reservas que producen
      // ocupan, y la salida no ocupa (un checkOut el 6-oct no choca).
      const choques = await prisma.hospitalityReservation.findMany({
        where: {
          tenantId: TENANT_ID,
          unitId: UNIT_1B,
          estado: { notIn: ['cancelled', 'no_show'] },
          checkIn: { lt: FIN },
          checkOut: { gt: INICIO },
        },
        select: { id: true, externalBookingId: true, checkIn: true, checkOut: true, estado: true },
      });
      if (choques.length > 0) {
        throw new Error(
          `Hay ${choques.length} reserva(s) en el rango: ${JSON.stringify(choques)}. No se bloquea.`
        );
      }

      const bloqueo = await prisma.hospitalityUnitBlock.create({
        data: {
          tenantId: TENANT_ID,
          unitId: UNIT_1B,
          fechaInicio: INICIO,
          fechaFin: FIN,
          tipo: 'administrativo',
          motivo: MOTIVO,
          estado: 'activo',
        },
      });
      console.log('BLOQUEO: creado:', JSON.stringify({
        id: bloqueo.id,
        unitId: bloqueo.unitId,
        fechaInicio: bloqueo.fechaInicio,
        fechaFin: bloqueo.fechaFin,
        tipo: bloqueo.tipo,
        motivo: bloqueo.motivo,
      }));

      await prisma.auditLog.create({
        data: {
          tenantId: TENANT_ID,
          accion: 'BLOQUEO_CREADO',
          entidad: 'hospitality_unit_block',
          entidadId: bloqueo.id,
          descripcion: `Bloqueo de 1B del 2026-10-06 al 2027-05-01 (última noche 30-abr) · ${unidad.nombre}`,
          cambiosDespues: {
            unitId: UNIT_1B,
            fechaInicio: '2026-10-06',
            fechaFin: '2027-05-01',
            tipo: 'administrativo',
            motivo: MOTIVO,
          },
          metadata: { origen: 'activacion-asistida', propiedad: propiedad.nombre },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: TENANT_ID,
        accion: 'BOOKING_ACTIVADO',
        entidad: 'hospitality_booking_config',
        entidadId: config.id,
        descripcion:
          'Motor de reservas directo activado: propiedad publicada con solo 1B visible (1A/2A/2B siguen en canal)',
        cambiosDespues: campos,
        metadata: { origen: 'activacion-asistida' },
      },
    });

    console.log('OK');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('FALLO:', e && e.message ? e.message : e);
  process.exit(1);
});
