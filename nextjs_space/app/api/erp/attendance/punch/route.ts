export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withTenantAuth } from "@/lib/api-key-auth";
import { AttendanceService } from "@/lib/erp/attendance-service";
import { prisma } from "@/lib/db";
import { AttendancePunchBaseSchema } from "@/lib/validation/schemas/attendance-partner";

/**
 * POST /api/erp/attendance/punch
 *
 * Endpoint interno NextAuth (empleados fichando desde la UI).
 *
 * Schema del body: importado desde `lib/validation/schemas/attendance-partner.ts`
 * (single source-of-truth, también usado por `/api/v1/partner/attendance/punch`).
 *
 * NO incluye `evidenceUrl`: la captura facial/biométrica se ha retirado por
 * cumplimiento RGPD. Ver `docs/DPIA-ASISTENCIA-GPS.md`.
 */
const PunchBodySchema = AttendancePunchBaseSchema;

// GET /api/erp/attendance/status
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userEmail = auth.user!.email;

    const employee = await prisma.employee.findFirst({
      where: { email: userEmail, tenantId },
    });

    if (!employee) {
      return NextResponse.json({ status: "OUT", message: "No vinculado como empleado" });
    }

    const lastLog = await prisma.attendance.findFirst({
      where: { employeeId: employee.id, tenantId },
      orderBy: { timestamp: "desc" },
    });

    return NextResponse.json({
      status: lastLog?.type === "IN" ? "IN" : "OUT",
      lastPunch: lastLog?.timestamp,
      employeeId: employee.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, ['attendance:read']);

// POST /api/erp/attendance/punch
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const raw = await request.json();
    const parsed = PunchBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // ── Idempotency-Key (mismo patrón, scope `attendance.punch`) ────────────
    const idempotencyKey = request.headers.get("x-idempotency-key")?.trim();
    if (idempotencyKey && idempotencyKey.length > 255) {
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
            scope: "attendance.punch",
            key: idempotencyKey,
          },
        },
      });
      if (cached) {
        return NextResponse.json({
          ...((cached.responseJson as any) ?? {}),
          idempotent: true,
        });
      }
    }

    // ── Llamada al servicio (GPS + HMAC + Impossible Travel + Rate limit + LOPDGDD Art. 88) ──
    const result = await AttendanceService.registerPunch({
      employeeId: body.employeeId,
      tenantId,
      type: body.type,
      method: body.method ?? "WEB",
      locationLat: body.locationLat,
      locationLng: body.locationLng,
      clientTimestamp: body.clientTimestamp,
    });

    // ── Persistir la respuesta bajo la clave de idempotencia ────────────────
    if (idempotencyKey) {
      try {
        await prisma.idempotencyKey.create({
          data: {
            tenantId,
            scope: "attendance.punch",
            key: idempotencyKey,
            responseJson: result,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          // Race condition: otro request ganó.
          const winner = await prisma.idempotencyKey.findUnique({
            where: {
              tenantId_scope_key: {
                tenantId,
                scope: "attendance.punch",
                key: idempotencyKey,
              },
            },
          });
          if (winner) {
            return NextResponse.json({
              ...((winner.responseJson as any) ?? {}),
              idempotent: true,
            });
          }
        }
        console.error("[attendance.punch] IdempotencyKey.create warning:", err);
      }
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    // ── Mapping RGPD-aware error → HTTP ──────────────────────────────────────
    const code = error instanceof Error ? error.message : "UNKNOWN";
    switch (code) {
      case "EMPLOYEE_NOT_FOUND":
        return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
      case "GPS_REQUIRED":
        return NextResponse.json(
          {
            error:
              "Política del tenant requiere captura de geolocalización (RGPD Art. 6.1.f). " +
              "Por favor, concede permiso de ubicación al navegador.",
          },
          { status: 400 }
        );
      case "GPS_INVALID_LAT":
      case "GPS_INVALID_LNG":
        return NextResponse.json(
          { error: "Coordenadas GPS inválidas (lat ∈ [-90,90], lng ∈ [-180,180])." },
          { status: 400 }
        );
      case "GPS_OUT_OF_RANGE":
        return NextResponse.json(
          { error: "Ubicación fuera del radio autorizado de tu centro de trabajo." },
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
              "Tu empleado no tiene una ubicación base configurada. Contacta con RRHH para configurar la geocerca de tu centro.",
          },
          { status: 400 }
        );
      case "NOTICE_NOT_ACKNOWLEDGED":
        return NextResponse.json(
          {
            error:
              "No has firmado la cláusula de tratamiento de geolocalización (LOPDGDD Art. 88). " +
              "Accede a /dashboard/rrhh/mi-asistencia para firmarla antes de marcar.",
            required_action: "/dashboard/rrhh/mi-asistencia",
          },
          { status: 403 }
        );
      default:
        return NextResponse.json({ error: code }, { status: 400 });
    }
  }
}, ['attendance:write']);
