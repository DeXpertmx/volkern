import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Guardia de dinero de la plataforma.
 *
 * La regla: **`lib/moneda.ts` es el único archivo que puede contener un código de
 * divisa, un formato de dinero o un símbolo pegado a una cifra**. Todo lo demás pide
 * la divisa a los datos —o a la moneda de reporte del tenant— y escribe el importe
 * con `formatearImporte`.
 *
 * Por qué existe. La plataforma tenía tres formas de escribir dinero conviviendo
 * (ERP, seguros y Hospitality, cada una con su locale y su divisa por defecto) y los
 * códigos sueltos acabaron siendo valores por defecto que nadie eligió. El resultado
 * visible: un tenant español con importes en pesos, y esos mismos pesos guardados en
 * la base de datos.
 *
 * Cómo se aplica, en dos niveles:
 *
 *   • **Zonas limpias, cero tolerancia.** Hospitality (ERP de alojamiento) y el
 *     vertical inmobiliario ya no tienen ni un literal: la guardia falla ante el
 *     primero.
 *   • **Ratchet con recuento exacto.** El resto de la plataforma tiene deuda
 *     heredada. Está inventariada en `moneda-baseline.json`, archivo por archivo,
 *     y **no puede crecer**: cualquier literal nuevo, en un archivo nuevo o en
 *     uno ya listado, hace fallar esta prueba.
 *
 * Y una segunda dimensión, porque la primera dejaba un hueco: **el dinero escrito
 * con símbolo**, sin código ISO que delate la divisa. `€{precio}` o `99 €` en una
 * tarjeta de precio eran invisibles para el detector de códigos, y la portada de
 * seguros escribía así tres importes. También lo era el símbolo pegado **detrás**
 * de una expresión —`${total}€`, que es como el motor de agentes respondía por
 * Telegram—: la dimensión miraba la cifra y no el cierre de la expresión. Esa
 * dimensión tiene su propio inventario (`moneda-simbolos-baseline.json`) y su
 * propio techo, separados de los códigos para que ninguno de los dos techos se
 * mueva por culpa del otro.
 *
 * Quedaba un tercer borde, el del símbolo **sin vecindad**: un `'€'` como valor,
 * un `{ MXN: '$', EUR: '€' }` escrito a mano, un `6M€` en el texto de una
 * descripción. No tiene cifra al lado ni cierre de expresión delante, así que
 * ninguna de las cuatro formas lo veía. Tiene su propio inventario
 * (`moneda-simbolos-sueltos-baseline.json`) y su propio techo, y no cuenta el
 * símbolo que vive dentro de un patrón —`/[€$£]/g`, `€?\s*([\d.,]+)`—, porque
 * ese no escribe dinero: lo lee.
 *
 * Los tres inventarios se regeneran a la vez, y nunca para dar de alta deuda nueva:
 *
 *   MONEDA_BASELINE=update npx vitest run tests/moneda-plataforma-guard.test.ts
 *
 * Qué queda en el inventario y por qué, para que nadie lo confunda con trabajo
 * pendiente:
 *
 *   • **Contratos de proveedor** (`lib/insurance/connectors/…`, incluido su mock
 *     data). Los códigos de divisa son los que envía la aseguradora en su payload;
 *     reescribirlos como constantes de la plataforma sería mentir sobre el
 *     contrato externo.
 *   • **Tabla de tipos de cambio** (`lib/insurance/currency.ts`). Sus claves son
 *     divisas por definición; es el único sitio donde un mapa de códigos no es
 *     deuda.
 *   • **Ejemplos de plantilla de importación** (`lib/insurance/csv-template.ts`)
 *     y las frases de ejemplo de los clasificadores de intención
 *     (`lib/agents/intents/*.ts`): son datos de muestra —lo que el usuario
 *     escribe—, no decisiones de formato de la plataforma, y por eso un `5000€`
 *     ahí no es deuda aunque el inventario lo cuente.
 *   • **El símbolo suelto tiene su propio inventario**
 *     (`moneda-simbolos-sueltos-baseline.json`). Cuenta lo que no tiene ni cifra
 *     ni expresión al lado —un mapa `{ EUR: '€' }` escrito a mano, un `'€'` como
 *     valor, un `6M€` en una descripción— y deja fuera el símbolo que vive dentro
 *     de un patrón de lectura, que es reconocimiento y no escritura.
 *   • **Deuda real heredada** en el resto de la plataforma (skills, hubs,
 *     automatizaciones, web pública), que sí es trabajo pendiente y por eso
 *     puede bajar pero no subir. El motor de agentes ya no está en la lista: sus
 *     mensajes piden la divisa al dato o al tenant. Los verticales que ya están a cero —Hospitality,
 *     inmobiliario, seguros, ERP, finanzas, fiscal, facturación y nóminas— no
 *     vuelven al inventario.
 *   • **Superficies públicas ya migradas**, que ya no aparecen: el portal del
 *     cliente (`app/portal/[token]`), el PDF del contrato público, los datos del
 *     sitio público del tenant (`app/api/public/users/[slug]`), las fichas y el
 *     carrusel de inmuebles (`app/p/[tenantSlug]/…`), los planes públicos
 *     (`app/api/public/plans`), las diez portadas de vertical —que ahora leen el
 *     precio mensual de `lib/vertical-plans.ts`, la misma fuente que usa el
 *     cobro— y la landing de la campaña Neting, que deriva sus importes de su
 *     propio objeto `PRICING` en vez de repetir `€299` treinta veces.
 *   • **Portadas anteriores ya retiradas** (`components/public/PricingClient.tsx`,
 *     `NewLanding.tsx`): no las importaba ninguna página y se inventariaron
 *     primero, para que borrarlas fuese una decisión explícita y no un efecto
 *     colateral de una migración. Ya no existen.
 *
 * Las fechas quedan fuera de la regla: `Intl.DateTimeFormat` y `toLocaleDateString`
 * están permitidos, porque lo que se persigue es el dinero y no el idioma.
 */

