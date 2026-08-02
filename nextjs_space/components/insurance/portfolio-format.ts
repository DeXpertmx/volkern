/**
 * Helpers compartidos de formateo para los componentes del dashboard
 * ejecutivo de Seguros (portfolio + timeline). Reusables desde cualquier
 * módulo que necesite moneda MXN, fechas relativas o absolutas en español.
 */

/**
 * Formatea un número como moneda. Usa `Intl.NumberFormat('es-MX', currency)`
 * y cae a `$N.toLocaleString('es-MX')` si el entorno no soporta Intl.
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
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
