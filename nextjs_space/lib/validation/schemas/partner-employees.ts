import { z } from "zod";

/**
 * Volkern Partner API — Phase 1.5 — Employee pass-through.
 *
 * Single source-of-truth para validación Zod de los endpoints
 * `GET /api/v1/partner/employees` y `POST /api/v1/partner/employees`.
 *
 * Modelo de aceptación: el SaaS externo (Volkern Hostelería) envía un payload
 * "magro" (RGPD Art. 5 §1.c — minimización), solo los campos estrictamente
 * necesarios para que Volkern Core mantenga un Employee sincronizado. NO se
 * exponen campos ultra-sensibles (salaryEncrypted, governmentIdEncrypted,
 * bankDetailsEncrypted) ni biometría retirada.
 *
 * Campos excluidos a propósito (data minimization + soberanía de bóveda):
 *   - salary (trabaja HREngine que descifra bajo demanda; nunca viene del partner)
 *   - bankDetailsEncrypted / governmentIdEncrypted (Partner NO escribe vault)
 *   - biometric / faceVector (RGPD Art. 9 — jubilado desde 2026-07)
 *   - salaryEncrypted / contractUrlEncrypted (encryptionKeyId = 'v2-tenant-isolation')
 *
 * `externalEmployeeId` es el identificador estable del SaaS externo y se
 * persiste como campo único compuesto (tenantId, externalEmployeeId).
 */

// Teléfono en formato E.164 libre (no validamos país — partner ya sanea).
const PhoneSchema = z
  .string()
  .trim()
  .min(5, "Teléfono demasiado corto.")
  .max(20, "Teléfono demasiado largo.")
  .optional()
  .nullable();

// Identificador externo (SaaS) — recomendado ASCII/[A-Za-z0-9_-] aunque
// aceptamos hasta 80 chars. La unicidad la aplica la DB (composite unique).
const ExternalEmployeeIdSchema = z
  .string()
  .trim()
  .min(1, "externalEmployeeId es obligatorio.")
  .max(80, "externalEmployeeId demasiado largo (máx 80 chars).");

// hiringDate e isActive son columnas non-nullable en DB, por lo que NO
// permitimos `null` en el body (ver `nullPolicyOnNonNullable` en docs §1.9.2).
// En el Zod schema, son solo optional (no nullable) — omitir la key significa
// "no tocar" en PATCH.
const HiringDateSchema = z
  .string()
  .datetime({ message: "hiringDate debe ser ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)." });

/**
 * Vocabulario oficial de `role` para Restauranteros SaaS (untyped — la DB
 * sigue aceptando cualquier string hasta que decidamos migrar a enum). Si
 * envías valores fuera de la lista primaria, el handler los pasará tal cual
 * a Prisma (la columna `Employee.role` es `String`, no enum) — útil para
 * compat con integradores legacy.
 */
export const ROLE_VOCABULARY_PRIMARY = [
  "OPERATOR", "MANAGER", "ADMIN", "KITCHEN", "WAITER",
  "BARTENDER", "HOST", "OTHER",
] as const;

/**
 * Tabla de `nullPolicyOnNonNullable` — qué columnas aceptan `null = clear`
 * en PATCH semantics:
 *
 * | Campo           | Acepta `null`? | Razón                                |
 * | --------------- | -------------- | ------------------------------------ |
 * | email           | SÍ             | Columna DB nullable                 |
 * | mobilePhone     | SÍ             | Columna DB nullable                 |
 * | jobTitle        | SÍ             | Columna DB nullable                 |
 * | baseGPSLat/Lng  | SÍ             | Columna DB nullable                 |
 * | role            | NO             | Columna DB non-null; null = 400     |
 * | department      | NO             | Columna DB non-null; null = 400     |
 * | isActive        | NO             | Columna DB non-null; null = 400     |
 * | hiringDate      | NO             | Columna DB non-null; null = 400     |
 * | fullName        | NO             | Columna DB non-null + required      |
 * | externalEmployeeId | NO          | Required + composite unique         |
 *
 * Schema del body `POST /api/v1/partner/employees`.
 *
 * Semántica upsert idempotente:
 *   - Si existe un Employee con (tenantId, externalEmployeeId), se actualiza
 *     con los campos provistos (PATCH semantics — solo los enviados).
 *   - Si no existe, se crea con defaults aplicados SOLO en el branch CREATE
 *     (role=OPERATOR, department=GENERAL, isActive=true, hiringDate=now).
 *
 * IMPORTANTE: usamos `.optional().nullable()` sin `.default()` para preservar
 * la semántica PATCH real (distinguir "no enviado" de "enviado con valor").
 * Ver `route.ts` para los details del split entre CREATE / UPDATE.
 *
 * Diferencia contrato `null` vs ausencia:
 *   - Campo ausente (key no está en el JSON)  → no tocar la DB (PATCH).
 *   - Campo con `null`                        → limpiar el campo en DB (clear).
 *   - Campo con valor                        → asignar el valor.
 *
 * Idempotency: el header `x-idempotency-key` se valida a nivel de route
 * scope=`partner.employees.upsert`.
 */
