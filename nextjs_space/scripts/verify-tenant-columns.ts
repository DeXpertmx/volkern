/**
 * Verificación SOLO-LECTURA del estado real de la tabla "Tenant" en la BD
 * configurada (Neon). Diagnostica el P2022 de los tests de integración.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const cols = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'Tenant'
     ORDER BY column_name`,
  );
  const names = cols.map((c) => c.column_name);

  const targets = [
    'monedaInferida',
    'monedaInferenciaSource',
    'genesisHash',
    'maxSlots',
    'parentId',
    'provisioningStatus',
    'dnaOperativo',
  ];
  console.log('Total columnas en Tenant:', names.length);
  for (const t of targets) {
    console.log(`  ${t}: ${names.includes(t) ? '✅ EXISTE' : '❌ FALTA'}`);
  }

  // Enums creados por la migración de moneda inference
  const enums = await p.$queryRawUnsafe<{ typname: string }[]>(
    `SELECT t.typname FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname LIKE '%MonedaInferencia%'`,
  );
  console.log('Enums MonedaInferencia:', JSON.stringify(enums.map((e) => e.typname)));

  // Tabla _prisma_migrations presente?
  const migTab = await p.$queryRawUnsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM information_schema.tables
     WHERE table_name = '_prisma_migrations'`,
  );
  console.log('_prisma_migrations existe:', Number(migTab[0].count) > 0);
}

main()
  .catch((e) => console.error('ERR:', e.message))
  .finally(() => p.$disconnect());
