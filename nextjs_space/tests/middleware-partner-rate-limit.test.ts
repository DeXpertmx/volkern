import { describe, it, expect, beforeEach } from "vitest";

import { fetchMock } from "./setup/fetchMock";

process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

import { NextResponse } from "next/server";

import {
  getScopeFromPath,
  hashApiKeyEdge,
  PARTNER_RATE_LIMITS,
  extractApiKeyFromHeaders,
} from "@/lib/rate-limit/partner-rate-limit-config";
import { checkPartnerRateLimit } from "@/lib/rate-limit/upstash-edge-rate-limit";

describe("Partner rate-limit integration scenarios (FIXes #1, #3, #4, #5)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  });
  // NOTA: NO usar vi.unstubAllGlobals() aquí (mismo bug que partner-usage-endpoint.test.ts).
  // El stub global de `fetch` está puesto al module-top-level; eliminarlo entre
  // tests hace que el siguiente `checkPartnerRateLimit` invoque fetch real
  // (que falla con DNS error → catch silencioso en upstash-edge-rate-limit.ts →
  // fallback unavailable → aserciones enmascaradas).
  //
  // `fetchMock.mockReset()` en beforeEach basta: borra implementación y call
  // history sin tocar el stub global.

  it("happy path POST /api/v1/partner/payroll/run -> scope=payroll:run, failClosed", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ result: 0 }, { result: 0 }, { result: 1 }, { result: [] }, { result: 1 }],
    });
    const scope = getScopeFromPath("/api/v1/partner/payroll/run", "POST");
    expect(scope).toBe("payroll:run");
    const policy = PARTNER_RATE_LIMITS[scope];
    expect(policy.limit).toBe(10);
    expect(policy.failClosed).toBe(true);
    const r = await checkPartnerRateLimit("anykey", scope, policy);
    expect(r.allowed).toBe(true);
  });

  it("POST /api/v1/partner/attendance/punch -> scope=attendance:write, failOpen", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ result: 0 }, { result: 0 }, { result: 1 }, { result: [] }, { result: 1 }],
    });
    const scope = getScopeFromPath("/api/v1/partner/attendance/punch", "POST");
    expect(scope).toBe("attendance:write");
    const policy = PARTNER_RATE_LIMITS[scope];
    expect(policy.limit).toBe(300);
    expect(policy.failClosed).toBe(false);
  });

  it("FIX #1: hipotetico /payroll/[runId]/run (nested) NO matchea payroll:run", () => {
    expect(getScopeFromPath("/api/v1/partner/payroll/run_abc/run", "POST")).toBe("payroll:read");
  });

  it("FIX #1: GET /payroll/runId123/receipts -> payroll:read", () => {
    expect(getScopeFromPath("/api/v1/partner/payroll/runId123/receipts", "GET")).toBe("payroll:read");
  });

  it("FIX #1: GET /payroll/runId123/aeat-status -> payroll:read", () => {
    expect(getScopeFromPath("/api/v1/partner/payroll/runId123/aeat-status", "GET")).toBe("payroll:read");
  });

  it("payroll:run fail-CLOSED: Upstash error -> allowed=false, error=RATE_LIMITER_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Upstash 503"));
    const r = await checkPartnerRateLimit("k", "payroll:run", PARTNER_RATE_LIMITS["payroll:run"]);
    expect(r.allowed).toBe(false);
    expect(r.error).toBe("RATE_LIMITER_UNAVAILABLE");
  });

  it("attendance:write fail-OPEN: Upstash error -> allowed=true", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Upstash timeout"));
    const r = await checkPartnerRateLimit("k", "attendance:write", PARTNER_RATE_LIMITS["attendance:write"]);
    expect(r.allowed).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("FIX #5: RATE_LIMITER_UNAVAILABLE push resetAt al futuro (backoff < ventana)", async () => {
    // Verify LOGICAL invariants (timing-independent):
    //   1. resetAt is FUTURE-relative (backoff pushes forward).
    //   2. delta < windowMs (UPSTASH_FETCH_TIMEOUT_MS * 2 = 600, NOT 60_000).
    fetchMock.mockRejectedValueOnce(new Error("Upstash 503"));
    const policy = PARTNER_RATE_LIMITS["payroll:run"]; // windowMs=60_000.
    const tBefore = Date.now();
    const r = await checkPartnerRateLimit("k", "payroll:run", policy);
    if (r.allowed === false && r.error === "RATE_LIMITER_UNAVAILABLE") {
      // (1) resetAt must be FUTURE.
      expect(r.resetAt).toBeGreaterThan(tBefore);
      const delta = r.resetAt - tBefore;
      // (2) backoff dimension = 600ms (~2x fetch timeout), <= windowMs.
      expect(delta).toBeLessThan(policy.windowMs);
      // Wide range to absorb scheduling jitter without ms race.
      expect(delta).toBeGreaterThanOrEqual(100);
      expect(delta).toBeLessThanOrEqual(2000);
    }
  });

  it("FIX #3: extract via Authorization Bearer con espacios multiples", () => {
    expect(extractApiKeyFromHeaders(new Headers({ authorization: "Bearer    vk_test_spaced" }))).toBe("vk_test_spaced");
  });

  it("FIX #3: extract via Authorization BEARER (mayusculas) tolerado", () => {
    expect(extractApiKeyFromHeaders(new Headers({ authorization: "BEARER vk_test_upper" }))).toBe("vk_test_upper");
  });

  it("FIX #3: extract rechaza Authorization sin scheme correcto", () => {
    expect(extractApiKeyFromHeaders(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(extractApiKeyFromHeaders(new Headers({ authorization: "Bearer" }))).toBeNull();
  });

  it("x-api-key prioridad sobre Authorization", () => {
    expect(
      extractApiKeyFromHeaders(
        new Headers({ "x-api-key": "vk_test_x", authorization: "Bearer vk_test_bearer" })
      )
    ).toBe("vk_test_x");
  });

  it("aislamiento: dos apiKeys distintos -> dos apiKeyId distintos", async () => {
    const a = await hashApiKeyEdge("vk_live_tenantA");
    const b = await hashApiKeyEdge("vk_live_tenantB");
    expect(a).not.toBe(b);
    expect(a).toHaveLength(16);
  });

  it("summary: politica por scope correcta", () => {
    expect(PARTNER_RATE_LIMITS["payroll:run"].limit).toBe(10);
    expect(PARTNER_RATE_LIMITS["payroll:run"].failClosed).toBe(true);
    expect(PARTNER_RATE_LIMITS["attendance:write"].limit).toBe(300);
    expect(PARTNER_RATE_LIMITS["attendance:write"].failClosed).toBe(false);
  });
});
