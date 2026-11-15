import { globalPrisma } from '@/lib/db';

/**
 * Vigencia del catálogo público.
 *
 * Una cartera que se publica y no se toca nunca más llena el portal de fichas
 * muertas: pisos vendidos hace meses que el cliente sigue pidiendo. Un inmueble
 * deja de listarse cuando lleva demasiado sin actualizarse, y vuelve en cuanto
 * alguien lo guarda (el guardado actualiza `fechaActualizacion`).
 *
 * No se borra ni se desactiva nada: el filtro es de consulta, así que la ficha
 * sigue accesible por enlace directo y el inmueble reaparece al editarlo.
 */

export const DIAS_VIGENCIA_POR_DEFECTO = 90;
export const MIN_DIAS_VIGENCIA = 7;
export const MAX_DIAS_VIGENCIA = 365;

/** Días configurados en la cuenta (`portal_dias_vigencia`), saneados. */
export function normalizarDiasVigencia(valor: unknown): number {
  const numero =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'string' && valor.trim() !== ''
        ? Number(valor)
        : Number.NaN;

  if (!Number.isFinite(numero) || numero <= 0) return DIAS_VIGENCIA_POR_DEFECTO;
  return Math.min(MAX_DIAS_VIGENCIA, Math.max(MIN_DIAS_VIGENCIA, Math.round(numero)));
}

/** Momento a partir del cual un inmueble se considera vigente. */
export function corteVigencia(dias: number, ahora: Date = new Date()): Date {
  const corte = new Date(ahora.getTime());
  corte.setDate(corte.getDate() - normalizarDiasVigencia(dias));
  return corte;
}

async function diasVigenciaPortal(tenantId: string): Promise<number> {
  try {
    const fila = await globalPrisma.configuracion.findFirst({
      where: { tenantId, clave: 'portal_dias_vigencia' },
      select: { valor: true },
    });
    return normalizarDiasVigencia(fila?.valor);
  } catch {
    // Sin configuración legible manda el criterio por defecto: nunca dejar el
    // portal sin catálogo por un fallo de lectura.
    return DIAS_VIGENCIA_POR_DEFECTO;
  }
}

/**
 * `where` del catálogo público: inmuebles activos y vigentes de una cuenta.
 *
 * Es la única puerta por la que portada, catálogo, relacionadas y sitemap leen
 * cartera, para que las cuatro digan siempre lo mismo. `extra` añade filtros
 * (destacados, exclusiones) sin repetir el criterio de vigencia.
 */
export async function whereCatalogoVigente<T extends Record<string, unknown>>(
  tenantId: string,
  extra?: T
) {
  const dias = await diasVigenciaPortal(tenantId);
  return {
    tenantId,
    tipo: 'inmueble' as const,
    activo: true,
    fechaActualizacion: { gte: corteVigencia(dias) },
    ...(extra ?? ({} as T)),
  };
}
