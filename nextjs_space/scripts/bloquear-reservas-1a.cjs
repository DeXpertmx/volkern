/**
 * Cierres de la unidad 1A que viven SOLO en el calendario de Booking.com.
 *
 * Medido el 17-oct-2026 con una sonda de solo lectura al Fetch Reservations del
 * canal: el proveedor devuelve 5 reservas y TODAS son de la unidad 2B. Para 1A
 * no hay ninguna reserva, ni en el canal ni en el ERP; sus cuatro cierres están
 * puestos a mano en la extranet. Como el ERP publica su estado interno como
 * verdad del calendario, esas noches se reabrirían en el siguiente push
 * (sobreventa silenciosa) si no se registran aquí.
 *
 * Se registran como BLOQUEOS (no como reservas): no hay datos de huésped,
 * importe ni canal que permitan crear una reserva real, y un bloqueo es
 * exactamente lo que son para el inventario. Cada uno lleva el nombre con el
 * que el hotel lo reconoce para que el planning diga por qué está cerrado.
 *
 * Intervalo: fechaInicio inclusiva, fechaFin EXCLUSIVA (checkout). Idempotente.
 * Ejecutar dentro del contenedor: node /tmp/bloquear-reservas-1a.cjs
 */
const { PrismaClient } = require('/app/node_modules/@prisma/client');

const TENANT_ID = 'cmuy1wvzk002lmi01pie3kp40';
const UNIT_1A = 'cmv6gpnfo00c6my01rzqfif22';

const CIERRES = [
  { inicio: '2026-10-10', fin: '2026-10-23', motivo: 'Reserva Alejo Ferrari (cerrada en Booking, no importada)' },
  { inicio: '2026-12-03', fin: '2026-12-06', motivo: 'Reserva Olena — Booking.com (cerrada en Booking, no importada)' },
  { inicio: '2027-01-02', fin: '2027-01-04', motivo: 'Reserva Elisa — Booking.com (cerrada en Booking, no importada)' },
  { inicio: '2027-03-25', fin: '2027-03-28', motivo: 'Reserva María José — Booking.com (cerrada en Booking, no importada)' },
].map((c) => ({
  ...c,
  inicioFecha: new Date(`${c.inicio}T00:00:00.000Z`),
  finFecha: new Date(`${c.fin}T00:00:00.000Z`),
}));

(async () => {
  const prisma = new PrismaClient();
  try {
    const unidad = await prisma.hospitalityUnit.findFirst({
      where: { id: UNIT_1A, tenantId: TENANT_ID },
      select: { id: true, nombre: true, propertyId: true },
    });
    if (!unidad) throw new Error('Unidad 1A no encontrada en el tenant');

    for (const cierre of CIERRES) {
      const existente = await prisma.hospitalityUnitBlock.findFirst({
        where: {
          tenantId: TENANT_ID,
          unitId: UNIT_1A,
          estado: 'activo',
          fechaInicio: { lt: cierre.finFecha },
          fechaFin: { gt: cierre.inicioFecha },
        },
        select: { id: true, fechaInicio: true, fechaFin: true },
      });
      if (existente) {
        console.log(`YA EXISTE ${cierre.inicio} → ${cierre.fin}:`, JSON.stringify(existente));
        continue;
      }

      // Misma guarda que la API: una noche vendida no se cierra.
      const choques = await prisma.hospitalityReservation.findMany({
        where: {
          tenantId: TENANT_ID,
          unitId: UNIT_1A,
          estado: { notIn: ['cancelled', 'no_show'] },
          checkIn: { lt: cierre.finFecha },
          checkOut: { gt: cierre.inicioFecha },
        },
        select: { id: true, externalBookingId: true, checkIn: true, checkOut: true },
      });
      if (choques.length > 0) {
        throw new Error(`Hay reservas en ${cierre.inicio} → ${cierre.fin}: ${JSON.stringify(choques)}`);
      }

      const bloqueo = await prisma.hospitalityUnitBlock.create({
        data: {
          tenantId: TENANT_ID,
          unitId: UNIT_1A,
          fechaInicio: cierre.inicioFecha,
          fechaFin: cierre.finFecha,
          tipo: 'administrativo',
          motivo: cierre.motivo,
          estado: 'activo',
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: TENANT_ID,
          accion: 'BLOQUEO_CREADO',
          entidad: 'hospitality_unit_block',
          entidadId: bloqueo.id,
          descripcion: `Bloqueo de 1A del ${cierre.inicio} al ${cierre.fin} (checkout) · ${cierre.motivo}`,
          cambiosDespues: {
            unitId: UNIT_1A,
            fechaInicio: cierre.inicio,
            fechaFin: cierre.fin,
            tipo: 'administrativo',
            motivo: cierre.motivo,
          },
          metadata: { origen: 'cierre-solo-en-canal', propiedad: unidad.nombre },
        },
      });

      console.log(`CREADO ${cierre.inicio} → ${cierre.fin}:`, bloqueo.id, '·', cierre.motivo);
    }
    console.log('OK');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('FALLO:', e && e.message ? e.message : e);
  process.exit(1);
});
