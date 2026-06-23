import { z } from "zod";

/**
 * Volkern Partner API — Phase 2 — Payroll pass-through.
 *
 * Single source-of-truth para validación Zod de los endpoints
 *   POST /api/v1/partner/payroll/run
 *   GET  /api/v1/partner/payroll/[runId]/receipts
 *   GET  /api/v1/partner/payroll/[runId]/aeat-status
 *
 * Modelo de input (decisión híbrida):
 *   - El partner SIEMPRE provee `externalEmployeeId` (mapeo Volkern Employee
 *     vía `GET /api/v1/partner/employees`).
 *   - `overrides` opcional: horas extra / propinas / complementos que conoce
 *     el SaaS restaurantero porque vive en su UI de turnos. Si está vacío,
 *     el PayrollEngineES calcula desde EmployeePayrollProfileES + attendance.
 *   - `bonuses?` opcional: conceptos no salariales puntuales (bonus puntual,
 *     atrasos, etc.). Marcan `isOverride=true` en PayrollLineES para
 *     trazabilidad.
 *
 * Data minimization (RGPD Art. 5): NUNCA se aceptan datos sensibles
 * (DNI, IBAN) desde el partner. El Volkern Core los mantiene en vault y
 * solo expone totales (gross + net + SS + IRPF) en la respuesta.
 *
 * Convenios hostelería:
 *   - Aunque el engine V1 no aplica tablas salariales por CC.AA, capturamos
 *     `convenioCode` en el body + `Tenant.configuracion.convenioCode` para
 *     auditoría. Si la lógica autonómica no está lista en V1.5, el endpoint
 *     persiste el código en `PayrollRunES.convenioCode` y loggea un WARNING
 *     en AuditLog (no rechaza).
 */

const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/; // 'YYYY-MM'

const ExternalEmployeeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe("externalEmployeeId del SaaS — único por tenant.");

// ⚠️ NO usamos `z.number().multipleOf(0.01)` directamente: floating-point
// rompe la validación (0.1 + 0.2 = 0.30000000000000004 no es exactamente
// múltiple de 0.01 en IEEE 754). Patrón estándar: validar formato string
// + convertir a entero-céntimos para almacenamiento.
const MONEY_DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const MoneyAmountSchema = z
  .coerce.number()
  .nonnegative()
  .max(1_000_000)
  .refine(
    (n) => MONEY_DECIMAL_REGEX.test(n.toString()) ||
           // Acepta también enteros pequeños sin separador decimal.
           Number.isInteger(n),
    "Importe debe tener max 2 decimales (centimos exactos)."
  )
  .transform((n) => Math.round(n * 100) / 100) // Normaliza a 2 decimales.
  .describe("Importe monetario en EUR (max 2 decimales).");

const OverrideLineSchema = z.object({
  conceptCode: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^\d{3,4}$/, "conceptCode debe ser numérico de 3-4 dígitos.")
    .describe("Código de nómina (ej. 101 salario base, 501 horas extra)."),
  type: z
    .enum(["EARNING", "DEDUCTION", "COMPENSATION"])
    .describe("EARNING=devengo, DEDUCTION=deducción, COMPENSATION=compensación SS/IRPF."),
  amount: MoneyAmountSchema,
  taxable: z.boolean().default(true),
  cotizable: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().nullable(),
});

