/**
 * Helpers compartidos de formateo para los componentes del dashboard
 * ejecutivo de Seguros (portfolio + timeline). Reusables desde cualquier
 * módulo que necesite moneda, fechas relativas o absolutas en español.
 *
 * El formateo lo hace `lib/moneda.ts`, que es el único módulo de la plataforma
 * que conoce divisas y formatos de dinero (lo verifica
 * `tests/moneda-plataforma-guard.test.ts`). Este archivo conserva su firma para no
 * tocar las llamadas de seguros.
 *
 * Las páginas deben pasar siempre la moneda explícita (`snapshot.tenantMoneda` o
 * `poliza.moneda`); el valor por defecto solo cubre el caso de tests o utilidades
 * que no tienen acceso al snapshot, y ya no es un literal escondido tras un
 * alias: es el mínimo del esquema, definido una sola vez.
 */
import { MONEDA_MINIMA_ESQUEMA, formatearImporte } from '@/lib/moneda';

/**
 * Formatea un número como moneda. El tipo es `string` (no `Currency`) porque los
 * endpoints devuelven `string` en runtime (validado contra `SUPPORTED_CURRENCIES`).
 */
export function formatCurrency(
  value: number,
  currency: string = MONEDA_MINIMA_ESQUEMA
): string {
  if (!Number.isFinite(value)) return formatearImporte(0, currency, 0);
  return formatearImporte(value, currency, 0);
}

/**
 * Variante con decimales: para pólizas individuales donde los céntimos importan.
 * Usar como `formatCurrencyExact(p.primaAnual, p.moneda)`.
 */
export function formatCurrencyExact(
  value: number,
  currency: string = MONEDA_MINIMA_ESQUEMA
): string {
  if (!Number.isFinite(value)) return formatearImporte(0, currency, 2);
  return formatearImporte(value, currency, 2);
}

/**
 * Formatea una fecha ISO como 'DD MMM YYYY' (ej. '15 may 2026') en español. Si
 * Intl no está disponible, cae al slice de la ISO.
 */
export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Devuelve el delta humano entre una fecha ISO y el momento actual.
 * Pasado → 'Hace 5d'. Hoy → 'Hoy'. Futuro cercano → 'En Xd' / 'En Xsem' / 'En Xmes'.
 */
export function formatRelative(iso: string): string {
  const target = new Date(iso).getTime();
  const diffMs = target - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Hace ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Hoy';
  if (diffDays < 7) return `En ${diffDays}d`;
  if (diffDays < 30) return `En ${Math.round(diffDays / 7)}sem`;
  return `En ${Math.round(diffDays / 30)}mes`;
}
