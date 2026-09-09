// ⚠️⚠️⚠️ NO EJECUTAR CONTRA PRODUCCIÓN (VPS / volkern.app) — OBSOLETO tras el swap de slugs del 2026-09-03
// --------------------------------------------------------------------------------------------
// El 2026-09-03 se intercambiaron slug/subdomain en producción:
//   · "Dimension eXpert" (bruno + admin@dexpert.volkern.app)  → slug dexpert (dexpert.volkern.app)
//   · "DeXpert Inmobiliaria" (datos del cliente)              → slug dimension-expert (dimension-expert.volkern.app)
// Este script busca el tenant por slug='dimension-expert', que AHORA es el workspace del CLIENTE,
// no el de Dimension eXpert. Solo usar contra una BD local de desarrollo.
// Estado actual y accesos: ver GUION_DEMO_DIMENSION_EXPERT.md (raíz del repo).
// --------------------------------------------------------------------------------------------
/**
 * [OBSOLETO para producción] Asigna el subdominio de login "dimension-expert" al tenant dimension-expert
 * (Dimension eXpert), para que sus cuentas puedan entrar por un host con marca:
 *   - dev:  http://dimension-expert.localhost:3000
 *   - prod: (ya NO aplica — ver banner superior)
 *
 * El login (lib/auth.ts) valida que el subdominio de la request coincida con
 * tenant.subdomain del usuario, así que sin esta fila las cuentas migradas
 * solo podían entrar por el login principal. Idempotente.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const SLUG = 'dimension-expert';
const SUBDOMAIN = 'dimension-expert';

async function main() {
  const tenant = await p.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) throw new Error(`No existe tenant slug=${SLUG}`);

  if (tenant.subdomain === SUBDOMAIN) {
    console.log(`  = ${tenant.nombre} ya tiene subdomain=${SUBDOMAIN}`);
    return;
  }

  const clash = await p.tenant.findUnique({ where: { subdomain: SUBDOMAIN } }).catch(() => null);
  if (clash && clash.id !== tenant.id) {
    throw new Error(`El subdominio ${SUBDOMAIN} ya lo usa otro tenant (${clash.id})`);
  }

  await p.tenant.update({
    where: { id: tenant.id },
    data: { subdomain: SUBDOMAIN },
  });
  console.log(`  ✓ ${tenant.nombre}: subdomain ${tenant.subdomain ?? '∅'} -> ${SUBDOMAIN}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
