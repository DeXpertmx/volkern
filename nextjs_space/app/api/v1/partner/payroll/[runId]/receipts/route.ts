export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withTenantAuth } from "@/lib/api-key-auth";
import { prisma } from "@/lib/db";
import {
  PARTNER_PAYROLL_SCHEMA_VERSION,
} from "@/lib/validation/schemas/partner-payroll";

import { writePartnerAuditLog, getRequestMetadata, ensurePartnerApiKey } from "@/lib/erp/partner-audit-log";
// ════════════════════════════════════════════════════════════════════════════
// Volkern Partner API — Phase 2 — Receipts
//
// GET /api/v1/partner/payroll/{runId}/receipts
//
// Auth    : API Key per-tenant. Scope `payroll:read` (reusa el scope interno).
// Compliance: RGPD Art. 5 §1.c — solo totales + líneas conceptuales.
//             NUNCA se devuelve salary*Encrypted, governmentIdEncrypted,
//             bankDetailsEncrypted, ni campos privados del empleado.
// ════════════════════════════════════════════════════════════════════════════







// ─── Sanitización RGPD-aware ──────────────────────────────────────────────

interface SanitizedReceipt {
  externalEmployeeId: string;
  payrollRecordId: string;
  period: string;
  status: string;
  fiscalStatus: string;
  totals: {
    gross: string;
    net: string;
    socialSecurityWorker: string;
    socialSecurityEmp: string;
    irpf: string;
  };
  auditHash: string | null;
  chainedHash: string | null;
  sealedAt: string | null;
  lines: Array<{
    conceptCode: string;
    conceptType: string;
    amount: string;
    taxable: boolean;
    cotizable: boolean;
    isOverride: boolean;
    notes: string | null;
  }>;
}

function sanitizeReceipt(
  record: any,
  lines: any[],
  externalEmployeeId: string
): SanitizedReceipt {
  return {
    externalEmployeeId,
    payrollRecordId: record.id,
    period: record.period,
    status: record.status,
    fiscalStatus: record.fiscalStatus,
    totals: {
      gross: record.grossTotal?.toString() ?? "0",
      net: record.netTotal?.toString() ?? "0",
      socialSecurityWorker:
        record.socialSecurityWorker?.toString() ?? "0",
      socialSecurityEmp:
        record.socialSecurityEmp?.toString() ?? "0",
      irpf: record.irpfTotal?.toString() ?? "0",
    },
    auditHash: record.auditHash ?? null,
    chainedHash: record.chainedHash ?? null,
    sealedAt: record.sealedAt?.toISOString() ?? null,
    lines: lines.map((l) => ({
      conceptCode: l.conceptCode,
      conceptType: l.conceptType,
      amount: l.amount?.toString() ?? "0",
      taxable: l.taxable,
      cotizable: l.cotizable,
      isOverride: l.isOverride,
      notes: l.notes ?? null,
    })),
  };
}

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

    // Extraer runId del pathname (Next.js App Router no inyecta params 2do arg
    // consistentemente, así que parseamos la URL).
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
            include: {
              employee: {
                select: { externalEmployeeId: true },
              },
              lines: {
                orderBy: { conceptCode: "asc" },
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

      const receipts: SanitizedReceipt[] = run.records.map((record: any) =>
        sanitizeReceipt(
          record,
          record.lines,
          record.employee?.externalEmployeeId ?? "?"
        )
      );

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
          convenioCode: run.convenioCode,
          createdAt: run.createdAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
          submittedAt: run.submittedAt?.toISOString() ?? null,
        },
        receipts,
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
        { error: "Error interno al cargar recibos." },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ["payroll:read"] }
);