const RAIZ = process.cwd();
const MODULO_UNICO = 'lib/moneda.ts';
const RUTA_BASELINE = join(RAIZ, 'tests', 'moneda-baseline.json');
const RUTA_BASELINE_SIMBOLOS = join(RAIZ, 'tests', 'moneda-simbolos-baseline.json');
const RUTA_BASELINE_SUELTOS = join(RAIZ, 'tests', 'moneda-simbolos-sueltos-baseline.json');

/** Zonas sin deuda: aquí la regla es absoluta. */
const ZONAS_LIMPIAS = [
  'lib/hospitality',
  'app/dashboard/hospitality',
  'app/api/hospitality',
  // El vertical inmobiliario bajó a cero y se queda en cero.
  'lib/real-estate',
  'app/dashboard/real-estate',
  'app/api/real-estate',
  'lib/puck/components/real-estate',
];

const CARPETAS = ['app', 'components', 'lib'];
const EXTENSIONES = ['.ts', '.tsx'];
const IGNORAR = ['node_modules', '.next', 'dist', '__tests__', '.d.ts'];

const ACTUALIZAR = process.env.MONEDA_BASELINE === 'update';

/** Quita comentarios: el código puede explicar el bug sin cometerlo. */
export function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Dinero escrito con símbolo en vez de con su código ISO.
 *
 * Es el hueco que la primera versión de esta guardia dejaba pasar. Cuatro formas
 * reconocidas, todas con la cifra o la expresión al lado:
 *
 *   • `€99`       — símbolo antes de una cifra;
 *   • `€{total}`  — símbolo antes de una expresión (JSX o plantilla);
 *   • `99 €`      — cifra antes del símbolo;
 *   • `${total}€` — símbolo **después** de una expresión. Era el último punto
 *     ciego y el más caro: la regla miraba la cifra, así que el importe
 *     interpolado con el símbolo pegado detrás —la forma en que el motor de
 *     agentes respondía por Telegram— no se veía. Solo el cierre de una expresión
 *     (`}`, `)` o `]`) delante del símbolo lo delata. El símbolo que no tiene ni
 *     cifra ni cierre al lado no entra aquí: tiene su propia dimensión, más abajo.
 */
const SIMBOLO_EUROPEO =
  /[€£¥]\s*(?=\d)|[€£¥]\s*(?=(?:\{(?!\$)|\$\{))|\d\s*[€£¥]|[}\]\)]\s*[€£¥]/g;

/**
 * Dólar junto a una cifra.
 *
 * El `$` es ambiguo en JavaScript, y por eso no se persigue a ciegas: `${x}` es
 * interpolación, `$1` es un parámetro ligado de Postgres y `'$1'` la referencia a
 * un grupo de una expresión regular. Ninguno de los tres es dinero. Cuenta solo
 * cuando la cifra tiene forma de importe: separador de millares (`$1,500.00`),
 * decimales (`$0.00`), dos o tres dígitos sueltos (`$99`) o sufijo de magnitud
 * (`$2M`). Un `$5` solo es indistinguible de un parámetro, y queda fuera a
 * propósito: esa es la parte del hueco que sigue abierta.
 */
const SIMBOLO_DOLAR =
  /\$\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\s*\d+\.\d{1,2}|\$\s*\d{2,3}(?![\d,.])|\$\s*\d(?=[A-Z]\b)/g;

