/**
 * Carga de entorno de los scripts: `.env.local` primero, `.env` después.
 *
 * Por qué existe este fichero: la base de datos de producción es el Postgres del
 * VPS (`deploy-vps/.env.vps`), que no publica puerto y vive en una red overlay,
 * así que no es alcanzable desde un portátil. El `DATABASE_URL` de desarrollo
 * apunta a Neon y vive en `.env.local`, el fichero local que git ignora.
 *
 * Next.js y Vitest leen `.env.local` por su cuenta, pero **Prisma —CLI y
 * cliente— y `dotenv/config` solo leen `.env`**: sin este cargador, `npx prisma
 * migrate`, `npm run db:verify` y los ensayos E2E se quedarían sin
 * `DATABASE_URL` al arrancar. Es el mismo orden y la misma precedencia que usa
 * `tests/global-setup.ts`.
 *
 * Lo que ya venga en el entorno (CI, una corrida puntual con
 * `DATABASE_URL=... npm run ...`) manda y no se pisa: `override` va en false.
 *
 * Uso:
 *   npx tsx --require ./scripts/cargar-entorno.cjs scripts/db-setup.ts
 *   node --require ./scripts/cargar-entorno.cjs scripts/e2e-booking-engine.mjs
 */
const path = require('node:path');
const dotenv = require('dotenv');

for (const archivo of ['.env.local', '.env']) {
  dotenv.config({ path: path.resolve(process.cwd(), archivo), override: false });
}
