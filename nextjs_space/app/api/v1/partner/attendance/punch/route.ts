export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withTenantAuth } from "@/lib/api-key-auth";
import { AttendanceService } from "@/lib/erp/attendance-service";
import { prisma } from "@/lib/db";
import { PartnerAttendancePunchSchema } from "@/lib/validation/schemas/attendance-partner";

import { writePartnerAuditLog, getRequestMetadata, ensurePartnerApiKey } from "@/lib/erp/partner-audit-log";
/**
 * POST /api/v1/partner/attendance/punch
 *
 * Para Restauranteros SaaS (Volkern Hostelería) que registran marcajes
 * de sus empleados desde su propio software.
 *
 * Auth: API Key per-tenant. Header `x-api-key` o
 *   `Authorization: Bearer vk_live_...` (extraído por `extractApiKeyFromRequest`).
 * Scope requerido: `attendance:write` (ver `lib/api-keys.ts`).
 *
 * Body: schema importado desde `lib/validation/schemas/attendance-partner.ts`
 *   (single source-of-truth con endpoint interno NextAuth).
 *   `employeeId` es el Volkern `Employee.id`. Para mapear
 *   externalEmployeeId (SaaS externo) → `Employee.id`, consultar
 *   `GET /api/v1/partner/employees` cuando esté implementado (Phase 1.5).
 *
 * Idempotency: header `x-idempotency-key` opcional (RFC Stripe-style, TTL 24h).
 *   Scope interno: `partner.attendance.punch` (no choca con `attendance.punch`
 *   del endpoint interno NextAuth).
 *
 * Compliance: cada llamada genera un `AuditLog` con `accion=PARTNER_ATTENDANCE_PUNCH`,
 *   cumplimiento RGPD Art. 30 (registro de actividades de tratamiento).
 *   El endpoint interno NO escribe AuditLog por diseño — solo el endpoint
 *   partner (acceso externo) deja rastro auditable.
 *
 * Response: 200 + `{ ok, id, isAnomaly, anomalyType, message, idempotent? }`.
 *
 * Diferencia clave vs `/api/erp/attendance/punch`:
 *   - Rechaza explícitamente si la auth llegó por sesión (no API Key) para
 *     evitar exponer el endpoint a empleados internos con sesión NextAuth
 *     que no deberían acceder al canal partner.
 *   - Scope de idempotency namespace-separado.
 *   - `method` default `PARTNER_APP` (no `WEB`).
 *   - AuditLog escrito en cada llamada (éxito + errores mapeados).
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────





// ─── Handler ─────────────────────────────────────────────────────────────────

export const POST = withTenantAuth(
  async (request, auth) => {
    // ── Guards de contrato partner ─────────────────────────────────────────────
    // El endpoint partner solo acepta auth vía API Key del SaaS externo.
    // Las sesiones NextAuth (empleados internos) NO están autorizadas aquí.
    if (auth.authMethod !== "apikey" || !auth.apiKey) {
      return NextResponse.json(
        {
          error:
            "Este endpoint requiere autenticación por API Key (un software externo " +
            "integrado). Las sesiones de usuario NextAuth no están autorizadas aquí.",
        },
        { status: 401 }
      );
    }

    const apiKeyId = auth.apiKey.id;
    const apiKeyName = auth.apiKey.nombre;
    const tenantId = auth.tenant!.id;
    const { ipAddress, userAgent } = getRequestMetadata(request);

    // Capturamos employeeId/type/method AQUI (fuera del try) para que
    // el catch path tenga datos válidos para el AuditLog sin recurrir a
    // headers potencialmente maliciosos del cliente.
    let employeeIdForAudit: string = "UNKNOWN";
    let typeForAudit: "IN" | "OUT" = "IN";
    let methodForAudit = "UNKNOWN";
    let attendanceId: string | null = null;
    let isAnomaly = false;
    let anomalyType: string | null = null;

    try {
      const raw = await request.json();
      const parsed = PartnerAttendancePunchSchema.safeParse(raw);
      if (!parsed.success) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          outcome: "rejected",
          httpStatus: 400,
          rejectionReason: "zod_validation_failed",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          {
            error: "Datos inválidos",
            details: parsed.error.flatten(),
          },
          { status: 400 }
        );
      }
      const body = parsed.data;
      // Tras Zod OK, propagamos employeeId/type/method al audit log.
      employeeIdForAudit = body.employeeId;
      typeForAudit = body.type;
      methodForAudit = body.method ?? "PARTNER_APP";

      // ── Idempotency-Key ────────────────────────────────────────────────────
      const idempotencyKey = request.headers.get("x-idempotency-key")?.trim();
      if (idempotencyKey && idempotencyKey.length > 255) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
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
      if (idempotencyKey) {
        const cached = await prisma.idempotencyKey.findUnique({
          where: {
            tenantId_scope_key: {
              tenantId,
              scope: "partner.attendance.punch",
              key: idempotencyKey,
            },
          },
        });
        if (cached) {
          // Cache hit ↔ no es un punch nuevo aún así registramos el acceso
          // (RGPD Art. 30 — toda actividad de partner debe quedar registrada).
          await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
            outcome: "success",
            httpStatus: 200,
            rejectionReason: "idempotency_cache_hit",
            ipAddress,
            userAgent,
          });
          return NextResponse.json({
            ...((cached.responseJson as any) ?? {}),
            idempotent: true,
          });
        }
      }

      // ── Llamada al servicio (GPS + HMAC + Impossible Travel + Rate limit) ──
      const result = await AttendanceService.registerPunch({
        employeeId: body.employeeId,
        tenantId,
        type: body.type,
        method: body.method ?? "PARTNER_APP",
        locationLat: body.locationLat,
        locationLng: body.locationLng,
        clientTimestamp: body.clientTimestamp,
      });

      attendanceId = result.id;
      isAnomaly = result.isAnomaly;
      anomalyType = result.anomalyType;

      // ── Persistir la respuesta bajo la clave de idempotencia ────────────────
      if (idempotencyKey) {
        try {
          await prisma.idempotencyKey.create({
            data: {
              tenantId,
              scope: "partner.attendance.punch",
              key: idempotencyKey,
              responseJson: result,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            const winner = await prisma.idempotencyKey.findUnique({
              where: {
                tenantId_scope_key: {
                  tenantId,
                  scope: "partner.attendance.punch",
                  key: idempotencyKey,
                },
              },
            });
            if (winner) {
              await writePartnerAuditLog({
                tenantId,
                apiKeyId,
                apiKeyName,
                outcome: "success",
                httpStatus: 200,
                rejectionReason: "p2002_race_recovery",
                ipAddress,
                userAgent,
              });
              return NextResponse.json({
                ...((winner.responseJson as any) ?? {}),
                idempotent: true,
              });
            }
          }
          console.error(
            "[partner.attendance.punch] IdempotencyKey.create warning:",
            err
          );
        }
      }

      // AuditLog éxito (RGPD Art. 30)
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        outcome: "success",
        attendanceId,
        isAnomaly,
        anomalyType,
        httpStatus: 200,
        ipAddress,
        userAgent,
      });

      return NextResponse.json(result);
    } catch (error: unknown) {
      // ── Mapping RGPD-aware error → HTTP ──────────────────────────────────────
      const code = error instanceof Error ? error.message : "UNKNOWN";
      let httpStatus = 400;
      switch (code) {
        case "EMPLOYEE_NOT_FOUND":
          httpStatus = 404;
          break;
        case "NOTICE_NOT_ACKNOWLEDGED":
          httpStatus = 403;
          break;
        case "RATE_LIMITED":
          httpStatus = 429;
          break;
      }

      // AuditLog error (RGPD Art. 30 — incluye rechazo regulatorio)
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        outcome: "error",
        attendanceId,
        isAnomaly,
        anomalyType,
        httpStatus,
        rejectionReason: code,
        ipAddress,
        userAgent,
      });

      switch (code) {
        case "EMPLOYEE_NOT_FOUND":
          return NextResponse.json(
            {
              error:
                "Empleado no encontrado en este tenant (verifica el employeeId).",
            },
            { status: 404 }
          );
        case "GPS_REQUIRED":
          return NextResponse.json(
            {
              error:
                "Política del tenant requiere captura de geolocalización (RGPD Art. 6.1.f). " +
                "Envía locationLat y locationLng desde el dispositivo del empleado.",
            },
            { status: 400 }
          );
        case "GPS_INVALID_LAT":
        case "GPS_INVALID_LNG":
          return NextResponse.json(
            {
              error:
                "Coordenadas GPS inválidas (lat ∈ [-90,90], lng ∈ [-180,180]).",
            },
            { status: 400 }
          );
        case "GPS_OUT_OF_RANGE":
          return NextResponse.json(
            {
              error:
                "Ubicación fuera del radio autorizado del centro de trabajo del empleado.",
            },
            { status: 400 }
          );
        case "RATE_LIMITED":
          return NextResponse.json(
            {
              error:
                "Espera unos segundos antes de volver a marcar. Política anti-doble-tap del tenant.",
            },
            { status: 429, headers: { "retry-after": "30" } }
          );
        case "NO_BASE_LOCATION":
          return NextResponse.json(
            {
              error:
                "El empleado no tiene una ubicación base configurada. Contacta con RRHH para configurar la geocerca de su centro.",
            },
            { status: 400 }
          );
        case "NOTICE_NOT_ACKNOWLEDGED":
          // 403 Forbidden (RFC 7231 §6.5.3): regla RGPD/LOPDGDD Art. 88.
          return NextResponse.json(
            {
              error:
                "El empleado no ha firmado la cláusula de tratamiento de geolocalización (LOPDGDD Art. 88). " +
                "Accede a /dashboard/rrhh/mi-asistencia para firmarla antes de marcar.",
              required_action: "/dashboard/rrhh/mi-asistencia",
            },
            { status: 403 }
          );
        default:
          return NextResponse.json({ error: code }, { status: 400 });
      }
    }
  },
  { requiredScopes: ["attendance:write"] }
);
