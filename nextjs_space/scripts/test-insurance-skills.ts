/**
 * Prueba directa de los 5 skills de insurance contra la BD (sin LLM).
 * Verifica la capa de ejecución: create_poliza, list_polizas, polizas_por_vencer,
 * renovaciones_pendientes, clientes_sin_contacto.
 *
 * USO: npx tsx scripts/test-insurance-skills.ts
 */
import { prisma } from '../lib/db';
import { create_poliza, list_polizas, polizas_por_vencer, renovaciones_pendientes, clientes_sin_contacto } from '../lib/skills/insurance-skills';

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'admin@dexpert.volkern.app' },
    select: { tenantId: true },
  });
  const tenantId = user?.tenantId;
  if (!tenantId) {
    console.log('❌ No tenant');
    return;
  }
  console.log(`Tenant: ${tenantId}\n`);

  // 1. Aseguradora AXA (para poder crear pólizas)
  let aseguradora = await prisma.aseguradora.findFirst({ where: { tenantId, nombre: 'AXA' } });
  if (!aseguradora) {
    aseguradora = await prisma.aseguradora.create({ data: { tenantId, nombre: 'AXA' } });
    console.log(`✅ Aseguradora AXA creada: ${aseguradora.id}`);
  } else {
    console.log(`ℹ️ Aseguradora AXA ya existe: ${aseguradora.id}`);
  }

  // 2. Cliente de prueba (contacto) para la póliza
  let cliente = await prisma.contact.findFirst({ where: { tenantId, email: 'juan@mail.com' } });
  if (!cliente) {
    cliente = await prisma.contact.create({
      data: { tenantId, nombre: 'Juan Pérez', email: 'juan@mail.com', tipo: 'person' },
    });
    console.log(`✅ Cliente Juan Pérez creado: ${cliente.id}`);
  } else {
    console.log(`ℹ️ Cliente juan@mail.com ya existe: ${cliente.id}`);
  }

  // 3. create_poliza
  console.log('\n── 1) create_poliza ──');
  try {
    const res = await create_poliza({
      tenantId,
      numeroPoliza: 'POL-001',
      cliente: 'juan@mail.com',
      aseguradora: 'AXA',
      fechaVencimiento: '2026-12-31',
      primaAnual: '850',
      sumaAsegurada: '100000',
      formaPago: 'ANUAL',
    });
    console.log('✅ OK:', res.message);
  } catch (e: any) {
    console.log('⚠️ (puede ser duplicado si ya se creó antes):', e.message);
  }

  // 4. list_polizas
  console.log('\n── 2) list_polizas ──');
  try {
    const res = await list_polizas({ tenantId });
    console.log(`✅ ${res.total} póliza(s):`, res.polizas.map((p: any) => p.numeroPoliza).join(', ') || '(vacío)');
  } catch (e: any) {
    console.log('❌', e.message);
  }

  // 5. polizas_por_vencer
  console.log('\n── 3) polizas_por_vencer (30 días) ──');
  try {
    const res = await polizas_por_vencer({ tenantId, dias: 30 });
    console.log(`✅ ${res.total} póliza(s) por vencer:`, res.polizas.map((p: any) => p.numeroPoliza).join(', ') || '(vacío)');
  } catch (e: any) {
    console.log('❌', e.message);
  }

  // 6. renovaciones_pendientes
  console.log('\n── 4) renovaciones_pendientes ──');
  try {
    const res = await renovaciones_pendientes({ tenantId });
    console.log(`✅ ${res.total} renovación(es):`, res.renovaciones.map((r: any) => r.poliza?.numeroPoliza).join(', ') || '(vacío)');
  } catch (e: any) {
    console.log('❌', e.message);
  }

  // 7. clientes_sin_contacto
  console.log('\n── 5) clientes_sin_contacto (180 días) ──');
  try {
    const res = await clientes_sin_contacto({ tenantId, dias: 180 });
    console.log(`✅ ${res.total} cliente(s) sin contacto:`, res.clientes.map((c: any) => c.nombre).join(', ') || '(vacío)');
  } catch (e: any) {
    console.log('❌', e.message);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
