/**
 * Actualiza `Tenant.moneda` (la "moneda de reporte" del tenant).
 *
 * Por qué existe: el campo `Tenant.moneda` defaults a 'MXN' en el schema
 * (`prisma/schema.prisma:173`). Si al crear el tenant nadie lo cambió y
 * luego se importan pólizas en otra moneda (EUR, USD, etc.), el portfolio
 * ejecutivo muestra el KPI global convertido a la moneda del tenant —
 * confundiendo al broker ("yo manejo Euros pero veo MXN").
 *
 * Por defecto corre en modo dry-run. Para aplicar el cambio, pasar --apply.
 *
 * USO:
 *   npx tsx scripts/update-tenant-currency.ts --tenant=dexpert --moneda=EUR
 *   npx tsx scripts/update-tenant-currency.ts --tenant=dexpert --moneda=EUR --apply
 *
 * Monedas soportadas (lib/insurance/currency.ts): USD, EUR, MXN, GBP, JPY,
 * CNY, CAD, BRL, CLP, ARS, COP, PEN.
 */
import { globalPrisma } from '../lib/db';
import type { Currency } from '../lib/insurance/currency';

const SUPPORTED: Currency[] = ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CNY', 'CAD', 'BRL', 'CLP', 'ARS', 'COP', 'PEN'];

type Args = { tenant?: string; moneda?: string; apply?: boolean };
function parseArgs(): Args {
  const out: Args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--tenant=')) out.tenant = arg.split('=')[1];
    else if (arg.startsWith('--moneda=')) out.moneda = arg.split('=')[1].toUpperCase();
    else if (arg === '--apply') out.apply = true;
  }
  return out;
}

async function main() {
  const args = parseArgs();

  if (!args.tenant) {
    console.error('❌ Falta --tenant=<slug|subdomain|parte-del-nombre>');
    process.exit(1);
  }
  if (!args.moneda) {
    console.error('❌ Falta --moneda=<USD|EUR|MXN|GBP|JPY|CNY|CAD|BRL|CLP|ARS|COP|PEN>');
    process.exit(1);
  }
  if (!SUPPORTED.includes(args.moneda as Currency)) {
    console.error(`❌ Moneda no soportada: ${args.moneda}. Soportadas: ${SUPPORTED.join(', ')}`);
    process.exit(1);
  }

  const where = {
    OR: [
      { slug: args.tenant },
      { subdomain: args.tenant },
      { nombre: { contains: args.tenant, mode: 'insensitive' as const } },
    ],
  };

  const t = await globalPrisma.tenant.findFirst({
    where,
    select: { id: true, nombre: true, slug: true, subdomain: true, moneda: true },
  });
  if (!t) {
    console.error(`❌ Tenant no encontrado con filtro: ${args.tenant}`);
    await globalPrisma.$disconnect();
    process.exit(1);
  }

  console.log('=== TENANT ENCONTRADO ===');
  console.log(JSON.stringify(t, null, 2));
  console.log(`\nMoneda actual: ${t.moneda ?? '(null)'}`);
  console.log(`Moneda destino: ${args.moneda}`);

  if (t.moneda === args.moneda) {
    console.log('\nℹ️  La moneda ya coincide — no hay nada que cambiar.');
    await globalPrisma.$disconnect();
    return;
  }

  if (!args.apply) {
    console.log('\n🔒 DRY-RUN — para aplicar el cambio, añade --apply al comando:');
    console.log(
      `   npx tsx scripts/update-tenant-currency.ts --tenant=${args.tenant} --moneda=${args.moneda} --apply`,
    );
    await globalPrisma.$disconnect();
    return;
  }

  // Aplicar el cambio
  const updated = await globalPrisma.tenant.update({
    where: { id: t.id },
    data: { moneda: args.moneda },
    select: { id: true, slug: true, moneda: true },
  });

  console.log('\n✅ ACTUALIZADO:');
  console.log(JSON.stringify(updated, null, 2));

  // Audit log
  try {
    await globalPrisma.auditLog.create({
      data: {
        accion: 'actualizar',
        entidad: 'tenant',
        entidadId: t.id,
        descripcion: `Moneda del tenant cambiada: ${t.moneda ?? '(null)'} → ${args.moneda}`,
        cambiosAntes: { moneda: t.moneda } as any,
        cambiosDespues: { moneda: args.moneda } as any,
      },
    });
    console.log('✅ Audit log registrado en Control Plane.');
  } catch (e: any) {
    console.warn('⚠️  No se pudo registrar audit log:', e?.message);
  }

  await globalPrisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e?.message || e);
  await globalPrisma.$disconnect();
  process.exit(1);
});
