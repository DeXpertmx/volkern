// ⚠️⚠️⚠️ NO EJECUTAR CONTRA PRODUCCIÓN (VPS / volkern.app) — OBSOLETO tras el swap de slugs del 2026-09-03
// --------------------------------------------------------------------------------------------
// El 2026-09-03 se intercambiaron slug/subdomain en producción:
//   · "Dimension eXpert" (bruno + admin@dexpert.volkern.app)  → slug dexpert (dexpert.volkern.app)
//   · "DeXpert Inmobiliaria" (datos del cliente)              → slug dimension-expert (dimension-expert.volkern.app)
// Este script apunta al tenant fijo cms96c27k0002ju04e47e4xht (Dimension eXpert, hoy slug dexpert) y
// BORRARÍA su fila logo_corporativo — que hoy contiene el LOGO REAL de Dimension eXpert. NO correr en
// producción. Solo uso local/dev.
// --------------------------------------------------------------------------------------------
/**
 * [OBSOLETO para producción] Limpia el branding stale "DeXpert" del tenant dimension-expert (Dimension eXpert):
 *  1. Renombra el nombre visible de admin@dexpert.volkern.app (ahora en dimension-expert).
 *  2. Elimina la fila logo_corporativo de dimension-expert que apuntaba al logo
 *     de "DeXpert Inmobiliaria" (la Configuración volverá a estado sin logo propio).
 *
 * El tenant del cliente (slug=dexpert) conserva su branding "DeXpert Inmobiliaria".
 * Idempotente: re-ejecutarlo no produce cambios adicionales.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const DIMENSION_ID = 'cms96c27k0002ju04e47e4xht';
const EMAIL = 'admin@dexpert.volkern.app';
const NEW_NAME = 'Admin Dimension eXpert';

async function main() {
  const u = await p.user.findUnique({ where: { email: EMAIL } });
  if (!u) throw new Error(`No existe ${EMAIL}`);
  if (u.name !== NEW_NAME) {
    await p.user.update({ where: { id: u.id }, data: { name: NEW_NAME } });
    console.log(`  ✓ user "${u.name}" -> "${NEW_NAME}" (tenant ${u.tenantId})`);
  } else {
    console.log(`  = user ya se llama "${NEW_NAME}"`);
  }

  const logo = await p.configuracion.findUnique({
    where: { tenantId_clave: { tenantId: DIMENSION_ID, clave: 'logo_corporativo' } },
  });
  if (logo) {
    await p.configuracion.delete({ where: { id: logo.id } });
    console.log(`  ✓ logo_corporativo eliminado de dimension-expert (era: ${String(logo.valor).slice(0, 90)}…)`);
  } else {
    console.log('  = dimension-expert ya no tiene logo_corporativo');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
