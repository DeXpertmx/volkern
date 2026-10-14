// @vitest-environment node
//
// Guardia de la pantalla de Tarifas (app/dashboard/hospitality/tarifas/page.tsx):
// las reglas de una temporada son restricciones de venta, y la pantalla debe
// respetar la regla del módulo puro (una sola definición para la web, la
// reserva y el canal):
//  - Cada regla viaja en la fila de temporada y al payload SOLO cuando se
//    rellena (vacío = «la del plan», que es distinto de un mínimo de 1).
//  - La validación se apoya en el tope del módulo y en la coherencia
//    mínimo/máximo, no en números escritos aquí.
//  - La pantalla dice la semántica real: aplican a las llegadas del rango y
//    reemplazan campo a campo a las del plan, y viajan al canal.
//  - La tarjeta y los contadores de la lista reflejan las reglas por temporada.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '..');
const PAGINA = 'app/dashboard/hospitality/tarifas/page.tsx';
const fuente = readFileSync(path.join(raiz, PAGINA), 'utf8');

describe('Tarifas — reglas por temporada (interfaz)', () => {
  it('la fila de temporada lleva las cuatro reglas y sus campos están enlazados', () => {
    expect(fuente).toContain('minNoches: string;');
    expect(fuente).toContain('maxNoches: string;');
    expect(fuente).toContain('checkInDias: number[];');
    expect(fuente).toContain('checkOutDias: number[];');
    expect(fuente).toContain('onChange={(e) => setTemporada(idx, { minNoches: e.target.value })}');
    expect(fuente).toContain('onChange={(e) => setTemporada(idx, { maxNoches: e.target.value })}');
    expect(fuente).toContain("(['checkInDias', 'checkOutDias'] as const).map((campo)");
    expect(fuente).toContain('onClick={() => toggleDiaTemporada(idx, campo, d.v)}');
    expect(fuente).toContain('Máx. noches');
  });

  it('el payload manda cada regla solo cuando hay valor', () => {
    expect(fuente).toContain("...(t.minNoches.trim() !== '' ? { minNoches: Number(t.minNoches) } : {})");
    expect(fuente).toContain("...(t.maxNoches.trim() !== '' ? { maxNoches: Number(t.maxNoches) } : {})");
    expect(fuente).toContain('...(t.checkInDias.length ? { checkInDias: t.checkInDias } : {})');
    expect(fuente).toContain('...(t.checkOutDias.length ? { checkOutDias: t.checkOutDias } : {})');
  });

  it('valida las reglas antes de enviar con el tope del módulo puro', () => {
    expect(fuente).toContain("from '@/lib/hospitality/estacionalidad'");
    expect(fuente).toContain('NOCHES_TEMPORADA_MAX');
    expect(fuente).toContain('const nochesValidas = (n: number) =>');
    expect(fuente).toContain('t.maxNoches < t.minNoches');
  });

  it('explica la semántica real: llegadas del rango y reemplazo campo a campo', () => {
    expect(fuente).toContain('llegadas dentro de la temporada');
    expect(fuente).toContain('reemplazan, campo a');
    expect(fuente).toContain('Viajan al canal');
  });

  it('la tarjeta y los contadores reflejan las reglas por temporada', () => {
    expect(fuente).toContain('noches en temporada');
    expect(fuente).toContain('días en temporada');
    expect(fuente).toContain("Number(t.minNoches) > 1 || t.maxNoches.trim() !== ''");
    expect(fuente).toContain('t.checkInDias.length > 0 || t.checkOutDias.length > 0');
  });
});
