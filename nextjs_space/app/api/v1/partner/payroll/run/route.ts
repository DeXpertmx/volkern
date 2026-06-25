export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withTenantAuth } from "@/lib/api-key-auth";
import { prisma } from "@/lib/db";
import {
  PartnerPayrollRunSchema,
  PARTNER_PAYROLL_SCHEMA_VERSION,
  PARTNER_PAYROLL_ERROR_MAP,
} from "@/lib/validation/schemas/partner-payroll";
import { PayrollEngineES } from "@/lib/finance/payroll/es/payroll-engine-es";
import { PayrollSealer } from "@/lib/finance/payroll/es/payroll-sealer";
import { shipNominaToAEAT } from "@/lib/erp/aeat-nomina-adapter";

import { writePartnerAuditLog, getRequestMetadata, ensurePartnerApiKey } from "@/lib/erp/partner-audit-log";
// ════════════════════════════════════════════════════════════════════════════
// Volkern Partner API — Phase 2 — Payroll run + AEAT submission
//
// POST /api/v1/partner/payroll/run
//
// Auth    : API Key per-tenant. Header `x-api-key` o `Authorization: Bearer vk_...`.
//           Sesiones NextAuth rechazadas explícitamente.
// Scope   : `payroll:run`.
// Idempotency: header `x-idempotency-key` (RFC Stripe-style, TTL 24h).
//             Scope namespace-separado: `partner.payroll.run`. Bloquea
//             re-crear runs sellados (409 RUN_YA_SELLADO).
//
// Compliance:
//   - AuditLog RGPD Art. 30 en cada llamada (accion=PARTNER_PAYROLL_RUN).
//   - Solo totales (gross/net/ss/irpf) se devuelven. salary*Encrypted,
//     governmentIdEncrypted, bankDetailsEncrypted NUNCA se exponen al
//     partner (RGPD Art. 5 §1.c — data minimization).
//
// Convenios hostelería:
//   - convenioCode viene del body o, en su defecto, de
//     Tenant.configuracion.convenioCode. Se persiste en PayrollRunES.
//     Si la lógica autonómica engine aún no está conectada (V1 no lo está),
//     se loggea WARNING en AuditLog y se usa el genérico.
//
// Flujo:
//   1. Zod validation → 400 si falla.
//   2. Idempotency cache check (partner.payroll.run) → 200 cached si hit.
//   3. Lookup Employees por externalEmployeeId → 404 si alguno no existe.
//   4. Per empleado: PayrollEngineES.calculatePayroll → persist PayrollRecordES
//      + PayrollLineES (status=DRAFT + overrides isOverride=true).
//   5. PayrollSealer.sealPayroll(recordId, 'PARTNER', note) por registro.
//   6. Bulk AEAT shipment via shipNominaToAEAT (V1 síncrono).
//   7. Actualizar PayrollRunES.status → AEAT_SUBMITTED.
//   8. AuditLog final.
// ════════════════════════════════════════════════════════════════════════════

const IDEMPOTENCY_SCOPE = "partner.payroll.run";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Helpers compartidos ─────────────────────────────────────────────────────







function mapErrorToResponse(code: string) {
  return (
    PARTNER_PAYROLL_ERROR_MAP[code] ?? {
      status: 400,
      message: code,
    }
  );
}

async function checkIdempotencyCache(opts: {
  tenantId: string;
  idempotencyKey: string | null;
}) {
  if (!opts.idempotencyKey) return null;
  const cached = await (prisma as any).payrollRunES.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: opts.tenantId,
        idempotencyKey: opts.idempotencyKey,
      },
    },
  });
  return cached;
}

