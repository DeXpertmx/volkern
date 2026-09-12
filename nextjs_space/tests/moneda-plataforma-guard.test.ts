import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Guardia de dinero de la plataforma.
 *
 * La regla: **`lib/moneda.ts` es el único archivo que puede contener un código de
 * divisa o un formato de dinero**. Todo lo demás pide la divisa a los datos —o a la
 * moneda de reporte del tenant— y escribe el importe con `formatearImporte`.
 *
 * Por qué existe. La plataforma tenía tres formas de escribir dinero conviviendo
 * (ERP, seguros y Hospitality, cada una con su locale y su divisa por defecto) y los
 * códigos sueltos acabaron siendo valores por defecto que nadie eligió. El resultado
 * visible: un tenant español con importes en pesos, y esos mismos pesos guardados en
 * la base de datos.
 *
 * Cómo se aplica, en dos niveles:
 *
 *   • **Zonas limpias, cero tolerancia.** Hospitality (ERP de alojamiento) ya no
 *     tiene ni un literal: la guardia falla ante el primero.
 *   • **Ratchet con recuento exacto.** El resto de la plataforma tiene deuda
 *     heredada: mock data de aseguradoras, plantillas de CSV de ejemplo y
 *     formateos sueltos. Está inventariada en `moneda-baseline.json`, archivo por
 *     archivo, y **no puede crecer**: cualquier literal nuevo, en un archivo nuevo
 *     o en uno ya listado, hace fallar esta prueba.
 *
 * Regenerar el inventario tras reducir deuda (nunca para dar de alta deuda nueva):
 *
 *   MONEDA_BASELINE=update npx vitest run tests/moneda-plataforma-guard.test.ts
 *
 * Las fechas quedan fuera de la regla: `Intl.DateTimeFormat` y `toLocaleDateString`
 * están permitidos, porque lo que se persigue es el dinero y no el idioma.
 */

const RAIZ = process.cwd();
const MODULO_UNICO = 'lib/moneda.ts';
const RUTA_BASELINE = join(RAIZ, 'tests', 'moneda-baseline.json');

/** Zonas sin deuda: aquí la regla es absoluta. */
const ZONAS_LIMPIAS = [
  'lib/hospitality',
  'app/dashboard/hospitality',
  'app/api/hospitality',
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
 * Motivos por los que un archivo rompe la regla.
 *
 * Devuelve `{ divisa, formato }`: cuántos códigos de divisa y cuántos formateos de
 * dinero hechos a mano contiene.
 */
export function medir(codigo: string): { divisa: number; formato: number } {
  const limpio = sinComentarios(codigo);

  const divisa = (limpio.match(/\b(MXN|USD|EUR|GBP|JPY|CNY|CAD|BRL|CLP|ARS|COP|PEN)\b/g) || [])
    .length;

  let formato = 0;
  if (/style:\s*['"]currency['"]/.test(limpio)) formato += 1;
  formato += (limpio.match(/\bIntl\.NumberFormat\b/g) || []).length;
  // Un número con locale explícito es dinero: los recuentos van sin locale y las
  // fechas por `Intl.DateTimeFormat` o `toLocaleDateString`.
  formato += (limpio.match(/\.toLocaleString\(\s*['"`]/g) || []).length;

  return { divisa, formato };
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

const baseline: Record<string, { divisa: number; formato: number }> = existsSync(RUTA_BASELINE)
  ? JSON.parse(readFileSync(RUTA_BASELINE, 'utf8'))
  : {};

const totalDe = (inv: Record<string, { divisa: number; formato: number }>) =>
  Object.values(inv).reduce(
    (acc, v) => ({ divisa: acc.divisa + v.divisa, formato: acc.formato + v.formato }),
    { divisa: 0, formato: 0 }
  );

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
    expect(medir('formatearImporte(importe, moneda, 2)')).toEqual({ divisa: 0, formato: 0 });
    expect(medir("monedaEfectiva(filas.map((f) => f.moneda), auth.tenant?.moneda)")).toEqual({
      divisa: 0,
      formato: 0,
    });
    expect(medir("new Intl.DateTimeFormat('es-MX', { month: 'short' })").formato).toBe(0);
    expect(medir("fecha.toLocaleDateString('es-ES', { day: '2-digit' })").formato).toBe(0);
    expect(medir('count.toLocaleString()').formato).toBe(0);
  });

  it('ignora lo que solo está en un comentario', () => {
    expect(medir("// el esquema trae 'MXN' por defecto\nconst x = 1;")).toEqual({
      divisa: 0,
      formato: 0,
    });
    expect(medir("/* antes era moneda || 'MXN' */\nconst x = 1;")).toEqual({
      divisa: 0,
      formato: 0,
    });
  });
});

describe('las zonas limpias no tienen ni un literal', () => {
  it('recorre más de 1.000 archivos (la guardia no se autoengaña)', () => {
    expect(archivosDeLaPlataforma().length).toBeGreaterThan(1000);
  });

  it('Hospitality no fija divisas ni formatos de dinero en ningún archivo', () => {
    const infracciones = archivosDeLaPlataforma()
      .filter(estaEnZonaLimpia)
      .flatMap((archivo) => {
        const { divisa, formato } = medir(readFileSync(join(RAIZ, archivo), 'utf8'));
        return divisa || formato ? [`${archivo} (divisa=${divisa} formato=${formato})`] : [];
      })
      .sort();

    expect(infracciones).toEqual([]);
  });

  it('las zonas limpias no aparecen en el inventario de deuda', () => {
    const coladas = Object.keys(baseline).filter(estaEnZonaLimpia);
    expect(coladas).toEqual([]);
  });
});

describe('la deuda del resto de la plataforma no puede crecer', () => {
  it('el inventario coincide con el baseline, archivo por archivo', () => {
    const actual = inventario();

    if (ACTUALIZAR) {
      writeFileSync(RUTA_BASELINE, `${JSON.stringify(actual, null, 2)}\n`);
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
    // la deuda, ya rebajado al arreglar las escrituras de ERP (246 → 242 archivos).
    // El techo solo puede bajar; cada bajada exige regenerar el inventario, así que
    // queda en el diff y se ve.
    expect(Object.keys(baseline).length).toBeLessThanOrEqual(242);
    expect(divisa).toBeGreaterThan(0);
    expect(divisa).toBeLessThanOrEqual(624);
    expect(formato).toBeLessThanOrEqual(242);
  });

  it('la mayor parte de la deuda son catálogos y datos de ejemplo, no decisiones', () => {
    // Deja constancia de dónde vive el grueso, para que el inventario sea legible.
    const grandes = Object.entries(baseline)
      .filter(([, c]) => c.divisa + c.formato >= 18)
      .map(([archivo]) => archivo);

    expect(grandes.length).toBeLessThanOrEqual(7);
  });
});
