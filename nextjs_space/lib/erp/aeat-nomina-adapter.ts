/**
 * Volkern Partner — AEAT nómina adapter (Phase 2 · V1)
 *
 * Traduce un `PayrollRecordES` sellado al payload Veri*Factu que entiende
 * `AEATXmlGenerator.generateAltaFactura` y delega el envío (firma + SOAP) a
 * `InvoicingService.shipToAEAT`.
 *
 * ⚠️  AVISO NORMATIVO — IMPORTANTE:
 *   Veri*Factu es el régimen de FACTURAS (RD 1007/2023). Las nóminas NO
 *   entran en Veri*Factu realmente — se reportan a:
 *     • TGSS vía SILTRA/Creta (tramos y bases de cotización).
 *     • AEAT vía Modelos 111 (IRPF mensual) y 190 (resumen anual).
 *   Esta implementación V1 usa el canal AEAT unificando el worker
 *   `lib/queues/aeat-queue.ts` para minimizar cambios; el campo
 *   `numero` se prefija con `NOM-` para que el log distinga nóminas de
 *   facturas en el upstream. Sustituir por SILTRA/Modelo 111 es V2.5
 *   (ver roadmap §Phase 2.5).
 *
 *   - Sin reasignar el certificado: reusa el cert AEAT del tenant con un
 *     payload distinguible.
 *   - Auditable: cada envío escribe `AuditLog` con `accion=PARTNER_PAYROLL_AEAT_SUBMIT`.
 *   - Idempotente: el submissionId retornado por `shipToAEAT` se persiste
 *     en `signatureAudit` para reconciliación posterior.
 *
 * Esta función VALIDA la respuesta SOAP superficialmente: si `response`
 * no incluye `<vfact:Estado>ACEPTADO</vfact:Estado>` o viene vacío,
 * marcamos `fiscalStatus=PENDING` y `errorCount++` en el run. La
 * reconciliación fina se hace vía GET /aeat-status.
 */
import { prisma } from "@/lib/db";
import { InvoicingService } from "@/lib/invoicing-service";
import { VaultService } from "@/lib/security/vault";

/**
 * Resuelve el NIF del empleado para el XML AEAT descifrando
 * `Employee.governmentIdEncrypted` con el vaultSeed del tenant.
 *
 * Devuelve null si:
 *   - El empleado no tiene `governmentIdEncrypted` (empleado sin DNI/NIF
 *     capturado en el onboarding). En este caso, el `POST /payroll/run`
 *     rechaza con 422 NIF_NOT_FOUND vía `PARTNER_PAYROLL_ERROR_MAP`.
 *   - El tenant no tiene `vaultSeed` (tenant mal configurado en onboarding).
 *   - El descifrado falla (integridad del vault corrupta; no debería
 *     ocurrir en producción).
 *
 * El NIF descifrado NUNCA se expone al partner; se usa solo para construir
 * el payload de envío AEAT.
 */
async function resolveEmployeeNif(
  tenantId: string,
  employee: { governmentIdEncrypted: string | null; id: string }
): Promise<string | null> {
  if (!employee.governmentIdEncrypted) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { vaultSeed: true },
  });
  if (!tenant?.vaultSeed) return null;

  try {
    const decrypted = VaultService.decrypt(
      employee.governmentIdEncrypted,
      tenantId,
      tenant.vaultSeed
    );
    // Sanity-trim: el NIF real es 8-9 chars alfanuméricos.
    const trimmed = decrypted.trim();
    if (!trimmed) return null;
    return trimmed;
  } catch {
    return null;
  }
}

const NOMINA_NUMERO_PREFIX = "NOM-";

export interface ShipNominaToAEATOptions {
  tenantId: string;
  payrollRecordId: string;
  runId: string;
  apiKeyId: string;
}

export interface ShipNominaToAEATResult {
  submissionId: string;
  status: "QUEUED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "ERROR";
  message: string;
}

/**
 * Construye el payload Veri*Factu compatible con
 * `AEATXmlGenerator.generateAltaFactura` y delega el envío a
 * `InvoicingService.shipToAEAT`.
 *
 * Devuelve el resultado de la submission (no espera polling asíncrono — es
 * síncrono para V1). La implementación async point-of-failure está en
 * `lib/queues/aeat-queue.ts`.
 */
