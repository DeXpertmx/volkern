/**
 * Verificación de UNA unidad contra el canal — SOLO LECTURA.
 *
 * Responde «¿está la unidad X conectada a Aiosell?» con el vínculo real (no con
 * lo que muestre la pantalla): fila de `ConnectivityMapping` con su estado y su
 * propiedad externa, plan de tarifa activo, y las noches de los próximos días
 * tal como viajaron en el último empuje que las cubre. No escribe ni empuja.
 *
 * Uso (dentro del contenedor de la app):
 *   CODIGO=CPC-2A node /tmp/check-unidad-2a.cjs
 */
const { PrismaClient } = require('/app/node_modules/@prisma/client');

const TENANT_ID = process.env.TENANT_ID || 'cmuy1wvzk002lmi01pie3kp40';
const CODIGO = process.env.CODIGO || 'CPC-2A';
const DIAS = Number(process.env.DIAS || 14);

const iso = (d) => d.toISOString().slice(0, 10);
const sumarDias = (texto, n) => {
  const d = new Date(`${texto}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

(async () => {
  const prisma = new PrismaClient();
  try {
    const unidad = await prisma.hospitalityUnit.findFirst({
      where: { tenantId: TENANT_ID, codigo: CODIGO },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        estado: true,
        capacidad: true,
        property: { select: { id: true, nombre: true, estado: true } },
        mappings: true,
        ratePlans: { select: { id: true, codigo: true, tarifa: true, activo: true, minNoches: true, maxNoches: true } },
      },
    });

    if (!unidad) {
      console.log(`No existe la unidad ${CODIGO} en el tenant ${TENANT_ID}.`);
      return;
    }

    console.log(`UNIDAD ${unidad.codigo} — "${unidad.nombre}" · estado ${unidad.estado} · capacidad ${unidad.capacidad ?? '—'}`);
    console.log(`  propiedad: ${unidad.property.nombre} [${unidad.property.estado}]`);
    console.log(`  vínculos (${unidad.mappings.length}):`);
    for (const m of unidad.mappings) {
      console.log(
        `    proveedor ${m.provider} · estado ${m.estado} · propiedad externa ${m.externalPropertyId} · habitación ${m.externalUnitCode} · tarifa ${m.externalRatePlanCode ?? '—'}`
      );
    }
    if (!unidad.mappings.length) console.log('    ⚠ NINGUNO: la unidad no se empuja a ningún canal.');

    console.log('  planes de tarifa:');
    for (const p of unidad.ratePlans) {
      console.log(
        `    ${p.codigo} · ${p.tarifa} · ${p.activo ? 'activo' : 'INACTIVO'} · mín ${p.minNoches ?? '—'} / máx ${p.maxNoches ?? '—'}`
      );
    }

    const ahora = new Date();
    const [bloqueos, reservas] = await Promise.all([
      prisma.hospitalityUnitBlock.findMany({
        where: { unitId: unidad.id, estado: 'activo', fechaFin: { gte: ahora } },
        orderBy: { fechaInicio: 'asc' },
        select: { fechaInicio: true, fechaFin: true, motivo: true, tipo: true, estado: true },
      }),
      prisma.hospitalityReservation.findMany({
        where: { unitId: unidad.id, estado: { notIn: ['cancelled', 'no_show'] }, checkOut: { gte: ahora } },
        orderBy: { checkIn: 'asc' },
        select: { externalBookingId: true, channel: true, checkIn: true, checkOut: true, estado: true },
      }),
    ]);
    console.log(`  bloqueos activos que tocan el futuro (${bloqueos.length}):`);
    for (const b of bloqueos) {
      console.log(`    ${iso(new Date(b.fechaInicio))} → ${iso(new Date(b.fechaFin))} · ${b.tipo ?? '—'} · ${b.motivo ?? '—'} [${b.estado}]`);
    }
    console.log(`  reservas vivas que tocan el futuro (${reservas.length}):`);
    for (const r of reservas) {
      console.log(`    ${r.channel}/${r.externalBookingId} · ${iso(new Date(r.checkIn))} → ${iso(new Date(r.checkOut))} · ${r.estado}`);
    }

    const codigosExternos = [...new Set(unidad.mappings.map((m) => m.externalUnitCode))];
    if (!codigosExternos.length) return;

    // Último empuje de inventario que cubre cada una de las próximas noches.
    const logs = await prisma.hospitalitySyncLog.findMany({
      where: {
        tenantId: TENANT_ID,
        tipo: 'inventory',
        estado: 'exito',
        fechaCreacion: { gt: new Date(Date.now() - 120 * 86400000) },
      },
      orderBy: { fechaCreacion: 'desc' },
      select: { fechaCreacion: true, operacion: true, requestPayload: true },
      take: 300,
    });

    const hoy = iso(new Date());
    console.log(`\nINVENTARIO EMPUJADO (${hoy} → ${sumarDias(hoy, DIAS - 1)})`);
    for (const code of codigosExternos) {
      console.log(`  habitación externa ${code}:`);
      for (let i = 0; i < DIAS; i += 1) {
        const fecha = sumarDias(hoy, i);
        const dia = new Date(`${fecha}T00:00:00.000Z`).getTime();
        const ocupada = reservas.some(
          (r) => new Date(r.checkIn).setUTCHours(0, 0, 0, 0) <= dia && new Date(r.checkOut).setUTCHours(0, 0, 0, 0) > dia
        );
        const bloqueada = bloqueos.some(
          (b) => new Date(b.fechaInicio).setUTCHours(0, 0, 0, 0) <= dia && new Date(b.fechaFin).setUTCHours(0, 0, 0, 0) > dia
        );
        let hallado = null;
        for (const log of logs) {
          const tramos = log.requestPayload?.updates;
          if (!Array.isArray(tramos)) continue;
          for (const t of tramos) {
            if (!t?.startDate || !t?.endDate || fecha < t.startDate || fecha > t.endDate) continue;
            const room = (t.rooms || []).find((r) => r?.roomCode === code && typeof r.available === 'number');
            if (room) {
              hallado = { available: room.available, cuando: new Date(log.fechaCreacion).toISOString(), operacion: log.operacion };
              break;
            }
          }
          if (hallado) break;
        }
        const esperado = ocupada || bloqueada ? 0 : 1;
        const marca = hallado && hallado.available !== esperado ? (hallado.available > esperado ? '  ⚠ ABIERTA de más' : '  ⚠ CERRADA de más') : '';
        console.log(
          hallado
            ? `    ${fecha}  pushed ${hallado.available} · interno ${esperado}${marca}  (push ${hallado.cuando}, ${hallado.operacion ?? '—'})`
            : `    ${fecha}  interno ${esperado} · SIN DATO en los empujes de los últimos 120 días`
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('FALLO:', e && e.message ? e.message : e);
  process.exit(1);
});
