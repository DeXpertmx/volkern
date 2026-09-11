import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardia de plantillas Docker en los scripts de despliegue.
 *
 * Contexto (regresión real, sin commit de por medio que la detectara):
 * `deploy-vps/run-migrations.sh` consultaba el estado del job de migraciones con
 * `docker service ps --format '{{.Status.Err}}'`. Docker 26 eliminó el campo
 * `.Status` del contexto de tarea de `docker service ps` y la consulta pasó a
 * fallar con «can't evaluate field Status in type *task.taskContext».
 *
 * Como el stderr iba a /dev/null y el script usa `set -euo pipefail`, el pipeline
 * moría EN SILENCIO justo después de aplicar las migraciones y ANTES del
 * `service update`: la base quedaba migrada, el servicio seguía con la imagen
 * vieja y nadie se enteraba. Esa es exactamente la clase de fallo que un test
 * puede atrapar y un despliegue manual no.
 *
 * Esta guardia recorre los scripts de despliegue, extrae las plantillas de
 * `docker ... --format` y falla si usan:
 *   1. un campo retirado (p. ej. `.Status` en el contexto de tarea), o
 *   2. un campo que no pertenece al contexto de la plantilla, o
 *   3. un comando con `--format` que la guardia aún no clasifica (para que no
 *      queden puntos ciegos cuando Docker retira otro campo).
 *
 * Solo analiza el contenido de las plantillas: los comentarios que documentan el
 * caso (como el de `run-migrations.sh`) no cuentan, y hay un self-test que lo
 * demuestra.
 */

// ── Registro de reglas por comando ───────────────────────────────────────────
//
// `campos: null` = salida JSON (los campos dependen del esquema) → no se validan,
// pero el comando SÍ queda clasificado para no dejar puntos ciegos.

interface ReglaComando {
  /** Campos válidos del contexto de la plantilla. `null` = salida JSON. */
  campos: string[] | null;
  /** Campos retirados: motivo + sustituto recomendado. */
  retirados?: Record<string, string>;
  /** Por qué no se validan sus campos. */
  nota?: string;
}

/** Contexto de tarea de Swarm (`docker service ps`, `node ps`, `stack ps`). */
const CAMPOS_TAREA = [
  'ID',
  'Name',
  'Image',
  'Node',
  'DesiredState',
  'CurrentState',
  'Error',
  'Ports',
];

const RETIRADO_STATUS_TAREA =
  'Docker 26 eliminó `.Status` del contexto de tarea. La plantilla falla con ' +
  '«can\'t evaluate field Status in type *task.taskContext»; con `set -euo pipefail` ' +
  'eso aborta el script en silencio. Usa `{{.CurrentState}}` para el estado y ' +
  '`{{.Error}}` para el motivo del fallo.';

const REGLAS: Record<string, ReglaComando> = {
  'service ps': {
    campos: CAMPOS_TAREA,
    retirados: { Status: RETIRADO_STATUS_TAREA },
  },
  'node ps': {
    campos: CAMPOS_TAREA,
    retirados: { Status: RETIRADO_STATUS_TAREA },
  },
  'stack ps': {
    campos: CAMPOS_TAREA,
    retirados: { Status: RETIRADO_STATUS_TAREA },
  },
  ps: {
    // OJO: en el contexto de CONTENEDOR `.Status` sí es válido («Up 3 hours»).
    // El campo retirado es el de TAREA (`docker service ps`), no este.
    campos: [
      'ID',
      'Image',
      'Command',
      'CreatedAt',
      'RunningFor',
      'Ports',
      'State',
      'Status',
      'Size',
      'Names',
      'Labels',
      'Label',
      'Mounts',
      'LocalVolumes',
      'Networks',
    ],
  },
  'image inspect': { campos: null, nota: 'Salida JSON de la imagen.' },
  'container inspect': { campos: null, nota: 'Salida JSON del contenedor.' },
  'service inspect': { campos: null, nota: 'Salida JSON del servicio.' },
  version: { campos: null, nota: 'Salida JSON de `docker version` ({{.Server.Version}}, {{.Client.Version}}…).' },
};

/** Alias de subcomando → clave canónica del registro. */
const ALIAS: Record<string, string> = {
  'container ps': 'ps',
  'container ls': 'ps',
  'container list': 'ps',
};

/**
 * Campos que son texto, no objeto: dereferenciarlos (`.Status.Err`) siempre es
 * un error, aunque el campo base sea válido para ese comando.
 */
