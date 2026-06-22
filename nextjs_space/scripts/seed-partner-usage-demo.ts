#!/usr/bin/env -S npx tsx
/**
 * seed-partner-usage-demo.ts — Volkern Partner API stress test.
 *
 * Golpea GET /api/v1/partner/usage para N tenants simultáneamente y recolecta
 * métricas de latencia per-scope + inspectSource. No modifica estado Upstash
 * (sólo inspecciona buckets en modo read-only).
 *
 * ── Uso (staging) ──────────────────────────────────────────────────────────
 *
 *  STAGING_URL=https://staging.volkern.app \
 *  API_KEYS=vk_live_key1,vk_live_key2,...,vk_live_keyN \
 *  CONCURRENCY=50 \
 *  npx tsx scripts/seed-partner-usage-demo.ts
 *
 * ── Variables de entorno ───────────────────────────────────────────────────
 *
 *  STAGING_URL   (req)  Base URL del entorno staging (sin trailing slash).
 *  API_KEYS      (req)  Comma-separated list de apiKeys (1 por tenant).
 *  KEY_FILE      (opt)  Si se prefiere, path a un archivo con 1 key por línea.
 *                       API_KEYS tiene prioridad sobre KEY_FILE.
 *  CONCURRENCY   (opt)  Número máximo de requests concurrentes. Default: 50.
 *  TIMEOUT_MS    (opt)  Timeout por request. Default: 5000.
 *
 * ── Salida ─────────────────────────────────────────────────────────────────
 *
 *  JSON a stdout con estructura:
 *   {
 *     "summary": {
 *       "totalRequests": 50,
 *       "ok": 48,
 *       "failed": 2,
 *       "unavailable": 0,
 *       "latencyMs": { "p50": 42, "p95": 89, "p99": 134, "min": 28, "max": 210 }
 *     },
 *     "perScope": { "payroll:run": { "avgUsed": 2.3, ... }, ... },
 *     "failures": [ { "tenantIndex": 12, "status": 401, "body": "..." }, ... ],
 *     "histogramMs": { "0-50": 32, "50-100": 14, "100-250": 3, "250+": 1 }
 *   }
 *
 *  exit code 0 si todas las requests fueron 200 OK; 1 si hubo fallos.
 */

const STAGING_URL = process.env.STAGING_URL;
if (!STAGING_URL) {
  console.error("❌ STAGING_URL no definido. Ejemplo: STAGING_URL=https://staging.volkern.app");
  process.exit(2);
}

const CONCURRENCY = Number(process.env.CONCURRENCY) || 50;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 5000;

/* ─── Resolver apiKeys ─────────────────────────────────────────────────────── */

function resolveApiKeys(): string[] {
  if (process.env.API_KEYS) {
    return process.env.API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  if (process.env.KEY_FILE) {
    const fs = require("fs");
    const raw = fs.readFileSync(process.env.KEY_FILE, "utf-8");
    return raw
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && !l.startsWith("#"));
  }
  console.error(
    "❌ API_KEYS o KEY_FILE requerido. Ejemplo: API_KEYS=vk_live_a,vk_live_b,...",
  );
  process.exit(2);
}

const apiKeys = resolveApiKeys();
if (apiKeys.length === 0) {
  console.error("❌ No se encontraron apiKeys en API_KEYS ni KEY_FILE.");
  process.exit(2);
}

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */

interface TenantResult {
  tenantIndex: number;
  apiKeyPrefix: string;
  status: number;
  durationMs: number;
  ok: boolean;
  inspectSource?: string;
  buckets?: Record<string, { used: number; remaining: number; resetAt: number }>;
  error?: string;
}

interface Stats {
  total: number;
  ok: number;
  failed: number;
  unavailable: number;
  latencies: number[];
}

/* ─── Fetch helper ──────────────────────────────────────────────────────────── */