export const PartnerEmployeeUpsertSchema = z.object({
  externalEmployeeId: ExternalEmployeeIdSchema,

  // Identidad mínima
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(255).optional().nullable(),
  mobilePhone: PhoneSchema,
  jobTitle: z.string().trim().max(150).optional().nullable(),

  // Organización
  // Role es string libre para mantener compat con integradores legacy
  // (columna DB = String). El handler normaliza a UPPER + trim. La lista
  // `ROLE_VOCABULARY_PRIMARY` se documenta y se acepta cualquier string
  // razonable (≤ 50 chars).
  // IMPORTANTE: role no acepta `null` porque la columna DB es non-nullable;
  // null en PATCH sería rechazado con 400 (ver `nullPolicyOnNonNullable` en
  // docs §1.9.2).
  role: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(50)
    .optional(),
  department: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(50)
    .optional(),

  // Tiempos y estado. hiringDate e isActive son columnas non-nullable, por
  // lo que no se acepta `null` (dejar el campo vacío se hace omitiendo la key).
  hiringDate: HiringDateSchema.optional(), // re-cadena: ya es optional, le quitamos nullable
  isActive: z.boolean().optional(),

  // Geofencing — opcional. Si el partner conoce coords base (su local),
  // las ignora Volkern y deja al onboarding interno decidir.
  baseGPSLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  baseGPSLng: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export type PartnerEmployeeUpsertInput = z.infer<typeof PartnerEmployeeUpsertSchema>;

/**
 * Schema del query string `GET /api/v1/partner/employees`.
 *
 * Acepta dos modos de lookup:
 *   - `?externalEmployeeId=X`           → devuelve 1 empleado (el asociado).
 *   - `?externalEmployeeId=X,Y,Z`      → devuelve hasta 50 empleados (bulk lookup).
 *   - sin params                         → devuelve lista paginada (default 25).
 *
 * Implementación con `preprocess`: aunque el partner envíe una string con
 * comas (url.searchParams solo da strings siempre), la preprocesamos a array
 * ANTES de validar. Esto evita el bug clásico de `z.union([A, B])` donde
 * el primer match (string) gana y se ignora el transform que splitea en
 * comas — el union discriminaba mal.
 */
export const PartnerEmployeeLookupSchema = z.object({
  externalEmployeeId: z
    .preprocess(
      (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (Array.isArray(v)) return v;
        if (typeof v === "string") {
          return v.split(",").map((s) => s.trim()).filter(Boolean);
        }
        return v;
      },
      z.array(ExternalEmployeeIdSchema).min(1).max(50).optional()
    ),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().max(80).optional(),
});

export type PartnerEmployeeLookupInput = z.infer<typeof PartnerEmployeeLookupSchema>;

/**
 * Helper — proyección de respuesta sanitizada (no exponer cifrados al partner).
 *
 * Devolvemos SOLO campos que el SaaS externo puede necesitar para su UI sin
 * violar minimización RGPD. Los cifrados viven en la bóveda interna y solo
 * se descifran por HRService.getEmployeeData (auditado).
 */
export function sanitizeEmployeeForPartner<
  T extends {
    id: string;
    tenantId: string;
    externalEmployeeId: string | null;
    fullName: string;
    email: string | null;
    jobTitle: string | null;
    role: string;
    department: string;
    hiringDate: Date;
    isActive: boolean;
    baseGPSLat: number | null;
    baseGPSLng: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
>(emp: T) {
  return {
    id: emp.id,
    tenantId: emp.tenantId,
    externalEmployeeId: emp.externalEmployeeId,
    fullName: emp.fullName,
    email: emp.email,
    jobTitle: emp.jobTitle,
    role: emp.role,
    department: emp.department,
    hiringDate:
      emp.hiringDate instanceof Date
        ? emp.hiringDate.toISOString()
        : String(emp.hiringDate),
    isActive: emp.isActive,
    baseGPSLat: emp.baseGPSLat,
    baseGPSLng: emp.baseGPSLng,
    createdAt:
      emp.createdAt instanceof Date
        ? emp.createdAt.toISOString()
        : String(emp.createdAt),
    updatedAt:
      emp.updatedAt instanceof Date
        ? emp.updatedAt.toISOString()
        : String(emp.updatedAt),
  };
}

/**
 * Versionado del schema — si en Phase 2+ necesitamos añadir campos opcionales
 * sin romper integradores, podemos crear `PartnerEmployeeUpsertSchemaV2` que
 * `.extend()` el V1. Estilo Stripe API versioning.
 */
export const PARTNER_EMPLOYEES_SCHEMA_VERSION = "2026-07-02";