const CAMPOS_ESCALARES: Record<string, string[]> = {
  ps: ['Status'],
};

// ── Escáner (puro y testeable por separado) ──────────────────────────────────

export interface Plantilla {
  archivo: string;
  linea: number;
  /** Clave canónica: `service ps`, `ps`, `image inspect`… */
  comando: string;
  plantilla: string;
}

export interface Hallazgo extends Plantilla {
  campo: string;
  motivo: string;
}

interface Logica {
  texto: string;
  /** 1-based: línea raw donde empieza esta línea lógica. */
  linea: number;
  /** inicios[i] = índice dentro de `texto` donde empieza la línea raw `linea + i`. */
  inicios: number[];
}

/** Une continuaciones de línea (`\` al final) conservando el mapeo a líneas reales. */
function lineasLogicas(src: string): Logica[] {
  const raw = src.split('\n');
  const out: Logica[] = [];
  let partes: string[] = [];
  let inicio = 0;

  const cerrar = () => {
    const texto = partes.join(' ');
    const inicios: number[] = [];
    let pos = 0;
    for (const p of partes) {
      inicios.push(pos);
      pos += p.length + 1;
    }
    out.push({ texto, linea: inicio, inicios });
    partes = [];
  };

  for (let i = 0; i < raw.length; i++) {
    const l = raw[i].replace(/\r$/, '');
    if (partes.length === 0) inicio = i + 1;
    if (/\\[ \t]*$/.test(l)) {
      partes.push(l.replace(/\\[ \t]*$/, ''));
      continue;
    }
    partes.push(l);
    cerrar();
  }
  if (partes.length) cerrar();
  return out;
}

/** Línea real (1-based) del índice `idx` dentro de una línea lógica. */
function mapearLinea(l: Logica, idx: number): number {
  let i = 0;
  for (let k = 0; k < l.inicios.length; k++) {
    if (l.inicios[k] <= idx) i = k;
  }
  return l.linea + i;
}

