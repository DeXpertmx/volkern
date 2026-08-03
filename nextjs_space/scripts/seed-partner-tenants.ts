#!/usr/bin/env -S npx tsx
/**
 * seed-partner-tenants.ts — Genera N tenants demo + API keys para el stress
 * test de GET /api/v1/partner/usage.
 *
 * Crea:
 *   1. N tenants (Demo Partner 01 … Demo Partner NN, configurable vía --count)
 *   2. 1 usuario admin por tenant
 *   3. 1 API key (vk_live_…) por tenant con scope `audit:read`
 *
 * ── Sobre la MONEDA (NUEVO desde 2026-08-03) ─────────────────────────────
 *
 * Por defecto, el schema defaultea `Tenant.moneda` a 'MXN' — pésimo para los
 * brokers europeos/latinoamericanos que manejan EUR/USD. El portfolio ejecutivo
 * les mostraba KPIs convertidos a MXN y el chip decía "MXN" junto al botón
 * Refrescar: confuso y propenso a regresiones.
 *
 * Para arreglarlo en el origen, este script FUERZA a pedir la moneda preferida
 * antes de crear el primer tenant. Si no se pasa por flag y el STDIN es TTY,
 * muestra un prompt interactivo. Si STDIN no es interactivo (CI), aborta con
 * un error claro que indica cómo usar `--moneda=<USD|EUR|MXN|...>`.
 *
 * Reglas de auto-set (si decides omitir el prompt con `--allow-auto`):
 *   • 0 pólizas   → fallback conservador (default MXN).
 *   • 1 moneda    → esa moneda (e.g. EUR-only → EUR).
 *   • >1 moneda   → fallback conservador (default MXN).
 *
 * Salida: escribe `./{count}-api-keys.txt` (un key por línea) listo para
 * `seed-partner-usage-demo.ts`.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-partner-tenants.ts
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-partner-tenants.ts --cleanup
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-partner-tenants.ts --force
 *
 *   --count=<N>          Número de tenants demo (default: 50).
 *   --moneda=<USD|EUR>   Moneda única aplicada a todos los tenants (default: prompt).
 *   --allow-auto         Permite auto-detección: si no se pasa --moneda, deja MXN
 *                        como default conservador sin prompt. Útil para CI/CD.
 *   --cleanup            Elimina tenants demo previos (slug demo-partner-*) antes.
 *   --force              Sobrescribe el archivo de keys si ya existe.
 *
 * ── En staging ─────────────────────────────────────────────────────────────
 *
 *   Primero verifica que el DATABASE_URL apunte a la BD de staging.
 *   Luego ejecuta el script. Las API keys generadas solo existen en staging.
 */

import { PrismaClient } from '@prisma/client';
import { generateApiKey } from '../lib/api-keys';
import { SUPPORTED_CURRENCIES, type Currency } from '../lib/insurance/currency';
import * as fs from 'fs';
import * as readline from 'readline';

const SLUG_PREFIX = 'demo-partner-';
const FALLBACK_DEFAULT_MONEDA: Currency = 'MXN';

const prisma = new PrismaClient();

type CliArgs = {
  count: number;
  cleanup: boolean;
  force: boolean;
  moneda?: Currency;
  allowAuto: boolean;
};

