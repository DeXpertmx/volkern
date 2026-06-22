import { describe, it, expect, beforeEach } from "vitest";

import { fetchMock } from "./setup/fetchMock";

import {
  PARTNER_RATE_LIMITS,
  getScopeFromPath,
  hashApiKeyEdge,
  extractApiKeyFromHeaders,
} from "@/lib/rate-limit/partner-rate-limit-config";
import {
  checkPartnerRateLimit,
  UpstashLimitResult,
} from "@/lib/rate-limit/upstash-edge-rate-limit";

describe("getScopeFromPath", () => {
  it("deduce payroll:run del POST /api/v1/partner/payroll/run", () => {
    expect(
      getScopeFromPath("/api/v1/partner/payroll/run", "POST"),
    ).toBe("payroll:run");
  });

  it("deduce payroll:read del GET /api/v1/partner/payroll/[runId]/receipts", () => {
    expect(
      getScopeFromPath(
        "/api/v1/partner/payroll/run_abc123/receipts",
        "GET",
      ),
    ).toBe("payroll:read");
  });

  it("deduce payroll:read del GET /aeat-status", () => {
    expect(
      getScopeFromPath(
        "/api/v1/partner/payroll/run_abc123/aeat-status",
        "GET",
      ),
    ).toBe("payroll:read");
  });

  it("deduce attendance:write del POST /attendance/punch", () => {
    expect(
      getScopeFromPath("/api/v1/partner/attendance/punch", "POST"),
    ).toBe("attendance:write");
  });

  it("deduce employees:write del POST /employees", () => {
    expect(
      getScopeFromPath("/api/v1/partner/employees", "POST"),
    ).toBe("employees:write");
  });

  it("deduce employees:read del GET /employees", () => {
    expect(
      getScopeFromPath("/api/v1/partner/employees", "GET"),
    ).toBe("employees:read");
  });

  it("devuelve 'default' para rutas Partner no clasificadas", () => {
    expect(
      getScopeFromPath("/api/v1/partner/whatever", "GET"),
    ).toBe("default");
  });

  it("prefiere payroll:run sobre payroll:read cuando termina en /payroll/run", () => {
    expect(
      getScopeFromPath("/api/v1/partner/payroll/run", "POST"),
    ).toBe("payroll:run");
  });
});

describe("hashApiKeyEdge (Web Crypto SHA-256)", () => {
  // jsdom o node debe exponer crypto.subtle en el entorno vitest.
  // Si no, este test falla claramente → ajustar setup.
  it("produce el mismo hash para el mismo input (determinismo)", async () => {
    const a = await hashApiKeyEdge("vk_live_abc123");
    const b = await hashApiKeyEdge("vk_live_abc123");
    expect(a).toBe(b);
    expect(a).toHaveLength(16); // substring(0,16)
    expect(a).toMatch(/^[a-f0-9]+$/);
  });

  it("produce hashes distintos para apiKeys distintos (aislamiento)", async () => {
    const a = await hashApiKeyEdge("vk_live_aaa");
    const b = await hashApiKeyEdge("vk_live_bbb");
    expect(a).not.toBe(b);
  });
});

describe("extractApiKeyFromHeaders", () => {
  it("lee de x-api-key header", () => {
    const headers = new Headers({ "x-api-key": "vk_test_xyz" });
    expect(extractApiKeyFromHeaders(headers)).toBe("vk_test_xyz");
  });

  it("lee de Authorization Bearer", () => {
    const headers = new Headers({ authorization: "Bearer vk_test_abc" });
    expect(extractApiKeyFromHeaders(headers)).toBe("vk_test_abc");
  });

  it("prefiere x-api-key sobre Authorization si ambos vienen", () => {
    const headers = new Headers({
      "x-api-key": "vk_test_from_x",
      authorization: "Bearer vk_test_from_bearer",
    });
    expect(extractApiKeyFromHeaders(headers)).toBe("vk_test_from_x");
  });

  it("devuelve null cuando no hay key", () => {
    const headers = new Headers();
    expect(extractApiKeyFromHeaders(headers)).toBeNull();
  });

  it("devuelve null cuando Authorization no es Bearer", () => {
    const headers = new Headers({ authorization: "Basic dXNlcjpwYXNz" });
    expect(extractApiKeyFromHeaders(headers)).toBeNull();
  });
});

