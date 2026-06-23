export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withTenantAuth } from "@/lib/api-key-auth";

import {
  writePartnerAuditLog,
  getRequestMetadata,
  ensurePartnerApiKey,
} from "@/lib/erp/partner-audit-log";
import {
  PARTNER_RATE_LIMITS,
  type PartnerRateScope,
  hashApiKeyEdge,
  extractApiKeyFromHeaders,
} from "@/lib/rate-limit/partner-rate-limit-config";
import { inspectPartnerRateLimit } from "@/lib/rate-limit/upstash-edge-rate-limit";

// Volkern Partner API — Usage Dashboard (read-only inspection).
//
// GET /api/v1/partner/usage
//
// Auth: API Key per-tenant. Scope: audit:read (zero-config).
// Response: 200 SIEMPRE que auth pase — incluso si Upstash down.

const REPORTED_SCOPES: PartnerRateScope[] = [
  "payroll:run",
  "payroll:read",
  "attendance:write",
  "attendance:read",
  "employees:write",
  "employees:read",
];

export const GET = withTenantAuth(
  async (request, auth) => {
    const partnerErr = ensurePartnerApiKey(auth);
    if (partnerErr) return partnerErr;

    const tenantId = auth.tenant!.id;
    const apiKeyId = auth.apiKey.id;
    const apiKeyName = auth.apiKey.nombre;
    const { ipAddress, userAgent } = getRequestMetadata(request);

    // Header `x-rate-limit-key` propagado por middleware con el hash SHA-256
    // del apiKey. Lo preferimos sobre re-hashear para ahorrar 1 round-trip
    // async (~0.1-1ms en edge).
    //
    // El trim + || null protege contra dos edge-cases del upstream proxy /
    // SaaS mal integrado:
    //   1. Header presente con valor vacío (`""`) → falsy, NO usar.
    //   2. Header presente con whitespace (`"   "`) → trim lo reduce a "",
    //      falsy, NO usar.
    // Si el SaaS lo manda mal, caemos al fallback de re-hash.
    const rawPropagated = request.headers.get("x-rate-limit-key");
    const propagatedKey = rawPropagated?.trim() || null;
    let hashedId: string | null = propagatedKey;
    if (!hashedId) {
      const rawApiKey = extractApiKeyFromHeaders(request.headers);
      if (rawApiKey) hashedId = await hashApiKeyEdge(rawApiKey);
    }

    if (!hashedId) {
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_USAGE_INSPECT",
        entidad: "PayrollRunES",
        entidadId: "<api-key-missing>",
        outcome: "rejected",
        httpStatus: 400,
        rejectionReason: "api_key_missing_in_headers",
        ipAddress,
        userAgent,
        extra: { endpoint: "usage" },
      });
      return NextResponse.json(
        { error: "Header x-api-key o Authorization Bearer ausente o sin propagar." },
        { status: 400 },
      );
    }

    const inputs = REPORTED_SCOPES.map((scope) => ({
      apiKeyId: hashedId,
      scope,
      policy: PARTNER_RATE_LIMITS[scope],
    }));

    let result;
    try {
      result = await inspectPartnerRateLimit(inputs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "UNKNOWN";
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_USAGE_INSPECT",
        entidad: "PayrollRunES",
        entidadId: "<inspect-failed>",
        outcome: "error",
        httpStatus: 500,
        rejectionReason: msg,
        ipAddress,
        userAgent,
        extra: { endpoint: "usage" },
      });
      return NextResponse.json(
        { error: "Error interno al inspeccionar usage." },
        { status: 500 },
      );
    }

    const buckets: Record<string, unknown> = {};
    result.buckets.forEach((bucket, idx) => {
      buckets[REPORTED_SCOPES[idx]] = {
        limit: bucket.limit,
        used: bucket.used,
        remaining: bucket.remaining,
        resetAt: bucket.resetAt,
        resetAtISO: new Date(bucket.resetAt).toISOString(),
        windowMs: bucket.windowMs,
        failClosed: bucket.failClosed,
      };
    });

    await writePartnerAuditLog({
      tenantId,
      apiKeyId,
      apiKeyName,
      accion: "PARTNER_USAGE_INSPECT",
      entidad: "PayrollRunES",
      entidadId: hashedId,
      outcome: "success",
      httpStatus: 200,
      ipAddress,
      userAgent,
      extra: {
        endpoint: "usage",
        inspectSource: result.inspectSource,
        scopesReported: REPORTED_SCOPES.length,
      },
    });

    return NextResponse.json({
      ok: true,
      apiKeyId: hashedId,
      buckets,
      inspectedAt: result.inspectedAt,
      inspectedAtISO: new Date(result.inspectedAt).toISOString(),
      inspectSource: result.inspectSource,
    });
  },
  { requiredScopes: ["audit:read"] },
);
