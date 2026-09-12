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
 * seguros escribía así tres importes. Esa dimensión tiene su propio inventario
 * (`moneda-simbolos-baseline.json`) y su propio techo, separados de los códigos
 * para que ninguno de los dos techos se mueva por culpa del otro.
 *
 * Los dos inventarios se regeneran a la vez, y nunca para dar de alta deuda nueva:
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
 *     y la frase de ejemplo de un clasificador de intenciones: son datos de
 *     muestra que el usuario lee, no decisiones de formato.
 *   • **Deuda real heredada** en el resto de la plataforma (agentes y skills,
 *     hubs, automatizaciones, web pública), que sí es trabajo pendiente y por eso
 *     puede bajar pero no subir. Los verticales que ya están a cero —Hospitality,
 *     inmobiliario, seguros, ERP, finanzas, fiscal, facturación y nóminas— no
 *     vuelven al inventario.
 *
 * Las fechas quedan fuera de la regla: `Intl.DateTimeFormat` y `toLocaleDateString`
 * están permitidos, porque lo que se persigue es el dinero y no el idioma.
 */

const RAIZ = process.cwd();
const MODULO_UNICO = 'lib/moneda.ts';
const RUTA_BASELINE = join(RAIZ, 'tests', 'moneda-baseline.json');
const RUTA_BASELINE_SIMBOLOS = join(RAIZ, 'tests', 'moneda-simbolos-baseline.json');

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
 * Es el hueco que la primera versión de esta guardia dejaba pasar. Tres formas
 * reconocidas, todas con la cifra al lado:
 *
 *   • `€99`      — símbolo antes de una cifra;
 *   • `€{total}` — símbolo antes de una expresión (JSX o plantilla);
 *   • `99 €`     — cifra antes del símbolo.
 */