function parseArgs(): CliArgs {
  const out: CliArgs = {
    count: 50,
    cleanup: false,
    force: false,
    allowAuto: false,
  };
  for (const a of process.argv.slice(2)) {
    if (a === '--cleanup') out.cleanup = true;
    else if (a === '--force') out.force = true;
    else if (a === '--allow-auto') out.allowAuto = true;
    else if (a.startsWith('--count=')) {
      const n = Number(a.split('=')[1]);
      if (!Number.isInteger(n) || n <= 0 || n > 1000) {
        console.error(`❌ --count inválido: ${a}. Debe ser entero 1..1000.`);
        process.exit(2);
      }
      out.count = n;
    } else if (a.startsWith('--moneda=')) {
      const m = a.split('=')[1].toUpperCase() as Currency;
      if (!SUPPORTED_CURRENCIES.includes(m)) {
        console.error(
          `❌ --moneda inválida: ${m}. Soportadas: ${SUPPORTED_CURRENCIES.join(', ')}`,
        );
        process.exit(2);
      }
      out.moneda = m;
    } else {
      console.error(`❌ Flag desconocido: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

/**
 * Prompt interactivo para pedir la moneda preferida cuando STDIN es TTY.
 * Devuelve la Currency elegida o null si el usuario aborta.
 */
async function promptMoneda(): Promise<Currency | null> {
  if (!process.stdin.isTTY) {
    return null; // No se puede pedir interactivamente
  }
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('  🌐 MONEDA PREFERIDA DEL TENANT');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('  El portfolio ejecutivo muestra KPIs en `Tenant.moneda`.');
    console.error('  Si dejas el default (MXN) y luego importas pólizas en EUR/USD,');
    console.error('  el dashboard mostrará el KPI global convertido a MXN.');
    console.error('  Recomendación: elige la moneda en la que operas.');
    console.error('');
    console.error('  Opciones:');
    SUPPORTED_CURRENCIES.forEach((m, i) => {
      const nota =
        m === 'MXN'
          ? '(default conservador — solo si operas principalmente en México)'
          : m === 'EUR'
            ? '(recomendado para brokers europeos)'
            : m === 'USD'
              ? '(recomendado para brokers estadounidenses)'
              : '';
      console.error(`    ${i + 1}. ${m.padEnd(4)} ${nota}`);
    });
    console.error('');
    rl.question('  Elige moneda [1..12] o escribe el código (default: MXN): ', answer => {
      rl.close();
      const raw = answer.trim().toUpperCase();
      if (!raw) {
        console.error('  → Default elegido: MXN');
        return resolve('MXN');
      }
      // Acepta número (1..12) o código (USD/EUR/...).
      const asNumber = Number(raw);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= SUPPORTED_CURRENCIES.length) {
        return resolve(SUPPORTED_CURRENCIES[asNumber - 1]);
      }
      if (SUPPORTED_CURRENCIES.includes(raw as Currency)) {
        return resolve(raw as Currency);
      }
      console.error(`  ⚠️  Entrada inválida: ${answer}. Default MXN.`);
      resolve('MXN');
    });
  });
}

async function main() {
  const args = parseArgs();
  const outPath = `./${args.count}-api-keys.txt`;

  // ── 1) Resolver la moneda antes de cualquier I/O en BD ─────────────────
  let monedaElegida: Currency = args.moneda ?? FALLBACK_DEFAULT_MONEDA;
  let fuenteMoneda: 'flag' | 'prompt' | 'allow-auto-default' = args.moneda ? 'flag' : 'allow-auto-default';

  // Campo `monedaInferenciaSource` del Tenant: trazabilidad programática de
  // POR QUÉ cada tenant tiene su moneda actual. Esta pieza es lo que permite
  // al superadmin listar "tenants con moneda heredada del default MXN".
  type FuenteInferencia = 'EXPLICIT' | 'USER_PROMPT' | 'IMPORT_AUTO' | 'FALLBACK';
  const fuenteInferencia: FuenteInferencia = args.moneda
    ? 'EXPLICIT' // --moneda=USD es elección explícita vía flag CLI
    : args.allowAuto
      ? 'FALLBACK' // --allow-auto deja el heredado MXN sin pasar por prompt
      : fuenteMoneda === 'prompt'
        ? 'USER_PROMPT'
        : 'FALLBACK';

  if (!args.moneda && !args.allowAuto) {
    // Intentar prompt interactivo
    const interactive = await promptMoneda();
    if (interactive) {
      monedaElegida = interactive;
      fuenteMoneda = 'prompt';
    } else {
      console.error('');
      console.error('❌ STDIN no es interactivo y no se proporcionó --moneda.');
      console.error('   Para CI/CD pasa pass --moneda=<USD|EUR|MXN|...> o --allow-auto (default MXN).');
      console.error('');
      console.error('   Sugerencia para brokers EUR: --moneda=EUR');
      console.error('');
      process.exit(2);
    }
  }
  console.error('');
  console.error(`💱 Moneda aplicada: ${monedaElegida} (fuente: ${fuenteMoneda}, inferencia: ${fuenteInferencia})`);
  console.error('');

  // ── 2) Cleanup (opcional) ──────────────────────────────────────────────
  if (args.cleanup) {
    console.error('🧹 Limpiando tenants demo previos …');
    const toDelete = await prisma.tenant.findMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
      select: { id: true },
    });
    const ids = toDelete.map(t => t.id);
    if (ids.length > 0) {
      await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.apiKey.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
      console.error(`   Eliminados ${ids.length} tenants demo.`);
    } else {
      console.error('   No se encontraron tenants demo previos.');
    }
  }

  // ── 3) Check de archivo existente ─────────────────────────────────────
  if (fs.existsSync(outPath) && !args.force) {
    console.error(
      `❌ ${outPath} ya existe. Usa --force para sobrescribir, o --cleanup para re-generar.`,
    );
    process.exit(2);
  }

  // ── 4) Crear tenants ───────────────────────────────────────────────────
  const apiKeys: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < args.count; i++) {
    const idx = String(i + 1).padStart(2, '0');
    const name = `Demo Partner ${idx}`;
    const slug = `${SLUG_PREFIX}${idx}`;
    const email = `demo-partner-${idx}@volkern-test.dev`;

    try {
      // 1. Crear tenant con moneda (NUEVO: forzado desde el prompt) +
      //    trazabilidad de inferencia (campo monedaInferenciaSource) para que
      //    el superadmin pueda distinguir programáticamente los tenants que
      //    eligieron moneda explícita de los que heredaron el default MXN.
      const tenant = await prisma.tenant.create({
        data: {
          nombre: name,
          slug,
          plan: 'esencial',
          estado: 'activo',
          accountType: 'BUSINESS',
          moneda: monedaElegida,
          monedaInferida: monedaElegida,
          monedaInferenciaSource: fuenteInferencia,
        },
      });

      // 2. Crear usuario admin
      const user = await prisma.user.create({
        data: { email, name, tenantId: tenant.id },
      });

      // 3. Generar API key con scope audit:read
      const { key, keyHash, prefix } = generateApiKey('live');
      await prisma.apiKey.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          nombre: `Key Staging — ${name}`,
          keyHash,
          prefix,
          scopes: ['audit:read'],
        },
      });

      apiKeys.push(key);
      succeeded++;
      console.error(`[${i + 1}/${args.count}] ✅ ${name} (${monedaElegida}, ${fuenteInferencia})`);
    } catch (err) {
      console.error(`[${i + 1}/${args.count}] ❌ ${name}: ${(err as Error).message}`);
      failed++;
    }
  }

  // ── 5) Escribir archivo de keys ────────────────────────────────────────
  if (apiKeys.length > 0) {
    fs.writeFileSync(outPath, apiKeys.join('\n') + '\n', 'utf-8');
  }

  console.error('');
  console.error('📊 Resumen:');
  console.error(`   • Moneda aplicada: ${monedaElegida} (${fuenteMoneda}, ${fuenteInferencia})`);
  console.error(`   • Tenants creados: ${succeeded} / ${args.count}`);
  console.error(`   • Tenants fallidos: ${failed}`);
  console.error(`   • Keys guardadas en: ${outPath}`);
  console.error('');
  console.error('   Ejecutar stress test:');
  console.error(`   STAGING_URL=https://staging.volkern.app \\`);
  console.error(`   KEY_FILE=${outPath} \\`);
  console.error(`   npx tsx scripts/seed-partner-usage-demo.ts`);
  console.error('');
  console.error('   ⚠️  Recuerda: el portfolio ejecutivo ahora muestra la moneda del tenant.');
  console.error('      Para verificar: /dashboard/seguros/portfolio (chip junto a Refrescar).');
}

main()
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
