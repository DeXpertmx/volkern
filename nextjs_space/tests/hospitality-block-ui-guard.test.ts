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
  ESTADOS_BLOQUEO,
  LONGITUD_MAXIMA_MOTIVO,
  PRESENTACION_BLOQUEO,
  RAZONES_BLOQUEO,
  accionBloqueo,
  esBloqueoActivo,
  limpiarMotivo,
  normalizarEstadoBloqueo,
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

/**
 * Un bloqueo no se borra para reabrir las fechas: se libera (`cancelado`), y
 * desde ahí se reactiva (`activo`). Las dos cosas son el mismo PATCH con otro
 * `estado`, y la decisión de qué acción ofrecer vive en el módulo puro para que
 * la pantalla no tenga una segunda copia de la regla.
 */
describe('Estado del bloqueo: liberar y reactivar (módulo puro)', () => {
  it('un estado ausente o desconocido cuenta como activo (el lado seguro)', () => {
    // Dar por libres unas fechas que están cerradas es peor que ofrecer liberar
    // unas que ya lo estaban: es el valor por defecto de la columna.
    expect(normalizarEstadoBloqueo('activo')).toBe('activo');
    expect(normalizarEstadoBloqueo('cancelado')).toBe('cancelado');
    expect(normalizarEstadoBloqueo(undefined)).toBe('activo');
    expect(normalizarEstadoBloqueo('inventado')).toBe('activo');
  });

  it('la acción ofrecida es la contraria: liberar si cierra, reactivar si está liberado', () => {
    expect(esBloqueoActivo('activo')).toBe(true);
    expect(esBloqueoActivo('cancelado')).toBe(false);

    const sobreActivo = accionBloqueo('activo');
    expect(sobreActivo.destino).toBe('cancelado');
    expect(sobreActivo.etiqueta).toBe('Liberar fechas');
    expect(sobreActivo.ayuda).toContain('disponibles');

    const sobreLiberado = accionBloqueo('cancelado');
    expect(sobreLiberado.destino).toBe('activo');
    expect(sobreLiberado.etiqueta).toBe('Reactivar bloqueo');
    expect(sobreLiberado.ayuda).toContain('cerrarán');
  });

  it('el destino es siempre uno de los dos estados que acepta la API', () => {
    for (const estado of [undefined, 'activo', 'cancelado', 'otro']) {
      expect(ESTADOS_BLOQUEO as readonly string[]).toContain(accionBloqueo(estado).destino);
    }
  });
});

describe('Liberar y reactivar desde el planning', () => {
  const fuente = fuenteDelPlanning();

  it('la pantalla no decide el estado a mano: lo lee del módulo puro', () => {
    // Qué acción ofrecer y qué estado cerrar salen de `accionBloqueo`, y si un
    // bloqueo cierra fechas, de `esBloqueoActivo`: la pantalla no reimplementa
    // la regla (dos copias se desincronizan y una de las dos miente).
    expect(fuente).toContain('accionBloqueo(block.estado)');
    expect(fuente).toContain('esBloqueoActivo(');
    expect(fuente).toContain('EstadoBloqueo');
  });

  it('cambiar el estado viaja como PATCH al bloqueo, con el estado de destino', () => {
    expect(fuente).toMatch(/method:\s*'PATCH'/);
    expect(fuente).toMatch(/body:\s*JSON\.stringify\(\{\s*estado:\s*destino\s*\}\)/);
    expect(fuente).toContain('/api/hospitality/blocks/${block.id}');
  });

  it('la rejilla dibuja también los liberados: si no, no se podrían reactivar', () => {
    expect(fuente).toContain('blocks.filter((b) => b.unitId === unit.id)');
    expect(fuente).not.toContain("b.estado === 'activo'");
  });

  it('las dos acciones se pintan desde la fuente única y eliminar sigue siendo borrar la fila', () => {
    // El texto («Liberar fechas» / «Reactivar bloqueo») vive en block-types.ts:
    // aquí se comprueba que la pantalla lo usa en vez de escribirlo.
    expect(fuente).toContain('{accion.etiqueta}');
    expect(fuente).toMatch(/method:\s*'DELETE'/);
  });
});

/**
 * El motivo es la razón documentada del cierre y es obligatorio: quien mire el
 * calendario más adelante tiene que saber por qué esas noches estaban cerradas
 * (una visita de un familiar, noches vendidas a una empresa fuera de canal, una
 * avería…). El catálogo solo sugiere; el campo es libre.
 */
describe('El motivo del bloqueo', () => {
  it('cada tipo tiene razones frecuentes, sin repetir y sin espacios sobrantes', () => {
    for (const tipo of TIPOS_BLOQUEO) {
      const razones = RAZONES_BLOQUEO[tipo];
      expect(razones.length).toBeGreaterThanOrEqual(3);
      expect(new Set(razones).size).toBe(razones.length);
      for (const razon of razones) expect(razon.trim()).toBe(razon);
    }
  });

  it('recoge los casos reales del negocio: la visita familiar y las noches de empresa', () => {
    expect(RAZONES_BLOQUEO.propietario).toContain('Visita de un familiar');
    expect(RAZONES_BLOQUEO.administrativo.join(' ')).toContain('empresa');
  });

  it('lo que no sea texto no es un motivo: no se cuela un bloqueo sin razón', () => {
    expect(limpiarMotivo('  Visita de un familiar  ')).toBe('Visita de un familiar');
    expect(limpiarMotivo('')).toBe('');
    expect(limpiarMotivo('   ')).toBe('');
    expect(limpiarMotivo(undefined)).toBe('');
    expect(limpiarMotivo(42)).toBe('');
    expect(limpiarMotivo({ motivo: 'algo' })).toBe('');
    expect(limpiarMotivo('x'.repeat(LONGITUD_MAXIMA_MOTIVO + 50))).toHaveLength(LONGITUD_MAXIMA_MOTIVO);
  });

  it('la pantalla pide la razón y la sugiere desde el catálogo, sin lista propia', () => {
    const fuente = fuenteDelPlanning();
    expect(fuente).toContain('RAZONES_BLOQUEO[blockForm.tipo]');
    expect(fuente).toContain('list="razones-bloqueo"');
    expect(fuente).toContain('LONGITUD_MAXIMA_MOTIVO');
    // El motivo ya no es opcional: sin razón no hay cierre de fechas.
    expect(fuente).not.toContain('Motivo (opcional)');
    expect(fuente).toContain('Escribe el motivo');
  });
});

/**
 * Las fechas ya contratadas no se cierran. La pantalla avisa ANTES de enviar
 * —con las reservas que ya tiene cargadas— y, cuando el servidor encuentra un
 * choque que la rejilla no veía (una reserva fuera de la semana visible), lo
 * enseña con sus reservas en vez de dejar solo un aviso efímero.
 */
describe('Fechas ya contratadas: la pantalla usa la regla del servidor', () => {
  const fuente = fuenteDelPlanning();

  it('el aviso sale del módulo puro compartido con la API (una regla, no dos)', () => {
    expect(fuente).toContain('choquesParaRespuesta(');
    expect(fuente).toContain('mensajeConflictoBloqueo(');
    expect(fuente).toContain('AvisoConflictoBloqueo');
  });

  it('el 409 del servidor se enseña con sus reservas, no solo con un aviso', () => {
    expect(fuente).toContain('data.conflicto');
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
