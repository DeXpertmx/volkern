export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withTenantAuth } from "@/lib/api-key-auth";
import { prisma } from "@/lib/db";
import { PARTNER_PAYROLL_SCHEMA_VERSION } from "@/lib/validation/schemas/partner-payroll";

import { writePartnerAuditLog, getRequestMetadata, ensurePartnerApiKey } from "@/lib/erp/partner-audit-log";
// ════════════════════════════════════════════════════════════════════════════
// Volkern Partner API — Phase 2 — AEAT submission status
//
// GET /api/v1/partner/payroll/{runId}/aeat-status
//
// Auth    : API Key per-tenant. Scope `payroll:read`.
// Compliance: AuditLog RGPD Art. 30 en cada llamada.
// Nota V1  : El "AEAT status" se reconstruye desde los `fiscalStatus`
//            almacenados en PayrollRecordES tras el envío síncrono de run.
//            Una integración con el worker asíncrono AEAT requerirá
//            refactor en V2.5 (polling o webhook).
// ════════════════════════════════════════════════════════════════════════════







// ─── Handler ────────────────────────────────────────────────────────────────

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

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const segments = pathname.split("/");
    const idx = segments.indexOf("payroll");
    const runId = idx >= 0 ? segments[idx + 1] : null;

    if (!runId) {
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        outcome: "rejected",
        entidadId: "PENDING",
        httpStatus: 400,
        rejectionReason: "missing_run_id",
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { error: "runId faltante en path." },
        { status: 400 }
      );
    }

    try {
      const run = await prisma.payrollRunES.findUnique({
        where: { id: runId },
        include: {
          records: {
            select: {
              id: true,
              employeeId: true,
              status: true,
              fiscalStatus: true,
              sealedAt: true,
              employee: {
                select: { externalEmployeeId: true },
              },
            },
          },
        },
      });

      if (!run || run.tenantId !== tenantId) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          outcome: "rejected",
          entidadId: runId,
          httpStatus: 404,
          rejectionReason: "run_not_found",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          { error: "runId no encontrado en este tenant." },
          { status: 404 }
        );
      }

      // Distribución AEAT-status por record.
      const distribution = {
        PENDING: 0,
        SIGNED: 0,
        ARCHIVED: 0,
      } as Record<string, number>;
      for (const rec of run.records) {
        const key = rec.fiscalStatus ?? "PENDING";
        distribution[key] = (distribution[key] ?? 0) + 1;
      }

      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        outcome: "success",
        entidadId: run.id,
        httpStatus: 200,
        ipAddress,
        userAgent,
      });

      return NextResponse.json({
        schemaVersion: PARTNER_PAYROLL_SCHEMA_VERSION,
        run: {
          id: run.id,
          period: run.period,
          status: run.status,
          totalRecords: run.totalRecords,
          acceptedCount: run.acceptedCount,
          rejectedCount: run.rejectedCount,
          errorCount: run.errorCount,
          lastError: run.lastError,
          createdAt: run.createdAt.toISOString(),
          submittedAt: run.submittedAt?.toISOString() ?? null,
        },
        aeat: {
          distribution,
          // Estado humano-friendly del run completo.
          summary:
            run.errorCount > 0
              ? "PARTIAL_ERRORS"
              : distribution.SIGNED === run.records.length
              ? "ALL_ACCEPTED"
              : distribution.PENDING === run.records.length
              ? "ALL_PENDING"
              : "MIXED",
        },
        records: run.records.map((r: any) => ({
          externalEmployeeId:
            r.employee?.externalEmployeeId ?? "?",
          payrollRecordId: r.id,
          status: r.status,
          fiscalStatus: r.fiscalStatus,
          sealedAt: r.sealedAt?.toISOString() ?? null,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "UNKNOWN";
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        outcome: "error",
        entidadId: runId,
        httpStatus: 500,
        rejectionReason: msg,
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { error: "Error interno al consultar estado AEAT." },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ["payroll:read"] }
);
