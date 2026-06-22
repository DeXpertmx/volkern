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
const PREFIX = "Demo Partner";

const prisma = new PrismaClient();

async function main() {
  const apiKeys: string[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const idx = String(i + 1).padStart(2, "0");
    const name = `${PREFIX} ${idx}`;
    const slug = `demo-partner-${idx}`;
    const email = `demo-partner-${idx}@volkern-test.dev`;

    console.error(`[${i + 1}/${TOTAL}] Creando: ${name} …`);

    // 1. Crear tenant
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

    // 3. Generar API key con scope audit:read (requerido por GET /api/v1/partner/usage)
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
  }

  // Escribir archivo de keys
  const outPath = "./50-api-keys.txt";
  fs.writeFileSync(outPath, apiKeys.join("\n") + "\n", "utf-8");
  console.error(`\n✅ ${TOTAL} tenants + API keys creados.`);
  console.error(`   Keys guardadas en: ${outPath}`);
  console.error(`\n   Ejecutar stress test:`);
  console.error(`   STAGING_URL=https://staging.volkern.app \\`);
  console.error(`   KEY_FILE=./50-api-keys.txt \\`);
  console.error(`   npx tsx scripts/seed-partner-usage-demo.ts`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
