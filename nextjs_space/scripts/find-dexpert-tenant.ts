/** SOLO LECTURA: localiza el tenant dexpert y muestra sus features actuales */
import { prisma } from '../lib/db';

async function main() {
  const t = await prisma.tenant.findFirst({
    where: {
      OR: [
        { nombre: { contains: 'dexpert', mode: 'insensitive' } },
        { slug: { contains: 'dexpert', mode: 'insensitive' } },
        { subdomain: { contains: 'dexpert', mode: 'insensitive' } },
      ],
    },
    select: { id: true, nombre: true, slug: true, subdomain: true, plan: true, estado: true },
  });

  if (!t) {
    console.log('NO_ENCONTRADO');
    await prisma.$disconnect();
    return;
  }
  console.log('TENANT:', JSON.stringify(t, null, 2));

  const tfs = await prisma.tenantFeature.findMany({
    where: { tenantId: t.id },
    select: { feature: true, habilitado: true, razon: true },
  });
  console.log('\nTENANT_FEATURES:', JSON.stringify(tfs, null, 2));

  const hasInsurance = tfs.find(f => f.feature === 'insurance');
  console.log('\nINSURANCE_OVERRIDE:', hasInsurance ? JSON.stringify(hasInsurance) : '(ninguno)');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
