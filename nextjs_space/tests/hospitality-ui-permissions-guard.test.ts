import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TODAS_LAS_CAPACIDADES } from '@/lib/hospitality/capacidades';

/**
 * Guardia de la interfaz de Hospitality: que no se ofrezca una acción que la API
 * va a rechazar.
 *
 * La guardia de la API (`hospitality-permissions-guard.test.ts`) comprueba que
 * cada endpoint exige capacidad. Esta comprueba lo otro: que la interfaz no
 * enseñe el botón. Una acción sin permiso que se ofrece y devuelve 403 es peor
 * que una acción que no está, porque promete algo que el usuario no puede hacer.
 *
 * La regla: **toda acción que escribe** —la que dispara un POST/PATCH/PUT/DELETE,
 * ya sea con un manejador propio o con un `fetch` escrito dentro del propio
 * `onClick`— tiene que estar dentro de un `<AccionHospitality>`. Se comprueba
 * sobre el código real de las páginas, no sobre una lista mantenida a mano, así
 * que una acción nueva sin permiso falla aunque nadie se acuerde de esta prueba.
 *
 * Se permite la excepción del rol: no se está comprobando *quién* puede, solo
 * que la decisión pasa por el único sitio donde se decide (`puedePorRol`), que
 * es el mismo que usa el servidor.
 */

const RAIZ = path.resolve(__dirname, '..');
const DASHBOARD = 'app/dashboard/hospitality';
/**
 * Una llamada mutante es la que manda `method:` con un verbo que escribe. Se
 * acepta cualquier cosa entre el `:` y el verbo porque hay handlers que eligen
 * en línea (`method: editing ? 'PATCH' : 'POST'`), y ese caso es justo el que se
 * escapó la primera vez: la comprobación lo daba por lectura.
 */
const METODOS_MUTANTES = /method:\s*[^\n]*'(POST|PATCH|PUT|DELETE)'/;

/** Todas las páginas del módulo, incluidas las que cuelgan de subcarpetas. */
function listarPaginas(dir = DASHBOARD): string[] {
  const absoluto = path.join(RAIZ, dir);
  const encontradas: string[] = [];
  for (const entrada of fs.readdirSync(absoluto, { withFileTypes: true })) {
    const relativo = path.posix.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontradas.push(...listarPaginas(relativo));
    } else if (entrada.name === 'page.tsx') {
      encontradas.push(relativo);
    }
  }
  return encontradas;
}

/**
 * Devuelve el rango de profundidad de cada `<AccionHospitality>`. Como el
 * componente devuelve un fragmento, se anidan pocas veces, pero se cuenta la
 * profundidad por si acaso: dentro de uno hay dos abiertos, cuenta dos.
 *
 * `profundidad[i]` es la profundidad *justo antes* de la posición i del archivo.
 */
function profundidadesAccion(src: string): number[] {
  const profundidad: number[] = new Array(src.length).fill(0);
  const re = /<(\/?)AccionHospitality\b/g;
  let m: RegExpExecArray | null;
  let actual = 0;
  let ultimo = 0;
  while ((m = re.exec(src)) !== null) {
    for (let i = ultimo; i <= m.index; i++) profundidad[i] = actual;
    actual += m[1] === '/' ? -1 : 1;
    ultimo = m.index;
  }
  for (let i = ultimo; i < src.length; i++) profundidad[i] = actual;
  return profundidad;
}

/** Nombres de las funciones que escriben (las que contienen una llamada mutante). */
function manejadoresMutantes(src: string): Set<string> {
  const declaraciones: { nombre: string; inicio: number }[] = [];
  const re = /(?:const|let|function)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:useCallback\(\s*)?(?:async\s*)?\(|function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    declaraciones.push({ nombre: m[1] || m[2], inicio: m.index });
  }

  const mutantes = new Set<string>();
  declaraciones.forEach((d, i) => {
    const fin = i + 1 < declaraciones.length ? declaraciones[i + 1].inicio : src.length;
    if (METODOS_MUTANTES.test(src.slice(d.inicio, fin))) mutantes.add(d.nombre);
  });
  return mutantes;
}

/**
 * Los eventos desde los que se puede disparar una escritura. `onClick` es el
 * habitual, pero un formulario (`onSubmit`) o una tecla (`onKeyDown`) pueden
 * lanzar la misma petición, y una acción escondida detrás de un Enter sería
 * exactamente el mismo problema.
 */
const EVENTOS = 'onClick|onSubmit|onKeyDown|onDoubleClick';

