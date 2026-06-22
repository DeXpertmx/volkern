import { describe, it, expect, beforeEach } from "vitest";

import { fetchMock } from "./setup/fetchMock";

process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

import {
  PARTNER_RATE_LIMITS,
  hashApiKeyEdge,
  type PartnerRateScope,
} from "@/lib/rate-limit/partner-rate-limit-config";
import { inspectPartnerRateLimit } from "@/lib/rate-limit/upstash-edge-rate-limit";

const REPORTED_SCOPES: PartnerRateScope[] = [
  "payroll:run",
  "payroll:read",
  "attendance:write",
  "attendance:read",
  "employees:write",
  "employees:read",
];

function makeInputs(apiKeyId: string) {
  return REPORTED_SCOPES.map((scope) => ({
    apiKeyId,
    scope,
    policy: PARTNER_RATE_LIMITS[scope],
  }));
}

describe("inspectPartnerRateLimit - read-only bucket inspection", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });
  // NOTA: NO usar vi.unstubAllGlobals() aquí — eso elimina el stub global
  // de `fetch` entre tests, y los tests subsiguientes terminan llamando al
  // `fetch` real (que falla con DNS error en el dominio
  // `upstash.example.com`), `inspectPartnerRateLimit` lo captura en su try/catch
  // y devuelve silenciosamente inspectSource="unavailable". Eso enmascara
  // los assertions de los tests.
  //
  // `fetchMock.mockReset()` en el beforeEach basta: borra la implementación
  // y el call history sin tocar el stub global, así que el mock persiste a
  // través de todos los tests del file (vitest worker solo crea un module
  // graph por file, y este file-level setup aplica a todos los `describe` aquí).

  it("happy path: ZCARD resultados correctos por scope", async () => {
    const upstashResponse = [
      // ZRANGE WITHSCORES for accurate oldest-entry score. Empty bucket → [].
      { result: 0 }, { result: 2 }, { result: [] },
      { result: 0 }, { result: 5 }, { result: [] },
      { result: 0 }, { result: 100 }, { result: ["old_member_a", "1700000000000"] },
      { result: 0 }, { result: 0 }, { result: [] },
      { result: 0 }, { result: 0 }, { result: [] },
      { result: 0 }, { result: 30 }, { result: ["old_member_b", "1700000020000"] },
    ];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => upstashResponse });
    const result = await inspectPartnerRateLimit(makeInputs("apikeyhash"));
    expect(result.inspectSource).toBe("upstash");
    expect(result.buckets).toHaveLength(6);
    expect(result.buckets[0]).toMatchObject({ limit: 10, used: 2, remaining: 8, windowMs: 60_000, failClosed: true });
    expect(result.buckets[2]).toMatchObject({ limit: 300, used: 100, remaining: 200 });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toHaveLength(18); // 6 scopes × 3 cmds.
    expect(body[0][0]).toBe("ZREMRANGEBYSCORE");
    expect(body[1][0]).toBe("ZCARD");
    expect(body[2][0]).toBe("ZRANGE");
    expect(body[2]).toContain("WITHSCORES");
  });

  it("dev fallback sin env vars: used=0, remaining=limit, source=fallback", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = "test";
    const result = await inspectPartnerRateLimit(makeInputs("any"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.inspectSource).toBe("fallback");
    expect(result.buckets[0]).toMatchObject({ used: 0, remaining: 10, limit: 10 });
  });

  it("Upstash 5xx: source=unavailable, used=null, remaining=null, limit real", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" });
    const result = await inspectPartnerRateLimit(makeInputs("any"));
    expect(result.inspectSource).toBe("unavailable");
    expect(result.buckets[0].used).toBeNull();
    expect(result.buckets[0].remaining).toBeNull();
    expect(result.buckets[0].limit).toBe(10);
  });

  it("Upstash timeout: source=unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("AbortError"));
    const result = await inspectPartnerRateLimit(makeInputs("any"));
    expect(result.inspectSource).toBe("unavailable");
  });

  it("aislamiento: dos apiKeys distintos producen buckets distintos", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => REPORTED_SCOPES.flatMap(() => [{ result: 0 }, { result: 1 }, { result: [] }]),
    }));
    await inspectPartnerRateLimit(makeInputs("apikeyA"));
    await inspectPartnerRateLimit(makeInputs("apikeyB"));
    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body1[1][1]).toContain("apikeyA");
    expect(body2[1][1]).toContain("apikeyB");
    expect(body1[1][1]).not.toBe(body2[1][1]);
  });

  it("buckets preservan windowMs y failClosed desde el policy table", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => REPORTED_SCOPES.flatMap(() => [{ result: 0 }, { result: 0 }, { result: [] }]),
    });
    const result = await inspectPartnerRateLimit(makeInputs("any"));
    REPORTED_SCOPES.forEach((scope, i) => {
      const policy = PARTNER_RATE_LIMITS[scope];
      expect(result.buckets[i].windowMs).toBe(policy.windowMs);
      expect(result.buckets[i].failClosed).toBe(policy.failClosed);
    });
  });

  it("empty inputs: returns empty buckets array", async () => {
    const result = await inspectPartnerRateLimit([]);
    expect(result.buckets).toHaveLength(0);
  });

  it("resetAt preciso: ZRANGE WITHSCORES devuelve oldest-score → resetAt = oldest + windowMs", async () => {
    // En un bucket con 1 entry de hace 30s in a 60s window:
    //   resetAt preciso = oldestScore + windowMs.
    //   Pero oldestScore = now - 30000 (timestamp Epoch ms).
    // Verificamos que NO usamos `now + windowMs` ciego.
    const tBefore = Date.now();
    const oldestScore = String(tBefore - 30000); // 30s ago
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        // payroll:run: 1 entry de hace 30s, used=1, oldest=tBefore-30000.
        { result: 0 }, { result: 1 }, { result: ["m", oldestScore] },
        ...REPORTED_SCOPES.slice(1).flatMap(() => [{ result: 0 }, { result: 0 }, { result: [] }]),
      ],
    });
    const result = await inspectPartnerRateLimit(makeInputs("any"));
    const resetAt = result.buckets[0].resetAt;
    // Calculamos: oldestScore + windowMs (60000) = (tBefore - 30000) + 60000 = tBefore + 30000.
    // resetAt esperado ≈ tBefore + 30000 (no ahora + 60000).
    const expectedResetAt = Number(oldestScore) +
      PARTNER_RATE_LIMITS["payroll:run"].windowMs;
    // Tolerancia pequeña por runtime entre tBefore y result.buckets[0].resetAt cálculo.
    expect(Math.abs(resetAt - expectedResetAt)).toBeLessThan(100);
  });

  it("resetAt heurístico cuando bucket vacío: now + windowMs (fallback)", async () => {
    const tBefore = Date.now();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        REPORTED_SCOPES.flatMap(() => [{ result: 0 }, { result: 0 }, { result: [] }]),
    });
    const result = await inspectPartnerRateLimit(makeInputs("any"));
    // Si bucket vacío, resetAt ≈ now + windowMs (heurístico).
    const expectedResetAt =
      tBefore + PARTNER_RATE_LIMITS["payroll:run"].windowMs;
    expect(Math.abs(result.buckets[0].resetAt - expectedResetAt)).toBeLessThan(100);
  });

  it("hash determinista: same apiKey siempre produce mismo apiKeyId", async () => {
    const a = await hashApiKeyEdge("vk_live_test");
    const b = await hashApiKeyEdge("vk_live_test");
    expect(a).toBe(b);
  });

  it("used truthful: 9999 usados -> remaining clamped a 0", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { result: 0 }, { result: 9999 }, { result: [] },
        ...REPORTED_SCOPES.slice(1).flatMap(() => [{ result: 0 }, { result: 0 }, { result: [] }]),
      ],
    });
    const result = await inspectPartnerRateLimit(makeInputs("any"));
    expect(result.buckets[0].remaining).toBe(0);
    expect(result.buckets[0].used).toBe(9999);
  });
});