/** Quita comentarios (de línea completa y al final de línea) para no analizar prosa. */
function limpiarComentario(texto: string): string {
  const t = texto.trimStart();
  if (t.startsWith('#') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  return texto.replace(/\s#.*$/, '').replace(/\s\/\/.*$/, '');
}

const RE_FORMAT_ENTRECOMILLADO = /--format[=\s]+(['"])([\s\S]*?)\1/g;
const RE_FORMAT_SIN_COMILLAS = /--format=([^\s'"]+)/g;
const RE_DOCKER = /\bdocker\s+([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?/g;
const RE_PLANTILLA = /\{\{([\s\S]*?)\}\}/g;

/** Última invocación `docker <cmd>` que aparece antes del índice dado. */
function comandoDockerAntes(texto: string, idx: number): string | null {
  RE_DOCKER.lastIndex = 0;
  let mejor: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = RE_DOCKER.exec(texto)) !== null) {
    if (m.index > idx) break;
    mejor = m[2] ? `${m[1]} ${m[2]}` : m[1];
  }
  return mejor;
}

/** Campos referenciados dentro de una plantilla Go (`{{.A.B}}` → A, A.B). */
function camposDePlantilla(plantilla: string): { top: string; segmentos: string[] }[] {
  const campos: { top: string; segmentos: string[] }[] = [];
  RE_PLANTILLA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_PLANTILLA.exec(plantilla)) !== null) {
    for (const token of m[1].trim().split(/\s+/)) {
      if (!token.startsWith('.')) continue;
      // `{{println .}}` → token '.', sin campo.
      const limpio = token.replace(/^\./, '').replace(/[^\w.]/g, '');
      const segmentos = limpio.split('.').filter(Boolean);
      if (!segmentos.length) continue;
      campos.push({ top: segmentos[0], segmentos });
    }
  }
  return campos;
}

/** Analiza el contenido de un archivo (puro: sin tocar el disco). */
export function escanearTexto(contenido: string, archivo: string): {
  plantillas: Plantilla[];
  hallazgos: Hallazgo[];
} {
  const plantillas: Plantilla[] = [];
  const hallazgos: Hallazgo[] = [];

  for (const logica of lineasLogicas(contenido)) {
    const texto = limpiarComentario(logica.texto);
    if (!texto.includes('--format')) continue;
    if (!/\bdocker\b/.test(texto)) continue;

    const coincidencias: { inicio: number; plantilla: string }[] = [];
    for (const re of [RE_FORMAT_ENTRECOMILLADO, RE_FORMAT_SIN_COMILLAS]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto)) !== null) {
        coincidencias.push({ inicio: m.index, plantilla: m[2] ?? m[1] });
      }
    }
    coincidencias.sort((a, b) => a.inicio - b.inicio);

    for (const c of coincidencias) {
      const comando = comandoDockerAntes(texto, c.inicio);
      if (!comando) continue;
      const clave = ALIAS[comando] ?? comando;
      const plantilla: Plantilla = {
        archivo,
        linea: mapearLinea(logica, c.inicio),
        comando: clave,
        plantilla: c.plantilla,
      };
      plantillas.push(plantilla);

      const regla = REGLAS[clave];
      if (!regla) {
        hallazgos.push({
          ...plantilla,
          campo: '(comando sin clasificar)',
          motivo:
            `\`docker ${clave}\` usa --format pero la guardia no lo clasifica. ` +
            'Añádelo a REGLAS con sus campos válidos/retirados, o documéntalo como salida JSON ' +
            '(`campos: null`) para que no sea un punto ciego si Docker retira un campo.',
        });
        continue;
      }
      if (regla.campos === null) continue;

      for (const campo of camposDePlantilla(c.plantilla)) {
        const retirado = regla.retirados?.[campo.top];
        if (retirado) {
          hallazgos.push({ ...plantilla, campo: campo.top, motivo: retirado });
          continue;
        }
        if (CAMPOS_ESCALARES[clave]?.includes(campo.top) && campo.segmentos.length > 1) {
          hallazgos.push({
            ...plantilla,
            campo: campo.segmentos.join('.'),
            motivo:
              `\`.${campo.top}\` en \`docker ${clave}\` es un texto (p. ej. «Up 3 hours»), no un objeto: ` +
              `\`.${campo.segmentos.join('.')}\` no existe. Usa \`{{.${campo.top}}}\` o \`{{.State}}\`.`,
          });
          continue;
        }
        if (!regla.campos.includes(campo.top)) {
          hallazgos.push({
            ...plantilla,
            campo: campo.top,
            motivo:
              `\`{{.${campo.top}}}\` no es un campo válido de \`docker ${clave}\`. ` +
              `Campos soportados: ${regla.campos.join(', ')}.`,
          });
        }
      }
    }
  }

  return { plantillas, hallazgos };
}

// ── Recorrido de los scripts de despliegue ───────────────────────────────────

const DIRECTORIOS = ['deploy-vps', 'scripts'];
const EXTENSIONES = ['.sh', '.bash', '.ts', '.js', '.mjs', '.cjs'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTENSIONES.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/** Raíces válidas, tanto si el test corre en nextjs_space/ como en la raíz del repo. */
function raices(): string[] {
  const out: string[] = [];
  for (const base of [process.cwd(), join(process.cwd(), 'nextjs_space')]) {
    for (const d of DIRECTORIOS) {
      const p = join(base, d);
      try {
        if (statSync(p).isDirectory()) out.push(p);
      } catch {
        // ignorar
      }
    }
  }
  return out;
}

function escanearTodo(): { plantillas: Plantilla[]; hallazgos: Hallazgo[]; archivos: string[] } {
  const plantillas: Plantilla[] = [];
  const hallazgos: Hallazgo[] = [];
  const archivos: string[] = [];

  for (const root of raices()) {
    for (const file of walk(root)) {
      const rel = relative(process.cwd(), file);
      if (rel.includes('node_modules')) continue;
      archivos.push(rel);
      const r = escanearTexto(readFileSync(file, 'utf8'), rel);
      plantillas.push(...r.plantillas);
      hallazgos.push(...r.hallazgos);
    }
  }

  return { plantillas, hallazgos, archivos };
}

function formatear(hallazgos: Hallazgo[]): string[] {
  return hallazgos.map(
    (h) => `- ${h.archivo}:${h.linea} → docker ${h.comando} --format '{{.${h.campo}}}'\n  ${h.motivo}`
  );
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Guardia de plantillas Docker en los scripts de despliegue', () => {
  const { plantillas, hallazgos, archivos } = escanearTodo();

  it('el escáner encuentra plantillas Docker reales (no pasa por vacío)', () => {
    expect(archivos.length, 'No se encontró ningún script de despliegue que escanear').toBeGreaterThan(0);
    expect(plantillas.length, [
      'El escáner no encontró ninguna plantilla `docker ... --format`.',
      'Si los scripts cambiaron de formato, la guardia quedaría ciega: revisa el escáner.',
    ].join('\n')).toBeGreaterThan(5);

    const comandos = Array.from(new Set(plantillas.map((p) => p.comando)));
    expect(comandos, 'La guardia espera al menos `docker service ps` entre las plantillas reales').toContain(
      'service ps'
    );
    expect(comandos, 'La guardia espera al menos `docker ps` entre las plantillas reales').toContain('ps');
  });

  it('ninguna plantilla usa un campo retirado, fuera de contexto o sin clasificar', () => {
    expect(hallazgos.map((h) => `${h.archivo}:${h.linea} docker ${h.comando} {{.${h.campo}}}`)).toEqual([]);
  });

  it('la causa del hallazgo explica el fallo y el sustituto', () => {
    // Se comprueba contra el registro (no contra el árbol), para que el mensaje
    // siga siendo útil aunque hoy no haya hallazgos.
    const muestras = escanearTexto(
      "STATE=$(docker service ps \"$S\" --format '{{.Status.Err}}' 2>/dev/null | head -1 || true)\n",
      'muestra.sh'
    );
    expect(muestras.hallazgos).toHaveLength(1);
    expect(muestras.hallazgos[0].motivo).toContain('CurrentState');
    expect(muestras.hallazgos[0].motivo).toContain('Docker 26');
  });

  it('la guardia no se dispara con plantillas válidas ni con comentarios (self-test)', () => {
    const sano = [
      '# OJO: NO usar `.Status.Err` con docker service ps (Docker 26 lo eliminó)',
      'STATE=$(docker service ps "$S" --format \'{{.CurrentState}} {{.Error}}\' 2>/dev/null | head -1 || true)',
      'CID=$(docker ps --filter name=volkern-erp_app --format \'{{.ID}}\' | head -1)',
      'docker service inspect app --format \'{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}\'',
      'docker version --format \'docker {{.Server.Version}}\'',
    ].join('\n');

    const r = escanearTexto(sano, 'sano.sh');
    expect(r.plantillas.map((p) => p.comando)).toEqual(['service ps', 'ps', 'service inspect', 'version']);
    expect(r.hallazgos, formatear(r.hallazgos).join('\n')).toEqual([]);

    // Un archivo con SOLO el comentario histórico no genera ni plantillas.
    const soloComentario = "# usa docker service ps --format '{{.Status}}'\n";
    expect(escanearTexto(soloComentario, 'comentario.sh').plantillas).toEqual([]);
  });

  it('detecta campos retirados, campos inexistentes y comandos sin clasificar (self-test)', () => {
    const casos: { codigo: string; campo: string }[] = [
      { codigo: "docker service ps x --format '{{.Status}}'\n", campo: 'Status' },
      { codigo: "docker service ps x --format '{{.Status.Err}}'\n", campo: 'Status' },
      { codigo: "docker node ps x --format '{{.Status}}'\n", campo: 'Status' },
      { codigo: "docker service ps x --format '{{.DesiredState}} {{.Foo}}'\n", campo: 'Foo' },
      { codigo: "docker ps --format '{{.Status.Err}}'\n", campo: 'Status.Err' },
      { codigo: "docker events --format '{{.Action}}'\n", campo: '(comando sin clasificar)' },
    ];

    for (const caso of casos) {
      const r = escanearTexto(caso.codigo, 'caso.sh');
      expect(
        r.hallazgos.map((h) => h.campo),
        `No se detectó el caso: ${caso.codigo.trim()}`
      ).toContain(caso.campo);
    }
  });

  it('detecta el campo problemático aunque el comando esté partido en varias líneas (self-test)', () => {
    const continuacion = [
      'STATE=$(docker service ps "$S" \\',
      "  --format '{{.Status}}' 2>/dev/null | head -1 || true)",
    ].join('\n');

    const r = escanearTexto(continuacion, 'continuacion.sh');
    expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0].comando).toBe('service ps');
    expect(r.hallazgos[0].campo).toBe('Status');
    // El `--format` está en la segunda línea física del script.
    expect(r.hallazgos[0].linea).toBe(2);
  });

  it('el registro cubre el caso histórico y no puede quedar vacío (self-test)', () => {
    expect(REGLAS['service ps'].retirados?.Status).toBeTruthy();
    expect(REGLAS['node ps'].retirados?.Status).toBeTruthy();
    expect(REGLAS['stack ps'].retirados?.Status).toBeTruthy();
    // `docker ps` sí acepta `.Status` (contexto de contenedor): no debe estar retirado.
    expect(REGLAS.ps.retirados?.Status).toBeUndefined();
    expect(REGLAS.ps.campos).toContain('Status');
  });
});