/**
 * Símbolo de divisa **suelto**: el que no tiene ni cifra ni expresión al lado.
 *
 * Es el tercer borde del hueco, y el que obligó a darle su propio recuento,
 * porque aquí la frontera no la marca el símbolo sino su contexto:
 *
 *   • `const s = '€';`         — un símbolo como valor, sin nada alrededor;
 *   • `` `total: ${x} K €` ``  — un importe con sufijo de magnitud (`6M€`);
 *   • `{ MXN: '$', EUR: '€' }` — un mapa de símbolos escrito a mano.
 *
 * Los tres son dinero escrito a mano. Lo que **no** cuenta es el símbolo dentro
 * de un patrón —`/[€$£]/g`, `€?\s*([\d.,]+)`, `/€\s*$/`—: ese no escribe dinero,
 * lo reconoce, y vive en los lectores de facturas y de OCR. Medido antes de
 * decidir: de los 67 símbolos sin vecindad que hay en la plataforma, 25 son
 * patrones de lectura y 42 son escrituras. Contarlos todos habría metido 25
 * falsos positivos en el inventario.
 *
 * La distinción es mecánica y no adivina: al símbolo le sigue un metacaracter de
 * expresión regular, o le precede un `\` o un `[`, y entonces es un patrón.
 *
 * El `$` queda fuera, por la misma razón que en la dimensión de al lado: un `$`
 * suelto es indistinguible de un parámetro ligado o de una interpolación, y
 * contarlo llenaría el inventario de `WHERE id = $1`.
 */
const METACARACTER_TRAS_SIMBOLO = new Set([
  '?',
  '*',
  '+',
  '{',
  '}',
  '|',
  '\\',
  '/',
  ']',
  '^',
  '$',
]);
const ABRE_PATRON_ANTES = new Set(['\\', '[']);

/**
 * Cuenta los símbolos de divisa europeos que no tienen vecindad.
 *
 * Excluye los que ya cuenta `SIMBOLO_EUROPEO` —las dimensiones no se solapan,
 * para que un mismo importe no engorde dos techos— y los que viven dentro de un
 * patrón.
 */
function contarSimboloSuelto(limpio: string): number {
  const cubiertos = new Set<number>();
  const cubiertas = new RegExp(SIMBOLO_EUROPEO.source, 'g');
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = cubiertas.exec(limpio)) !== null) {
    const indice = coincidencia[0].search(/[€£¥]/);
    if (indice >= 0) cubiertos.add(coincidencia.index + indice);
  }

  let total = 0;
  const simbolos = /[€£¥]/g;
  while ((coincidencia = simbolos.exec(limpio)) !== null) {
    if (cubiertos.has(coincidencia.index)) continue;
    const antes = limpio[coincidencia.index - 1] || '';
    const despues = limpio[coincidencia.index + 1] || '';
    if (METACARACTER_TRAS_SIMBOLO.has(despues) || ABRE_PATRON_ANTES.has(antes)) continue;
    total += 1;
  }

  return total;
}

/**
 * Cuenta los `.toLocaleString('es-ES')` que escriben dinero.
 *
 * Una fecha también se escribe con `.toLocaleString('es-ES')` —`new
 * Date(…).toLocaleString('es-ES')` en la bandeja de gastos— y eso es una fecha
 * con formato, no dinero. Si la expresión del mismo renglón abre un `Date(`, no
 * cuenta: contarla inventaba deuda que no existía y quien la leyera iba a
 * "arreglar" un formateo de fecha.
 */
