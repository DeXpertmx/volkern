/**
 * Seed Demo — Siniestros (Fase 5.1)
 *
 * Crea siniestros demo contra las pólizas de seed-insurance-demo.ts
 * (tenant 'demo'), cubriendo todos los estados del ciclo de vida:
 * REPORTADO → EN_TRAMITE → ABIERTO → (PAGADO | RECHAZADO) → CERRADO.
 *
 * Idempotente: upsert por `tenantId_numeroSiniestro` (todos los demo llevan
 * numeroSiniestro SIN-DEMO-XXX). No borra ni duplica nada.
 *
 * Uso: npx tsx scripts/seed-siniestros-demo.ts
 *       TENANT_ID=<tenantId> npx tsx scripts/seed-siniestros-demo.ts
 */

import prisma from '../lib/db';

const TENANT_ID = process.env.TENANT_ID || 'demo';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log(`🛡️  Sembrando siniestros demo para tenant '${TENANT_ID}'...\n`);

  // El Siniestro requiere createdById → User. Resolver el primer usuario del tenant.
  const user = await prisma.user.findFirst({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    console.error(`❌ No hay ningún usuario en el tenant '${TENANT_ID}'. No puedo asignar createdById.`);
    process.exit(1);
  }
  console.log(`  👤 Creador: ${user.name || user.id}`);

  // Resolver las pólizas demo por número.
  const polizas = await prisma.poliza.findMany({
    where: { tenantId: TENANT_ID, numeroPoliza: { in: [
      'P-AXA-2026-001', // Carlos — Auto
      'P-MAP-2026-004', // María — Auto
      'P-AXA-2026-008', // Roberto — Empresarial
      'P-QUA-2026-012', // Ana — Auto
      'P-QUA-2026-013', // Javier — Transporte
      'P-AXA-2026-003', // Carlos — Vida
    ] } },
    select: {
      id: true,
      numeroPoliza: true,
      clienteId: true,
      aseguradoraId: true,
      moneda: true,
      cliente: { select: { nombre: true } },
    },
  });
  const polizaByNum = new Map(polizas.map(p => [p.numeroPoliza, p]));
  const faltantes = [
    'P-AXA-2026-001', 'P-MAP-2026-004', 'P-AXA-2026-008',
    'P-QUA-2026-012', 'P-QUA-2026-013', 'P-AXA-2026-003',
  ].filter(n => !polizaByNum.has(n));
  if (faltantes.length > 0) {
    console.error(`❌ Faltan pólizas demo (ejecuta primero seed-insurance-demo.ts): ${faltantes.join(', ')}`);
    process.exit(1);
  }

  const now = new Date();
  const demo = [
    {
      numeroSiniestro: 'SIN-DEMO-001',
      polizaNum: 'P-AXA-2026-001',
      descripcion: 'Colisión leve en estacionamiento: golpe en puerta trasera derecha y espejo.',
      fechaSuceso: addDays(now, -3),
      fechaReporte: addDays(now, -2),
      montoReclamado: 1500,
      deducible: 200,
      moneda: 'EUR',
      estado: 'REPORTADO' as const,
      notas: 'Cliente enviará fotos del vehículo esta tarde.',
    },
    {
      numeroSiniestro: 'SIN-DEMO-002',
      polizaNum: 'P-MAP-2026-004',
      descripcion: 'Daño por agua tras tormenta: filtraciones en el habitáculo y sistema eléctrico afectado.',
      fechaSuceso: addDays(now, -10),
      fechaReporte: addDays(now, -9),
      montoReclamado: 3200,
      deducible: 300,
      moneda: 'EUR',
      estado: 'EN_TRAMITE' as const,
      notas: 'Perito asignado por MAPFRE, inspección el viernes.',
    },
    {
      numeroSiniestro: 'SIN-DEMO-003',
      polizaNum: 'P-AXA-2026-008',
      descripcion: 'Incendio en local comercial: daños en mercancía y acondicionamiento del local.',
      fechaSuceso: addDays(now, -20),
      fechaReporte: addDays(now, -19),
      montoReclamado: 24000,
      deducible: 1000,
      moneda: 'EUR',
      estado: 'ABIERTO' as const,
      notas: 'Pendiente informe pericial de AXA; cliente muy afectado, priorizar seguimiento.',
    },
    {
      numeroSiniestro: 'SIN-DEMO-004',
      polizaNum: 'P-QUA-2026-012',
      descripcion: 'Choque por alcance en avenida: parachoques trasero y defensa dañados.',
      fechaSuceso: addDays(now, -30),
      fechaReporte: addDays(now, -30),
      montoReclamado: 4200,
      montoIndemnizado: 3980,
      deducible: 220,
      moneda: 'MXN',
      estado: 'PAGADO' as const,
      fechaCierre: addDays(now, -2),
      notas: 'Indemnización transferida a la cuenta del taller.',
    },
    {
      numeroSiniestro: 'SIN-DEMO-005',
      polizaNum: 'P-QUA-2026-013',
      descripcion: 'Vuelco de camión de reparto: daños en caja y mercancía perecedera.',
      fechaSuceso: addDays(now, -15),
      fechaReporte: addDays(now, -14),
      montoReclamado: 18500,
      deducible: 1500,
      moneda: 'MXN',
      estado: 'RECHAZADO' as const,
      motivoRechazo: 'Siniestro no cubierto: el vehículo operaba fuera de la zona autorizada por la póliza.',
      notas: 'Revisar si el cliente quiere recurrir la decisión.',
    },
    {
      numeroSiniestro: 'SIN-DEMO-006',
      polizaNum: 'P-AXA-2026-003',
      descripcion: 'Robo con violencia en domicilio: sustracción de enseres personales.',
      fechaSuceso: addDays(now, -45),
      fechaReporte: addDays(now, -45),
      montoReclamado: 6200,
      montoIndemnizado: 5400,
      deducible: 0,
      moneda: 'EUR',
      estado: 'CERRADO' as const,
      fechaCierre: addDays(now, -10),
      notas: 'Expediente cerrado con denuncia presentada.',
    },
  ];

  let creados = 0;
  for (const s of demo) {
    const poliza = polizaByNum.get(s.polizaNum)!;
    await prisma.siniestro.upsert({
      where: { tenantId_numeroSiniestro: { tenantId: TENANT_ID, numeroSiniestro: s.numeroSiniestro } },
      update: {
        descripcion: s.descripcion,
        estado: s.estado,
        notas: s.notas,
      },
      create: {
        tenantId: TENANT_ID,
        polizaId: poliza.id,
        clienteId: poliza.clienteId,
        aseguradoraId: poliza.aseguradoraId,
        numeroSiniestro: s.numeroSiniestro,
        descripcion: s.descripcion,
        fechaSuceso: s.fechaSuceso,
        fechaReporte: s.fechaReporte,
        fechaCierre: s.fechaCierre ?? null,
        montoReclamado: s.montoReclamado,
        montoIndemnizado: s.montoIndemnizado ?? null,
        deducible: s.deducible,
        moneda: s.moneda ?? poliza.moneda ?? 'EUR',
        estado: s.estado,
        motivoRechazo: s.motivoRechazo ?? null,
        notas: s.notas ?? null,
        createdById: user.id,
      },
    });
    creados++;
    console.log(`  ✅ ${s.numeroSiniestro} — ${s.estado} · ${poliza.cliente?.nombre ?? poliza.clienteId} · ${s.polizaNum}`);
  }

  const total = await prisma.siniestro.count({ where: { tenantId: TENANT_ID } });
  console.log(`\n📊 Resumen:`);
  console.log(`  • ${creados} siniestros demo (upsert)`);
  console.log(`  • ${total} siniestros totales en el tenant`);
  console.log('\n✅ Seed de siniestros completado. Abre /dashboard/seguros/siniestros para verlos.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed de siniestros:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