/**
 * Extrae la expresión de cada manejador de evento, respetando llaves dentro de
 * objetos y plantillas para no cortar antes de tiempo.
 */
function expresionesDeEvento(src: string): { texto: string; indice: number }[] {
  const resultados: { texto: string; indice: number }[] = [];
  const re = new RegExp(`(?:${EVENTOS})=\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let nivel = 1;
    let comilla: string | null = null;
    while (i < src.length && nivel > 0) {
      const c = src[i];
      if (comilla) {
        if (c === '\\') i++;
        else if (c === comilla) comilla = null;
      } else if (c === '"' || c === "'" || c === '`') {
        comilla = c;
      } else if (c === '{') nivel++;
      else if (c === '}') nivel--;
      i++;
    }
    resultados.push({ texto: src.slice(m.index + m[0].length, i - 1), indice: m.index });
  }
  return resultados;
}

function lineaDe(src: string, indice: number): number {
  return src.slice(0, indice).split('\n').length;
}

interface Violacion {
  archivo: string;
  linea: number;
  detalle: string;
}

const paginas = listarPaginas();

describe('ninguna acción que escribe se ofrece sin permiso', () => {
  it('encuentra las páginas (la guardia no está mirando al vacío)', () => {
    expect(paginas.length).toBeGreaterThanOrEqual(13);
  });

  it('cada acción mutante está dentro de un <AccionHospitality>', () => {
    const violaciones: Violacion[] = [];

    for (const archivo of paginas) {
      const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
      const mutantes = manejadoresMutantes(src);
      const profundidad = profundidadesAccion(src);

      for (const { texto, indice } of expresionesDeEvento(src)) {
        const escribeDirecto = METODOS_MUTANTES.test(texto);
        const llamaMutante = [...mutantes].some((nombre) =>
          new RegExp(`\\b${nombre}\\b`).test(texto)
        );
        if (!escribeDirecto && !llamaMutante) continue;

        if (profundidad[indice] === 0) {
          const quien = [...mutantes].find((n) => new RegExp(`\\b${n}\\b`).test(texto));
          violaciones.push({
            archivo,
            linea: lineaDe(src, indice),
            detalle: quien ? `llama a ${quien}` : 'escribe dentro del propio manejador',
          });
        }
      }
    }

    expect(
      violaciones,
      [
        'Estas acciones escriben sin comprobar el rol; el usuario las verá y la API responderá 403:',
        ...violaciones.map((v) => `  ${v.archivo}:${v.linea} → ${v.detalle}`),
      ].join('\n')
    ).toEqual([]);
  });

  it('cada capacidad usada en la interfaz existe en el catálogo', () => {
    const catalogo = new Set<string>(TODAS_LAS_CAPACIDADES);
    const desconocidas: Violacion[] = [];

    for (const archivo of paginas) {
      const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
      const re = /capacidad="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (!catalogo.has(m[1])) {
          desconocidas.push({ archivo, linea: lineaDe(src, m.index), detalle: m[1] });
        }
      }
    }

    expect(
      desconocidas,
      `Capacidades que no existen en el catálogo:\n${desconocidas
        .map((v) => `  ${v.archivo}:${v.linea} → ${v.detalle}`)
        .join('\n')}`
    ).toEqual([]);
  });

  it('el alcance es el dashboard: la reserva pública no se esconde a nadie', () => {
    // El widget de reserva directa (`components/hospitality/booking/`) escribe,
    // pero quien lo usa es el huésped de la web, no un usuario con rol: no hay
    // permiso que comprobarle. Se comprueba que sigue fuera del alcance a
    // propósito, para que nadie lo "arregle" envolviendo la reserva pública en
    // un guard de rol que dejaría la web sin poder reservar.
    const fueraDeAlcance = fs.existsSync(path.join(RAIZ, 'components/hospitality/booking'));
    expect(fueraDeAlcance).toBe(true);
    expect(paginas.some((p) => p.includes('components/'))).toBe(false);
  });

  it('la decisión del navegador es la misma regla que la del servidor', () => {
    // Si el hook reimplementara la comprobación, bastaría con que una de las dos
    // capas cambiara para que la interfaz ofreciera botones que la API rechaza.
    const hook = fs.readFileSync(path.join(RAIZ, 'hooks/use-capacidades-hospitality.ts'), 'utf8');
    expect(hook).toContain('puedePorRol');

    const componente = fs.readFileSync(
      path.join(RAIZ, 'components/hospitality/AccionHospitality.tsx'),
      'utf8'
    );
    expect(componente).toContain('useCapacidadesHospitality');
  });
});