function contarToLocaleStringDeNumero(codigo: string): number {
  const patron = /\.toLocaleString\(\s*['"`]/g;
  let total = 0;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patron.exec(codigo)) !== null) {
    const inicioDeLinea = codigo.lastIndexOf('\n', coincidencia.index) + 1;
    const antes = codigo.slice(inicioDeLinea, coincidencia.index);
    if (/\bDate\s*\(/.test(antes)) continue;
    total += 1;
  }

  return total;
}

/**
 * Motivos por los que un archivo rompe la regla.
 *
 * Devuelve `{ divisa, formato, simbolo, suelto }`: cuántos códigos de divisa,
 * cuántos formateos de dinero hechos a mano, cuántos importes escritos con símbolo
 * y cuántos símbolos sueltos —sin cifra ni expresión al lado— contiene.
 */
export function medir(codigo: string): {
  divisa: number;
  formato: number;
  simbolo: number;
  suelto: number;
} {
  const limpio = sinComentarios(codigo);

  const divisa = (limpio.match(/\b(MXN|USD|EUR|GBP|JPY|CNY|CAD|BRL|CLP|ARS|COP|PEN)\b/g) || [])
    .length;

  let formato = 0;
  if (/style:\s*['"]currency['"]/.test(limpio)) formato += 1;
  formato += (limpio.match(/\bIntl\.NumberFormat\b/g) || []).length;
  // Un número con locale explícito es dinero: los recuentos van sin locale y las
  // fechas por `Intl.DateTimeFormat` o `toLocaleDateString`.
  formato += contarToLocaleStringDeNumero(limpio);

  const simbolo =
    (limpio.match(SIMBOLO_EUROPEO) || []).length + (limpio.match(SIMBOLO_DOLAR) || []).length;
  // Sin vecindad, y sin contar lo que ya cuenta `simbolo`: las dimensiones no se
  // solapan, para que un importe no engorde dos techos.
  const suelto = contarSimboloSuelto(limpio);

  return { divisa, formato, simbolo, suelto };
}

function archivosFuente(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.some((ignorar) => entrada.includes(ignorar))) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      encontrados.push(...archivosFuente(ruta));
    } else if (EXTENSIONES.some((ext) => entrada.endsWith(ext))) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

function archivosDeLaPlataforma(): string[] {
  return CARPETAS.flatMap((carpeta) => {
    const base = join(RAIZ, carpeta);
    return existsSync(base) ? archivosFuente(base) : [];
  })
    .map((ruta) => relative(RAIZ, ruta).split(sep).join('/'))
    .filter((archivo) => !/\.(test|spec)\.tsx?$/.test(archivo))
    .filter((archivo) => archivo !== MODULO_UNICO);
}

function estaEnZonaLimpia(archivo: string): boolean {
  return ZONAS_LIMPIAS.some((zona) => archivo === zona || archivo.startsWith(`${zona}/`));
}

/** Inventario de la deuda: solo los archivos que rompen la regla, con su recuento. */
function inventario(): Record<string, { divisa: number; formato: number }> {
  const resultado: Record<string, { divisa: number; formato: number }> = {};
  for (const archivo of archivosDeLaPlataforma()) {
    const { divisa, formato } = medir(readFileSync(join(RAIZ, archivo), 'utf8'));
    if (divisa === 0 && formato === 0) continue;
    if (estaEnZonaLimpia(archivo)) continue;
    resultado[archivo] = { divisa, formato };
  }
  return resultado;
}

/**
 * Inventario del dinero escrito con símbolo.
 *
 * Va en su propio archivo, y no como un campo del anterior, para que los techos
 * sean independientes: rebajar deuda de códigos no puede aflojar el techo de los
 * símbolos ni al revés. Las zonas limpias nunca entran aquí —su
 * tolerancia es cero y se comprueba aparte, para que una infracción se lea como
 * infracción y no como una línea más del inventario—.
 */
function inventarioSimbolos(): Record<string, { simbolo: number }> {
  const resultado: Record<string, { simbolo: number }> = {};
  for (const archivo of archivosDeLaPlataforma()) {
    if (estaEnZonaLimpia(archivo)) continue;
    const { simbolo } = medir(readFileSync(join(RAIZ, archivo), 'utf8'));
    if (simbolo === 0) continue;
    resultado[archivo] = { simbolo };
  }
  return resultado;
}

/**
 * Inventario del símbolo suelto.
 *
 * Tercer archivo, tercer techo, por la misma razón que el segundo: la deuda del
 * símbolo pegado a una cifra y la del símbolo sin vecindad se parecen, pero no
 * son la misma y no deben moverse juntas.
 */
function inventarioSueltos(): Record<string, { suelto: number }> {
  const resultado: Record<string, { suelto: number }> = {};
  for (const archivo of archivosDeLaPlataforma()) {
    if (estaEnZonaLimpia(archivo)) continue;
    const { suelto } = medir(readFileSync(join(RAIZ, archivo), 'utf8'));
    if (suelto === 0) continue;
    resultado[archivo] = { suelto };
  }
  return resultado;
}

const baseline: Record<string, { divisa: number; formato: number }> = existsSync(RUTA_BASELINE)
  ? JSON.parse(readFileSync(RUTA_BASELINE, 'utf8'))
  : {};

const baselineSimbolos: Record<string, { simbolo: number }> = existsSync(RUTA_BASELINE_SIMBOLOS)
  ? JSON.parse(readFileSync(RUTA_BASELINE_SIMBOLOS, 'utf8'))
  : {};

const baselineSueltos: Record<string, { suelto: number }> = existsSync(RUTA_BASELINE_SUELTOS)
  ? JSON.parse(readFileSync(RUTA_BASELINE_SUELTOS, 'utf8'))
  : {};

const totalDe = (inv: Record<string, { divisa: number; formato: number }>) =>
  Object.values(inv).reduce(
    (acc, v) => ({ divisa: acc.divisa + v.divisa, formato: acc.formato + v.formato }),
    { divisa: 0, formato: 0 }
  );

const totalDeSimbolos = (inv: Record<string, { simbolo: number }>) =>
  Object.values(inv).reduce((acc, v) => acc + v.simbolo, 0);

const totalDeSueltos = (inv: Record<string, { suelto: number }>) =>
  Object.values(inv).reduce((acc, v) => acc + v.suelto, 0);

/** Escribe los tres inventarios cuando la prueba se corre para regenerarlos. */
function regenerar(): void {
  writeFileSync(RUTA_BASELINE, `${JSON.stringify(inventario(), null, 2)}\n`);
  writeFileSync(RUTA_BASELINE_SIMBOLOS, `${JSON.stringify(inventarioSimbolos(), null, 2)}\n`);
  writeFileSync(RUTA_BASELINE_SUELTOS, `${JSON.stringify(inventarioSueltos(), null, 2)}\n`);
}

describe('el detector reconoce lo que persigue (la guardia se prueba a sí misma)', () => {
  it('detecta una divisa fijada como valor por defecto', () => {
    expect(medir("const moneda = datos?.moneda || 'MXN';").divisa).toBe(1);
    expect(medir("currency: a.currency || 'EUR',").divisa).toBe(1);
  });

  it('detecta el formato de dinero hecho a mano', () => {
    expect(
      medir("new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })").formato
    ).toBeGreaterThan(0);
    expect(medir("valor.toLocaleString('es-MX')").formato).toBe(1);
  });

  it('no marca el código correcto ni confunde fechas con dinero', () => {
    const limpio = { divisa: 0, formato: 0, simbolo: 0, suelto: 0 };
    expect(medir('formatearImporte(importe, moneda, 2)')).toEqual(limpio);
    expect(medir("monedaEfectiva(filas.map((f) => f.moneda), auth.tenant?.moneda)")).toEqual(limpio);
    expect(medir("new Intl.DateTimeFormat('es-MX', { month: 'short' })").formato).toBe(0);
    expect(medir("fecha.toLocaleDateString('es-ES', { day: '2-digit' })").formato).toBe(0);
    expect(medir('count.toLocaleString()').formato).toBe(0);
    // Una fecha con formato tampoco es dinero, aunque use `toLocaleString`.
    expect(medir("new Date(documento.createdAt).toLocaleString('es-ES')").formato).toBe(0);
    expect(medir("new Date(x).toLocaleString('es-ES', { day: '2-digit' })").formato).toBe(0);
    // …pero el mismo método sobre un número sí lo es.
    expect(medir("importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })").formato).toBe(1);
  });

  it('detecta el dinero escrito con símbolo', () => {
    // Símbolo antes de una cifra, antes de una expresión, después de la cifra y
    // después de una expresión.
    expect(medir("const precio = '€1,200.00';").simbolo).toBe(1);
    expect(medir('<span className="font-black">€{plan.precio}</span>').simbolo).toBe(1);
    expect(medir('const etiqueta = `€${total}`;').simbolo).toBe(1);
    expect(medir("const umbral = 'aprobación si supera 5.000 €';").simbolo).toBe(1);
    expect(medir('const pvp = "$1,500.00";').simbolo).toBe(1);
    expect(medir('const desde = "$99";').simbolo).toBe(1);
    expect(medir('return <td>$0.00</td>;').simbolo).toBe(1);
    // El símbolo pegado detrás de una expresión, que es como el motor de agentes
    // escribía cada importe antes de pedir la divisa al dato.
    expect(medir('const respuesta = `Ingresos: ${total}€`;').simbolo).toBe(1);
    expect(medir('const fila = `${etiqueta}${importe}€`;').simbolo).toBe(1);
    expect(medir('return <span>{importe} €</span>;').simbolo).toBe(1);
    expect(medir('const tarifa = `${precio.toFixed(2)} €/noche`;').simbolo).toBe(1);
    expect(medir('console.log(`${formatear(x)}€`);').simbolo).toBe(1);
  });

  it('no confunde la interpolación, el parámetro de SQL ni el grupo de una expresión regular', () => {
    const limpio = { divisa: 0, formato: 0, simbolo: 0, suelto: 0 };
    expect(medir('const url = `/api/leads/${id}/notas`;')).toEqual(limpio);
    expect(medir('const sql = `SELECT x FROM "User" WHERE id = $1`;')).toEqual(limpio);
    expect(medir("const sql = `WHERE zona = $2::text`;")).toEqual(limpio);
    expect(medir("const nombre = valor.replace(/(x)/g, '$1');")).toEqual(limpio);
    // Un cierre seguido de otra interpolación es una plantilla encadenada, no
    // dinero; y un cierre sin símbolo tampoco dice nada.
    expect(medir('const ruta = `${base}${slug}`;')).toEqual(limpio);
    expect(medir('const sql = `WHERE a = $1 AND b = $2`;')).toEqual(limpio);
    // El `$` tras un cierre sigue fuera a propósito: en una expresión regular es
    // el ancla de fin. Con `€` no hay ambigüedad; con `$` la hay.
    expect(medir('const ancla = /\\}$/;')).toEqual(limpio);
  });

  it('detecta el símbolo de divisa que no tiene vecindad', () => {
    expect(medir("const s = '€';").suelto).toBe(1);
    expect(medir('const sufijo = `${x} K €`;').suelto).toBe(1);
    expect(medir("const mapa = { MXN: '$', EUR: '€' };").suelto).toBe(1);
    expect(medir("desc: 'Grandes empresas (>6M€ facturación)'").suelto).toBe(1);
    expect(medir("const label = 'Importe Bruto (€)';").suelto).toBe(1);
    // …y no lo cuenta dos veces cuando ya lo cuenta la dimensión de al lado.
    expect(medir("const precio = '€1,200.00';").suelto).toBe(0);
    expect(medir('const respuesta = `Ingresos: ${total}€`;').suelto).toBe(0);
  });

  it('no cuenta el símbolo que vive dentro de un patrón: eso es leer dinero, no escribirlo', () => {
    expect(medir("valor.replace(/[€$£]/g, '').trim()").suelto).toBe(0);
    expect(medir('full.match(/total\\s*[:.]?\\s*€?\\s*([\\d.,]+)/i)').suelto).toBe(0);
    expect(medir('lines[i].replace(/€/g, "")').suelto).toBe(0);
    expect(medir('terms.match(/(\\d+)\\s*k\\s*€|(\\d+)\\s*mil|(\\d+)\\s*euros/i)').suelto).toBe(0);
  });

  it('ignora lo que solo está en un comentario', () => {
    const limpio = { divisa: 0, formato: 0, simbolo: 0, suelto: 0 };
    const conDivisa = "// el esquema trae 'MXN' por defecto\ncode;";
    expect(medir(conDivisa)).toEqual(limpio);
    expect(medir("/* antes era moneda || 'MXN' */\ncode;")).toEqual(limpio);
    expect(medir('// cuesta €99 al mes\ncode;')).toEqual(limpio);
  });
});

describe('las zonas limpias no tienen ni un literal', () => {
  it('recorre más de 1.000 archivos (la guardia no se autoengaña)', () => {
    expect(archivosDeLaPlataforma().length).toBeGreaterThan(1000);
  });

  it('las zonas limpias no fijan divisas, ni formatos, ni escriben dinero con símbolo', () => {
    const infracciones = archivosDeLaPlataforma()
      .filter(estaEnZonaLimpia)
      .flatMap((archivo) => {
        const { divisa, formato, simbolo, suelto } = medir(
          readFileSync(join(RAIZ, archivo), 'utf8')
        );
        return divisa || formato || simbolo || suelto
          ? [`${archivo} (divisa=${divisa} formato=${formato} simbolo=${simbolo} suelto=${suelto})`]
          : [];
      })
      .sort();

    expect(infracciones).toEqual([]);
  });

  it('las zonas limpias no aparecen en ninguno de los tres inventarios', () => {
    expect(Object.keys(baseline).filter(estaEnZonaLimpia)).toEqual([]);
    expect(Object.keys(baselineSimbolos).filter(estaEnZonaLimpia)).toEqual([]);
    expect(Object.keys(baselineSueltos).filter(estaEnZonaLimpia)).toEqual([]);
  });
});

describe('la deuda del resto de la plataforma no puede crecer', () => {
  it('el inventario coincide con el baseline, archivo por archivo', () => {
    const actual = inventario();

    if (ACTUALIZAR) {
      regenerar();
      return;
    }

    const nuevos = Object.keys(actual).filter((archivo) => !(archivo in baseline));
    const empeorados = Object.keys(actual)
      .filter((archivo) => archivo in baseline)
      .filter(
        (archivo) =>
          actual[archivo].divisa > baseline[archivo].divisa ||
          actual[archivo].formato > baseline[archivo].formato
      )
      .map((archivo) => `${archivo}: ${JSON.stringify(baseline[archivo])} → ${JSON.stringify(actual[archivo])}`);

    expect(
      nuevos.length || empeorados.length
        ? { archivosNuevosConDeuda: nuevos.sort(), archivosQueEmpeoran: empeorados.sort() }
        : {}
    ).toEqual({});
  });

  it('el inventario se mantiene exacto: al reducir deuda hay que actualizarlo', () => {
    if (ACTUALIZAR || !existsSync(RUTA_BASELINE)) return;
    const actual = inventario();

    const mejorados = Object.keys(baseline)
      .filter((archivo) => archivo in actual)
      .filter(
        (archivo) =>
          actual[archivo].divisa < baseline[archivo].divisa ||
          actual[archivo].formato < baseline[archivo].formato
      )
      .map((archivo) => archivo);
    const resueltos = Object.keys(baseline).filter((archivo) => !(archivo in actual));

    expect(
      mejorados.length || resueltos.length
        ? {
            archivosYaSinTodaSuDeuda: resueltos.sort(),
            archivosQueMejoran: mejorados.sort(),
            accion: 'Regenera el inventario con MONEDA_BASELINE=update',
          }
        : {}
    ).toEqual({});
  });

  it('la deuda está acotada y se puede leer de un vistazo', () => {
    const { divisa, formato } = totalDe(baseline);
    // Estos números no son un objetivo: son el techo del día en que se inventarió
    // la deuda, rebajado al migrar escrituras a la divisa del tenant: ERP
    // (246 → 242 archivos), seguros + inmobiliario (242 → 203), la respuesta de
    // /api/tenant/moneda (203 → 202), finanzas, fiscal, facturación y nóminas
    // (202 → 134, al dejar de escribir `'EUR'` por defecto y al sacar del recuento
    // las fechas con `toLocaleString`, que nunca fueron dinero), las superficies
    // públicas (134 → 123: el portal del cliente, el contrato público en PDF, los
    // datos del sitio público, las fichas de inmuebles y las portadas de las
    // verticales, que ahora leen el precio de `lib/vertical-plans.ts`) y el retiro
    // de las dos portadas que no importaba ninguna página (123 → 122).
    // La última bajada (122 → 118 archivos, 323 → 316 divisas y 110 → 87
    // formatos) es la del motor de agentes: sus respuestas escribían cada importe
    // con `toLocaleString('es-ES')` y un `€` pegado, y los clasificadores de
    // intención llevaban la lista de divisas copiada en siete expresiones
    // regulares. Ahora piden la divisa al dato o al tenant y la escriben con
    // `formatearImporte`.
    // El techo solo puede bajar; cada bajada exige regenerar el inventario, así que
    // queda en el diff y se ve.
    expect(Object.keys(baseline).length).toBeLessThanOrEqual(118);
    expect(divisa).toBeGreaterThan(0);
    expect(divisa).toBeLessThanOrEqual(316);
    expect(formato).toBeLessThanOrEqual(87);
  });

  it('la mayor parte de la deuda son catálogos y datos de ejemplo, no decisiones', () => {
    // Deja constancia de dónde vive el grueso, para que el inventario sea legible.
    const grandes = Object.entries(baseline)
      .filter(([, c]) => c.divisa + c.formato >= 18)
      .map(([archivo]) => archivo);

    expect(grandes.length).toBeLessThanOrEqual(7);
  });
});

describe('la deuda de dinero con símbolo no puede crecer', () => {
  it('el inventario de símbolos coincide con su baseline, archivo por archivo', () => {
    const actual = inventarioSimbolos();

    if (ACTUALIZAR) {
      regenerar();
      return;
    }

    const nuevos = Object.keys(actual).filter((archivo) => !(archivo in baselineSimbolos));
    const empeorados = Object.keys(actual)
      .filter((archivo) => archivo in baselineSimbolos)
      .filter((archivo) => actual[archivo].simbolo > baselineSimbolos[archivo].simbolo)
      .map(
        (archivo) =>
          `${archivo}: ${baselineSimbolos[archivo].simbolo} → ${actual[archivo].simbolo}`
      );

    expect(
      nuevos.length || empeorados.length
        ? { archivosNuevosConSimbolos: nuevos.sort(), archivosQueEmpeoran: empeorados.sort() }
        : {}
    ).toEqual({});
  });

  it('el inventario de símbolos se mantiene exacto: al reducir deuda hay que actualizarlo', () => {
    if (ACTUALIZAR || !existsSync(RUTA_BASELINE_SIMBOLOS)) return;
    const actual = inventarioSimbolos();

    const mejorados = Object.keys(baselineSimbolos)
      .filter((archivo) => archivo in actual)
      .filter((archivo) => actual[archivo].simbolo < baselineSimbolos[archivo].simbolo)
      .map((archivo) => archivo);
    const resueltos = Object.keys(baselineSimbolos).filter((archivo) => !(archivo in actual));

    expect(
      mejorados.length || resueltos.length
        ? {
            archivosYaSinSimbolos: resueltos.sort(),
            archivosQueMejoran: mejorados.sort(),
            accion: 'Regenera el inventario con MONEDA_BASELINE=update',
          }
        : {}
    ).toEqual({});
  });

  it('la deuda de símbolos está acotada (y el grueso ya no son las páginas públicas)', () => {
    // Al regenerar, el inventario en memoria todavía es el anterior: el techo se
    // comprueba en la pasada siguiente, que es la que lee el archivo recién escrito.
    if (ACTUALIZAR) return;
    // Techo del día en que se inventarió: no es un objetivo. Solo puede bajar, y
    // cada bajada exige regenerar el archivo, así que se ve en el diff. La única
    // subida admitida es cuando el detector aprende a ver deuda que ya existía: no
    // se escribió ninguna línea de dinero, se dejó de ser ciego. Nació en
    // 77 archivos / 292 importes, bajó a 75 / 290 al migrar los dos únicos que
    // había en zonas limpias (el ejemplo del envío de prueba de Hospitality y el
    // filtro de precio del grid inmobiliario), a 67 / 256 al darle a la sección de
    // Finanzas la divisa del tenant —sus pantallas escribían euros a mano—, a
    // 66 / 254 al quitarle el euro fijo al resumen de la consolidación, a
    // 50 / 182 al migrar las superficies públicas (el portal del cliente, las
    // páginas de inmuebles del sitio del tenant, el PDF del contrato, las tarjetas
    // de seguros y las diez portadas de vertical, que ahora piden el precio a la
    // fuente que usa el cobro), a 49 / 141 al llevar la campaña de Neting a esa
    // misma fuente —sus treinta importes eran copias a mano de los ocho números
    // que ya declaraba su propio objeto `PRICING`—, a 47 / 134 al retirar las dos
    // portadas que no importaba ninguna página y a 46 / 125 al migrar el motor de
    // agentes, que escribía el importe y le pegaba el `€` detrás.
    //
    // Y una subida, la única, 46 / 125 → 63 / 177: la que trae enseñarle a la
    // dimensión el símbolo pegado **detrás** de una expresión. No es deuda nueva
    // —no se escribió ni una línea de dinero para esta pasada— sino deuda que ya
    // estaba ahí y el detector no veía, porque miraba la cifra y no el cierre de la
    // expresión. `${total}€` es la forma en que el motor de agentes respondía por
    // Telegram. Los 17 archivos que afloran son dinero real —el formateador de
    // respuestas del agente, el validador de comandos, la nómina del vertical de
    // RRHH, el PDF del ERP, el mapa de cartera de seguros— y ahora que se ven
    // pueden bajar. Desde aquí el techo solo baja otra vez.
    //
    // Eso devuelve a `lib/agents` al inventario, y con razón: el formateador de
    // respuestas escribe `— ${monto}€` y el validador de comandos
    // `${amount}€ supera el límite`. Lo que sigue inventariado y no es deuda son
    // las frases de ejemplo de tres clasificadores de intención —«crea factura para
    // María García por 5000€»—, que son lo que el usuario escribe, no lo que la
    // plataforma redacta. El grueso nuevo está en piezas que quedaban fuera de todo
    // radar: la nómina de RRHH, el PDF del ERP y los skills de coste e
    // inmobiliario. El exterior de la plataforma —el portal del cliente, el sitio
    // público de cada tenant, las páginas de planes y las portadas de las
    // verticales— sigue a cero.
    expect(Object.keys(baselineSimbolos).length).toBeLessThanOrEqual(63);
    expect(totalDeSimbolos(baselineSimbolos)).toBeGreaterThan(0);
    expect(totalDeSimbolos(baselineSimbolos)).toBeLessThanOrEqual(177);
  });
});

describe('la deuda de símbolo suelto no puede crecer', () => {
  it('el inventario coincide con su baseline, archivo por archivo', () => {
    const actual = inventarioSueltos();

    if (ACTUALIZAR) {
      regenerar();
      return;
    }

    const nuevos = Object.keys(actual).filter((archivo) => !(archivo in baselineSueltos));
    const empeorados = Object.keys(actual)
      .filter((archivo) => archivo in baselineSueltos)
      .filter((archivo) => actual[archivo].suelto > baselineSueltos[archivo].suelto)
      .map(
        (archivo) => `${archivo}: ${baselineSueltos[archivo].suelto} → ${actual[archivo].suelto}`
      );

    expect(
      nuevos.length || empeorados.length
        ? { archivosNuevosConSuelto: nuevos.sort(), archivosQueEmpeoran: empeorados.sort() }
        : {}
    ).toEqual({});
  });

  it('el inventario se mantiene exacto: al reducir deuda hay que actualizarlo', () => {
    if (ACTUALIZAR || !existsSync(RUTA_BASELINE_SUELTOS)) return;
    const actual = inventarioSueltos();

    const mejorados = Object.keys(baselineSueltos)
      .filter((archivo) => archivo in actual)
      .filter((archivo) => actual[archivo].suelto < baselineSueltos[archivo].suelto)
      .map((archivo) => archivo);
    const resueltos = Object.keys(baselineSueltos).filter((archivo) => !(archivo in actual));

    expect(
      mejorados.length || resueltos.length
        ? {
            archivosYaSinSimboloSuelto: resueltos.sort(),
            archivosQueMejoran: mejorados.sort(),
            accion: 'Regenera el inventario con MONEDA_BASELINE=update',
          }
        : {}
    ).toEqual({});
  });

  it('la deuda de símbolo suelto está acotada (y son mapas de símbolos, etiquetas y cifras fijas)', () => {
    if (ACTUALIZAR) return;
    // Nace aquí, en 23 archivos / 42 importes: es la deuda que ninguna de las
    // cuatro formas de vecindad podía ver, medida después de separar el grano.
    // El símbolo dentro de un patrón no entra —son 25 lecturas de dinero, no
    // escrituras, y contarlas habría inflado el inventario a 67 importes en 25
    // archivos—, y el `$` tampoco, por la misma ambigüedad que en la dimensión de
    // al lado. El techo solo puede bajar; cada bajada exige regenerar el archivo,
    // así que queda en el diff y se ve.
    expect(Object.keys(baselineSueltos).length).toBeLessThanOrEqual(23);
    expect(totalDeSueltos(baselineSueltos)).toBeGreaterThan(0);
    expect(totalDeSueltos(baselineSueltos)).toBeLessThanOrEqual(42);
  });
});
