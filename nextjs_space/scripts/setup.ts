/**
 * setup — primer arranque del proyecto en un solo comando.
 *
 *   npm run setup
 *
 * Idempotente: en una máquina ya lista termina en segundos (salta lo hecho).
 * Sustituye la lista tribal "instala, copia el env, genera el cliente,
 * db:setup, y si falla algo pregunta" por un único comando con mensajes
 * accionables. El detalle técnico de cada paso vive en docs/PRISMA-BASELINE.md.
 *
 * Pasos:
 *   0. Preflight: versión de Node (rango de `engines`/`.nvmrc`) y git.
 *   1. Variables de entorno: si falta `.env`, se crea desde `.env.example`
 *      y el script SE DETIENE pidiendo editarlo (no lanza nada contra la
 *      base con credenciales de ejemplo).
 *   2. Dependencias: `npm install` solo si falta `node_modules`.
 *   3. Cliente Prisma: `prisma generate`.
 *   4. Base de datos: `db:setup` (migraciones + tenant + seed + verificación).
 *
 * Flags:
 *   --sin-install  fuerza el paso de dependencias aunque exista node_modules.
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();

function paso(titulo: string): void {
  console.log(`\n▶ ${titulo}`);
}

function fallo(mensaje: string): never {
  console.error(`\n❌ ${mensaje}`);
  process.exit(1);
}

/** Major/minor de Node en formato numérico, p. ej. 20.19 para v20.19.0. */
function versionNode(): { major: number; minor: number } {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return { major, minor };
}

/** ¿Existe la clave KEY= en .env? (solo presencia, nunca imprime valores). */
function envTieneClave(rutaEnv: string, clave: string): boolean {
  try {
    return readFileSync(rutaEnv, 'utf8').split('\n').some((l) => l.trim().startsWith(`${clave}=`));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log('🚀 setup — primer arranque del proyecto\n');

  // ── 0. Preflight ────────────────────────────────────────────────────────
  paso('Preflight (Node, git)');
  const { major, minor } = versionNode();
  if (major < 20 || (major === 20 && minor < 19)) {
    fallo(
      `Node ${process.versions.node} es anterior al mínimo del proyecto (>=20.19, ver .nvmrc). ` +
        'Instala Node 20 LTS (p. ej. con nvm: `nvm install && nvm use`) y relanza.'
    );
  }
  if (major >= 21) {
    console.log(
      `   ⚠  Node ${process.versions.node}: el proyecto declara >=20.19.0 <21 (engines/.nvmrc). ` +
        'Puede funcionar, pero lo soportado es Node 20 (`nvm use`).'
    );
  } else {
    console.log(`   ✓ Node ${process.versions.node}`);
  }
  try {
    execSync('git --version', { stdio: 'ignore' });
    console.log('   ✓ git disponible');
  } catch {
    fallo('git no está disponible: el flujo del proyecto lo necesita (hooks de husky, etc.).');
  }

  // ── 1. Variables de entorno (checkpoint humano si se crea desde ejemplo) ─
  const rutaEnv = join(RAIZ, '.env');
  const rutaEjemplo = join(RAIZ, '.env.example');
  if (!existsSync(rutaEjemplo)) {
    fallo('No existe .env.example: no hay plantilla de referencia para crear .env.');
  }
  if (!existsSync(rutaEnv)) {
    copyFileSync(rutaEjemplo, rutaEnv);
    console.log('\n✏️  Se creó .env desde .env.example.');
    console.log('   Edítalo con tus credenciales reales (mínimo DATABASE_URL) y vuelve a lanzar `npm run setup`.');
    console.log('   No se ha instalado nada ni se ha tocado ninguna base: primero tus credenciales.');
    process.exit(0);
  }
  if (!envTieneClave(rutaEnv, 'DATABASE_URL')) {
    fallo('.env existe pero no define DATABASE_URL. Edítalo y relanza `npm run setup`.');
  }
  const faltantes = ['SHADOW_DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'].filter((k) => !envTieneClave(rutaEnv, k));
  console.log('   ✓ .env presente (DATABASE_URL definida)');
  if (faltantes.length > 0) {
    console.log(`   ⚠  Sin definir en .env: ${faltantes.join(', ')}.`);
    console.log('      SHADOW_DATABASE_URL habilita el chequeo de drift de `db:verify`; NEXTAUTH_* hacen falta para arrancar la app.');
  }

  // ── 2. Dependencias ─────────────────────────────────────────────────────
  const nodeModules = join(RAIZ, 'node_modules');
  const forzarInstall = process.argv.includes('--sin-install');
  if (!forzarInstall && existsSync(nodeModules) && statSync(nodeModules).isDirectory()) {
    console.log('\n▶ Dependencias: node_modules ya existe (se omite npm install)');
  } else {
    paso('Dependencias (npm install — puede tardar varios minutos)');
    try {
      execSync('npm install', { stdio: 'inherit' });
    } catch (err) {
      const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
      if (e?.stderr) process.stderr.write(e.stderr.toString());
      fallo('npm install falló. Revisa el error de arriba (red, versión de Node, paquetes nativos) y relanza.');
    }
  }

  // ── 3. Cliente Prisma ───────────────────────────────────────────────────
  paso('Cliente Prisma (prisma generate)');
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
    if (e?.stdout) process.stdout.write(e.stdout.toString());
    if (e?.stderr) process.stderr.write(e.stderr.toString());
    fallo('prisma generate falló. Revisa prisma/schema.prisma y el error de arriba.');
  }

  // ── 4. Base de datos (migraciones + tenant + seed + verificación) ───────
  paso('Base de datos (db:setup: migraciones + tenant + seed + verificación)');
  try {
    execSync('npm run db:setup', { stdio: 'inherit' });
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
    if (e?.stderr) process.stderr.write(e.stderr.toString());
    console.error('\n❌ db:setup falló. Pistas rápidas:');
    console.error('   • ¿DATABASE_URL apunta a una base accesible? (conectividad es lo primero que comprueba db:setup)');
    console.error('   • Si la base nunca se baselinó (P3005), sigue docs/PRISMA-BASELINE.md.');
    console.error('   Corrige la causa y relanza `npm run setup` (es idempotente: no repite lo ya hecho).');
    process.exit(1);
  }

  console.log('\n✅ Proyecto listo. Arranca con `npm run dev`.');
  console.log('   Comandos relacionados: `npm run db:verify` (diagnóstico) · `npm run db:reset` (reconstruir desde cero).');
}

void main();
