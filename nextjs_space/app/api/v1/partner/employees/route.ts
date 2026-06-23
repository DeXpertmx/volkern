export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withTenantAuth } from "@/lib/api-key-auth";
import { prisma } from "@/lib/db";
import {
  PartnerEmployeeUpsertSchema,
  PartnerEmployeeLookupSchema,
  sanitizeEmployeeForPartner,
  PARTNER_EMPLOYEES_SCHEMA_VERSION,
} from "@/lib/validation/schemas/partner-employees";

import { writePartnerAuditLog, getRequestMetadata, ensurePartnerApiKey } from "@/lib/erp/partner-audit-log";
// ════════════════════════════════════════════════════════════════════════════
// Volkern Partner API — Phase 1.5 — Employees pass-through
//
// GET  /api/v1/partner/employees?externalEmployeeId=X[,Y,Z]  (read)
// POST /api/v1/partner/employees                              (upsert)
//
// Auth    : API Key per-tenant. Header `x-api-key` o `Authorization: Bearer vk_...`.
//           Sesiones NextAuth rechazadas explícitamente (no son SaaS externos).
// Scopes  : `employees:read`  (GET)
//           `employees:write` (POST)
// Compliance:
//   - Cada llamada escribe `AuditLog` accion=PARTNER_EMPLOYEE_LOOKUP |
//     PARTNER_EMPLOYEE_UPSERT — RGPD Art. 30 (registro de actividades).
//   - POST es idempotente vía x-idempotency-key (TTL 24h, scope namespace-
//     separado `partner.employees.upsert` — NO choca con endpoints internos).
//   - Data minimization (RGPD Art. 5): nunca se devuelven salaryEncrypted /
//     governmentIdEncrypted / bankDetailsEncrypted al partner. Solo datos
//     operativos.
//
// PATCH semantics:
//   - Key ausente   → no tocar el campo (skip).
//   - Key con `null`→ limpiar el campo (clear) — solo aplica a columnas nullable.
//   - Key con valor → asignar valor.
//   Esto se aplica SOLO en el branch UPDATE; el branch CREATE usa defaults
//   explícitos (role=OPERATOR, department=GENERAL, isActive=true, hiringDate=now).
// ════════════════════════════════════════════════════════════════════════════

const IDEMPOTENCY_SCOPE = "partner.employees.upsert";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────







/**
 * Verifica y cachea una respuesta por idempotency-key (RFC Stripe-style).
 * Devuelve `{ cached: true, response }` si la clave ya estaba usada (hit),
 * o `{ cached: false }` para que el caller prosiga con la operación.
 */
async function checkIdempotencyCache(opts: {
  tenantId: string;
  idempotencyKey: string | null;
}): Promise<{ cached: false } | { cached: true; response: unknown }> {
  if (!opts.idempotencyKey) return { cached: false };
  const cached = await prisma.idempotencyKey.findUnique({
    where: {
      tenantId_scope_key: {
        tenantId: opts.tenantId,
        scope: IDEMPOTENCY_SCOPE,
        key: opts.idempotencyKey,
      },
    },
  });
  if (!cached) return { cached: false };
  return { cached: true, response: cached.responseJson ?? {} };
}

/**
 * Persiste la respuesta bajo la idempotency-key.
 *
 * Devuelve:
 *   - `{ ok }`                  → cacheado correctamente.
 *   - `{ race, response }`      → otro POST con la misma key ganó la carrera
 *     (lock-free P2002 recovery). El caller debe devolver la respuesta del
 *     winner al partner con `idempotent: true`. NOTA: el intent perdedor
 *     ya habrá aplicado la mutation a DB, pero descartamos su response por
 *     contrato (la respuesta del winner es la "correcta" del endpoint).
 *   - `{ degraded }`            → error NO-P2002 al escribir el cache (FK,
 *     timeout, etc.). El caller emite header `X-Idempotency-Degraded: true`
 *     para que el partner sepa que reintentos podrían causar duplicate-write
 *     (aunque el upsert es idempotente vía composite unique, así que en
 *     práctica es seguro).
 */
