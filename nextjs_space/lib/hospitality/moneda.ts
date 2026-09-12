/**
 * Presentación de importes de Hospitality.
 *
 * Una sola definición de cómo se escribe el dinero en el módulo. El dato manda:
 * la moneda sale de la reserva o de la unidad, nunca de una constante escrita en
 * la vista. El esquema trae `'MXN'` como valor por defecto en todos los campos de
 * moneda, así que fijarla a mano deja a un tenant español mostrando pesos.
 */

/**
 * Moneda predominante de una lista de valores.
 *
 * Devuelve `null` si no hay ninguno: en ese caso el consumidor decide su
 * respaldo, en vez de que este módulo invente una divisa.
 */
export function monedaPredominante(valores: Array<string | null | undefined>): string | null {
  const conteo = new Map<string, number>();
  for (const valor of valores) {
    const moneda = (valor || '').trim().toUpperCase();
    if (!moneda) continue;
    conteo.set(moneda, (conteo.get(moneda) || 0) + 1);
  }
  if (conteo.size === 0) return null;

  return Array.from(conteo.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Símbolo de la moneda. Devuelve cadena vacía si no se reconoce, para no
 * etiquetar un importe con un símbolo que no le corresponde.
 */
export function simboloMoneda(moneda: string): string {
  switch ((moneda || '').trim().toUpperCase()) {
    case 'EUR':
      return '€';
    case 'USD':
      return '$';
    case 'MXN':
      return '$';
    case 'GBP':
      return '£';
    default:
      return '';
  }
}

/**
 * Importe formateado en convención española con su símbolo.
 * Un valor ausente devuelve '—' en lugar de un cero que parecería un dato.
 */
export function formatearImporte(
  valor: number | null | undefined,
  moneda: string,
  decimales = 2
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';

  const numero = valor.toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  const simbolo = simboloMoneda(moneda);
  return `${numero} ${simbolo}`.trim();
}
