import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Guardia de la divisa en Hospitality.
 *
 * El módulo llegó a tener tres formas de escribir dinero y varios valores por
 * defecto de divisa repartidos por las vistas. Cada literal suelto acabó siendo
 * una decisión que nadie tomó: un tenant europeo veía pesos y, peor, los guardaba
 * al crear una unidad, una reserva o un plan de tarifa.
 *
 * La regla es simple y absoluta: **`lib/hospitality/moneda.ts` es el único archivo
 * de Hospitality que puede contener un código de divisa o un locale de dinero**.
 * Todo lo demás lee la divisa de los datos, y de ahí el respaldo de la moneda del
 * tenant. Este test falla si alguien vuelve a fijar una a mano.
 *
 * Las fechas quedan fuera: `Intl.DateTimeFormat` y `toLocaleDateString` con locale
 * están permitidos. Lo que se persigue es el dinero, no el idioma.
 */

const RAIZ = process.cwd();
const MODULO_DE_MONEDA = 'lib/hospitality/moneda.ts';
const CARPETAS = ['app/dashboard/hospitality', 'app/api/hospitality', 'lib/hospitality'];
const EXTENSIONES = ['.ts', '.tsx'];

/** Quita comentarios: el código puede explicar el bug sin cometerlo. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Fija una divisa o un formato de dinero a mano.
 *
 * Devuelve la lista de motivos encontrados; vacía significa que el archivo solo
 * usa el módulo compartido.
 */
export function divisasFijadasAMano(codigo: string): string[] {
  const limpio = sinComentarios(codigo);
  const motivos: string[] = [];

  const moneda = limpio.match(/\b(MXN|USD|EUR|GBP|JPY|CNY|CAD|BRL|CLP|ARS|COP|PEN)\b/);
  if (moneda) motivos.push(`código de divisa literal: ${moneda[0]}`);

  if (/style:\s*['"]currency['"]/.test(limpio)) {
    motivos.push("formatea dinero a mano con style: 'currency'");
  }
  if (/\bIntl\.NumberFormat\b/.test(limpio)) {
    motivos.push('formatea dinero a mano con Intl.NumberFormat');
  }
  if (/\.toLocaleString\(\s*['"`]/.test(limpio)) {
    // `formatearImporte` se ocupa de los importes; un número con locale explícito
    // es dinero (los recuentos van sin locale y las fechas por su propia API).
    motivos.push('formatea un número con locale explícito (usa formatearImporte)');
  }

  return motivos;
}

function archivosFuente(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      encontrados.push(...archivosFuente(ruta));
    } else if (EXTENSIONES.some((ext) => entrada.endsWith(ext))) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

function superficies(): Array<{ archivo: string; codigo: string }> {
  return CARPETAS.flatMap((carpeta) =>
    archivosFuente(join(RAIZ, carpeta))
      .map((ruta) => ({
        archivo: relative(RAIZ, ruta).split(sep).join('/'),
        codigo: readFileSync(ruta, 'utf8'),
      }))
      // El módulo de moneda es la definición única: aquí sí vive el símbolo, el
      // catálogo de divisas y el mínimo que exige el esquema.
      .filter(({ archivo }) => archivo !== MODULO_DE_MONEDA)
  );
}

describe('el detector reconoce lo que persigue (la guardia se prueba a sí misma)', () => {
  it('detecta una divisa fijada como valor por defecto', () => {
    expect(divisasFijadasAMano("const moneda = datos?.moneda || 'MXN';")).toHaveLength(1);
    expect(divisasFijadasAMano("currency: a.currency || 'EUR',")[0]).toContain('EUR');
  });

  it('detecta el formato de dinero hecho a mano', () => {
    expect(
      divisasFijadasAMano("new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })")
    ).not.toHaveLength(0);
    expect(divisasFijadasAMano("valor.toLocaleString('es-MX')")).toHaveLength(1);
  });

  it('no marca el código correcto ni confunde fechas con dinero', () => {
    expect(divisasFijadasAMano('formatearImporte(importe, moneda, 2)')).toEqual([]);
    expect(divisasFijadasAMano('monedaEfectiva(filas.map((f) => f.moneda), auth.tenant?.moneda)')).toEqual([]);
    // Fechas: permitidas, con su propio API.
    expect(divisasFijadasAMano("new Intl.DateTimeFormat('es-MX', { month: 'short' })")).toEqual([]);
    expect(divisasFijadasAMano("fecha.toLocaleDateString('es-ES', { day: '2-digit' })")).toEqual([]);
    expect(divisasFijadasAMano('count.toLocaleString()')).toEqual([]);
  });

  it('ignora lo que solo está en un comentario', () => {
    expect(divisasFijadasAMano("// el esquema trae 'MXN' por defecto\nconst x = 1;")).toEqual([]);
    expect(divisasFijadasAMano("/* antes era moneda || 'MXN' */\nconst x = 1;")).toEqual([]);
  });
});

describe('las superficies de Hospitality leen la divisa de los datos', () => {
  it('encuentra archivos que revisar (la guardia no se autoengaña)', () => {
    expect(superficies().length).toBeGreaterThan(30);
  });

  it('ningún archivo fija una divisa ni un formato de dinero a mano', () => {
    const infracciones = superficies()
      .flatMap(({ archivo, codigo }) =>
        divisasFijadasAMano(codigo).map((motivo) => `${archivo}: ${motivo}`)
      )
      .sort();

    expect(infracciones).toEqual([]);
  });

  it('el módulo de moneda sigue siendo el único que conoce los códigos', () => {
    const modulo = readFileSync(join(RAIZ, MODULO_DE_MONEDA), 'utf8');
    const otros = superficies().filter(({ codigo }) =>
      /\b(MXN|USD|EUR|GBP|JPY|CNY|CAD|BRL|CLP|ARS|COP|PEN)\b/.test(sinComentarios(codigo))
    );
    expect(otros).toEqual([]);
    expect(modulo).toContain('MONEDAS_SELECCIONABLES');
    expect(modulo).toContain('monedaEscritura');
  });
});
