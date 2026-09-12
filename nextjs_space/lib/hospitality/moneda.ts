/**
 * Presentación de importes de Hospitality.
 *
 * Una sola definición de cómo se escribe el dinero en el módulo. El dato manda:
 * la moneda sale de la reserva o de la unidad, nunca de una constante escrita en
 * la vista. El esquema trae `'MXN'` como valor por defecto en todos los campos de
 * moneda, así que fijarla a mano deja a un tenant español mostrando pesos.
 */

/**
 * Divisas que la interfaz ofrece elegir.
 *
 * Vive aquí, y no en cada pantalla, para que las vistas no contengan ningún
 * código de divisa: la guardia de tests falla si aparece uno fuera de este
 * archivo, porque cada literal suelto por el módulo acabó siendo un valor por
 * defecto que nadie eligió.
 */
export const MONEDAS_SELECCIONABLES = ['MXN', 'USD', 'EUR'] as const;

/**
 * Valor que la base de datos exige cuando no hay ninguna divisa que usar.
 *
 * No es una decisión de negocio: las columnas de moneda no admiten nulos, así que
 * es el mínimo que el esquema acepta. Solo se usa en las escrituras y nunca gana
 * sobre un dato real ni sobre la moneda del tenant.
 */
const MONEDA_MINIMA_ESQUEMA = 'MXN';

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
 * Divisa con la que hay que escribir, resuelta en este orden:
 *
 *   1. la que dictan los datos (si hay más de una, la predominante);
 *   2. la moneda de reporte del tenant (`Tenant.moneda`), que es la fuente
 *      autoritativa y existe desde que se crea la cuenta;
 *   3. cadena vacía, para no inventar una divisa cuando no hay ni datos ni
 *      tenant del que tirar.
 *
 * El valor por defecto del esquema nunca entra en esta cadena: es el último
 * recurso del motor de base de datos, no una decisión del negocio.
 */
export function monedaEfectiva(
  valores: Array<string | null | undefined>,
  monedaTenant?: string | null
): string {
  return monedaPredominante(valores) || (monedaTenant || '').trim().toUpperCase() || '';
}

/**
 * Primera divisa presente de una lista ordenada por precedencia.
 *
 * A diferencia de `monedaPredominante`, aquí el orden manda: sirve para cadenas
 * del tipo "lo que pidió el cliente, si no lo que hereda, si no la del tenant".
 * Devuelve cadena vacía si ninguna trae valor.
 */
export function primeraMoneda(...valores: Array<string | null | undefined>): string {
  for (const valor of valores) {
    const moneda = (valor || '').trim().toUpperCase();
    if (moneda) return moneda;
  }
  return '';
}

/**
 * Divisa con la que se escribe un registro nuevo (unidad, plan, reserva).
 *
 * Toma los candidatos en orden de precedencia y aplica al final la red de
 * seguridad que exigen las escrituras, donde guardar cadena vacía sería peor que
 * el mínimo del esquema. Centralizarla aquí evita que cada ruta cargue con su
 * propio `|| 'MXN'`, que es como el valor del esquema terminó decidiendo la divisa
 * de todo el módulo.
 */
export function monedaEscritura(...valores: Array<string | null | undefined>): string {
  return primeraMoneda(...valores) || MONEDA_MINIMA_ESQUEMA;
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
