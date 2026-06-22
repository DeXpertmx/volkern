/**
 * Volkern Partner API — Edge-compatible sliding window rate limiter.
 *
 * Provider: **Upstash Redis REST** (HTTP, edge-compatible).
 *   Endpoint: `${UPSTASH_REDIS_REST_URL}/pipeline` con N comandos atómicos.
 *
 * Dos funciones públicas:
 *   - `checkPartnerRateLimit`  : sliding-window WRITE (ZREMRANGEBYSCORE → ZCARD → ZADD → EXPIRE).
 *   - `inspectPartnerRateLimit`: sliding-window READ  (ZREMRANGEBYSCORE → ZCARD → ZRANGE WITHSCORES).
 *
 * Atomicidad: Upstash pipeline ejecuta los comandos en una sola HTTP request,
 * con el mismo "isolation level" que MULTI/EXEC en Redis nativo.
 *
 * Edge Runtime compat:
 *   - Sin Node-only deps (no `crypto`, no `ioredis`, no `Prisma`).
 *   - Sólo `fetch` (Web API) + `AbortController` + `crypto.subtle` (indirecto).
 */

import type { RateLimitPolicy } from "./partner-rate-limit-config";
import { UPSTASH_FETCH_TIMEOUT_MS } from "./partner-rate-limit-config";
import { logger } from "@/lib/logger";

/* ─── Write-side (existente): checkPartnerRateLimit ──────────────────────── */

export interface UpstashLimitResult {
  /** Si false → 429 inmediato. */
  allowed: boolean;
  /** Slots restantes en la ventana sliding. */
  remaining: number;
  /** Epoch ms cuando la ventana se reinicia (now + windowMs en success; fail-backoff si Upstash down). */
  resetAt: number;
  /** Límite configurado para este scope. */
  limit: number;
  /** Definido sólo si allowed=false por causa Upstash unreachable. */
  error?: "RATE_LIMITER_UNAVAILABLE";
}

/**
 * Key shape: `volkern:rl:partner:<scope>:<apiKeyId>`.
 *  - `volkern:rl:` namespace separado de los rate-limits existentes
 *    (`ratelimit:` en `lib/rate-limiter.ts`) para evitar colisiones.
 *  - scope: PartnerRateScope.
 *  - apiKeyId: SHA-256 hex substring(0,16) — determinista, no-PII.
 */
function makeKey(scope: string, apiKeyId: string): string {
  return `volkern:rl:partner:${scope}:${apiKeyId}`;
}

/**
 * Comprueba Y registra 1 request en el sliding window del (scope, apiKeyId).
 * Devuelve `{allowed, remaining, resetAt, limit, error?}`.
 *
 * Fail policy ante Upstash unreachable:
 *   - `policy.failClosed === true` → `allowed=false` con `error="RATE_LIMITER_UNAVAILABLE"`.
 *   - `policy.failClosed === false` → `allowed=true` (fail-open).
 *
 * Sin env vars configuradas: dev mode fail-OPEN, prod fail-closed-when-default.
 */
