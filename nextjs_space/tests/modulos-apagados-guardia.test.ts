import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUBS } from '@/lib/navigation-config';

/**
 * Los hub que se apagan para un vertical solo desaparecen del menú si, además,
 * su layout de servidor llama a `exigirHub`. Sin eso, escribir la URL a mano
 * seguía abriendo la pantalla: exactamente el agujero que se cerró con Agencia y
 * Contabilidad y que estos hubs volvían a tener.
 */

const RAIZ = path.join(process.cwd(), 'app/dashboard');

/** Carpeta de la ruta → id del hub que la protege. */
const RUTAS_GUARDADAS: ReadonlyArray<readonly [string, string]> = [
  ['academia', 'academia'],
  ['cursos', 'academia'],
  ['estudiantes', 'academia'],
  ['quizzes', 'academia'],
  ['comunidad', 'academia'],
  ['seguros', 'seguros'],
  ['hospitality', 'hospitality'],
  ['calidad', 'calidad'],
  ['produccion', 'produccion'],
  ['inventario', 'inventario'],
  ['compras', 'compras'],
  ['proyectos', 'proyectos'],
  ['support', 'taskforce'],
  ['logistica', 'logistica'],
];

describe('Hubs apagados con guardia de servidor', () => {
  it.each(RUTAS_GUARDADAS)('%s exige el hub %s', (carpeta, idHub) => {
    const layout = fs.readFileSync(path.join(RAIZ, carpeta, 'layout.tsx'), 'utf8');

    expect(layout).toContain(`exigirHub('${idHub}')`);
    // Un layout cliente no puede ser guardia: `exigirHub` usa cookies y redirect.
    expect(layout.startsWith("'use client'")).toBe(false);
  });

  it('todos los ids usados existen como hub', () => {
    const ids = new Set(HUBS.map((hub) => hub.id));

    for (const [, idHub] of RUTAS_GUARDADAS) {
      expect(ids.has(idHub)).toBe(true);
    }
  });

  it('los layouts de guardia están declarados como async', () => {
    for (const [carpeta] of RUTAS_GUARDADAS) {
      const layout = fs.readFileSync(path.join(RAIZ, carpeta, 'layout.tsx'), 'utf8');
      expect(layout).toMatch(/export default async function/);
    }
  });
});