async function fetchUsage(
  baseUrl: string,
  apiKey: string,
  index: number,
): Promise<TenantResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let status = 0;
  let body: unknown = null;
  let error: string | undefined;

  try {
    const res = await fetch(`${baseUrl}/api/v1/partner/usage`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    status = res.status;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
    status = status || 0;
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - start;
  const ok = status === 200;
  const bucketData = body as Record<string, unknown> | null;
  const inspectSource =
    typeof bucketData?.inspectSource === "string"
      ? bucketData.inspectSource
      : undefined;

  let buckets: TenantResult["buckets"] | undefined;
  if (ok && bucketData?.buckets) {
    const raw = bucketData.buckets as Record<
      string,
      { used: number; remaining: number; resetAt: number }
    >;
    buckets = {};
    for (const [scope, v] of Object.entries(raw)) {
      buckets[scope] = {
        used: typeof v.used === "number" ? v.used : -1,
        remaining: typeof v.remaining === "number" ? v.remaining : -1,
        resetAt: typeof v.resetAt === "number" ? v.resetAt : 0,
      };
    }
  }

  return {
    tenantIndex: index,
    apiKeyPrefix: apiKey.slice(0, 8) + "...",
    status,
    durationMs,
    ok,
    inspectSource,
    buckets,
    error: ok ? undefined : (error ?? JSON.stringify(body).slice(0, 200)),
  };
}

/* ─── Estadísticas ──────────────────────────────────────────────────────────── */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function histogram(latencies: number[]): Record<string, number> {
  const bins: Record<string, number> = {
    "0-50": 0,
    "50-100": 0,
    "100-250": 0,
    "250-500": 0,
    "500-1000": 0,
    "1000+": 0,
  };
  for (const ms of latencies) {
    if (ms < 50) bins["0-50"]!++;
    else if (ms < 100) bins["50-100"]!++;
    else if (ms < 250) bins["100-250"]!++;
    else if (ms < 500) bins["250-500"]!++;
    else if (ms < 1000) bins["500-1000"]!++;
    else bins["1000+"]!++;
  }
  return bins;
}

/* ─── Main ──────────────────────────────────────────────────────────────────── */

async function main() {
  console.error(
    `🔬 Volkern Partner API Usage Stress Test\n` +
      `   URL:         ${STAGING_URL}\n` +
      `   Tenants:     ${apiKeys.length}\n` +
      `   Concurrency: ${CONCURRENCY}\n` +
      `   Timeout:     ${TIMEOUT_MS}ms\n`,
  );

  const startTs = Date.now();

  // Ejecutar en batches de CONCURRENCY para no saturar el event loop.
  const results: TenantResult[] = [];
  for (let i = 0; i < apiKeys.length; i += CONCURRENCY) {
    const batch = apiKeys.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((key, j) => fetchUsage(STAGING_URL!, key, i + j)),
    );
    results.push(...batchResults);
    console.error(
      `   Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(apiKeys.length / CONCURRENCY)}: ${batchResults.filter((r) => r.ok).length}/${batch.length} OK`,
    );
  }

  const totalMs = Date.now() - startTs;

  // ── Agregar stats ───────────────────────────────────────────────────────
  const stats: Stats = {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    unavailable: results.filter((r) => r.inspectSource === "unavailable")
      .length,
    latencies: results.map((r) => r.durationMs).sort((a, b) => a - b),
  };

  const perScope: Record<
    string,
    { avgUsed: number; avgRemaining: number; sampleSize: number }
  > = {};
  const scopeKeys = new Set<string>();
  for (const r of results) {
    if (r.buckets) {
      for (const scope of Object.keys(r.buckets)) {
        scopeKeys.add(scope);
      }
    }
  }
  for (const scope of scopeKeys) {
    let totalUsed = 0;
    let totalRemaining = 0;
    let count = 0;
    for (const r of results) {
      if (r.buckets?.[scope]) {
        totalUsed += r.buckets[scope].used;
        totalRemaining += r.buckets[scope].remaining;
        count++;
      }
    }
    perScope[scope] = {
      avgUsed: count > 0 ? Math.round((totalUsed / count) * 10) / 10 : 0,
      avgRemaining:
        count > 0 ? Math.round((totalRemaining / count) * 10) / 10 : 0,
      sampleSize: count,
    };
  }

  const failures = results
    .filter((r) => !r.ok)
    .map((r) => ({
      tenantIndex: r.tenantIndex,
      apiKeyPrefix: r.apiKeyPrefix,
      status: r.status,
      error: r.error,
    }));

  const report = {
    summary: {
      totalRequests: stats.total,
      ok: stats.ok,
      failed: stats.failed,
      unavailable: stats.unavailable,
      totalWallMs: totalMs,
      latencyMs: {
        p50: percentile(stats.latencies, 50),
        p95: percentile(stats.latencies, 95),
        p99: percentile(stats.latencies, 99),
        min: stats.latencies[0] ?? 0,
        max: stats.latencies[stats.latencies.length - 1] ?? 0,
      },
    },
    perScope,
    failures: failures.slice(0, 20), // top 20 failures
    histogramMs: histogram(stats.latencies),
  };

  console.log(JSON.stringify(report, null, 2));

  if (stats.failed > 0) {
    console.error(
      `\n⚠️  ${stats.failed}/${stats.total} requests fallaron.`,
    );
    process.exit(1);
  }

  console.error(`\n✅ ${stats.total}/${stats.total} OK en ${totalMs}ms.`);
}

main().catch((err) => {
  console.error("💥 Error fatal:", err);
  process.exit(2);
});