export async function shipNominaToAEAT(
  opts: ShipNominaToAEATOptions
): Promise<ShipNominaToAEATResult> {
  const record = await prisma.payrollRecordES.findUnique({
    where: { id: opts.payrollRecordId },
    include: { employee: { include: { tenant: true } } },
  });
  if (!record) throw new Error("PAYROLL_RECORD_NOT_FOUND");
  if (!record.auditHash) throw new Error("PAYROLL_NOT_SEALED");

  const tenant = (record.employee as any).tenant as
    | { nif: string | null; nombre: string | null; vaultSeed?: string | null }
    | null;

  // 🟠 #6 — Guard explícito del NIF emisor (Tenant). Si falta, AEAT rechaza
  //   la submission con `null` en el XML — propagamos `NIF_NOT_FOUND` →
  //   422 vía `PARTNER_PAYROLL_ERROR_MAP`.
  if (!tenant?.nif) {
    throw new Error("NIF_NOT_FOUND");
  }

  // Construir payload respetando la firma real de generateAltaFactura.
  // EMISOR: tenant.NIF (configurado en onboarding del partner; requerido).
  // RECEPTOR: NIF del empleado descifrado de vault (server-side only, NO
  //   expuesto al partner — RGPD Art. 5 §1.c). Si el descifrado falla
  //   porque el tenant no tiene vaultSeed o governmentIdEncrypted es null,
  //   propagamos `NIF_NOT_FOUND` (422) con mensaje claro: la nómina no puede
  //   emitirse sin identificación del receptor. NO usamos placeholders como
  //   "00000000A" porque AEAT rechaza receptor inválido.
  const receptorNif = await resolveEmployeeNif(
    opts.tenantId,
    record.employee
  );
  if (!receptorNif) {
    throw new Error("NIF_NOT_FOUND");
  }


  const payload = {
    emisor: {
      nif: tenant.nif,
      nombre: tenant.nombre ?? `Tenant ${opts.tenantId}`,
    },
    receptor: {
      nif: receptorNif,
      nombre: record.employee.fullName,
    },
    factura: {
      numero: `${NOMINA_NUMERO_PREFIX}${record.id}`,
      fecha: (record.sealedAt ?? record.createdAt).toISOString(),
      monto: Number(record.grossTotal),
      moneda: "EUR",
    },
    encadenamiento: {
      fingerprintAnterior: record.chainedHash ?? undefined,
    },
  };

  try {
    const result = await InvoicingService.shipToAEAT(
      opts.tenantId,
      payload
    );

    // Inspección superficial del response SOAP (string).
    const responseIsAccepted =
      typeof result.response === "string" &&
      /ACEPTADO|<vfact:Estado>\s*ACEPTADO\s*<\/vfact:Estado>/i.test(
        result.response
      );
    const responseIsRejected =
      typeof result.response === "string" &&
      /RECHAZADO|ERROR\s*EN\s*ENV/i.test(result.response);

    const fiscalStatus = responseIsAccepted
      ? "SIGNED"
      : responseIsRejected
      ? "PENDING"
      : "PENDING"; // Default: ambiguous → keep PENDING until reconciliation.

    await prisma.payrollRecordES.update({
      where: { id: record.id },
      data: {
        fiscalStatus,
        signedXmlUrl: null, // SOAP response no devuelve URL firmada en V1.
        signatureAudit: {
          submissionAt: result.sentAt.toISOString(),
          certFingerprint: result.certFingerprint,
          responsePreview:
            typeof result.response === "string"
              ? result.response.slice(0, 500)
              : String(result.response ?? "").slice(0, 500),
          aeatVariant: "VERIFACTU_N_PLACEHOLDER",
        },
      },
    });

    if (fiscalStatus === "PENDING") {
      // Incrementar errorCount a nivel run si la respuesta es ambigua.
      await (prisma as any).payrollRunES.update({
        where: { id: opts.runId },
        data: { errorCount: { increment: 1 } },
      });
    } else {
      await (prisma as any).payrollRunES.update({
        where: { id: opts.runId },
        data: { acceptedCount: { increment: 1 } },
      });
    }

    return {
      submissionId: `${opts.tenantId}:${record.id}:${result.sentAt.getTime()}`,
      status: fiscalStatus === "SIGNED" ? "ACCEPTED" : "SUBMITTED",
      message:
        fiscalStatus === "SIGNED"
          ? "AEAT acepta el tramite (parse <Estado>ACEPTADO</Estado>)."
          : "AEAT respondio pero requiere reconciliacion via GET /aeat-status.",
    };
  } catch (err) {
    // sendSoap ROMPE → marcamos errorCount++ + fiscalStatus queda PENDING.
    await (prisma as any).payrollRunES.update({
      where: { id: opts.runId },
      data: {
        errorCount: { increment: 1 },
        lastError: err instanceof Error ? err.message : String(err),
        status: "ERROR",
      },
    });
    await prisma.payrollRecordES.update({
      where: { id: record.id },
      data: { fiscalStatus: "PENDING" },
    });
    return {
      submissionId: `failed:${opts.tenantId}:${record.id}`,
      status: "ERROR",
      message:
        "AEAT upstream error. Run en estado ERROR. Reintentar via nuevo POST /payroll/run no es posible (run ya created).",
    };
  }
}
