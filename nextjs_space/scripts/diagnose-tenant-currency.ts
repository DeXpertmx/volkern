/**
 * SOLO LECTURA — Diagnostica la moneda configurada en el tenant
 * y la composición de monedas de sus pólizas activas.
 *
 * Útil cuando el portfolio ejecutivo muestra una moneda distinta a la esperada
 * (ej. el broker dice "manejamos Euros" pero el chip del dashboard dice MXN).
 *
 * Compara `tenant.moneda` (la "moneda de reporte") con la moneda nativa más
 * frecuente en sus pólizas, para detectar mismatch y sugerir el fix.
 *
 * USO:
 *   NODE_OPTIONS='--max-old-space-size=4096' npx tsx scripts/diagnose-tenant-currency.ts
 *   npx tsx scripts/diagnose-tenant-currency.ts --tenant=<slug-o-subdomain>
 */
import { prisma, globalPrisma } from '../lib/db';

type Args = { tenant?: string; dryRun?: boolean };
function parseArgs(): Args {
  const out: Args = { dryRun: true };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--tenant=')) out.tenant = arg.split('=')[1];
  }
  return out;
}

async function main() {
  const args = parseArgs();

  // 1. Localizar el tenant en el Control Plane
  const where = args.tenant
    ? {
        OR: [
          { slug: args.tenant },
          { subdomain: args.tenant },
          { nombre: { contains: args.tenant, mode: 'insensitive' as const } },
        ],
      }
    : {
        OR: [
          { nombre: { contains: 'dexpert', mode: 'insensitive' as const } },
          { slug: { contains: 'dexpert', mode: 'insensitive' as const } },
          { subdomain: { contains: 'dexpert', mode: 'insensitive' as const } },
        ],
      };

  const t = await globalPrisma.tenant.findFirst({
    where,
    select: { id: true, nombre: true, slug: true, subdomain: true, moneda: true, plan: true },
  });

  if (!t) {
    console.log('❌ TENANT_NO_ENCONTRADO', args.tenant ? `(filtro: ${args.tenant})` : '(filtro default: dexpert)');
    await globalPrisma.$disconnect();
    return;
  }

  console.log('=== TENANT ===');
  console.log(JSON.stringify(t, null, 2));

  // 2. Contar pólizas por moneda (en la BD física del tenant via proxy prisma)
  const grupos = await prisma.poliza.groupBy({
    by: ['moneda'],
    where: { tenantId: t.id, estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } },
    _count: { _all: true },
    _sum: { primaAnual: true },
  });

  console.log('\n=== PÓLIZAS ACTIVAS POR MONEDA ===');
  if (grupos.length === 0) {
    console.log('(Sin pólizas activas)');
  } else {
    for (const g of grupos) {
      console.log(`  ${g.moneda || '(null)'}: ${g._count._all} pólizas, prima suma = ${g._sum.primaAnual ?? 0}`);
    }
  }

  // 3. Detección de mismatch
  const tenantMoneda = t.moneda ?? 'MXN';
  const monedasEnUso = grupos.map(g => g.moneda).filter(Boolean) as string[];
  const masUsada = grupos.sort((a, b) => b._count._all - a._count._all)[0]?.moneda ?? null;

  console.log('\n=== DIAGNÓSTICO ===');
  console.log(`Moneda configurada en tenant: ${tenantMoneda}`);
  console.log(`Moneda más usada en pólizas:  ${masUsada ?? '(sin datos)'}`);

  if (monedasEnUso.length === 0) {
    console.log('ℹ️  Sin pólizas activas — la moneda del tenant es la única referencia.');
  } else if (monedasEnUso.length === 1) {
    if (monedasEnUso[0] !== tenantMoneda) {
      console.log(
        `⚠️  MISMATCH: todas las pólizas están en ${monedasEnUso[0]} pero el tenant muestra ${tenantMoneda}. ` +
          `Sugerencia: ejecutar scripts/update-tenant-currency.ts --tenant=${t.slug} --moneda=${monedasEnUso[0]} --apply`,
      );
    } else {
      console.log(`✅ Coherente: tenant y pólizas en la misma moneda (${tenantMoneda}).`);
    }
  } else {
    console.log(
      `🔀 Portfolio multi-divisa: ${monedasEnUso.length} monedas en uso (${monedasEnUso.join(', ')}). ` +
        `El agregado se muestra en la moneda del tenant (${tenantMoneda}). ` +
        `Para cambiar la moneda de reporte, ejecuta: scripts/update-tenant-currency.ts --tenant=${t.slug} --moneda=<EUR|USD|...>`,
    );
  }

  await globalPrisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e?.message || e);
  await globalPrisma.$disconnect();
  process.exit(1);
});
