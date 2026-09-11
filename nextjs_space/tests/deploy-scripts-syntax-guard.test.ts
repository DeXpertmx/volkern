import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

/**
 * Guardia de sintaxis de los scripts de despliegue.
 *
 * Los scripts de `deploy-vps/` se copian al VPS y se ejecutan allí como root
 * (`bash deploy-vps/deploy-app.sh`). Un error de sintaxis no se descubre en
 * local: revienta en el servidor, a mitad del despliegue, y con
 * `set -euo pipefail` puede dejar el pipeline a medias. Ya pasó una vez con un
 * fallo silencioso (plantilla Docker retirada, ver
 * `tests/deploy-docker-templates-guard.test.ts`); este es el mismo principio,
 * un paso antes: que el archivo ni siquiera sea sintácticamente válido.
 *
 * Esta guardia:
 *   1. recorre `deploy-vps/` y `scripts/` (todos los `.sh` y `.bash`),
 *   2. ejecuta `bash -n` en cada uno — valida la sintaxis sin ejecutarlo, y
 *   3. si `shellcheck` está disponible, lo ejecuta con severidad `error`.
 *
 * `shellcheck` es opcional a propósito: no está garantizado en todos los
 * entornos (en CI sí, los runners de Ubuntu lo traen). Cuando falta, sus tests
 * aparecen como *skipped* en la salida, no como aprobados, para que nadie
 * asuma cobertura que no tuvo.
 */

const DIRECTORIOS = ['deploy-vps', 'scripts'];
const EXTENSIONES = ['.sh', '.bash'];

/**
 * Severidad mínima de shellcheck que hace fallar la guardia.
 *
 * `error` cubre lo que impide que el script funcione (parseo, directivas
 * inválidas, shebang no soportado). NO se sube a `warning` todavía: los
 * scripts existentes arrastran avisos que ahogarían la señal y convertirían
 * la guardia en ruido. Subirlo es un cambio de una línea y este test lo
 * obliga a ser una decisión explícita.
 */
export const SEVERIDAD_SHELLCHECK = 'error';

export interface Script {
  /** Ruta absoluta, para ejecutar las herramientas. */
  abs: string;
  /** Ruta relativa, para los mensajes. */
  rel: string;
}

export interface Revision {
  archivo: string;
  ok: boolean;
  salida: string;
}

// ── Utilidades de disco ──────────────────────────────────────────────────────

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

/** Scripts de despliegue a validar, sin duplicados. */
export function recorrerScripts(): Script[] {
  const vistos = new Set<string>();
  const scripts: Script[] = [];
  for (const root of raices()) {
    for (const abs of walk(root)) {
      if (vistos.has(abs)) continue;
      vistos.add(abs);
      scripts.push({ abs, rel: relative(process.cwd(), abs) });
    }
  }
  return scripts.sort((a, b) => a.rel.localeCompare(b.rel));
}

// ── Herramientas ─────────────────────────────────────────────────────────────

function hayBinario(bin: string, args: string[]): boolean {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}

export function bashDisponible(): boolean {
  return hayBinario('bash', ['--version']);
}

export function shellcheckDisponible(): boolean {
  return hayBinario('shellcheck', ['--version']);
}

/**
 * `bash -n`: valida la sintaxis SIN ejecutar el script. Es la puerta
 * obligatoria de esta guardia.
 */
export function revisarSintaxis(archivo: string, bin = 'bash'): Revision {
  const r = spawnSync(bin, ['-n', archivo], { encoding: 'utf8' });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const error = r.error ? r.error.message : '';
  return {
    archivo,
    ok: !r.error && r.status === 0,
    salida: [salida, error].filter(Boolean).join('\n'),
  };
}

/**
 * shellcheck limitado a la severidad indicada. Se pasa el binario como
 * parámetro para poder verificar la interpretación del código de salida con un
 * binario simulado (hay un self-test que lo hace).
 */
export function ejecutarShellcheck(archivo: string, bin = 'shellcheck'): Revision {
  const r = spawnSync(bin, [`--severity=${SEVERIDAD_SHELLCHECK}`, '--format=gcc', archivo], {
    encoding: 'utf8',
  });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const error = r.error ? r.error.message : '';
  return {
    archivo,
    ok: !r.error && r.status === 0,
    salida: [salida, error].filter(Boolean).join('\n'),
  };
}

// ── Auxiliares de test ───────────────────────────────────────────────────────

const HAY_BASH = bashDisponible();
const HAY_SHELLCHECK = shellcheckDisponible();

function formatear(revisiones: Revision[]): string[] {
  return revisiones.map(
    (r) => `- ${r.archivo}\n${r.salida.split('\n').map((l) => `    ${l}`).join('\n')}`
  );
}

