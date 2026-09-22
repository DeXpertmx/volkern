// @vitest-environment node
//
// Preguntas personalizadas del check-in (lib/hospitality/checkin-preguntas.ts):
// la config del hotel, la validación de respuestas y — la guardia más
// importante — LA FRONTERA con el parte MIR: lo que el huésped contesta aquí
// es asunto del hotel y jamás viaja al XML del Ministerio.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  normalizarPreguntas,
  validarRespuestas,
  TIPOS_PREGUNTA,
  type PreguntaCruda,
} from '../lib/hospitality/checkin-preguntas';

const RAIZ = path.resolve(__dirname, '..');

/** Pregunta válida de ejemplo. */
function pregunta(overrides: Partial<PreguntaCruda> = {}): PreguntaCruda {
  return {
    id: 'p1',
    tipo: 'texto',
    es: 'Hora estimada de llegada',
    en: 'Estimated arrival time',
    opciones: null,
    requerida: false,
    activa: true,
    orden: 0,
    ...overrides,
  };
}

describe('normalizarPreguntas', () => {
  it('acepta una config válida y respeta el orden', () => {
    const preguntas = normalizarPreguntas([
      pregunta({ id: 'b', orden: 2 }),
      pregunta({ id: 'a', orden: 1 }),
    ]);
    expect(preguntas.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('descarta la pregunta sin texto en ninguno de los dos idiomas', () => {
    expect(normalizarPreguntas([pregunta({ es: '  ', en: '' })])).toEqual([]);
  });

  it('reutiliza el español si falta el inglés (y al revés)', () => {
    expect(normalizarPreguntas([pregunta({ en: null })])[0].en).toBe('Hora estimada de llegada');
    expect(normalizarPreguntas([pregunta({ es: null })])[0].es).toBe('Estimated arrival time');
  });

  it('descarta el tipo desconocido cayendo a texto', () => {
    expect(normalizarPreguntas([pregunta({ tipo: 'color_favorito' })])[0].tipo).toBe('texto');
  });

  it('una pregunta de opción sin opciones no se publica', () => {
    expect(normalizarPreguntas([pregunta({ tipo: 'opcion', opciones: { es: [], en: [] } })])).toEqual([]);
  });

  it('una pregunta de opción sin opciones en un idioma reutiliza el otro', () => {
    const p = normalizarPreguntas([
      pregunta({ tipo: 'opcion', opciones: { es: ['Sí', 'No'], en: [] } }),
    ])[0];
    expect(p.opciones).toEqual({ es: ['Sí', 'No'], en: ['Sí', 'No'] });
  });

  it('deduplica y acota las opciones (tope 12)', () => {
    const p = normalizarPreguntas([
      pregunta({
        tipo: 'opcion',
        opciones: { es: ['Sí', 'Sí', 'No', ...Array.from({ length: 20 }, (_, i) => `v${i}`)], en: [] },
      }),
    ])[0];
    expect(p.opciones!.es[0]).toBe('Sí');
    expect(p.opciones!.es[1]).toBe('No');
    expect(p.opciones!.es.length).toBeLessThanOrEqual(12);
  });

  it('inactivas fuera; tope de 20 activas', () => {
    const muchas = Array.from({ length: 25 }, (_, i) => pregunta({ id: `p${i}`, orden: i }));
    muchas[0].activa = false;
    const preguntas = normalizarPreguntas(muchas);
    expect(preguntas).toHaveLength(20);
    expect(preguntas.some((p) => p.id === 'p0')).toBe(false);
  });

  it('trunca etiquetas largas a 250 caracteres', () => {
    const p = normalizarPreguntas([pregunta({ es: 'x'.repeat(400) })])[0];
    expect(p.es.length).toBe(250);
  });

  it('los tipos soportados son exactamente los que la API acepta', () => {
    expect([...TIPOS_PREGUNTA]).toEqual(['texto', 'opcion', 'numero', 'fecha']);
  });
});

describe('validarRespuestas', () => {
  const config = normalizarPreguntas([
    pregunta({ id: 'texto' }),
    pregunta({ id: 'opcion', tipo: 'opcion', opciones: { es: ['Sí', 'No'], en: ['Yes', 'No'] } }),
    pregunta({ id: 'numero', tipo: 'numero' }),
    pregunta({ id: 'fecha', tipo: 'fecha' }),
    pregunta({ id: 'requerida', requerida: true }),
  ]);

  it('guarda las respuestas válidas y descarta lo que no corresponde', () => {
    const r = validarRespuestas(config, {
      texto: '22:30',
      opcion: 'Yes',
      numero: '3',
      fecha: '2026-10-01',
      intruso: 'no corresponde a ninguna pregunta',
    });
    expect(r.respuestas).toEqual({
      texto: '22:30',
      opcion: 'Yes',
      numero: '3',
      fecha: '2026-10-01',
    });
    expect(r.descartadas).toEqual(['intruso']);
  });

  it('una opción solo acepta valores de su lista (en cualquiera de los dos idiomas)', () => {
    expect(validarRespuestas(config, { opcion: 'Sí' }).respuestas.opcion).toBe('Sí');
    expect(validarRespuestas(config, { opcion: 'quizá' }).respuestas.opcion).toBeUndefined();
  });

  it('número: admite decimales con coma y rechaza texto no numérico', () => {
    expect(validarRespuestas(config, { numero: '2,5' }).respuestas.numero).toBe('2,5');
    expect(validarRespuestas(config, { numero: 'abc' }).respuestas.numero).toBeUndefined();
  });

  it('fecha: solo AAAA-MM-DD parseable', () => {
    expect(validarRespuestas(config, { fecha: '2026-10-01' }).respuestas.fecha).toBe('2026-10-01');
    expect(validarRespuestas(config, { fecha: '01/10/2026' }).respuestas.fecha).toBeUndefined();
  });

  it('una requerida sin respuesta se informa en faltan pero no bloquea nada', () => {
    const r = validarRespuestas(config, { texto: 'algo' });
    expect(r.faltan).toEqual(['requerida']);
    expect(r.respuestas).toEqual({ texto: 'algo' });
  });

  it('respuesta de requerida presente: faltan vacío', () => {
    expect(validarRespuestas(config, { requerida: 'ok' }).faltan).toEqual([]);
  });

  it('entradas raras (null, número, texto largo) no rompen y se recortan a 500', () => {
    const r = validarRespuestas(config, { texto: 'x'.repeat(800), numero: 42 });
    expect(r.respuestas.texto.length).toBe(500);
    expect(r.respuestas.numero).toBeUndefined();
  });

  it('sin respuestas, todo requerida y nada más', () => {
    const r = validarRespuestas(config, null);
    expect(r.respuestas).toEqual({});
    expect(r.faltan).toEqual(['requerida']);
    expect(r.descartadas).toEqual([]);
  });
});

describe('LA FRONTERA: las preguntas personalizadas jamás entran en el parte MIR', () => {
  it('registro-viajeros.ts no importa nada del módulo de preguntas', () => {
    const fuente = readFileSync(path.join(RAIZ, 'lib/hospitality/registro-viajeros.ts'), 'utf8');
    expect(fuente).not.toContain('checkin-preguntas');
  });

  it('el cron del registro no importa nada del módulo de preguntas', () => {
    const fuente = readFileSync(
      path.join(RAIZ, 'lib/cron/hospitality-registro-viajeros.ts'),
      'utf8'
    );
    expect(fuente).not.toContain('checkin-preguntas');
  });

  it('el servicio del registro no importa nada del módulo de preguntas', () => {
    const fuente = readFileSync(
      path.join(RAIZ, 'lib/hospitality/registro-viajeros-service.ts'),
      'utf8'
    );
    expect(fuente).not.toContain('checkin-preguntas');
  });

  it('el servicio de check-in no pasa respuestas al envío del parte', () => {
    const fuente = readFileSync(path.join(RAIZ, 'lib/hospitality/checkin-service.ts'), 'utf8');
    // `enviarRegistroDeReserva` no recibe nada de respuestas.
    expect(fuente).not.toMatch(/enviarRegistroDeReserva\([^)]*respuestas/i);
  });

  it('la API pública del check-in no mete respuestas en el envío del parte', () => {
    const fuente = readFileSync(
      path.join(RAIZ, 'app/api/public/checkin/[token]/route.ts'),
      'utf8'
    );
    expect(fuente).not.toMatch(/enviarParteSiCorresponde\(\s*\{[^}]*respuestas/i);
  });
});
