import { describe, it, expect } from 'vitest';
import {
  esMonedaSoportada,
  formatearImporte,
  formatearMedida,
  localeDeMoneda,
  monedaEfectiva,
  monedaEscritura,
  monedaPredominante,
  primeraMoneda,
  MONEDAS_SELECCIONABLES,
} from '../lib/moneda';

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
    // Es la unión de lo que los formularios ya ofrecían suelto: seguros daba
    // EUR/MXN/USD y real estate añadía COP en sus dos pantallas de inmuebles.
    // Al centralizarla, la lista no podía encogerse y dejar sin opción a quien
    // ya facturaba en pesos colombianos.
    expect([...MONEDAS_SELECCIONABLES]).toEqual(['MXN', 'USD', 'EUR', 'COP']);
    for (const moneda of MONEDAS_SELECCIONABLES) {
      expect(esMonedaSoportada(moneda)).toBe(true);
    }
  });
});

describe('esMonedaSoportada', () => {
  it('reconoce las divisas del módulo, sin importar el formato', () => {
    expect(esMonedaSoportada('EUR')).toBe(true);
    expect(esMonedaSoportada('eur')).toBe(true);
    expect(esMonedaSoportada(' eur ')).toBe(true);
  });

  it('rechaza lo que no es una divisa conocida', () => {
    expect(esMonedaSoportada('XYZ')).toBe(false);
    expect(esMonedaSoportada('')).toBe(false);
    expect(esMonedaSoportada(null)).toBe(false);
    expect(esMonedaSoportada(undefined)).toBe(false);
  });
});

describe('localeDeMoneda', () => {
  it('el peso se escribe en convención mexicana y el euro en española', () => {
    expect(localeDeMoneda('MXN')).toBe('es-MX');
    expect(localeDeMoneda('mxn')).toBe('es-MX');
    expect(localeDeMoneda(' eur ')).toBe('es-ES');
  });

  it('una divisa sin convención declarada usa la de la plataforma', () => {
    expect(localeDeMoneda('USD')).toBe('es-ES');
    expect(localeDeMoneda('XYZ')).toBe('es-ES');
    expect(localeDeMoneda('')).toBe('es-ES');
    expect(localeDeMoneda(null)).toBe('es-ES');
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

/** Cambia los espacios tipográficos de `Intl` por espacios normales. */
const espaciosNormales = (texto: string) => texto.replace(/[\u00a0\u202f]/g, ' ');

describe('formatearImporte', () => {
  it('escribe el importe en convención española con su símbolo', () => {
    expect(sinSeparadores(formatearImporte(1234.5, 'EUR'))).toBe('1234,50€');
  });

  it('cada divisa se escribe en la convención de su tenant', () => {
    // Es la decisión de producto: un tenant con la moneda en pesos ve `$1,235`,
    // y uno con la moneda en euros `1235 €`. La decide el módulo, no la pantalla.
    expect(formatearImporte(1235.4, 'MXN', 0)).toBe('$1,235');
    expect(espaciosNormales(formatearImporte(1235.4, 'EUR', 0))).toBe('1235 €');
  });

  it('el dólar y el peso no se confunden aunque los dos lleven `$`', () => {
    const usd = formatearImporte(1235.4, 'USD', 0);
    const mxn = formatearImporte(1235.4, 'MXN', 0);

    expect(usd).not.toBe(mxn);
    expect(usd).toMatch(/US/);
    expect(mxn).toBe('$1,235');
  });

  it('no lanza con una divisa que no reconoce', () => {
    // Un código malformado hacía lanzar RangeError al formateo nativo y dejaba la
    // pantalla en blanco; ahora se escribe el importe sin símbolo.
    expect(sinSeparadores(formatearImporte(1200, 'XX'))).toBe('1200,00');
    expect(sinSeparadores(formatearImporte(1200, ''))).toBe('1200,00');
    // Un código bien formado pero desconocido no es un error: se escribe tal cual,
    // que informa más que un símbolo inventado.
    expect(sinSeparadores(formatearImporte(1200, 'XYZ'))).toBe('1200,00XYZ');
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

describe('formatearMedida', () => {
  it('escribe una medida sin ceros de relleno', () => {
    // Una distancia declarada como «5 km» no se convierte en «5,0 km»: los
    // decimales de una medida son opcionales, a diferencia de los de un importe.
    expect(formatearMedida(5)).toBe('5');
    expect(formatearMedida(12.5)).toBe('12,5');
    expect(formatearMedida(0.4)).toBe('0,4');
  });

  it('limita los decimales al máximo indicado', () => {
    expect(formatearMedida(1.234, 2)).toBe('1,23');
    expect(formatearMedida(1.234, 1)).toBe('1,2');
  });

  it('cambia de convención con el idioma de quien lee', () => {
    // La ficha pública del hotel existe en dos idiomas: la unidad cambia con él
    // (`km`/`mi`) y el número tiene que cambiar igual.
    expect(formatearMedida(12.5, 2, 'es-ES')).toBe('12,5');
    expect(formatearMedida(12.5, 2, 'en-US')).toBe('12.5');
  });

  it('una medida ausente no se pinta como cero', () => {
    expect(formatearMedida(null)).toBe('—');
    expect(formatearMedida(undefined)).toBe('—');
    expect(formatearMedida(Number.NaN)).toBe('—');
  });

  it('el cero sí es una medida válida', () => {
    expect(formatearMedida(0)).toBe('0');
  });
});
