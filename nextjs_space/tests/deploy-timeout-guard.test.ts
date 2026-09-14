import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardia contra el despliegue que se queda colgado.
 *
 * El 14-sep-2026 el pipeline se quedó parado más de diez minutos en
 * `docker service create` del job de migraciones: el CLI imprimió el ID del
 * servicio, avisó de que la imagen no tenía digest y NO retornó nunca. Con
 * `set -euo pipefail` eso no es un error: es un despliegue que no termina, no
 * actualiza nada y no dice por qué. Es peor que un fallo, porque nadie lo mira.
 *
 * Esta guardia fija las dos condiciones que evitan repetirlo:
 *
 *   1. Toda llamada a `docker service create` va acotada con `timeout`, para que
 *      un CLI mudo no bloquee el pipeline más allá de su presupuesto.
 *   2. Los scripts que crean un job replicado comprueban que el servicio existe
 *      antes de esperarlo, para no agotar la espera en un job que nunca se creó.
 *
 * Acotar el `create` NO oculta el resultado: el job queda creado igualmente y el
 * paso siguiente comprueba su estado real, que es lo que decide si el despliegue
 * continúa. Lo único que añade es un techo al silencio del CLI.
 */

const DIRECTORIOS = ['deploy-vps', 'scripts'];
const EXTENSIONES = ['.sh', '.bash'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONES.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function scriptsDeDespliegue(): Array<{ abs: string; rel: string; contenido: string }> {
  const out: Array<{ abs: string; rel: string; contenido: string }> = [];
  const vistos = new Set<string>();
  for (const base of [process.cwd(), join(process.cwd(), 'nextjs_space')]) {
    for (const dir of DIRECTORIOS) {
      const raiz = join(base, dir);
      let existe = true;
      try {
        existe = statSync(raiz).isDirectory();
      } catch {
        existe = false;
      }
      if (!existe) continue;
      for (const abs of walk(raiz)) {
        if (vistos.has(abs)) continue;
        vistos.add(abs);
        out.push({ abs, rel: relative(process.cwd(), abs), contenido: readFileSync(abs, 'utf8') });
      }
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

const SCRIPTS = scriptsDeDespliegue();

describe('el pipeline de despliegue no puede quedarse colgado', () => {
  it('hay scripts de despliegue que revisar (la guardia no pasa por vacío)', () => {
    expect(SCRIPTS.length).toBeGreaterThan(0);
  });

  it('toda llamada a `docker service create` está acotada con `timeout`', () => {
    const sinAcotar: string[] = [];

    for (const script of SCRIPTS) {
      const lineas = script.contenido.split('\n');
      lineas.forEach((linea, indice) => {
        if (linea.trim().startsWith('#')) return;
        // Solo cuentan las llamadas de verdad: un `echo` o un comentario que
        // mencione el comando (por ejemplo, el aviso de que no retornó) no es una
        // invocación que pueda colgarse.
        const sinCadenas = linea.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
        if (!/\bdocker\s+service\s+create\b/.test(sinCadenas)) return;

        // El `timeout` puede ir en la misma línea o en la anterior, si la llamada
        // está partida con continuaciones de línea.
        const previas = lineas.slice(Math.max(0, indice - 3), indice).join(' ');
        const acotada = /\btimeout\s+\d+/.test(linea) || /\btimeout\s+\d+/.test(previas);
        if (!acotada) sinAcotar.push(`${script.rel}:${indice + 1} → ${linea.trim()}`);
      });
    }

    expect(sinAcotar).toEqual([]);
  });

  it('los jobs replicados se comprueban antes de esperarlos', () => {
    const creadoresDeJob = SCRIPTS.filter((s) => /docker\s+service\s+create[\s\S]{0,400}?--mode\s+replicated-job/.test(s.contenido));

    expect(creadoresDeJob.length).toBeGreaterThan(0);
    for (const script of creadoresDeJob) {
      // Si el servicio no se llegó a crear, esperar su estado es esperar a nada.
      expect(
        /docker\s+service\s+inspect\s+"?\$?\{?JOB_NAME/.test(script.contenido),
        `${script.rel}: crea un job replicado pero no comprueba que el servicio exista antes de esperarlo`
      ).toBe(true);
    }
  });

  it('el job de migraciones informa de un fallo de migración en lugar de continuar', () => {
    const migraciones = SCRIPTS.find((s) => s.rel.endsWith('run-migrations.sh'));
    expect(migraciones).toBeTruthy();
    expect(migraciones!.contenido).toMatch(/migrate deploy falló/);
    expect(migraciones!.contenido).toMatch(/exit 1/);
  });
});
