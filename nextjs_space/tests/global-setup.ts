import path from 'node:path';
import dotenv from 'dotenv';
import { exigirBaseDeDatosDePruebas } from './guardia-base-datos-produccion';

/**
 * `globalSetup` de vitest: se ejecuta UNA vez, antes del primer archivo de test
 * y antes de que ningún `PrismaClient` se conecte.
 *
 * Aquí se carga `.env`/`.env.local` (el globalSetup corre en su propio contexto y
 * no hereda lo que hace `tests/setup.ts`) y se comprueba la base de datos. Si
 * `DATABASE_URL` apunta a producción, la suite aborta entera: no arranca ningún
 * archivo, así que no hay ventana en la que un test escriba antes del aviso.
 *
 * La comprobación vive en `tests/guardia-base-datos-produccion.ts`, que es puro
 * y tiene su propia guardia de tests.
 */
export default function setup(): void {
  // Los mismos archivos que usaría Next.js, sin pisar lo que venga del entorno
  // (en CI el DATABASE_URL lo inyecta el workflow y debe ganar).
  for (const archivo of ['.env.local', '.env']) {
    dotenv.config({ path: path.resolve(process.cwd(), archivo), override: false });
  }

  exigirBaseDeDatosDePruebas();
}
