/**
 * Interpreta manualmente un número escrito en una moneda concreta sin perder precisión.
 *
 * Convención por moneda (ISO 4217):
 *  - EUR y monedas europeas: separador de miles = punto, separador decimal = coma (1.234,56).
 *  - USD / MXN y resto:       separador de miles = coma, separador decimal = punto (1,234.56).
 *
 * Si `currency` viene definido se usa esa convención de forma determinista, resolviendo
 * la ambigüedad de valores como `1.234` (que en EUR son mil doscientos treinta y cuatro,
 * pero en USD serían 1,234). Si `currency` es null se intenta auto-detectar aplicando
 * la heurística de formato europeo cuando hay punto de miles seguido de coma decimal,
 * y americano en caso contrario.
 */
export function parseNum(value: unknown, currency?: string | null): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let s = String(value).trim().replace(/\s/g, '');
  if (!s) return null;

  const isEuro = (currency || '').toUpperCase() === 'EUR';

  // Solo tratamos separadores si la cadena no es un entero limpio.
  if ((s.includes(',') || s.includes('.')) && !/^[+-]?\d+$/.test(s)) {
    if (isEuro) {
      // Europeo: quitar puntos de miles, coma -> punto decimal.
      // 1.234.567,89 -> 1234567.89 ; 240,39 -> 240.39 ; 1.234 -> 1234
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (currency == null || currency === '') {
      // Sin moneda definida: auto-detectar. El patrón típico europeo usa coma
      // como decimal (240,39). Si aparece una coma, la tratamos como decimal;
      // los puntos, si hay grupos de 3 que preceden a la coma, son miles.
      if (s.includes(',')) {
        // 1.234,56 -> 1234.56 ; 240,39 -> 240.39
        if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          s = s.replace(',', '.');
        }
      } else {
        // Solo puntos: si siguen el patrón de miles (1.234) son miles europeos;
        // un punto aislado sin grupos de 3 (1.23) se deja como decimal.
        if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
          s = s.replace(/\./g, '');
        }
      }
    } else {
      // Americano: quitar comas de miles, punto queda como decimal.
      // 1,234,567.89 -> 1234567.89 ; 240.39 -> 240.39 ; 1,234 -> 1234
      s = s.replace(/,/g, '');
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}