/** Crea un directorio temporal, ejecuta `fn` y lo borra siempre. */
function conDirectorioTemporal<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'volkern-sintaxis-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Crea un ejecutable falso (para simular shellcheck sin tenerlo instalado). */
function binarioSimulado(dir: string, nombre: string, cuerpo: string): string {
  const ruta = join(dir, nombre);
  writeFileSync(ruta, `#!/bin/bash\n${cuerpo}\n`);
  chmodSync(ruta, 0o755);
  return ruta;
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Guardia de sintaxis de los scripts de despliegue', () => {
  const scripts = recorrerScripts();

  it('bash está disponible: sin él la guardia no protege nada', () => {
    expect(
      HAY_BASH,
      'No se encontró `bash` en PATH. Esta guardia valida los scripts con `bash -n`; ' +
        'sin bash no puede garantizar que un script roto no llegue al VPS.'
    ).toBe(true);
  });

  it('encuentra los scripts de despliegue a validar (no pasa por vacío)', () => {
    expect(scripts.length, 'No se encontró ningún script .sh/.bash en deploy-vps/ ni scripts/').toBeGreaterThan(10);

    const nombres = scripts.map((s) => s.rel.replace(/\\/g, '/'));
    for (const esperado of [
      'deploy-vps/deploy-app.sh',
      'deploy-vps/run-migrations.sh',
      'deploy-vps/deploy-local.sh',
    ]) {
      expect(nombres, `La guardia debería estar validando ${esperado}`).toContain(esperado);
    }
  });

  it.skipIf(!HAY_BASH)('todos los scripts pasan `bash -n` (sin errores de sintaxis)', () => {
    const fallos = scripts
      .map((s) => ({ ...revisarSintaxis(s.abs, 'bash'), archivo: s.rel }))
      .filter((r) => !r.ok);
    const detalle = formatear(fallos);
    expect(detalle, [
      'Hay scripts de despliegue con errores de sintaxis.',
      'No se descubre hasta ejecutarlos (normalmente ya en el VPS, a mitad del despliegue).',
      'Reproduce con: bash -n <archivo>',
      '',
      ...detalle,
    ].join('\n')).toEqual([]);
  });

  it('la severidad mínima de shellcheck está declarada de forma explícita', () => {
    // Evita que el tramo de shellcheck se desactive o se relaje sin que sea una
    // decisión consciente (el comentario de SEVERIDAD_SHELLCHECK explica el porqué).
    expect(SEVERIDAD_SHELLCHECK).toBe('error');
  });

  it.skipIf(!HAY_BASH)('detecta un script con error de sintaxis (self-test)', () => {
    conDirectorioTemporal((dir) => {
      const roto = join(dir, 'roto.sh');
      // `if` sin cerrar: bash -n debe rechazarlo.
      writeFileSync(roto, '#!/bin/bash\nif [ -f /tmp/x ]; then\n  echo "falta fi"\n');
      const r = revisarSintaxis(roto);
      expect(r.ok, 'bash -n debería rechazar un `if` sin cerrar').toBe(false);
      expect(r.salida.length, 'bash -n debe devolver el motivo del fallo').toBeGreaterThan(0);

      const sano = join(dir, 'sano.sh');
      writeFileSync(sano, '#!/bin/bash\nset -euo pipefail\necho hola\n');
      expect(revisarSintaxis(sano).ok, 'bash -n debe aceptar un script válido').toBe(true);
    });
  });

  it.skipIf(!HAY_BASH)('interpreta bien el resultado de shellcheck (self-test con binario simulado)', () => {
    conDirectorioTemporal((dir) => {
      const archivo = join(dir, 'x.sh');
      writeFileSync(archivo, '#!/bin/bash\necho hola\n');

      const rojo = binarioSimulado(
        dir,
        'shellcheck-rojo',
        'echo "x.sh:1:1: error: SC1234: algo roto"\nexit 1'
      );
      const fallo = ejecutarShellcheck(archivo, rojo);
      expect(fallo.ok, 'un hallazgo debe marcar el script como fallido').toBe(false);
      expect(fallo.salida).toContain('SC1234');

      const verde = binarioSimulado(dir, 'shellcheck-verde', 'exit 0');
      expect(ejecutarShellcheck(archivo, verde).ok).toBe(true);
    });
  });

  it.skipIf(!HAY_SHELLCHECK)('ningún script tiene hallazgos de shellcheck de severidad error', () => {
    const fallos = scripts
      .map((s) => ({ ...ejecutarShellcheck(s.abs), archivo: s.rel }))
      .filter((r) => !r.ok);
    const detalle = formatear(fallos);
    expect(detalle, [
      `Hay scripts de despliegue con hallazgos de shellcheck (severidad >= ${SEVERIDAD_SHELLCHECK}).`,
      `Reproduce con: shellcheck --severity=${SEVERIDAD_SHELLCHECK} <archivo>`,
      'Los avisos de menor severidad no bloquean: subir el listón es una decisión explícita.',
      '',
      ...detalle,
    ].join('\n')).toEqual([]);
  });

  it('deja constancia de si el tramo de shellcheck se ejecutó', () => {
    // No sustituye al test de arriba; evita que un runner sin shellcheck parezca
    // haber validado lo mismo que uno con shellcheck (los tests quedan *skipped*).
    if (!HAY_SHELLCHECK) {
      console.info(
        '[guardia de sintaxis] shellcheck no está disponible en este entorno: ' +
          'su tramo aparece como skipped. En CI (Ubuntu) sí se ejecuta.'
      );
    }
    expect(scripts.length).toBeGreaterThan(0);
  });
});
