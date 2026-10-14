// ⚠️⚠️⚠️ NO EJECUTAR CONTRA PRODUCCIÓN (VPS / volkern.app) — OBSOLETO tras el swap de slugs del 2026-09-03
// --------------------------------------------------------------------------------------------
// El 2026-09-03 se intercambiaron slug/subdomain en producción:
//   · "Dimension eXpert" (bruno + admin@dexpert.volkern.app)  → slug dexpert (dexpert.volkern.app)
//   · "DeXpert Inmobiliaria" (datos del cliente)              → slug dimension-expert (dimension-expert.volkern.app)
// El renombrado objetivo ya está aplicado en producción (el tenant de bruno se llama "Dimension eXpert");
// este script ya no aporta nada allí y su lógica asume el mapeo anterior. Solo uso local/dev.
// --------------------------------------------------------------------------------------------
/**
 * [OBSOLETO para producción] Renombra el tenant que aloja las cuentas reales del usuario
 * (bruno.hess@dimensionexpert.com y admin@dexpert.volkern.app)
 * de "DeXpert Inmobiliaria" → "Dimension eXpert".
 *
 * Solo cambia el NOMBRE visible. NO toca id, slug, subdomain (dexpert.volkern.app),
 * ni ningún dato del tenant, para no romper logins ni acceso a la información.
 *
 * Idempotente: si ya está renombrado, no hace nada.
 *
 * USO: npx tsx -r ./scripts/cargar-entorno.cjs scripts/rename-dexpert-tenant.ts
 */
import { prisma } from '../lib/db';

const CURRENT_NAME = 'DeXpert Inmobiliaria';
const NEW_NAME = 'Dimension eXpert';
const OWNER_EMAILS = ['bruno.hess@dimensionexpert.com', 'admin@dexpert.volkern.app'];

async function main() {
  const owners = await prisma.user.findMany({
    where: { email: { in: OWNER_EMAILS } },
    select: { email: true, tenantId: true },
  });
  if (owners.length === 0) {
    console.error('❌ Ninguna de las cuentas del usuario fue encontrada');
    process.exit(1);
  }
  const tenantIds = new Set(owners.map((o) => o.tenantId));
  if (tenantIds.size !== 1) {
    console.error('❌ Las cuentas están repartidas en varios tenants; revisar manualmente:', [...tenantIds].join(', '));
    process.exit(1);
  }
  const tenantId = [...tenantIds][0];

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, nombre: true, slug: true, subdomain: true },
  });
  if (!tenant) {
    console.error(`❌ Tenant ${tenantId} no encontrado`);
    process.exit(1);
  }

  console.log(`Tenant actual: ${tenant.nombre} (id=${tenant.id}, slug=${tenant.slug}, subdomain=${tenant.subdomain})`);
  console.log(`Cuentas dentro: ${owners.map((o) => o.email).join(', ')}`);

  if (tenant.nombre === NEW_NAME) {
    console.log('ℹ️ Ya está renombrado a "Dimension eXpert" — nada que hacer.');
    return;
  }

  if (tenant.nombre !== CURRENT_NAME) {
    console.log(`ℹ️ El tenant se llama "${tenant.nombre}", no "${CURRENT_NAME}" — no lo toco.`);
    return;
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { nombre: NEW_NAME },
  });
  console.log(`✅ Renombrado: "${CURRENT_NAME}" → "${NEW_NAME}"`);
  console.log('   (slug/subdomain/datos intactos)');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