async function loadEmployeesByExternalIds(
  tenantId: string,
  externalIds: string[]
) {
  return prisma.employee.findMany({
    where: { tenantId, externalEmployeeId: { in: externalIds } } as any,
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────

export const POST = withTenantAuth(
  async (request, auth) => {
    if (auth.authMethod !== "apikey" || !auth.apiKey) {

      const partnerErr = ensurePartnerApiKey(auth);

      if (partnerErr) return partnerErr;
    }

    const tenantId = auth.tenant!.id;
    const apiKeyId = auth.apiKey!.id;
    const apiKeyName = auth.apiKey!.nombre;
    const { ipAddress, userAgent } = getRequestMetadata(request);

    try {
      const idempotencyKey =
        request.headers.get("x-idempotency-key")?.trim() ?? null;
      if (idempotencyKey && idempotencyKey.length > 255) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_PAYROLL_RUN",
          outcome: "rejected",
          entidad: "PayrollRunES",
          entidadId: "PENDING",
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

      // Cache hit
      if (idempotencyKey) {
        const cached = await checkIdempotencyCache({
          tenantId,
          idempotencyKey,
        });
        if (cached) {
          await writePartnerAuditLog({
            tenantId,
            apiKeyId,
            apiKeyName,
            accion: "PARTNER_PAYROLL_RUN",
            outcome: "success",
            entidad: "PayrollRunES",
            entidadId: cached.id,
            httpStatus: 200,
            rejectionReason: "idempotency_cache_hit",
            ipAddress,
            userAgent,
          });
          return NextResponse.json({
            schemaVersion: PARTNER_PAYROLL_SCHEMA_VERSION,
            idempotent: true,
            run: {
              id: cached.id,
              period: cached.period,
              status: cached.status,
              totalRecords: cached.totalRecords,
              acceptedCount: cached.acceptedCount,
              rejectedCount: cached.rejectedCount,
              errorCount: cached.errorCount,
              createdAt: cached.createdAt.toISOString(),
              submittedAt: cached.submittedAt?.toISOString() ?? undefined,
            },
          });
        }
      }

      // Zod validation
      const raw = await request.json();
      const parsed = PartnerPayrollRunSchema.safeParse(raw);
      if (!parsed.success) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_PAYROLL_RUN",
          outcome: "rejected",
          entidad: "PayrollRunES",
          entidadId: "PENDING",
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

      // Detectar externalEmployeeId duplicados
      const externalIds = body.employees.map((e) => e.externalEmployeeId);
      const uniqueIds = new Set(externalIds);
      if (uniqueIds.size !== externalIds.length) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_PAYROLL_RUN",
          outcome: "rejected",
          entidad: "PayrollRunES",
          entidadId: "PENDING",
          httpStatus: 400,
          rejectionReason: "employees_duplicate",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          { error: mapErrorToResponse("EMPLOYEES_DUPLICATE").message },
          { status: 400 }
        );
      }

      // Idempotencia a nivel (tenantId, period): si hay run sellado, devolver 409.
      const existing = await (prisma as any).payrollRunES.findUnique({
        where: { tenantId_period: { tenantId, period: body.period } },
      });
      if (existing && existing.status === "SEALED") {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_PAYROLL_RUN",
          outcome: "rejected",
          entidad: "PayrollRunES",
          entidadId: existing.id,
          httpStatus: 409,
          rejectionReason: "run_ya_sellado",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          { error: mapErrorToResponse("RUN_YA_SELLADO").message },
          { status: 409 }
        );
      }

      // Lookup empleados por externalEmployeeId
      const employees = await loadEmployeesByExternalIds(tenantId, externalIds) as any[];
      const employeesFound = new Set(
        employees.map((e) => e.externalEmployeeId).filter(Boolean) as string[]
      );
      const missing = externalIds.filter(
        (id) => !employeesFound.has(id)
      );
      if (missing.length > 0) {
        await writePartnerAuditLog({
          tenantId,
          apiKeyId,
          apiKeyName,
          accion: "PARTNER_PAYROLL_RUN",
          outcome: "rejected",
          entidad: "PayrollRunES",
          entidadId: "PENDING",
      extra: { missing },
          httpStatus: 404,
          rejectionReason: "employees_not_found",
          ipAddress,
          userAgent,
        });
        return NextResponse.json(
          {
            error: "Algunos empleados no existen en este tenant.",
            missing,
          },
          { status: 404 }
        );
      }

      // Lookup convenio desde Tenant.configuracion (fallback al body override).
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { configuracion: true },
      });
      const tenantCfg = (tenant?.configuracion as any) ?? {};
      const convenioCode =
        body.convenioCode ??
        tenantCfg.convenioCode ??
        "ES_HOSTELERIA_ESTATAL";

      // Crear PayrollRunES (UPSERT por tenant+period para soportar reintentos
      // de runs no sellados).
      const run = await (prisma as any).payrollRunES.upsert({
        where: { tenantId_period: { tenantId, period: body.period } },
        create: {
          tenantId,
          period: body.period,
          status: "RUNNING",
          externalRunRef: body.externalRunRef ?? null,
          idempotencyKey: idempotencyKey ?? null,
          convenioCode,
          initiatedBy: apiKeyId,
          totalRecords: employees.length,
        },
        update: {
          status: "RUNNING",
          externalRunRef: body.externalRunRef ?? null,
          idempotencyKey: idempotencyKey ?? null,
          convenioCode,
          initiatedBy: apiKeyId,
          totalRecords: employees.length,
        },
      });

      const records: Array<{
        externalEmployeeId: string;
        recordId: string;
        status: string;
        fiscalStatus: string;
        grossTotal: string;
        netTotal: string;
        errorReason?: string;
      }> = [];
      const errors: Array<{
        externalEmployeeId: string;
        reason: string;
      }> = [];

      for (const employeeInput of body.employees) {
        const employee = employees.find(
          (e) => e.externalEmployeeId === employeeInput.externalEmployeeId
        );
        if (!employee) continue;

        try {
          // 1. Engine cálculo
          const calc = await PayrollEngineES.calculatePayroll(
            employee.id,
            tenantId,
            body.period
          );

          // 2. Persist PayrollRecordES (status=DRAFT, fiscalStatus=PENDING)
          const record = await (prisma as any).payrollRecordES.create({
            data: {
              tenantId,
              employeeId: employee.id,
              payrollRunId: run.id,
              period: body.period,
              status: "DRAFT",
              grossTotal: calc.grossTotal.toNumber(),
              netTotal: calc.netTotal.toNumber(),
              socialSecurityWorker: calc.socialSecurityWorker.toNumber(),
              socialSecurityEmp: calc.socialSecurityEmp.toNumber(),
              irpfTotal: calc.irpfTotal.toNumber(),
              calculationSnapshot: {
                period: body.period,
                employeeExternalId: employee.externalEmployeeId,
                calculatedAt: new Date().toISOString(),
                overrides: employeeInput.overrides ?? [],
                notes: employeeInput.notes ?? null,
              } as Prisma.InputJsonValue,
              operatorNote:
                body.operatorNote ?? employeeInput.notes ?? null,
              fiscalStatus: "PENDING",
            },
          });

          // 3. Persist PayrollLineES (engine lines + overrides with isOverride=true)
          await (prisma as any).payrollLineES.createMany({
            data: [
              ...calc.lines.map((line: any) => ({
                payrollRecordId: record.id,
                conceptCode: String(line.conceptCode),
                conceptType: String(line.conceptType),
                amount: line.amount.toNumber(),
                taxable: line.conceptType !== "DEDUCTION",
                cotizable: !["801", "901"].includes(String(line.conceptCode)),
                isOverride: false,
                notes: line.notes ?? null,
              })),
              ...(employeeInput.overrides ?? []).map((ov) => ({
                payrollRecordId: record.id,
                conceptCode: ov.conceptCode,
                conceptType:
                  ov.type === "DEDUCTION"
                    ? "DEDUCTION"
                    : ov.type === "COMPENSATION"
                    ? "COMPENSATION"
                    : "SALARY",
                amount: ov.amount,
                taxable: ov.taxable,
                cotizable: ov.cotizable,
                isOverride: true,
                notes: ov.notes ?? null,
              })),
            ],
          });

          // 4. Sealer (encadenado SHA-256 + AuditLog interno PAYROLL_HARDENED_SEAL)
          try {
            await PayrollSealer.sealPayroll(
              record.id,
              apiKeyId, // UserId = apiKeyId
              body.operatorNote ?? undefined
            );
          } catch (sealErr) {
            const msg = sealErr instanceof Error ? sealErr.message : "SEAL_ERROR";
            errors.push({
              externalEmployeeId: employeeInput.externalEmployeeId,
              reason: `seal:${msg}`,
            });
            continue;
          }

          // 5. AEAT submission
          const aeatResult = await shipNominaToAEAT({
            tenantId,
            payrollRecordId: record.id,
            runId: run.id,
            apiKeyId,
          });

          records.push({
            externalEmployeeId: employeeInput.externalEmployeeId,
            recordId: record.id,
            status: "SEALED",
            fiscalStatus: aeatResult.status,
            grossTotal: calc.grossTotal.toFixed(2),
            netTotal: calc.netTotal.toFixed(2),
          });
        } catch (empErr) {
          const reason =
            empErr instanceof Error ? empErr.message : "EMPLOYEE_ERROR";
          const mapped = mapErrorToResponse(reason);
          errors.push({
            externalEmployeeId: employeeInput.externalEmployeeId,
            reason:
              mapped.status === 422
                ? mapped.message
                : `employee:${reason}`,
          });
        }
      }

      // Update Run con contadores finales.
      const finalRun = await (prisma as any).payrollRunES.update({
        where: { id: run.id },
        data: {
          status: "AEAT_SUBMITTED",
          completedAt: new Date(),
          submittedAt: new Date(),
          rejectedCount: errors.length,
          lastError:
            errors.length > 0
              ? errors.map((e) => `${e.externalEmployeeId}: ${e.reason}`).join("; ")
              : undefined,
        },
      });

      const responseBody = {
        schemaVersion: PARTNER_PAYROLL_SCHEMA_VERSION,
        run: {
          id: finalRun.id,
          period: finalRun.period,
          status: finalRun.status,
          totalRecords: finalRun.totalRecords,
          acceptedCount: finalRun.acceptedCount,
          rejectedCount: finalRun.rejectedCount,
          errorCount: finalRun.errorCount,
          convenioCode: finalRun.convenioCode,
          createdAt: finalRun.createdAt.toISOString(),
          completedAt: finalRun.completedAt?.toISOString() ?? null,
          submittedAt: finalRun.submittedAt?.toISOString() ?? undefined,
          externalRunRef: finalRun.externalRunRef ?? undefined,
        },
        records,
        errors,
      };

      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_PAYROLL_RUN",
        outcome: errors.length === 0 ? "success" : "rejected",
        entidad: "PayrollRunES",
        entidadId: finalRun.id,
        httpStatus: 200,
        rejectionReason: errors.length > 0 ? "partial_errors" : undefined,
        extra: {
          total: finalRun.totalRecords,
          accepted: finalRun.acceptedCount,
          errors,
          convenio: convenioCode,
        },
        ipAddress,
        userAgent,
      });

      return NextResponse.json(responseBody);
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      const mapped = mapErrorToResponse(code);
      await writePartnerAuditLog({
        tenantId,
        apiKeyId,
        apiKeyName,
        accion: "PARTNER_PAYROLL_RUN",
        outcome: "error",
        entidad: "PayrollRunES",
        entidadId: "PENDING",
        httpStatus: mapped.status,
        rejectionReason: code,
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { error: mapped.message, reason: code },
        { status: mapped.status }
      );
    }
  },
  { requiredScopes: ["payroll:run"] }
);
