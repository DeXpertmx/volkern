import { describe, it, expect } from 'vitest';
import {
  formatearImporte,
  monedaEfectiva,
  monedaEscritura,
  monedaPredominante,
  primeraMoneda,
  simboloMoneda,
  MONEDAS_SELECCIONABLES,
} from '../lib/hospitality/moneda';

describe('monedaPredominante', () => {
  it('devuelve la moneda que más se repite', () => {
    expect(monedaPredominante(['EUR', 'EUR', 'MXN'])).toBe('EUR');
    expect(monedaPredominante(['MXN', 'EUR', 'MXN'])).toBe('MXN');
  });

  it('ignora los valores vacíos y normaliza a mayúsculas', () => {
    expect(monedaPredominante(['', null, undefined, ' eur '])).toBe('EUR');
  });

  it('devuelve null cuando no hay ninguna moneda, en vez de inventar una', () => {
    expect(monedaPredominante([])).toBeNull();
    expect(monedaPredominante([null, '', undefined])).toBeNull();
  });
});

describe('monedaEfectiva', () => {
  it('el dato manda sobre la moneda del tenant', () => {
    expect(monedaEfectiva(['MXN'], 'EUR')).toBe('MXN');
    expect(monedaEfectiva(['MXN', 'MXN', 'EUR'], 'EUR')).toBe('MXN');
  });

  it('sin datos usa la moneda de reporte del tenant', () => {
    expect(monedaEfectiva([], 'EUR')).toBe('EUR');
    expect(monedaEfectiva([null, '', undefined], ' eur ')).toBe('EUR');
  });

  it('nunca devuelve el valor por defecto del esquema', () => {
    // 'MXN' no aparece por ningún lado si ni los datos ni el tenant lo dicen: el
    // defecto de la base de datos no es una decisión del negocio.
    expect(monedaEfectiva([], null)).toBe('');
    expect(monedaEfectiva([null], undefined)).toBe('');
    expect(monedaEfectiva([], '')).toBe('');
  });
});

describe('primeraMoneda', () => {
  it('respeta el orden de precedencia, no la mayoría', () => {
    // Con dos candidatos distintos, la predominancia daría un empate y decidiría el
    // alfabeto; aquí tiene que ganar el que va primero.
    expect(primeraMoneda('USD', 'EUR')).toBe('USD');
    expect(primeraMoneda(undefined, 'EUR', 'MXN')).toBe('EUR');
    expect(primeraMoneda('', null, ' eur ')).toBe('EUR');
  });

  it('devuelve cadena vacía si ningún candidato trae valor', () => {
    expect(primeraMoneda()).toBe('');
    expect(primeraMoneda(undefined, null, '')).toBe('');
  });
});

describe('monedaEscritura', () => {
  it('usa el primer candidato con valor', () => {
    expect(monedaEscritura('MXN', 'EUR')).toBe('MXN');
    expect(monedaEscritura(undefined, 'EUR')).toBe('EUR');
  });

  it('solo cae al mínimo del esquema cuando no hay nada más', () => {
    // Es una escritura: la columna no admite nulos. En producción el tenant siempre
    // trae moneda, así que este caso no se alcanza.
    expect(monedaEscritura(undefined, undefined)).toBe('MXN');
    expect(monedaEscritura('', null)).toBe('MXN');
  });

  it('nunca devuelve cadena vacía', () => {
    for (const caso of [[], [''], [null], ['', undefined, null]] as Array<Array<string | null | undefined>>) {
      expect(monedaEscritura(...caso)).not.toBe('');
    }
  });
});

describe('MONEDAS_SELECCIONABLES', () => {
  it('es la única lista de divisas que ve la interfaz', () => {
    expect([...MONEDAS_SELECCIONABLES]).toEqual(['MXN', 'USD', 'EUR']);
    for (const moneda of MONEDAS_SELECCIONABLES) {
      expect(simboloMoneda(moneda)).not.toBe('');
    }
  });
});

describe('simboloMoneda', () => {
  it('reconoce las divisas del módulo', () => {
    expect(simboloMoneda('EUR')).toBe('€');
    expect(simboloMoneda('eur')).toBe('€');
    expect(simboloMoneda('USD')).toBe('$');
    expect(simboloMoneda('MXN')).toBe('$');
    expect(simboloMoneda('GBP')).toBe('£');
  });

  it('no inventa símbolo para una divisa desconocida', () => {
    expect(simboloMoneda('XYZ')).toBe('');
    expect(simboloMoneda('')).toBe('');
  });
});

/**
 * Quita los separadores de millar y los espacios tipográficos.
 *
 * El agrupado de millares depende de la versión de ICU del entorno (en español
 * las cifras de cuatro dígitos no se agrupan), así que comprobar el formato
 * exacto ataría el test a la versión de Node en lugar de al comportamiento que
 * importa: la coma decimal y el símbolo de la divisa correcta.
 */
const sinSeparadores = (texto: string) => texto.replace(/[.\u00a0\u202f]/g, '').replace(/\s/g, '');

describe('formatearImporte', () => {
  it('escribe el importe en convención española con su símbolo', () => {
    expect(sinSeparadores(formatearImporte(1234.5, 'EUR'))).toBe('1234,50€');
  });

  it('respeta la moneda que se le pasa en lugar de asumir pesos', () => {
    expect(sinSeparadores(formatearImporte(63350, 'EUR', 0))).toBe('63350€');
    expect(sinSeparadores(formatearImporte(63350, 'MXN', 0))).toBe('63350$');
  });

  it('un importe ausente no se pinta como cero', () => {
    expect(formatearImporte(null, 'EUR')).toBe('—');
    expect(formatearImporte(undefined, 'EUR')).toBe('—');
    expect(formatearImporte(Number.NaN, 'EUR')).toBe('—');
  });

  it('el cero sí es un importe válido', () => {
    expect(sinSeparadores(formatearImporte(0, 'EUR'))).toBe('0,00€');
  });
});