describe("checkPartnerRateLimit — Sliding Window + Pipeline Upstash", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret_token";
    process.env.NODE_ENV = "test";
    fetchMock.mockReset();
  });

  it("permitido: ZCARD devuelve count=5, policy limit=10 → allowed con remaining=4", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { result: 0 }, // ZREMRANGEBYSCORE
        { result: 5 }, // ZCARD
        { result: 1 }, // ZADD
        { result: [] }, // ZRANGE 0 0 WITHSCORES (bucket tiene entries pero oldest está fuera de rango → [])
        { result: 1 }, // EXPIRE
      ],
    });

    const res: UpstashLimitResult = await checkPartnerRateLimit(
      "a1b2c3d4e5f6a7b8",
      "payroll:run",
      PARTNER_RATE_LIMITS["payroll:run"],
    );
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(4); // 10 - 5 (old) - 1 (current) = 4
    expect(res.limit).toBe(10);
    expect(res.error).toBeUndefined();

    // Verify pipeline shape: 5 commands en orden ZREMRANGEBYSCORE → ZCARD → ZADD → ZRANGE → EXPIRE.
    // El ZRANGE WITHSCORES añade info de resetAt preciso (ver docstring upstash-edge-rate-limit.ts).
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toHaveLength(5);
    expect(body[0][0]).toBe("ZREMRANGEBYSCORE");
    expect(body[1][0]).toBe("ZCARD");
    expect(body[2][0]).toBe("ZADD");
    expect(body[3][0]).toBe("ZRANGE");
    expect(body[3]).toContain("WITHSCORES");
    expect(body[4][0]).toBe("EXPIRE");
  });

  it("bloqueado: ZCARD devuelve count=10 (lleno), policy limit=10 → allowed=false", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { result: 0 },
        { result: 10 }, // ya hay 10 en la ventana
        { result: 1 },
        { result: [] },
        { result: 1 },
      ],
    });

    const res = await checkPartnerRateLimit(
      "a1b2c3d4e5f6a7b8",
      "payroll:run",
      PARTNER_RATE_LIMITS["payroll:run"], // limit=10
    );
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.error).toBeUndefined(); // No fue error de Upstash, fue ratio-limit real.
  });

  it("Q1 write-path accurate resetAt: ZRANGE WITHSCORES score válido → resetAt = oldest + windowMs", async () => {
    // Regression test del fix Q1 (round 4 reviewer): si el 5to cmd del pipeline
    // (ZRANGE WITHSCORES) devuelve un oldest score válido, `extractOldestScore`
    // lo parsea y el write-path usa `resetAt = oldestScore + windowMs`
    // (no el heurístico ciego).
    //
    // Si en alguna iteración futura alguien reintroduce el `return safeResult(a,b)`
    // sin el spread override de resetAt, este test fallará y avisará.
    const oldestScore = 1700000000000;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { result: 0 }, // ZREMRANGEBYSCORE
        { result: 1 }, // ZCARD
        { result: 1 }, // ZADD
        { result: ["oldest_member", String(oldestScore)] }, // ZRANGE 0 0 WITHSCORES
        { result: 1 }, // EXPIRE
      ],
    });
    const res = await checkPartnerRateLimit(
      "anyKey",
      "payroll:run",
      PARTNER_RATE_LIMITS["payroll:run"],
    );
    expect(res.resetAt).toBe(oldestScore + PARTNER_RATE_LIMITS["payroll:run"].windowMs);
  });

  it("fail-closed payroll:run: si fetch revienta (timeout/5xx) → DENY con error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Upstash 503"));

    const res = await checkPartnerRateLimit(
      "a1b2c3d4e5f6a7b8",
      "payroll:run",
      PARTNER_RATE_LIMITS["payroll:run"], // failClosed=true
    );
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.error).toBe("RATE_LIMITER_UNAVAILABLE");
  });

  it("fail-open attendance:write: si fetch revienta → ALLOW + remaining optimista", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Upstash timeout"));

    const res = await checkPartnerRateLimit(
      "a1b2c3d4e5f6a7b8",
      "attendance:write",
      PARTNER_RATE_LIMITS["attendance:write"], // failClosed=false
    );
    expect(res.allowed).toBe(true);
    expect(res.error).toBeUndefined();
    // remaining optimista = 1 (heurística).
    expect(res.remaining).toBeGreaterThanOrEqual(1);
  });

  it("sin env vars en test → fail-open sin tocar fetch", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const res = await checkPartnerRateLimit(
      "anyKey",
      "payroll:run",
      PARTNER_RATE_LIMITS["payroll:run"],
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.allowed).toBe(true);
  });

  it("response shape malformado de Upstash → fail-open (excepto failClosed)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ result: 1 }, "not-an-object"],
    });
    // attendance:write es fail-open → allowed=true.
    const res = await checkPartnerRateLimit(
      "anyKey",
      "attendance:write",
      PARTNER_RATE_LIMITS["attendance:write"],
    );
    expect(res.allowed).toBe(true);
  });

  it("aislamiento: apiKey A y apiKey B reciben buckets distintos en Upstash", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { result: 0 },
        { result: 0 },
        { result: 1 },
        { result: [] },
        { result: 1 },
      ],
    });

    await checkPartnerRateLimit("apikeyA_hash", "payroll:run", PARTNER_RATE_LIMITS["payroll:run"]);
    await checkPartnerRateLimit("apikeyB_hash", "payroll:run", PARTNER_RATE_LIMITS["payroll:run"]);

    const callA = fetchMock.mock.calls[0];
    const callB = fetchMock.mock.calls[1];
    const bodyA = JSON.parse(callA[1].body);
    const bodyB = JSON.parse(callB[1].body);
    // Key del ZADD differ.
    expect(bodyA[2][1]).not.toBe(bodyB[2][1]);
    expect(bodyA[2][1]).toContain("apikeyA_hash");
    expect(bodyB[2][1]).toContain("apikeyB_hash");
  });

  it("alcance /pipeline incluye /pipeline en la URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { result: 0 },
        { result: 0 },
        { result: 1 },
        { result: [] },
        { result: 1 },
      ],
    });

    await checkPartnerRateLimit(
      "anyKey",
      "payroll:read",
      PARTNER_RATE_LIMITS["payroll:read"],
    );

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(
      "https://upstash.example.com/pipeline",
    );
  });

  it("Authorization header contiene el token Bearer Upstash", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { result: 0 },
        { result: 0 },
        { result: 1 },
        { result: [] },
        { result: 1 },
      ],
    });

    await checkPartnerRateLimit(
      "anyKey",
      "attendance:write",
      PARTNER_RATE_LIMITS["attendance:write"],
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer secret_token");
    expect(init.method).toBe("POST");
  });
});
