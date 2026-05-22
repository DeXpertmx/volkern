import { z, ZodSchema, ZodError } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Validación de body estandarizada para API routes.
 * 
 * @param schema - Schema Zod a validar
 * @param body - Objeto a validar (normalmente await req.json())
 * @returns Resultado parseado o lanza error
 * 
 * @example
 * ```ts
 * const body = await req.json();
 * const result = validateBody(LeadCreateSchema, body);
 * if (result instanceof NextResponse) return result;
 * // result está tipado como LeadCreateInput
 * ```
 */
export function validateBody<T>(schema: ZodSchema<T>, body: unknown): T | NextResponse {
  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: 'Datos inválidos',
        details: formatZodErrors(result.error),
      },
      { status: 400 }
    );
  }
  return result.data;
}

/**
 * Versión que devuelve { data, errors } en lugar de NextResponse.
 * Útil para handlers que necesitan más control sobre la respuesta.
 */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; errors: Record<string, string[]> } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, errors: formatZodErrors(result.error) };
  }
  return { success: true, data: result.data };
}

/**
 * Formatea errores de Zod a un objeto amigable para el frontend.
 * Convierte errores de validación anidados en un flat map.
 */
export function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }
  return formatted;
}

/**
 * Schemas comunes reutilizables
 */
export const CommonSchemas = {
  /** ID de Prisma (cuid: 25 chars) */
  id: z.string().min(25, 'ID inválido (se espera un cuid de 25 caracteres)'),

  /** Email válido */
  email: z.string().email('Email inválido').max(255),

  /** Teléfono (acepta varios formatos internacionales) */
  telefono: z.string().max(30).optional().nullable(),

  /** Nombre genérico */
  nombre: z.string().min(1, 'Nombre requerido').max(255),

  /** Texto largo descriptivo */
  descripcion: z.string().max(5000).optional().nullable(),

  /** URL válida */
  url: z.string().url('URL inválida').optional().nullable(),

  /** Valor monetario positivo (coerce: acepta strings como "1500.50") */
  montoPositivo: z.coerce.number().min(0, 'El valor debe ser >= 0'),

  /** Fecha ISO */
  fechaISO: z.string().datetime({ message: 'Formato de fecha inválido (ISO 8601)' }),

  /** Moneda (3 letras) */
  moneda: z.string().length(3, 'Código de moneda de 3 caracteres').default('EUR'),

  /** TenantId — requerido en rutas públicas */
  tenantId: z.string().min(1, 'Tenant ID requerido'),
};
