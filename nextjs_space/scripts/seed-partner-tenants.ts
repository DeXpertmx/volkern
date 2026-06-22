#!/usr/bin/env -S npx tsx
/**
 * seed-partner-tenants.ts — Genera 50 tenants demo + API keys para el stress
 * test de GET /api/v1/partner/usage.
 *
 * Crea:
 *   1. 50 tenants (Demo Partner 01 … Demo Partner 50)
 *   2. 1 usuario admin por tenant
 *   3. 1 API key (vk_live_…) por tenant con scope `audit:read`
 *
 * Salida: escribe `./50-api-keys.txt` (un key por línea) listo para
 * `seed-partner-usage-demo.ts`.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-partner-tenants.ts
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-partner-tenants.ts --cleanup
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-partner-tenants.ts --force
 *
 *   --cleanup  Elimina tenants demo previos antes de crear nuevos (para re-runs).
 *   --force    Sobrescribe ./50-api-keys.txt si ya existe (sin flag, se aborta).
 *
 * ── En staging ─────────────────────────────────────────────────────────────
 *
 *   Primero verifica que el DATABASE_URL apunte a la BD de staging.
 *   Luego ejecuta el script. Las API keys generadas solo existen en staging.
 */

import { PrismaClient } from "@prisma/client";
import { generateApiKey } from "../lib/api-keys";
import * as fs from "fs";

const TOTAL = 50;
const SLUG_PREFIX = "demo-partner-";
const OUT_PATH = "./50-api-keys.txt";

const prisma = new PrismaClient();

async function main() {
  const doCleanup = process.argv.includes("--cleanup");
  const doForce = process.argv.includes("--force");

  // ── Cleanup previo ─────────────────────────────────────────────────────
  if (doCleanup) {
    console.error("🧹 Limpiando tenants demo previos …");
    const toDelete = await prisma.tenant.findMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
      select: { id: true },
    });
    const ids = toDelete.map((t) => t.id);
    if (ids.length > 0) {
      await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.apiKey.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
      console.error(`   Eliminados ${ids.length} tenants demo.`);
    } else {
      console.error("   No se encontraron tenants demo previos.");
    }
  }

  // ── Check de archivo existente ─────────────────────────────────────────
  if (fs.existsSync(OUT_PATH) && !doForce) {
    console.error(
      `❌ ${OUT_PATH} ya existe. Usa --force para sobrescribir, o --cleanup para re-generar.`,
    );
    process.exit(2);
  }

  // ── Crear tenants ──────────────────────────────────────────────────────
  const apiKeys: string[] = [];
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < TOTAL; i++) {
    const idx = String(i + 1).padStart(2, "0");
    const name = `Demo Partner ${idx}`;
    const slug = `${SLUG_PREFIX}${idx}`;
    const email = `demo-partner-${idx}@volkern-test.dev`;

    try {
      // 1. Crear tenant (si el slug ya existe, Prisma tira P2002 → catch).
      const tenant = await prisma.tenant.create({
        data: {
          nombre: name,
          slug,
          plan: "esencial",
          estado: "activo",
          accountType: "BUSINESS",
        },
      });

      // 2. Crear usuario admin
      const user = await prisma.user.create({
        data: {
          email,
          name,
          tenantId: tenant.id,
        },
      });

      // 3. Generar API key con scope audit:read
      const { key, keyHash, prefix } = generateApiKey("live");
      await prisma.apiKey.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          nombre: `Key Staging — ${name}`,
          keyHash,
          prefix,
          scopes: ["audit:read"],
        },
      });

      apiKeys.push(key);
      succeeded++;
      console.error(`[${i + 1}/${TOTAL}] ✅ ${name}`);
    } catch (err) {
      console.error(`[${i + 1}/${TOTAL}] ❌ ${name}: ${(err as Error).message}`);
      failed++;
    }
  }

  // ── Escribir archivo de keys ───────────────────────────────────────────
  if (apiKeys.length > 0) {
    try {
      fs.writeFileSync(OUT_PATH, apiKeys.join("\n") + "\n", "utf-8");
    } catch (ioErr) {
      console.error(`\n❌ No se pudo escribir ${OUT_PATH}: ${(ioErr as Error).message}`);
      console.error("   API keys (pegar manualmente):");
      console.error(apiKeys.join("\n"));
      process.exit(3);
    }
  }

  console.error(`\n📊 Resumen: ${succeeded} creados, ${skipped} saltados, ${failed} fallidos.`);
  if (apiKeys.length > 0) {
    console.error(`   Keys guardadas en: ${OUT_PATH}`);
    console.error(`\n   Ejecutar stress test:`);
    console.error(`   STAGING_URL=https://staging.volkern.app \\`);
    console.error(`   KEY_FILE=./50-api-keys.txt \\`);
    console.error(`   npx tsx scripts/seed-partner-usage-demo.ts`);
  }

  if (failed > 0) {
    console.error(`\n⚠️  ${failed} tenants fallaron. Corrige los errores y re-ejecuta.`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
