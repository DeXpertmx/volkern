// ⚠️⚠️⚠️ NO EJECUTAR CONTRA PRODUCCIÓN (VPS / volkern.app) — OBSOLETO tras el swap de slugs del 2026-09-03
// --------------------------------------------------------------------------------------------
// El 2026-09-03 se intercambiaron slug/subdomain en producción:
//   · "Dimension eXpert" (bruno + admin@dexpert.volkern.app)  → slug dexpert (dexpert.volkern.app)
//   · "DeXpert Inmobiliaria" (datos del cliente)              → slug dimension-expert (dimension-expert.volkern.app)
// EJECUTARLO HOY EN PRODUCCIÓN: movería a bruno+admin al tenant del CLIENTE (slug dimension-expert),
// les reasignaría el rol Admin del cliente y renombraría el workspace de Dimension eXpert a
// "DeXpert Inmobiliaria". NO correr jamás contra el VPS. Solo uso local/dev.
// --------------------------------------------------------------------------------------------
/**
 * [OBSOLETO para producción] Migra las cuentas de Bruno Hess y del admin de dexpert desde el tenant
 * "dexpert" (DeXpert Inmobiliaria) hacia el tenant "dimension-expert"
 * (Dimension eXpert, plan infinity, provisioning COMPLETED).
 *
 * Idempotente: si los usuarios ya están en dimension-expert no hace nada.
 * No toca datos del tenant dexpert (leads/contactos/citas se quedan con el cliente).
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const DEXPERT_SLUG = 'dexpert'; // tenant del cliente, vuelve a su branding
const DIMENSION_SLUG = 'dimension-expert'; // tenant de la empresa (infinity, COMPLETED)
const EMAILS = ['bruno.hess@dimensionexpert.com', 'admin@dexpert.volkern.app'];

async function main() {
  const dexpert = await p.tenant.findUnique({ where: { slug: DEXPERT_SLUG } });
  const dimension = await p.tenant.findUnique({ where: { slug: DIMENSION_SLUG } });
  if (!dexpert) throw new Error(`No existe tenant slug=${DEXPERT_SLUG}`);
  if (!dimension) throw new Error(`No existe tenant slug=${DIMENSION_SLUG}`);

  const dimAdminRole = await p.role.findFirst({
    where: { tenantId: dimension.id, nombre: 'Admin' },
  });
  if (!dimAdminRole) throw new Error(`dimension-expert no tiene rol Admin`);

  console.log('Tenant dexpert      :', dexpert.id, `"${dexpert.nombre}"`, `plan=${dexpert.plan}`);
  console.log('Tenant dimension    :', dimension.id, `"${dimension.nombre}"`, `plan=${dimension.plan}`);
  console.log('Rol Admin dimension :', dimAdminRole.id);

  for (const email of EMAILS) {
    const u = await p.user.findUnique({ where: { email } });
    if (!u) { console.log(`  ! ${email}: no existe`); continue; }
    if (!u.tenantId) { console.log(`  ! ${email}: sin tenantId`); continue; }

    if (u.tenantId === dimension.id && u.roleId === dimAdminRole.id) {
      console.log(`  = ${email}: ya migrado a dimension-expert (nada que hacer)`);
      continue;
    }
    await p.user.update({
      where: { id: u.id },
      data: { tenantId: dimension.id, roleId: dimAdminRole.id },
    });
    console.log(`  ✓ ${email}: tenantId ${u.tenantId} -> ${dimension.id}, roleId -> ${dimAdminRole.id}`);
  }

  if (dexpert.nombre !== 'DeXpert Inmobiliaria') {
    await p.tenant.update({
      where: { id: dexpert.id },
      data: { nombre: 'DeXpert Inmobiliaria' },
    });
    console.log(`  ✓ tenant dexpert renombrado "${dexpert.nombre}" -> "DeXpert Inmobiliaria"`);
  } else {
    console.log(`  = tenant dexpert ya se llama "DeXpert Inmobiliaria"`);
  }

  // Verificación final
  const users = await p.user.findMany({ where: { tenantId: dimension.id }, select: { email: true, name: true, role: { select: { nombre: true } } } });
  console.log('\nUsuarios ahora en dimension-expert:', users.map((u) => `${u.email} (rol=${u.role?.nombre})`).join(', ') || '(ninguno)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
