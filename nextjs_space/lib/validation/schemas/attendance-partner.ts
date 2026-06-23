import { z } from "zod";

/**
 * Schema Zod compartido para `POST .../attendance/punch` (interno NextAuth) y
 * `POST /api/v1/partner/attendance/punch` (partner API Key).
 *
 * Antes (2026-07-02 — fix de code-reviewer 🔴): ambos endpoints tenían su
 * propia copia inline del schema. Drift silencioso entre ambos = bug latente
 * en dominio RGPD. Extraído aquí como single source-of-truth.
 *
 * Si en el futuro el endpoint interno y el partner necesitan divergir
 * (p.ej. añadir `externalEmployeeId` solo al partner), usar `extend()`:
 *
 *   export const PartnerAttendancePunchSchema =
 *     AttendancePunchBaseSchema.extend({
 *       externalEmployeeId: z.string().max(100).optional(),
 *     });
 *
 * Mantén la base sincronizada con `db/prisma/schema.prisma` modelo `Attendance`.
 */
export const AttendancePunchBaseSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(["IN", "OUT"]),
  method: z.string().max(50).optional(),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
  clientTimestamp: z.string().datetime().optional(),
});

/**
 * Schema del endpoint partner. Por ahora idéntico a la base — lo separamos
 * para que la evolución pueda divergir sin tocar el endpoint interno.
 */
export const PartnerAttendancePunchSchema = AttendancePunchBaseSchema;