async function persistIdempotencyCache(opts: {
  tenantId: string;
  idempotencyKey: string;
  response: unknown;
}): Promise<
  | { ok: true }
  | { race: true; response: unknown }
  | { degraded: true }
> {
  try {
    await prisma.idempotencyKey.create({
      data: {
        tenantId: opts.tenantId,
        scope: IDEMPOTENCY_SCOPE,
        key: opts.idempotencyKey,
        responseJson: opts.response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const winner = await prisma.idempotencyKey.findUnique({
        where: {
          tenantId_scope_key: {
            tenantId: opts.tenantId,
            scope: IDEMPOTENCY_SCOPE,
            key: opts.idempotencyKey,
          },
        },
      });
      if (winner) {
        return { race: true, response: winner.responseJson ?? {} };
      }
    }
    // No-P2002 error: log loud + surface degraded flag. El upsert sigue
    // siendo idempotente por el composite unique (tenantId, externalEmployeeId),
    // pero el reintento del partner NO devolverá el cache.
    console.warn(
      `[partner.employees] IdempotencyKey.create degraded (non-P2002):`,
      err
    );
    return { degraded: true };
  }
}

/**
 * Construye `updateData` aplicando PATCH semantics estrictas:
 *   - key ausente → skip.
 *   - key con `null` → clear (solo aplica a columnas nullable).
 *   - key con valor → set (con transform opcional).
 *
 * Usamos `in` para distinguir "ausente" de "enviado con null" porque tras
 * Zod `optional().nullable()`, `undefined` significa ausente y `null`
 * significa enviado-con-null. La semántica skip/clear/set está documentada
 * en §1.9.2 del PARTNER-API.md.
 */
function buildPatchData(
  body: PartnerEmployeeUpsertInput
): Prisma.EmployeeUpdateInput {
  const data: Prisma.EmployeeUpdateInput = {};
  const setIfPresent = <K extends keyof Prisma.EmployeeUpdateInput>(
    field: K,
    raw: unknown,
    transform?: (v: any) => any
  ) => {
    // `field` debe estar en el body — chequeo sobre el input raw, no sobre
    // body parsed (que colapsa undefined/null).
    if (!(field in body)) return;
    const v = (body as any)[field];
    if (v === undefined) return; // Defensive: aunque `in` devolviera true.
    if (v === null) {
      (data as any)[field] = null;
    } else if (transform) {
      (data as any)[field] = transform(v);
    } else {
      (data as any)[field] = v;
    }
  };
  setIfPresent("fullName", body.fullName);
  setIfPresent("email", body.email);
  setIfPresent("mobilePhone", body.mobilePhone);
  setIfPresent("jobTitle", body.jobTitle);
  setIfPresent("role", body.role);
  setIfPresent("department", body.department);
  setIfPresent("hiringDate", body.hiringDate, (v) => new Date(v));
  setIfPresent("isActive", body.isActive);
  setIfPresent("baseGPSLat", body.baseGPSLat);
  setIfPresent("baseGPSLng", body.baseGPSLng);
  return data;
}

// ─── GET ────────────────────────────────────────────────────────────────────

export const GET = withTenantAuth(
  async (request, auth) => {
    if (auth.authMethod !== "apikey" || !auth.apiKey) {

      const partnerErr = ensurePartnerApiKey(auth);

      if (partnerErr) return partnerErr;
    }

    const tenantId = auth.tenant!.id;
    const apiKeyId = auth.apiKey.id;
    const apiKeyName = auth.apiKey.nombre;
    const { ipAddress, userAgent } = getRequestMetadata(request);

    let externalEmployeeIdForAudit = "UNKNOWN";

    try {
      const url = new URL(request.url);
      const raw = {
        externalEmployeeId: url.searchParams.get("externalEmployeeId") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
      };
      const parsed = PartnerEmployeeLookupSchema.safeParse(raw);
      if (!parsed.success) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_EMPLOYEE_LOOKUP",
          outcome: "rejected",
          httpStatus: 400,
          rejectionReason: "zod_validation_failed",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          { error: "Parámetros inválidos", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { externalEmployeeId, limit, cursor } = parsed.data;

      // Lookup por externalEmployeeId (single o bulk).
      if (externalEmployeeId !== undefined) {
        const idList = Array.isArray(externalEmployeeId)
          ? externalEmployeeId
          : [externalEmployeeId];
        externalEmployeeIdForAudit = idList.join(",");
        const employees = await prisma.employee.findMany({
          where: {
            tenantId,
            externalEmployeeId: { in: idList },
          },
          orderBy: { updatedAt: "desc" },
        });
        const byExternalId = new Map(
          employees.map((e) => [
            e.externalEmployeeId ?? "__null__",
            sanitizeEmployeeForPartner(e),
          ])
        );
        const data = idList.map(
          (id) =>
            byExternalId.get(id) ?? {
              externalEmployeeId: id,
              notFound: true,
            }
        );

        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_EMPLOYEE_LOOKUP",
          outcome: "success",
          httpStatus: 200,
          ipAddress,
          userAgent,
        });
        return NextResponse.json({
          schemaVersion: PARTNER_EMPLOYEES_SCHEMA_VERSION,
          count: data.filter((d) => !("notFound" in d)).length,
          data,
        });
      }

      // Listado paginado: solo devuelve empleados sincronizados con un
      // partner externo (externalEmployeeId != null). Empleados legacy
      // (creados vía UI interna) NO aparecen aquí. Intencional.
      const employees = await prisma.employee.findMany({
        where: { tenantId, externalEmployeeId: { not: null } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: limit + 1,
        ...(cursor
          ? {
              cursor: { id: cursor },
              skip: 1,
            }
          : {}),
      });
      const hasNext = employees.length > limit;
      const page = employees.slice(0, limit);
      const nextCursor = hasNext ? page[page.length - 1].id : null;

      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_EMPLOYEE_LOOKUP",
        outcome: "success",
        httpStatus: 200,
        ipAddress,
        userAgent,
      });
      return NextResponse.json({
        schemaVersion: PARTNER_EMPLOYEES_SCHEMA_VERSION,
        count: page.length,
        data: page.map(sanitizeEmployeeForPartner),
        nextCursor,
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "UNKNOWN";
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_EMPLOYEE_LOOKUP",
        outcome: "error",
        httpStatus: 500,
        rejectionReason: reason,
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { error: "Error interno al consultar empleados." },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ["employees:read"] }
);

// ─── POST (upsert idempotente) ──────────────────────────────────────────────

export const POST = withTenantAuth(
  async (request, auth) => {
    if (auth.authMethod !== "apikey" || !auth.apiKey) {

      const partnerErr = ensurePartnerApiKey(auth);

      if (partnerErr) return partnerErr;
    }

    const tenantId = auth.tenant!.id;
    const apiKeyId = auth.apiKey.id;
    const apiKeyName = auth.apiKey.nombre;
    const { ipAddress, userAgent } = getRequestMetadata(request);

    let externalEmployeeIdForAudit = "UNKNOWN";

    try {
      const idempotencyKey =
        request.headers.get("x-idempotency-key")?.trim() ?? null;
      if (idempotencyKey && idempotencyKey.length > 255) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_EMPLOYEE_UPSERT",
          outcome: "rejected",
          httpStatus: 400,
          rejectionReason: "idempotency_key_too_long",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          { error: "Idempotency-Key demasiado largo (máx 255 chars)." },
          { status: 400 }
        );
      }

      // Zod validation
      const raw = await request.json();
      const parsed = PartnerEmployeeUpsertSchema.safeParse(raw);
      if (!parsed.success) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_EMPLOYEE_UPSERT",
          outcome: "rejected",
          httpStatus: 400,
          rejectionReason: "zod_validation_failed",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          { error: "Datos inválidos", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      const body = parsed.data;
      externalEmployeeIdForAudit = body.externalEmployeeId;

      // Cache hit por idempotency-key
      const cacheCheck = await checkIdempotencyCache({
        tenantId,
        idempotencyKey,
      });
      if (cacheCheck.cached) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_EMPLOYEE_UPSERT",
          outcome: "success",
          httpStatus: 200,
          rejectionReason: "idempotency_cache_hit",
          ipAddress,
          userAgent,
        });
        return NextResponse.json({
          ...((cacheCheck.response as object) ?? {}),
          idempotent: true,
        });
      }

      // Lookup del empleado actual por (tenantId, externalEmployeeId).
      const existing = await prisma.employee.findUnique({
        where: {
          tenantId_externalEmployeeId: {
            tenantId,
            externalEmployeeId: body.externalEmployeeId,
          },
        },
      });

      // PATCH semantics estrictas: solo campos enviados. `null` = clear.
      const patchData = buildPatchData(body);

      let employee;
      let created: boolean;
      const headers: Record<string, string> = {};

      if (existing) {
        employee = await prisma.employee.update({
          where: { id: existing.id },
          data: patchData,
        });
        created = false;
      } else {
        // CREATE path con defaults explícitos del handler (NO del Zod schema).
        // Importante: usamos `body.x ?? default` solo en CREATE; en UPDATE
        // un campo ausente significa skip (por eso buildPatchData distingue).
        const createData: Prisma.EmployeeCreateInput = {
          tenantId,
          externalEmployeeId: body.externalEmployeeId,
          fullName: body.fullName,
          email: body.email ?? null,
          mobilePhone: body.mobilePhone ?? null,
          jobTitle: body.jobTitle ?? null,
          role: body.role ?? "OPERATOR",
          department: body.department ?? "GENERAL",
          hiringDate: body.hiringDate
            ? new Date(body.hiringDate)
            : new Date(),
          isActive: body.isActive ?? true,
          baseGPSLat: body.baseGPSLat ?? null,
          baseGPSLng: body.baseGPSLng ?? null,
        };
        try {
          employee = await prisma.employee.create({ data: createData });
          created = true;
        } catch (err) {
          // P2002 en (tenantId, externalEmployeeId) → carrera entre dos POSTs
          // concurrentes del mismo partner. Recuperamos el ganador y aplicamos
          // el patch (la intención del segundo POST puede ser distinta).
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            const winner = await prisma.employee.findUnique({
              where: {
                tenantId_externalEmployeeId: {
                  tenantId,
                  externalEmployeeId: body.externalEmployeeId,
                },
              },
            });
            if (!winner) throw err; // No esperado; re-lanzamos.
            employee = await prisma.employee.update({
              where: { id: winner.id },
              data: patchData,
            });
            created = false;
          } else {
            throw err;
          }
        }
      }

      const sanitized = sanitizeEmployeeForPartner(employee);
      const responseBody = {
        schemaVersion: PARTNER_EMPLOYEES_SCHEMA_VERSION,
        created,
        employee: sanitized,
      };

      // Persistir cache de idempotencia (si procede).
      if (idempotencyKey) {
        const persist = await persistIdempotencyCache({
          tenantId,
          idempotencyKey,
          response: responseBody,
        });
        if (persist.race) {
          await writePartnerAuditLog({
            tenantId,
            apiKeyId,
            apiKeyName,
            accion: "PARTNER_EMPLOYEE_UPSERT",
            outcome: "success",
            httpStatus: 200,
            rejectionReason: "p2002_race_recovery",
            ipAddress,
            userAgent,
          });
          return NextResponse.json({
            ...((persist.response as object) ?? {}),
            idempotent: true,
          });
        }
        if (persist.degraded) {
          headers["X-Idempotency-Degraded"] = "true";
        }
      }

      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_EMPLOYEE_UPSERT",
        outcome: "success",
        httpStatus: 200,
        rejectionReason: created ? "create" : "update",
        ipAddress,
        userAgent,
      });
      return NextResponse.json(responseBody, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      let httpStatus = 400;
      switch (code) {
        case "P2002":
          httpStatus = 409;
          break;
        default:
          httpStatus = 500;
      }
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_EMPLOYEE_UPSERT",
        outcome: "error",
        httpStatus,
        rejectionReason: code,
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        {
          error:
            code === "P2002"
              ? "Conflicto de unicidad al guardar el empleado. Reintenta con el mismo x-idempotency-key."
              : "Error interno al guardar el empleado partner.",
          reason: code,
        },
        { status: httpStatus }
      );
    }
  },
  { requiredScopes: ["employees:write"] }
);