export async function checkPartnerRateLimit(
  apiKeyId: string,
  scope: string,
  policy: RateLimitPolicy,
): Promise<UpstashLimitResult> {
  const now = Date.now();
  const resetAt = now + policy.windowMs;
  const safeResult = (
    allowed: boolean,
    remaining: number,
    error?: UpstashLimitResult["error"],
  ): UpstashLimitResult => ({
    allowed,
    remaining,
    resetAt:
      error === "RATE_LIMITER_UNAVAILABLE"
        ? now + UPSTASH_FETCH_TIMEOUT_MS * 2
        : resetAt,
    limit: policy.limit,
    error,
  });

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV !== "production") {
      return safeResult(true, policy.limit);
    }
    if (policy.failClosed) {
      return safeResult(false, 0, "RATE_LIMITER_UNAVAILABLE");
    }
    return safeResult(true, 1);
  }

  const key = makeKey(scope, apiKeyId);
  const windowStart = now - policy.windowMs;
  const ttlSeconds = Math.ceil(policy.windowMs / 1000) + 1;
  // Miembro único → ~122 bits entropy via crypto.randomUUID() (Vercel Edge Runtime).
  const randomMember = `${now}:${crypto.randomUUID()}`;

  // Write pipeline (5 cmds, 1 HTTP roundtrip atomic via Upstash /pipeline):
  //   0. ZREMRANGEBYSCORE   → limpia las entries older than window.
  //   1. ZCARD              → cuenta remaining (count_old pre-insert).
  //   2. ZADD               → registra este request con score = now.
  //   3. ZRANGE 0 0 WITHSCORES → oldest entry para resetAt preciso.
  //   4. EXPIRE             → auto-eviction cuando la bucket quede idle para TTL + 1s.
  //
  // El ZRANGE WITHSCORES añade ~0.5-1 ms de CPU al pipeline (no es 25% de
  // latency como podría parecer — el cost de Upstash es en CPU por cmd, no
  // en HTTP roundtrips). Lo incluimos porque la SaaS partner-facing necesita
  // un `X-RateLimit-Reset` honesto: si están en 9/10 con entries de hace 30s,
  // queremos que vean `Retry-After = 30s`, no el heurístico de 60s.
  const pipeline = [
    ["ZREMRANGEBYSCORE", key, "-inf", String(windowStart)],
    ["ZCARD", key],
    ["ZADD", key, String(now), randomMember],
    ["ZRANGE", key, "0", "0", "WITHSCORES"],
    ["EXPIRE", key, String(ttlSeconds)],
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    UPSTASH_FETCH_TIMEOUT_MS,
  );

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Upstash ${res.status} ${res.statusText}`);
    }

    const data: unknown = await res.json();
    if (!isPipelineResponse(data, pipeline.length)) {
      throw new Error(
        `Upstash: malformed pipeline response (expected ${pipeline.length} results)`,
      );
    }
    const countOld = data[1].result;
    if (typeof countOld !== "number") {
      throw new Error(`Upstash: ZCARD returned ${typeof countOld}`);
    }

    const usedAfterInsert = countOld + 1;
    const allowed = usedAfterInsert <= policy.limit;
    const remaining = Math.max(0, policy.limit - usedAfterInsert);

    // resetAt preciso: `oldestEntryScore + windowMs` cuando hay entries,
    // heurístico `now + windowMs` cuando el bucket quedó vacío después de
    // ZREMRANGEBYSCORE.
    //
    // El 5to cmd del pipeline (índice 3) es ZRANGE 0 0 WITHSCORES → oldest
    // entry. Si Upstash devuelve un array `["member", "1700...000"]`,
    // `extractOldestScore` lo parsea. Si devuelve [] (bucket vacío) o
    // payload malformado → fallback al heurístico de la ventana completa.
    const oldestScore = extractOldestScore(data[3]?.result);
    const accurateResetAt =
      oldestScore !== null ? oldestScore + policy.windowMs : resetAt;

    // Spread override de resetAt: heredamos allowed/remaining/limit/error de
    // safeResult y solo pisamos resetAt. Más simple y sin el ternary
    // safeResult(...) && { ... } de iteraciones previas.
    return { ...safeResult(allowed, remaining), resetAt: accurateResetAt };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { scope, failClosed: policy.failClosed, error: message },
      "[PartnerRateLimit] Upstash unreachable",
    );

    if (policy.failClosed) {
      return safeResult(false, 0, "RATE_LIMITER_UNAVAILABLE");
    }
    return safeResult(true, 1);
  }
}

/* ─── Read-side (nuevo): inspectPartnerRateLimit ─────────────────────────── */

export interface InspectBucketResult {
  /** Límite configurado para este scope. */
  limit: number;
  /** Slots consumidos en la ventana sliding (null si Upstash down). */
  used: number | null;
  /** Slots restantes (= limit - used, clamped >= 0). null si Upstash down. */
  remaining: number | null;
  /**
   * Epoch ms cuando la ventana sliding reinicia realmente:
   *   - `oldestEntryScore + windowMs` si hay entries vivos (= momento exacto
   *     en el que el primer slot libera).
   *   - `now + windowMs` heurístico si bucket está vacío.
   * Esto es DIFERENTE de `now + windowMs` ciego — un SaaS al 9/10 con
   * entries de hace 5s verá `resetAt = now + 55s`, NO `now + 60s`.
   */
  resetAt: number;
  /** Tamaño de la ventana. */
  windowMs: number;
  /** Política de fail-closed (informativo para el SaaS partner). */
  failClosed: boolean;
}

export interface InspectPartnerLimitInput {
  apiKeyId: string;
  scope: string;
  policy: RateLimitPolicy;
}

export interface InspectPartnerResult {
  buckets: InspectBucketResult[];
  inspectedAt: number;
  /**
   * Origen de los datos:
   *   - "upstash"      → lectura real de Upstash.
   *   - "fallback"     → dev mode sin Upstash (used=0, remaining=limit).
   *   - "unavailable"  → prod mode sin Upstash o upstream timeout/error (used/remaining=null).
   */
  inspectSource: "upstash" | "fallback" | "unavailable";
}

/**
 * Inspección READ-ONLY de buckets Upstash.
 *
 * Pipeline por scope (3 comandos atómicos):
 *   1. `ZREMRANGEBYSCORE key -inf (now-windowMs)`  → cleanup idempotente.
 *   2. `ZCARD key`                                  → contar.
 *   3. `ZRANGE key 0 0 WITHSCORES`                  → oldest entry's score (para resetAt preciso).
 *
 * Para 6 scopes → 18 comandos en 1 fetch Upstash.
 *
 * Fail policy: ante Upstash down → `inspectSource="unavailable"` + `used/remaining=null`
 * pero `limit/failClosed/windowMs/resetAt(heurístico)` siempre reales.
 * NO fail-closed aquí — el endpoint inspection es INFORMATIVO y opcional.
 */
export async function inspectPartnerRateLimit(
  inputs: InspectPartnerLimitInput[],
): Promise<InspectPartnerResult> {
  const now = Date.now();
  const fallbackBuckets = (
    source: "fallback" | "unavailable",
  ): InspectBucketResult[] =>
    inputs.map((input) => ({
      limit: input.policy.limit,
      used: source === "fallback" ? 0 : null,
      remaining: source === "fallback" ? input.policy.limit : null,
      resetAt: now + input.policy.windowMs,
      windowMs: input.policy.windowMs,
      failClosed: input.policy.failClosed,
    }));

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    const source: "fallback" | "unavailable" =
      process.env.NODE_ENV !== "production" ? "fallback" : "unavailable";
    return {
      buckets: fallbackBuckets(source),
      inspectedAt: now,
      inspectSource: source,
    };
  }

  // 3 comandos por scope (purge + ZCARD + ZRANGE WITHSCORES).
  const pipeline: unknown[][] = [];
  inputs.forEach((input) => {
    const key = makeKey(input.scope, input.apiKeyId);
    const windowStart = now - input.policy.windowMs;
    pipeline.push(["ZREMRANGEBYSCORE", key, "-inf", String(windowStart)]);
    pipeline.push(["ZCARD", key]);
    pipeline.push(["ZRANGE", key, "0", "0", "WITHSCORES"]);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    UPSTASH_FETCH_TIMEOUT_MS,
  );

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Upstash ${res.status} ${res.statusText}`);

    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length !== pipeline.length) {
      throw new Error(
        `Upstash: malformed pipeline response (expected ${pipeline.length})`,
      );
    }

    const buckets: InspectBucketResult[] = inputs.map((input, i) => {
      const cardEntry = data[i * 3 + 1] as { result?: unknown } | undefined;
      const rangeEntry = data[i * 3 + 2] as { result?: unknown } | undefined;
      const used =
        typeof cardEntry?.result === "number" ? cardEntry.result : 0;
      const oldestScore = extractOldestScore(rangeEntry?.result);
      const resetAt =
        oldestScore !== null
          ? oldestScore + input.policy.windowMs
          : now + input.policy.windowMs;
      return {
        limit: input.policy.limit,
        used,
        remaining: Math.max(0, input.policy.limit - used),
        resetAt,
        windowMs: input.policy.windowMs,
        failClosed: input.policy.failClosed,
      };
    });
    return { buckets, inspectedAt: now, inspectSource: "upstash" };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { error: message },
      "[PartnerRateLimit] inspectPartnerRateLimit failed",
    );
    return {
      buckets: fallbackBuckets("unavailable"),
      inspectedAt: now,
      inspectSource: "unavailable",
    };
  }
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Type guard para response shape Upstash `/pipeline`.
 * Cada elemento: `{ result: <value> }` (o `{ error }`).
 */
function isPipelineResponse(
  data: unknown,
  expectedLength: number,
): data is Array<{ result: unknown; error?: unknown }> {
  return (
    Array.isArray(data) &&
    data.length >= expectedLength &&
    data.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "result" in (entry as Record<string, unknown>),
    )
  );
}

/**
 * Parse el score del oldest entry desde una respuesta Upstash de
 * `ZRANGE key 0 0 WITHSCORES`. Devuelve:
 *   - el score numérico si la respuesta tiene al menos 2 elementos (member, score).
 *   - null si el bucket está vacío (respuesta []).
 */
function extractOldestScore(rangeResult: unknown): number | null {
  if (
    !Array.isArray(rangeResult) ||
    rangeResult.length < 2 ||
    typeof rangeResult[1] !== "string"
  ) {
    return null;
  }
  const score = Number(rangeResult[1]);
  return Number.isFinite(score) ? score : null;
}
