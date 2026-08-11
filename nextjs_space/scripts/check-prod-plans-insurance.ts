/**
 * SOLO LECTURA — Verifica los planes guardados en subscriptionPlan (Control Plane)
 * y reporta cuáles incluyen el módulo 'insurance' en features.modules.
 *
 * Usa globalPrisma (el mismo cliente que el editor /admin/planes del superadmin).
 * NO ejecuta ninguna operación de escritura: solo findMany / count / groupBy.
 *
 * USO: NODE_OPTIONS='--max-old-space-size=4096' npx tsx scripts/check-prod-plans-insurance.ts
 */

import { globalPrisma, prisma } from '../lib/db';
import { ALL_MODULES, PLAN_MODULES, PLANS } from '../lib/plans';

function maskUrl(url: string): string {
  try {
    return url.replace(/:\/\/[^:@]+:[^@]+@/, '://***:***@').split('?')[0];
  } catch {
    return '(no legible)';
  }
}

async function main() {
  console.log('=== BD de destino (host, sin credenciales) ===');
  console.log(' ', maskUrl(process.env.DATABASE_URL || '(DATABASE_URL no definida)'));

  console.log('\n=== subscriptionPlan: TODOS los planes ===');
  const count = await globalPrisma.subscriptionPlan.count();
  console.log(`Total de planes en BD: ${count}`);

  const plans = await globalPrisma.subscriptionPlan.findMany({
    orderBy: { ordenamiento: 'asc' },
    select: {
      id: true,
      slug: true,
      nombre: true,
      activo: true,
      features: true,
    },
  });

  const validIds = new Set(ALL_MODULES.map(m => m.id));

  for (const p of plans) {
    const features = (p.features as any) || {};
    const modules: unknown[] = Array.isArray(features.modules) ? features.modules : [];
    const hasInsurance = modules.includes('insurance');
    const invalid = modules.filter(m => typeof m === 'string' && !validIds.has(m as any));

    console.log(`\n  ${hasInsurance ? '✅' : '❌'} ${p.slug} — "${p.nombre}"${p.activo ? '' : ' (INACTIVO)'}`);
    console.log(`     modules (${modules.length}): ${modules.slice(0, 12).join(', ') || '(vacío)'}${modules.length > 12 ? '…' : ''}`);
    if (invalid.length) console.log(`     ⚠️  IDs no válidos en ALL_MODULES: ${invalid.join(', ')}`);
  }

  if (plans.length === 0) {
    console.log('\n  ⚠️  No hay filas en subscriptionPlan. El editor del superadmin mostraría una lista vacía');
    console.log('      y getPlanConfig() cae al fallback hardcodeado de lib/plans.ts (PLAN_MODULES).');
  }

  console.log('\n=== Referencia: PLAN_MODULES hardcodeado (lib/plans.ts) ===');
  for (const slug of Object.values(PLANS)) {
    const modules = PLAN_MODULES[slug] || [];
    console.log(`  ${modules.includes('insurance' as any) ? '✅' : '—'} ${slug} (${modules.length} módulos)`);
  }

  console.log('\n=== Tenants activos por plan (contexto de impacto) ===');
  try {
    const byPlan = await globalPrisma.tenant.groupBy({
      by: ['plan'],
      _count: { id: true },
      where: { estado: { in: ['trial', 'activo'] } },
    });
    for (const row of byPlan) {
      console.log(`  ${row.plan}: ${row._count.id} tenant(s)`);
    }
  } catch (e: any) {
    console.log('  (no se pudo agrupar tenants:', e.message, ')');
  }

  console.log('\n=== Overrides tenantFeature de insurance (por tenant) ===');
  const tfs = await prisma.tenantFeature.findMany({
    where: { feature: 'insurance' },
    select: { tenantId: true, habilitado: true, razon: true },
  });
  if (tfs.length === 0) {
    console.log('  (ninguno — el acceso a insurance depende 100% del plan)');
  }
  for (const tf of tfs) {
    console.log(`  tenant ${tf.tenantId}: ${tf.habilitado ? 'ON' : 'OFF'} — ${tf.razon || ''}`);
  }

  await globalPrisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('ERROR:', e.message || e);
    process.exit(1);
  });