const SIMBOLO_EUROPEO = /[€£¥]\s*(?=\d)|[€£¥]\s*(?=(?:\{(?!\$)|\$\{))|\d\s*[€£¥]/g;

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
 * Devuelve `{ divisa, formato, simbolo }`: cuántos códigos de divisa, cuántos
 * formateos de dinero hechos a mano y cuántos importes escritos con símbolo
 * contiene.
 */
export function medir(codigo: string): { divisa: number; formato: number; simbolo: number } {
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

  return { divisa, formato, simbolo };
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
 * Va en su propio archivo, y no como un tercer campo del anterior, para que los
 * dos techos sean independientes: rebajar deuda de códigos no puede aflojar el
 * techo de los símbolos ni al revés. Las zonas limpias nunca entran aquí —su
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

const baseline: Record<string, { divisa: number; formato: number }> = existsSync(RUTA_BASELINE)
  ? JSON.parse(readFileSync(RUTA_BASELINE, 'utf8'))
  : {};

const baselineSimbolos: Record<string, { simbolo: number }> = existsSync(RUTA_BASELINE_SIMBOLOS)
  ? JSON.parse(readFileSync(RUTA_BASELINE_SIMBOLOS, 'utf8'))
  : {};

const totalDe = (inv: Record<string, { divisa: number; formato: number }>) =>
  Object.values(inv).reduce(
    (acc, v) => ({ divisa: acc.divisa + v.divisa, formato: acc.formato + v.formato }),
    { divisa: 0, formato: 0 }
  );

const totalDeSimbolos = (inv: Record<string, { simbolo: number }>) =>
  Object.values(inv).reduce((acc, v) => acc + v.simbolo, 0);

/** Escribe los dos inventarios cuando la prueba se corre para regenerarlos. */
function regenerar(): void {
  writeFileSync(RUTA_BASELINE, `${JSON.stringify(inventario(), null, 2)}\n`);
  writeFileSync(RUTA_BASELINE_SIMBOLOS, `${JSON.stringify(inventarioSimbolos(), null, 2)}\n`);
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
    const limpio = { divisa: 0, formato: 0, simbolo: 0 };
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
    // Símbolo antes de una cifra, antes de una expresión y después de la cifra.
    expect(medir("const precio = '€1,200.00';").simbolo).toBe(1);
    expect(medir('<span className="font-black">€{plan.precio}</span>').simbolo).toBe(1);
    expect(medir('const etiqueta = `€${total}`;').simbolo).toBe(1);
    expect(medir("const umbral = 'aprobación si supera 5.000 €';").simbolo).toBe(1);
    expect(medir('const pvp = "$1,500.00";').simbolo).toBe(1);
    expect(medir('const desde = "$99";').simbolo).toBe(1);
    expect(medir('return <td>$0.00</td>;').simbolo).toBe(1);
  });

  it('no confunde la interpolación, el parámetro de SQL ni el grupo de una expresión regular', () => {
    const limpio = { divisa: 0, formato: 0, simbolo: 0 };
    expect(medir('const url = `/api/leads/${id}/notas`;')).toEqual(limpio);
    expect(medir('const sql = `SELECT x FROM "User" WHERE id = $1`;')).toEqual(limpio);
    expect(medir("const sql = `WHERE zona = $2::text`;")).toEqual(limpio);
    expect(medir("const nombre = valor.replace(/(x)/g, '$1');")).toEqual(limpio);
    expect(medir('const total = €formateado;')).toEqual(limpio);
  });

  it('ignora lo que solo está en un comentario', () => {
    const limpio = { divisa: 0, formato: 0, simbolo: 0 };
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
        const { divisa, formato, simbolo } = medir(readFileSync(join(RAIZ, archivo), 'utf8'));
        return divisa || formato || simbolo
          ? [`${archivo} (divisa=${divisa} formato=${formato} simbolo=${simbolo})`]
          : [];
      })
      .sort();

    expect(infracciones).toEqual([]);
  });

  it('las zonas limpias no aparecen en ninguno de los dos inventarios', () => {
    expect(Object.keys(baseline).filter(estaEnZonaLimpia)).toEqual([]);
    expect(Object.keys(baselineSimbolos).filter(estaEnZonaLimpia)).toEqual([]);
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
    // /api/tenant/moneda (203 → 202) y por último finanzas, fiscal, facturación y
    // nóminas, que bajaron a 134 tras dejar de escribir `'EUR'` por defecto y al
    // sacar del recuento las fechas con `toLocaleString`, que nunca fueron dinero.
    // El techo solo puede bajar; cada bajada exige regenerar el inventario, así que
    // queda en el diff y se ve.
    expect(Object.keys(baseline).length).toBeLessThanOrEqual(134);
    expect(divisa).toBeGreaterThan(0);
    expect(divisa).toBeLessThanOrEqual(341);
    expect(formato).toBeLessThanOrEqual(122);
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

  it('la deuda de símbolos está acotada (y es sobre todo páginas públicas y datos de ejemplo)', () => {
    // Al regenerar, el inventario en memoria todavía es el anterior: el techo se
    // comprueba en la pasada siguiente, que es la que lee el archivo recién escrito.
    if (ACTUALIZAR) return;
    // Techo del día en que se inventarió: no es un objetivo. Solo puede bajar, y
    // cada bajada exige regenerar el archivo, así que se ve en el diff. Nació en
    // 77 archivos / 292 importes, bajó a 75 / 290 al migrar los dos únicos que
    // había en zonas limpias (el ejemplo del envío de prueba de Hospitality y el
    // filtro de precio del grid inmobiliario), a 67 / 256 al darle a la sección de
    // Finanzas la divisa del tenant —sus pantallas escribían euros a mano— y a
    // 66 / 254 al quitarle el euro fijo al resumen de la consolidación.
    expect(Object.keys(baselineSimbolos).length).toBeLessThanOrEqual(66);
    expect(totalDeSimbolos(baselineSimbolos)).toBeGreaterThan(0);
    expect(totalDeSimbolos(baselineSimbolos)).toBeLessThanOrEqual(254);
  });
});
