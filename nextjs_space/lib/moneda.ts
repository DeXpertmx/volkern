/**
 * El dinero de Volkern: única definición de divisas y de cómo se escriben.
 *
 * Regla de la plataforma, verificada por `tests/moneda-plataforma-guard.test.ts`:
 *
 *   **Este archivo es el único que puede contener un código de divisa o un
 *   formato de dinero.** Todo lo demás pide la divisa a los datos —o a la moneda
 *   de reporte del tenant— y escribe el importe con `formatearImporte`.
 *
 * Por qué existe. La plataforma tenía tres formas de escribir dinero conviviendo
 * (`lib/utils`, `components/insurance/portfolio-format` y el módulo de
 * Hospitality, cada uno con su locale y su divisa por defecto) y los códigos
 * sueltos acabaron siendo valores por defecto que nadie eligió: un tenant español
 * veía pesos, y los guardaba al crear una unidad, una reserva o una póliza.
 *
 * El esquema de datos trae `'MXN'` como valor por defecto en todos los campos de
 * moneda. Eso es el mínimo que acepta el motor de base de datos, **no** una
 * decisión de negocio, así que aquí nunca participa como primera opción.
 */

/**
 * Divisas que la plataforma reconoce.
 *
 * Es la lista que valida seguros (`SUPPORTED_CURRENCIES` la reexporta) y la que
 * da forma al tipo `Currency`.
 */
export const MONEDAS_SOPORTADAS = [
  'USD',
  'EUR',
  'MXN',
  'GBP',
  'JPY',
  'CNY',
  'CAD',
  'BRL',
  'CLP',
  'ARS',
  'COP',
  'PEN',
] as const;

/** Código ISO 4217 de una divisa soportada. */
export type Currency = (typeof MONEDAS_SOPORTADAS)[number];

/**
 * Divisas que la interfaz ofrece elegir en un formulario.
 *
 * Deliberadamente corta: es una decisión de producto, no la lista de lo que el
 * sistema sabe leer. Vive aquí para que ninguna vista contenga un código.
 */
export const MONEDAS_SELECCIONABLES = ['MXN', 'USD', 'EUR'] as const;

/**
 * Valor que la base de datos exige cuando no hay ninguna divisa que usar.
 *
 * No es una decisión de negocio: las columnas de moneda no admiten nulos, así que
 * es el mínimo que el esquema acepta. Solo se usa en las escrituras y nunca gana
 * sobre un dato real ni sobre la moneda del tenant. Sustituye al antiguo
 * `CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY`, que era el mismo literal repetido
 * en otro módulo.
 */
export const MONEDA_MINIMA_ESQUEMA: Currency = 'MXN';

/**
 * Convención de escritura de cada divisa.
 *
 * El formato del dinero acompaña a la divisa —y con ella al tenant—, no a la
 * interfaz: un tenant con la moneda en pesos espera `$1,235.40`, y uno con la
 * moneda en euros `1.235,40 €`. Como las filas heredan la divisa del tenant
 * (`monedaEfectiva` cae a `Tenant.moneda`), esto hace que cada tenant vea el
 * dinero en su propia convención sin que ninguna vista tenga que saberlo.
 *
 * La lista es deliberadamente corta: solo declara las convenciones que los
 * tenants reales usan. Añadir una es una línea, y va aquí, no en una pantalla.
 */
const CONVENCION_POR_DIVISA: Record<string, string> = {
  MXN: 'es-MX',
};

/** Convención de la plataforma cuando la divisa no declara una propia. */
const CONVENCION_POR_DEFECTO = 'es-ES';

/**
 * Convención regional con la que se escribe un importe de esa divisa.
 *
 * Es la única traducción de divisa a formato que existe en la plataforma.
 */
export function localeDeMoneda(moneda: string | null | undefined): string {
  const codigo = (moneda || '').trim().toUpperCase();
  return CONVENCION_POR_DIVISA[codigo] || CONVENCION_POR_DEFECTO;
}

/** ¿Es una divisa que la plataforma reconoce? */
export function esMonedaSoportada(valor: string | null | undefined): valor is Currency {
  const moneda = (valor || '').trim().toUpperCase();
  return (MONEDAS_SOPORTADAS as readonly string[]).includes(moneda);
}

/**
 * Moneda predominante de una lista de valores.
 *
 * Devuelve `null` si no hay ninguno: en ese caso el consumidor decide su respaldo,
 * en vez de que este módulo invente una divisa.
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
 *   3. cadena vacía, para no inventar una divisa cuando no hay ni datos ni tenant
 *      del que tirar.
 *
 * El valor por defecto del esquema nunca entra en esta cadena.
 */
export function monedaEfectiva(
  valores: Array<string | null | undefined>,
  monedaTenant?: string | null
): string {
  return monedaPredominante(valores) || primeraMoneda(monedaTenant);
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
 * Divisa con la que se escribe un registro nuevo (unidad, plan, reserva, póliza).
 *
 * Toma los candidatos en orden de precedencia y aplica al final la red de
 * seguridad que exigen las escrituras, donde guardar cadena vacía sería peor que
 * el mínimo del esquema.
 */
export function monedaEscritura(...valores: Array<string | null | undefined>): string {
  return primeraMoneda(...valores) || MONEDA_MINIMA_ESQUEMA;
}

/**
 * Importe formateado en la convención de su divisa, con su símbolo.
 *
 * Un valor ausente devuelve '—' en lugar de un cero que parecería un dato.
 *
 * La convención la decide `localeDeMoneda` y no el llamador: así una pantalla no
 * puede escribir el dinero de un tenant con las costumbres de otro. El símbolo lo
 * resuelve `Intl` y no una tabla propia; comprobar el símbolo a mano fue
 * justamente el defecto que esta guardia existe para impedir, y el tipo de cambio
 * de divisas ya se equivocó por eso en `formatCurrency`.
 *
 * Una divisa que `Intl` no reconoce devuelve el número sin símbolo en lugar de
 * lanzar: el formateo nativo lanza `RangeError` con un código inválido, y eso
 * dejaba pantallas en blanco.
 */
export function formatearImporte(
  valor: number | null | undefined,
  moneda: string,
  decimales = 2
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';

  const codigo = (moneda || '').trim().toUpperCase();
  const locale = localeDeMoneda(codigo);
  const opciones = {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  };

  if (codigo) {
    try {
      return new Intl.NumberFormat(locale, {
        ...opciones,
        style: 'currency',
        currency: codigo,
      }).format(valor);
    } catch {
      // Divisa desconocida: se escribe el número solo, sin inventarle un símbolo.
    }
  }

  return valor.toLocaleString(locale, opciones);
}