/* ─── Q5: extractOldestScore defense tests ──────────────────────────────────── */
/* Acceso indirecto via inspectPartnerRateLimit(1scope). Pipeline = 3 cmds; */
/* inyectamos payloads malformados en data[2].test (rangeEntry) y verificamos */
/* que resetAt recae en heurístico (now+windowMs) sin crashear. */
describe("extractOldestScore - malformed ZRANGE WITHSCORES payloads", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });
  // Ver nota en el primer `describe`: NO vi.unstubAllGlobals() aquí —
  // preserva el stub global de `fetch` durante todos los tests.

  async function inspectWithRangePayload(rangeResult: unknown): Promise<number> {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { result: 0 }, { result: 1 }, { result: rangeResult },
      ],
    });
    const result = await inspectPartnerRateLimit([
      { apiKeyId: "k", scope: "payroll:run", policy: PARTNER_RATE_LIMITS["payroll:run"] },
    ]);
    return result.buckets[0].resetAt;
  }

  it("ZRANGE resultado no-array (objeto): fallback a heurístico", async () => {
    const tBefore = Date.now();
    const resetAt = await inspectWithRangePayload({ unexpected: "shape" });
    const expected = tBefore + PARTNER_RATE_LIMITS["payroll:run"].windowMs;
    expect(Math.abs(resetAt - expected)).toBeLessThan(100);
  });

  it("ZRANGE resultado array < 2 elementos: fallback a heurístico", async () => {
    const resetAt = await inspectWithRangePayload(["only_member"]);
    const tAfter = Date.now();
    const expectedLow = tAfter - 10 + PARTNER_RATE_LIMITS["payroll:run"].windowMs;
    expect(resetAt).toBeGreaterThan(expectedLow - 100);
  });

  it("ZRANGE resultado score no-string (number): fallback a heurístico", async () => {
    const resetAt = await inspectWithRangePayload(["member", 12345 as unknown as string]);
    expect(typeof resetAt).toBe("number");
    expect(resetAt).toBeGreaterThan(Date.now() - 100);
  });

  it("ZRANGE resultado score string NaN (\"abc\"): fallback a heurístico", async () => {
    const resetAt = await inspectWithRangePayload(["member", "not_a_number"]);
    const tAfter = Date.now();
    expect(resetAt).toBeGreaterThan(tAfter - 10);
  });

  it("ZRANGE resultado score Infinity (\"Infinity\"): fallback a heurístico", async () => {
    const resetAt = await inspectWithRangePayload(["member", "Infinity"]);
    const tAfter = Date.now();
    expect(resetAt).toBeGreaterThan(tAfter - 10);
  });

  it("ZRANGE resultado score válido: resetAt = score + windowMs", async () => {
    const tBefore = Date.now();
    const oldestScore = tBefore - 20000; // 20s ago
    const resetAt = await inspectWithRangePayload(["member", String(oldestScore)]);
    const expected = oldestScore + PARTNER_RATE_LIMITS["payroll:run"].windowMs;
    expect(Math.abs(resetAt - expected)).toBeLessThan(100);
  });
});
