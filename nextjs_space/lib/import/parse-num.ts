/**
 * Interpreta un número escrito con separadores de miles/decimales de forma
 * determinista y robusta.
 *
 * La clave es detectar el FORMATO por el patrón del propio valor (no solo por
 * la moneda del tenant): un archivo europeo puede llegar a un tenant no-EUR y
 * viceversa. La moneda solo actúa como desempate en el caso genuinamente
 * ambiguo (`1.234` sin coma: en EUR son 1234, en USD 1,234).
 *
 * Casos soportados:
 *  - Europeo:    1.234,56 · 240,39 · 1.234 · 12.000,50
 *  - Americano:  1,234.56 · 240.39 · 1,234
 *  - Número real de Excel (formato general): 1234.56 → 1234.56 (¡no 123456!)
 */
export function parseNum(value: unknown, currency?: string | null): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let s = String(value).trim().replace(/\s/g, '');
  if (!s) return null;

  const isEuro = (currency || '').toUpperCase() === 'EUR';

  // Entero limpio: sin separadores.
  if (!s.includes(',') && !s.includes('.')) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  // Patrones fuertes (independientes de la moneda).
  const euroMiles = /^\d{1,3}(\.\d{3})+(,\d+)?$/; // 1.234,56 | 1.234 | 1.234.567,89
  const euroComaDecimal = /^\d+,\d{1,2}$/; // 240,39 (sin puntos de miles)
  const usMiles = /^\d{1,3}(,\d{3})+(\.\d+)?$/; // 1,234.56 | 1,234

  if (isEuro) {
    if (euroMiles.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (euroComaDecimal.test(s)) {
      s = s.replace(',', '.');
    } else if (usMiles.test(s)) {
      // Archivo con formato americano llegando a un tenant EUR: respetar el archivo.
      s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      // Coma con patrón raro: tratarla como decimal.
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes('.')) {
      // Sin coma: punto de miles (grupos de 3) o punto decimal real.
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      // else: decimal real (1234.56) → se mantiene.
    }
  } else {
    if (usMiles.test(s)) {
      s = s.replace(/,/g, '');
    } else if (euroMiles.test(s)) {
      // Archivo europeo llegando a un tenant no-EUR: respetar el archivo.
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (euroComaDecimal.test(s)) {
      s = s.replace(',', '.');
    } else if (s.includes(',')) {
      // Coma con patrón raro en no-EUR: quitar comas (miles).
      s = s.replace(/,/g, '');
    } else if (s.includes('.')) {
      // Punto: decimal real → mantener; solo puntos de miles (2+ grupos) → quitar.
      if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, '');
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
