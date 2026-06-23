import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { ApiKeyAuthResult } from "@/lib/api-key-auth";

/**
 * Volkern Partner API — Audit Log + Auth helpers compartidos.
 *
 * DRY: estos helpers estaban duplicados en 5 rutas (`app/api/v1/partner/**`).
 * Mantener un único punto de verdad:
 *   - `writePartnerAuditLog`     → registro RGPD Art. 30 obligatorio.
 *   - `getRequestMetadata`       → IP + User-Agent de NextRequest.
 *   - `ensurePartnerApiKey`      → guard explícito: rechaza sesiones internas
 *                                   en rutas exclusivas de software B2B externo.
 *
 * RGPD Art. 30: el log NUNCA debe bloquear la operativa principal. Política
 * best-effort con `console.error` ante fallos (silent-fail a nivel de negocio).
 */

/**
 * Acciones de dominio específicas de Volkern Partner API (RGPD Art. 30).
 * Mantener un union type estricto previene typos y facilita refactors.
 */
export type PartnerAuditAction =
  | "PARTNER_ATTENDANCE_PUNCH"
  | "PARTNER_EMPLOYEE_LOOKUP"
  | "PARTNER_EMPLOYEE_UPSERT"
  | "PARTNER_PAYROLL_RUN"
  | "PARTNER_PAYROLL_RECEIPTS"
  | "PARTNER_PAYROLL_AEAT_STATUS"
  | "PARTNER_PAYROLL_AEAT_SUBMIT"
  | "PARTNER_USAGE_INSPECT";

export type AuditEntity =
  | "Attendance"
  | "Employee"
  | "PayrollRunES"
  | "PayrollRecordES";

export type AuditOutcome = "success" | "rejected" | "error";

export interface PartnerAuditLogOpts<
  TExtra extends Record<string, unknown> = Record<string, never>,
> {
  /** Tenant sobre el que actúa la API key. */
  tenantId: string;
  /** `ApiKey.id` (cuál key se ha usado). */
  apiKeyId: string;
  /** `ApiKey.nombre` (etiqueta humana para la descripción). */
  apiKeyName: string | null;
  /** Acción RGPD del evento. */
  accion: PartnerAuditAction;
  /** Tipo de entidad afectada. */
  entidad: AuditEntity;
  /** Id del recurso afectado (attendanceId, employeeId, runId, etc.). */
  entidadId: string;
  /** Resultado del intento. */
  outcome: AuditOutcome;
  /** Status HTTP de la respuesta (200, 201, 400, 401, 403, 409, 422, 500). */
  httpStatus: number;
  /** Motivo textual cuando outcome==="rejected" | "error". */
  rejectionReason?: string;
  /** IP del cliente (proxy-aware). */
  ipAddress: string | null;
  /** User-Agent del cliente. */
  userAgent: string | null;
  /**
   * Campos específicos del dominio (type/method, anomalyType, runId/period,
   * externalEmployeeId, etc.). Se vuelcan íntegros en `AuditLog.metadata`
   * (JSONB en Prisma) para queries RGPD estructuradas, mientras la
   * `descripcion` mantiene un resumen human-readable.
   */
  extra?: TExtra;
}

/**
 * Escribe un AuditLog RGPD Art. 30 obligatorio para la llamada partner.
 *
 * Política best-effort: cualquier error al escribir el log es silencioso a
 * nivel de negocio (sólo se loggea vía `console.error`). El objetivo es que
 * un fallo en la tabla de auditoría NUNCA bloquee la operativa SaaS principal.
 *
 * Formato de la fila:
 *   - `descripcion`: `apiKey=<id> (<name>) outcome=<success|rejected|error>
 *                     status=<http> reason=<rejectionReason>`
 *   - `metadata`:   JSON.stringify(extra) cuando se proporciona.
 */
export async function writePartnerAuditLog<
  TExtra extends Record<string, unknown> = Record<string, unknown>,
>(opts: PartnerAuditLogOpts<TExtra>): Promise<void> {
  try {
    const baseDesc = `apiKey=${opts.apiKeyId} (${
      opts.apiKeyName ?? "?"
    }) outcome=${opts.outcome} status=${opts.httpStatus}`;
    const reasonSuffix = opts.rejectionReason
      ? ` reason=${opts.rejectionReason}`
      : "";

    await prisma.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: null, // Partner API no tiene User UI asociado
        accion: opts.accion,
        entidad: opts.entidad,
        entidadId: opts.entidadId,
        descripcion: baseDesc + reasonSuffix,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        ...(opts.extra
          ? { metadata: opts.extra as Prisma.InputJsonValue }
          : {}),
      },
    });
  } catch (auditErr) {
    logger.warn(
      { err: auditErr, accion: opts.accion, tenantId: opts.tenantId },
      "[Partner API AuditLog] failed writing log",
    );
  }
}

/**
 * Extrae IP + User-Agent de un NextRequest respetando cabeceras
 * de proxy inverso (x-forwarded-for[0], x-real-ip) — el orden sigue el
 * mismo patrón que el resto del codebase.
 */
export function getRequestMetadata(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null,
    userAgent: request.headers.get("user-agent"),
  };
}

/**
 * Guardia explícito para rutas exclusivas de software B2B externo:
 * impide que un usuario interno con sesión NextAuth (o JWT) consuma las
 * rutas Partner. `withTenantAuth` acepta ambos métodos de auth; aquí
 * exigimos `authMethod === "apikey"` por contrato de producto (RGPD + SaaS).
 *
 * Uso:
 *   const authErr = ensurePartnerApiKey(auth);
 *   if (authErr) return authErr;
 */
export function ensurePartnerApiKey(
  auth: ApiKeyAuthResult,
): NextResponse | null {
  if (auth.authMethod !== "apikey" || !auth.apiKey) {
    return NextResponse.json(
      {
        error:
          "Este endpoint requiere autenticación por API Key (software externo B2B integrado). " +
          "Las sesiones internas (NextAuth/JWT) no están autorizadas aquí.",
      },
      { status: 401 },
    );
  }
  return null;
}
