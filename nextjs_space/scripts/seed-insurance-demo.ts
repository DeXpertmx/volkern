/**
 * Seed Demo — Volkern Insurance
 * 
 * Carga datos realistas de seguros en la BD para que el dashboard
 * no esté vacío. Crea clientes, aseguradoras, productos y pólizas
 * con distintos ramos, estados y fechas de vencimiento.
 * 
 * Uso: npx tsx scripts/seed-insurance-demo.ts
 */

import prisma from '../lib/db';

const TENANT_ID = 'demo'; // Cambiar por el tenantId real

async function main() {
  console.log('🌱 Sembrando datos demo de Volkern Insurance...\n');

  // ── 1. Aseguradoras ──────────────────────────────────────────────────────
  const aseguradoras = await Promise.all([
    prisma.aseguradora.upsert({
      where: { tenantId_nombre: { tenantId: TENANT_ID, nombre: 'AXA Seguros' } },
      update: {},
      create: { tenantId: TENANT_ID, nombre: 'AXA Seguros', email: 'info@axa.es', web: 'https://www.axa.es', telefono: '912 000 000', activa: true },
    }),
    prisma.aseguradora.upsert({
      where: { tenantId_nombre: { tenantId: TENANT_ID, nombre: 'MAPFRE' } },
      update: {},
      create: { tenantId: TENANT_ID, nombre: 'MAPFRE', email: 'contacto@mapfre.es', web: 'https://www.mapfre.es', telefono: '915 000 000', activa: true },
    }),
    prisma.aseguradora.upsert({
      where: { tenantId_nombre: { tenantId: TENANT_ID, nombre: 'Allianz' } },
      update: {},
      create: { tenantId: TENANT_ID, nombre: 'Allianz', email: 'info@allianz.es', web: 'https://www.allianz.es', telefono: '913 000 000', activa: true },
    }),
    prisma.aseguradora.upsert({
      where: { tenantId_nombre: { tenantId: TENANT_ID, nombre: 'GNP Seguros' } },
      update: {},
      create: { tenantId: TENANT_ID, nombre: 'GNP Seguros', email: 'contacto@gnp.com.mx', web: 'https://www.gnp.com.mx', telefono: '555 000 0000', activa: true },
    }),
    prisma.aseguradora.upsert({
      where: { tenantId_nombre: { tenantId: TENANT_ID, nombre: 'Qualitas' } },
      update: {},
      create: { tenantId: TENANT_ID, nombre: 'Qualitas', email: 'info@qualitas.com.mx', web: 'https://www.qualitas.com.mx', telefono: '555 111 0000', activa: true },
    }),
  ]);
  console.log(`  ✅ ${aseguradoras.length} aseguradoras`);

  // ── 2. Productos de seguro ───────────────────────────────────────────────
  const axaId = aseguradoras[0].id;
  const mapfreId = aseguradoras[1].id;
  const allianzId = aseguradoras[2].id;
  const gnpId = aseguradoras[3].id;
  const qualitasId = aseguradoras[4].id;

  const productosData = [
    { aseguradoraId: axaId, nombre: 'Auto AXA Premium', ramo: 'AUTO', descripcion: 'Cobertura amplia con asistencia 24h' },
    { aseguradoraId: axaId, nombre: 'Hogar AXA Protección Total', ramo: 'HOGAR', descripcion: 'Protección completa para tu vivienda' },
    { aseguradoraId: axaId, nombre: 'Vida AXA Familiar', ramo: 'VIDA', descripcion: 'Seguro de vida con protección familiar' },
    { aseguradoraId: axaId, nombre: 'Salud AXA Completo', ramo: 'SALUD', descripcion: 'Cobertura médica completa sin copagos' },
    { aseguradoraId: mapfreId, nombre: 'Auto MAPFRE Plus', ramo: 'AUTO', descripcion: 'Cobertura con franquicia reducida' },
    { aseguradoraId: mapfreId, nombre: 'Hogar MAPFRE Comfort', ramo: 'HOGAR', descripcion: 'Hogar con responsabilidad civil ampliada' },
    { aseguradoraId: mapfreId, nombre: 'Vida MAPFRE Ahorro', ramo: 'VIDA', descripcion: 'Vida + ahorro garantizado' },
    { aseguradoraId: mapfreId, nombre: 'Empresarial MAPFRE PYME', ramo: 'EMPRESARIAL', descripcion: 'Paquete integral para pequeñas empresas' },
    { aseguradoraId: allianzId, nombre: 'Auto Allianz Elite', ramo: 'AUTO', descripcion: 'Cobertura premium con vehículo de sustitución' },
    { aseguradoraId: allianzId, nombre: 'Salud Allianz Global', ramo: 'SALUD', descripcion: 'Cobertura internacional' },
    { aseguradoraId: gnpId, nombre: 'Auto GNP Amplio', ramo: 'AUTO', descripcion: 'Cobertura amplia para todo México' },
    { aseguradoraId: gnpId, nombre: 'Gastos Médicos GNP', ramo: 'GASTOS_MEDICOS', descripcion: 'Gastos médicos mayores' },
    { aseguradoraId: gnpId, nombre: 'Vida GNP Protección', ramo: 'VIDA', descripcion: 'Protección familiar completa' },
    { aseguradoraId: qualitasId, nombre: 'Auto Qualitas Integral', ramo: 'AUTO', descripcion: 'Cobertura integral con ajuste de prima' },
    { aseguradoraId: qualitasId, nombre: 'Flotilla Qualitas', ramo: 'TRANSPORTE', descripcion: 'Seguro para flotillas comerciales' },
  ];

  const productos: Record<string, any> = {};
  for (const p of productosData) {
    const slug = `${p.aseguradoraId}-${p.nombre}`.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 80);
    const key = `${p.aseguradoraId}-${p.ramo}`;
    const prod = await prisma.productoSeguro.upsert({
      where: { tenantId_aseguradoraId_nombre: { tenantId: TENANT_ID, aseguradoraId: p.aseguradoraId, nombre: p.nombre } },
      update: {},
      create: { tenantId: TENANT_ID, aseguradoraId: p.aseguradoraId, nombre: p.nombre, ramo: p.ramo, descripcion: p.descripcion },
    });
    productos[key] = prod;
  }
  console.log(`  ✅ ${Object.keys(productos).length} productos`);

  // ── 3. Clientes ──────────────────────────────────────────────────────────
  const clientesData = [
    { nombre: 'Carlos Mendoza Gutiérrez', email: 'carlos.mendoza@email.com', telefono: '+34 612 345 678' },
    { nombre: 'María García López', email: 'maria.garcia@email.com', telefono: '+34 623 456 789' },
    { nombre: 'Roberto Núñez Fernández', email: 'roberto.nunez@email.com', telefono: '+34 634 567 890' },
    { nombre: 'Ana Martínez Ruiz', email: 'ana.martinez@email.com', telefono: '+34 645 678 901' },
    { nombre: 'Javier Torres Sánchez', email: 'javier.torres@email.com', telefono: '+34 656 789 012' },
  ];

  const clientes: any[] = [];
  for (const c of clientesData) {
    const cliente = await prisma.contact.upsert({
      where: { tenantId_email: { tenantId: TENANT_ID, email: c.email } },
      update: {},
      create: { tenantId: TENANT_ID, nombre: c.nombre, email: c.email, telefono: c.telefono, tipo: 'person' },
    });
    clientes.push(cliente);
  }
  console.log(`  ✅ ${clientes.length} clientes`);

  // ── 4. Pólizas ───────────────────────────────────────────────────────────
  const now = new Date();
  const polizasData = [
    // Carlos Mendoza — 3 pólizas con AXA
    { clienteIdx: 0, aseguradoraIdx: 0, ramo: 'AUTO', numeroPoliza: 'P-AXA-2026-001', primaAnual: 850, fechaVencimiento: addDays(now, 25), estado: 'ACTIVA' },
    { clienteIdx: 0, aseguradoraIdx: 0, ramo: 'HOGAR', numeroPoliza: 'P-AXA-2026-002', primaAnual: 420, fechaVencimiento: addDays(now, 90), estado: 'ACTIVA' },
    { clienteIdx: 0, aseguradoraIdx: 0, ramo: 'VIDA', numeroPoliza: 'P-AXA-2026-003', primaAnual: 650, fechaVencimiento: addDays(now, 180), estado: 'ACTIVA' },

    // María García — 2 pólizas con MAPFRE + 1 con Allianz
    { clienteIdx: 1, aseguradoraIdx: 1, ramo: 'AUTO', numeroPoliza: 'P-MAP-2026-004', primaAnual: 720, fechaVencimiento: addDays(now, 15), estado: 'PROXIMA_A_VENCER' },
    { clienteIdx: 1, aseguradoraIdx: 1, ramo: 'HOGAR', numeroPoliza: 'P-MAP-2026-005', primaAnual: 380, fechaVencimiento: addDays(now, 45), estado: 'ACTIVA' },
    { clienteIdx: 1, aseguradoraIdx: 2, ramo: 'SALUD', numeroPoliza: 'P-ALL-2026-006', primaAnual: 1200, fechaVencimiento: addDays(now, 210), estado: 'ACTIVA' },

    // Roberto Núñez — 2 pólizas con AXA + 2 con GNP
    { clienteIdx: 2, aseguradoraIdx: 0, ramo: 'AUTO', numeroPoliza: 'P-AXA-2026-007', primaAnual: 950, fechaVencimiento: addDays(now, 5), estado: 'PROXIMA_A_VENCER' },
    { clienteIdx: 2, aseguradoraIdx: 0, ramo: 'EMPRESARIAL', numeroPoliza: 'P-AXA-2026-008', primaAnual: 2400, fechaVencimiento: addDays(now, 60), estado: 'ACTIVA' },
    { clienteIdx: 2, aseguradoraIdx: 3, ramo: 'GASTOS_MEDICOS', numeroPoliza: 'P-GNP-2026-009', primaAnual: 1800, fechaVencimiento: addDays(now, 150), estado: 'ACTIVA' },
    { clienteIdx: 2, aseguradoraIdx: 3, ramo: 'VIDA', numeroPoliza: 'P-GNP-2026-010', primaAnual: 550, fechaVencimiento: addDays(now, -10), estado: 'VENCIDA' },

    // Ana Martínez — 1 póliza AXA + 1 Qualitas
    { clienteIdx: 3, aseguradoraIdx: 0, ramo: 'SALUD', numeroPoliza: 'P-AXA-2026-011', primaAnual: 1500, fechaVencimiento: addDays(now, 75), estado: 'ACTIVA' },
    { clienteIdx: 3, aseguradoraIdx: 4, ramo: 'AUTO', numeroPoliza: 'P-QUA-2026-012', primaAnual: 680, fechaVencimiento: addDays(now, 12), estado: 'ACTIVA' },

    // Javier Torres — 1 póliza Qualitas + 1 Allianz + 1 MAPFRE
    { clienteIdx: 4, aseguradoraIdx: 4, ramo: 'TRANSPORTE', numeroPoliza: 'P-QUA-2026-013', primaAnual: 3500, fechaVencimiento: addDays(now, 35), estado: 'ACTIVA' },
    { clienteIdx: 4, aseguradoraIdx: 2, ramo: 'AUTO', numeroPoliza: 'P-ALL-2026-014', primaAnual: 1100, fechaVencimiento: addDays(now, 120), estado: 'ACTIVA' },
    { clienteIdx: 4, aseguradoraIdx: 1, ramo: 'EMPRESARIAL', numeroPoliza: 'P-MAP-2026-015', primaAnual: 1800, fechaVencimiento: addDays(now, 55), estado: 'ACTIVA' },
  ];

  let creadas = 0;
  for (const p of polizasData) {
    const cliente = clientes[p.clienteIdx];
    const aseguradora = aseguradoras[p.aseguradoraIdx];
    const prodKey = `${aseguradora.id}-${p.ramo}`;
    const producto = productos[prodKey];
    if (!producto) {
      console.warn(`  ⚠️ Producto no encontrado para ${aseguradora.nombre} / ${p.ramo}`);
      continue;
    }

    await prisma.poliza.upsert({
      where: { tenantId_numeroPoliza: { tenantId: TENANT_ID, numeroPoliza: p.numeroPoliza } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        clienteId: cliente.id,
        aseguradoraId: aseguradora.id,
        productoSeguroId: producto.id,
        numeroPoliza: p.numeroPoliza,
        estado: p.estado,
        primaAnual: p.primaAnual,
        sumaAsegurada: p.primaAnual * 10,
        moneda: 'EUR',
        formaPago: 'ANUAL',
        fechaInicio: new Date(now.getFullYear(), 0, 1),
        fechaVencimiento: p.fechaVencimiento,
        comisionPct: 15,
        descripcion: `Póliza de ${p.ramo.replace(/_/g, ' ')} con ${aseguradora.nombre}`,
      },
    });
    creadas++;
  }
  console.log(`  ✅ ${creadas} pólizas creadas`);

  // ── 5. Resumen ────────────────────────────────────────────────────────────
  console.log('\n📊 Resumen de la cartera demo:');
  console.log(`  • ${clientes.length} clientes`);
  console.log(`  • ${aseguradoras.length} aseguradoras`);
  console.log(`  • ${Object.keys(productos).length} productos`);
  console.log(`  • ${creadas} pólizas`);
  console.log(`  • Prima anual total: €${polizasData.reduce((s, p) => s + p.primaAnual, 0).toLocaleString('es-ES')}`);
  console.log('\n✅ Seed completado. El dashboard ya tiene datos para la demo.\n');
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

main()
  .catch((e) => {
    console.error('❌ Error en seed demo:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