const PartnerEmployeeInputSchema = z.object({
  externalEmployeeId: ExternalEmployeeIdSchema,
  // El SaaS puede enviar horas trabajadas reales (por turnos hostelería).
  // Si no envía, PayrollEngineES infiere desde attendance.log.
  hoursWorked: z.coerce.number().min(0).max(366).optional().nullable(),
  overrides: z.array(OverrideLineSchema).max(50).optional().default([]),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const PartnerPayrollRunSchema = z.object({
  // Periodo ISO 'YYYY-MM' (mes cerrado — nóminas son siempre mensuales).
  period: z
    .string()
    .regex(PERIOD_REGEX, "period debe tener formato YYYY-MM (ej. '2026-07')."),
  // Referencia opcional del SaaS externo (ej 'hr-2026-07-tk-001') para
  // trazabilidad en logs del Restaurantero.
  externalRunRef: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .nullable(),
  // Override del convenio si el SaaS lo conoce (si no, se leerá de
  // Tenant.configuracion.convenioCode al ejecutar el run).
  convenioCode: z
    .enum([
      "ES_HOSTELERIA_ESTATAL",
      "ES_HOSTELERIA_CAT",
      "ES_HOSTELERIA_MAD",
      "ES_HOSTELERIA_PV",
      "ES_HOSTELERIA_AND",
      "CUSTOM",
    ])
    .optional()
    .nullable(),
  employees: z
    .array(PartnerEmployeeInputSchema)
    .min(1, "El run debe incluir al menos 1 empleado.")
    .max(500, "Un run puede procesar hasta 500 empleados a la vez."),
  // Operator note libre — se persiste en cada PayrollRecordES.operatorNote.
  operatorNote: z.string().trim().max(2000).optional().nullable(),
  // Si true, fuerza sellado incluso si hay perfiles incompletos (útil para
  // consultorías que quieren cerrar un mes aunque falten datos menores).
  force: z.boolean().optional().default(false),
});

export type PartnerPayrollRunInput = z.infer<typeof PartnerPayrollRunSchema>;

// ───────────────────────────────────────────────────────────────────────────
// GET /receipts y /aeat-status — params + projection
// ───────────────────────────────────────────────────────────────────────────

export const PartnerPayrollRunIdParamSchema = z
  .object({
    runId: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^c[a-z0-9]+$/, "runId debe ser un CUID válido generado por Volkern."),
  })
  .strict();

export type PartnerPayrollRunIdParam = z.infer<typeof PartnerPayrollRunIdParamSchema>;

/**
 * Versión del schema del modelo partner. Cuando la API evolucione, podemos:
 *   1) Publicar `partnerPayrollRunSchemaVersion = '2026-07-03'` como base.
 *   2) Crear `PartnerPayrollRunSchemaV2` que `.extend()` el V1 con campos nuevos.
 *   3) Negociar versión vía header `Accept: application/json; version=2`.
 *
 * Mantener la versión estable facilita el versionado de clientes SaaS.
 */
export const PARTNER_PAYROLL_SCHEMA_VERSION = "2026-07-03";

/**
 * Diccionario de errores comunes mapeados a HTTP status (RGPD-aware).
 * Reutilizado por los 3 endpoints para consistencia.
 */
export const PARTNER_PAYROLL_ERROR_MAP: Record<string, { status: number; message: string }> = {
  ZOD_VALIDATION_FAILED: { status: 400, message: "Datos de nómina inválidos (Zod)." },
  PERIOD_INVALID: { status: 400, message: "Period debe tener formato YYYY-MM." },
  EMPLOYEE_NOT_FOUND: { status: 404, message: "Empleado no encontrado por externalEmployeeId." },
  EMPLOYEES_DUPLICATE: { status: 400, message: "Hay externalEmployeeId duplicados en el body." },
  EMPLOYEES_EMPTY: { status: 400, message: "Debes incluir al menos un empleado." },
  PERFIL_NO_ENCONTRADO: { status: 422, message: "Empleado sin perfil de nómina configurado (EmployeePayrollProfileES ausente)." },
  RUN_YA_SELLADO: { status: 409, message: "Ya existe un run sellado para este (tenant, period). Para correcciones, crea nómina de atrasos en el siguiente periodo." },
  RUN_NOT_FOUND: { status: 404, message: "runId no encontrado en este tenant." },
  NIF_NOT_FOUND: { status: 422, message: "Tenant sin NIF emisor / NIF representante configurado — requerido para AEAT." },
  AEAT_UPSTREAM_ERROR: { status: 502, message: "Error AEAT upstream (SILTRA / modelos 111/190). El run quedó en estado AEAT_REJECTED o ERROR." },
};
