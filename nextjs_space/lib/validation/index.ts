/**
 * Módulo de validación centralizado para el proyecto Volkern.
 * 
 * Uso típico en un route handler:
 * ```ts
 * import { validateBody } from '@/lib/validation';
 * import { LeadCreateSchema } from '@/lib/validation/schemas';
 * 
 * export const POST = withTenantAuth(async (req, auth) => {
 *   const body = await req.json();
 *   const data = validateBody(LeadCreateSchema, body);
 *   if (data instanceof NextResponse) return data;
 *   // data está tipado como LeadCreateInput
 * });
 * ```
 */

export { validateBody, parseBody, formatZodErrors, CommonSchemas } from './common';
