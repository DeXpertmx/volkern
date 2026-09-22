// @vitest-environment node
//
// Guardia de la FASE 3.A (plan maestro §3.1 y §4): los bloqueos de calendario
// distinguen propietario / mantenimiento / administrativo, y el planning ofrece
// el selector + leyenda. La única fuente de tipos es lib/hospitality/block-types.ts;
// si la UI deja de usarla (tipos duplicados, selector hardcodeado, leyenda
// eliminada), estas pruebas lo detectan.
//
// El planning es una página cliente ('use client') sin exportaciones
// seleccionables, así que la guardia lee su código fuente — misma técnica que
// usa tests/hospitality-availability-guard.test.ts para el motor único.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TIPOS_BLOQUEO,
  PRESENTACION_BLOQUEO,
  normalizarTipoBloqueo,
  esTipoBloqueoValido,
  colorTipoBloqueo,
  etiquetaTipoBloqueo,
} from '../lib/hospitality/block-types';

const RAIZ = path.resolve(__dirname, '..');
const PAGINA = path.join(RAIZ, 'app/dashboard/hospitality/calendar/page.tsx');

function fuenteDelPlanning(): string {
  expect(fs.existsSync(PAGINA), `No existe la página del planning: ${PAGINA}`).toBe(true);
  return fs.readFileSync(PAGINA, 'utf8');
}

describe('Fuente única de tipos de bloqueo (block-types.ts)', () => {
  it('define exactamente los 3 tipos del plan', () => {
    expect([...TIPOS_BLOQUEO].sort()).toEqual(['administrativo', 'mantenimiento', 'propietario']);
  });

  it('cada tipo tiene presentación (etiqueta y color) para la UI y la leyenda', () => {
    for (const tipo of TIPOS_BLOQUEO) {
      const p = PRESENTACION_BLOQUEO[tipo];
      expect(p.etiqueta.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('normaliza valores desconocidos al tipo por defecto (nunca rompe la UI)', () => {
    expect(normalizarTipoBloqueo('otro')).toBe('propietario');
    expect(normalizarTipoBloqueo(undefined)).toBe('propietario');
    expect(esTipoBloqueoValido('mantenimiento')).toBe(true);
    expect(esTipoBloqueoValido('xxx')).toBe(false);
    expect(etiquetaTipoBloqueo('mantenimiento')).toBe('Mantenimiento');
    expect(colorTipoBloqueo('mantenimiento')).toBe(PRESENTACION_BLOQUEO.mantenimiento.color);
  });
});

describe('Selector de tipo en el diálogo de bloqueo', () => {
  const fuente = fuenteDelPlanning();

  it('el diálogo ofrece los 3 tipos desde la fuente única (sin lista duplicada)', () => {
    // El select itera TIPOS_BLOQUEO en vez de hardcodear opciones.
    expect(fuente).toMatch(/<select[\s\S]*?value=\{blockForm\.tipo\}[\s\S]*?<\/select>/s);
    expect(fuente).toContain('TIPOS_BLOQUEO.map((tipo)');
    // No hay opciones de tipo hardcodeadas: cualquier <option> del diálogo sale del map.
    expect(fuente).not.toMatch(/<option[^>]*value="(mantenimiento|administrativo)"/);
  });

  it('el estado del formulario es TipoBloqueo y se normaliza al abrir (nunca un valor inválido)', () => {
    expect(fuente).toMatch(/tipo:\s*TipoBloqueo;/);
    expect(fuente).toContain('tipo: normalizarTipoBloqueo(\'propietario\')');
  });

  it('el tipo elegido viaja al POST de la API', () => {
    expect(fuente).toMatch(/tipo:\s*blockForm\.tipo/);
  });

  it('la cuadrícula pinta cada bloqueo con el color de su tipo y la etiqueta', () => {
    expect(fuente).toContain('colorTipoBloqueo(block.tipo)');
    expect(fuente).toContain('etiquetaTipoBloqueo(block.tipo)');
  });
});

describe('Leyenda de bloqueos en el planning', () => {
  it('muestra los 3 tipos de bloqueo con su presentación, tras canales y estados', () => {
    const fuente = fuenteDelPlanning();

    const iCanales = fuente.indexOf('Canales:');
    const iEstados = fuente.indexOf('Estados:');
    const iBloqueos = fuente.indexOf('Bloqueos:');

    expect(iCanales).toBeGreaterThan(-1);
    expect(iEstados).toBeGreaterThan(iCanales);
    expect(
      iBloqueos,
      'El planning ya no muestra la leyenda de bloqueos (FASE 3.A).'
    ).toBeGreaterThan(iEstados);

    // La leyenda itera la fuente única (si se añade un tipo, aparece solo).
    const cola = fuente.slice(iBloqueos);
    expect(cola).toContain('TIPOS_BLOQUEO.map');
    expect(cola).toContain('PRESENTACION_BLOQUEO[tipo].color');
    expect(cola).toContain('PRESENTACION_BLOQUEO[tipo].etiqueta');
  });
});
