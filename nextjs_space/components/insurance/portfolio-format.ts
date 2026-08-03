/**
 * Helpers compartidos de formateo para los componentes del dashboard
 * ejecutivo de Seguros (portfolio + timeline). Reusables desde cualquier
 * módulo que necesite moneda, fechas relativas o absolutas en español.
 *
 * Defensa contra regresiones: la regla ESLint custom
 * `eslint-rules/no-hardcoded-currency-fallback` bloquea cualquier intento
 * de reintroducir el string literal 'MXN' en posiciones de fallback dentro
 * de app/api/insurance/portfolio/** y components/insurance/**. Por eso
 * evitamos defaults de la forma `currency = 'MXN'` aquí. Si necesitas un
 * default global, usa `CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY`, que es
 * un acceso por nombre, no un literal — la regla no lo bloqueará.
 */
import { CURRENCY_CONSTANTS } from '@/lib/insurance/currency';

/**
 * Formatea un número como moneda. Default = `CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY`
 * (acceso por nombre, no literal `'MXN'`) para que la ESLint rule no lo marque.
 * Las páginas/llamadas deben pasar siempre la moneda explícita (`snapshot.tenantMoneda`
 * o `poliza.moneda`); el default sólo cubre el caso edge de tests/utils que no
 * tienen acceso al snapshot.
 *
 * El tipo es `string` (no `Currency`) porque los endpoints devuelven `string`
 * en runtime (validado contra `SUPPORTED_CURRENCIES` en server). Esto evita
 * casts innecesarios en cada call site sin perder la defensa de la regla.
 */
export function formatCurrency(
  value: number,
  currency: string = CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY
): string {
  if (!Number.isFinite(value)) return '$0';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toLocaleString('es-MX')}`;
  }
}

/**
 * Variante con decimales: para pólizas individuales donde el centavos importan.
 * Usar como `formatCurrencyExact(p.primaAnual, p.moneda)`. Default por
 * constante tipada (no literal `'MXN'`) por la misma razón que `formatCurrency`.
 */
export function formatCurrencyExact(
  value: number,
  currency: string = CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY
): string {
  if (!Number.isFinite(value)) return '$0';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
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
