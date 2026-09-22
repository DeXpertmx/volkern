// @vitest-environment node
//
// Guardia de la caducidad de holds `pending`
// (docs/hospitality-estados-auditoria.md §holds). La regla vive en UN sitio
// (lib/hospitality/holds.ts) y el cron solo aporta datos: estos tests fijan
// las cuatro decisiones — solo pending, nunca con pagos, ventana por
// propiedad y 0 = sin caducidad.

import { describe, it, expect } from 'vitest';
import {
  HOLD_HORAS_POR_DEFECTO,
  HOLD_HORAS_MAXIMO,
  holdHorasEfectivas,
  esHoldHorasValidas,
  fechaCaducidadHold,
  evaluarHold,
  caducaHold,
} from '../lib/hospitality/holds';

const HORA = 60 * 60 * 1000;
const AHORA = new Date('2026-09-18T12:00:00');
const haceHoras = (horas: number) => new Date(AHORA.getTime() - horas * HORA);

describe('holdHorasEfectivas (ventana por propiedad)', () => {
  it('sin valor o corrupto cae en el defecto (24 h)', () => {
    expect(holdHorasEfectivas(undefined)).toBe(HOLD_HORAS_POR_DEFECTO);
    expect(holdHorasEfectivas(null)).toBe(HOLD_HORAS_POR_DEFECTO);
    expect(holdHorasEfectivas('basura')).toBe(HOLD_HORAS_POR_DEFECTO);
    expect(holdHorasEfectivas(NaN)).toBe(HOLD_HORAS_POR_DEFECTO);
  });

  it('respeta el 0: es «sin caducidad automática», no un valor corrupto', () => {
    expect(holdHorasEfectivas(0)).toBe(0);
  });

  it('acepta el string numérico que llega de la UI', () => {
    expect(holdHorasEfectivas('48')).toBe(48);
  });

  it('fuera de rango (negativo o por encima del tope) cae en el defecto', () => {
    expect(holdHorasEfectivas(-5)).toBe(HOLD_HORAS_POR_DEFECTO);
    expect(holdHorasEfectivas(HOLD_HORAS_MAXIMO + 1)).toBe(HOLD_HORAS_POR_DEFECTO);
  });

  it('la ventana válida va de 0 (desactivada) al tope de 30 días', () => {
    expect(esHoldHorasValidas(0)).toBe(true);
    expect(esHoldHorasValidas(24)).toBe(true);
    expect(esHoldHorasValidas(HOLD_HORAS_MAXIMO)).toBe(true);
    expect(esHoldHorasValidas(1.5)).toBe(false);
    expect(esHoldHorasValidas(-1)).toBe(false);
    expect(esHoldHorasValidas(HOLD_HORAS_MAXIMO + 1)).toBe(false);
    expect(esHoldHorasValidas('veinticuatro')).toBe(false);
    // Ausente no es 0: `Number(null)` es 0 y tomarlo por bueno desactivaría
    // la caducidad ante un payload incompleto.
    expect(esHoldHorasValidas(null)).toBe(false);
    expect(esHoldHorasValidas(undefined)).toBe(false);
    expect(esHoldHorasValidas('')).toBe(false);
  });
});

describe('fechaCaducidadHold', () => {
  it('suma la ventana a la creación', () => {
    const f = fechaCaducidadHold(new Date('2026-09-18T10:00:00'), 24);
    expect(f?.toISOString()).toBe(new Date('2026-09-19T10:00:00').toISOString());
  });

  it('sin ventana no hay fecha (no caduca nunca)', () => {
    expect(fechaCaducidadHold(AHORA, 0)).toBeNull();
  });
});

describe('evaluarHold / caducaHold', () => {
  it('un pending que pasó la ventana caduca', () => {
    const hold = { estado: 'pending', fechaCreacion: haceHoras(30) };
    expect(caducaHold(hold, AHORA, 24)).toBe(true);
    expect(evaluarHold(hold, AHORA, 24).motivo).toBeNull();
  });

  it('dentro de la ventana no caduca, y dice cuándo lo hará', () => {
    const hold = { estado: 'pending', fechaCreacion: haceHoras(2) };
    const ev = evaluarHold(hold, AHORA, 24);
    expect(ev.caduca).toBe(false);
    expect(ev.motivo).toBe('dentro_de_plazo');
    expect(ev.caducaEl?.getTime()).toBe(haceHoras(2).getTime() + 24 * HORA);
  });

  it('en el borde exacto de la ventana ya caduca', () => {
    const hold = { estado: 'pending', fechaCreacion: haceHoras(24) };
    expect(caducaHold(hold, AHORA, 24)).toBe(true);
  });

  it('con pagos registrados NUNCA caduca: es una decisión humana', () => {
    const hold = { estado: 'pending', fechaCreacion: haceHoras(500), tienePagos: true };
    const ev = evaluarHold(hold, AHORA, 24);
    expect(ev.caduca).toBe(false);
    expect(ev.motivo).toBe('tiene_pagos');
  });

  it('solo caducan las pending: un confirmado viejo no se toca', () => {
    for (const estado of ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']) {
      const ev = evaluarHold({ estado, fechaCreacion: haceHoras(1000) }, AHORA, 24);
      expect(ev.caduca).toBe(false);
      expect(ev.motivo).toBe('no_es_pending');
    }
  });

  it('ventana 0: el hold pendiente espera a una persona, por viejo que sea', () => {
    const hold = { estado: 'pending', fechaCreacion: haceHoras(24 * 60) };
    const ev = evaluarHold(hold, AHORA, 0);
    expect(ev.caduca).toBe(false);
    expect(ev.motivo).toBe('sin_caducidad_configurada');
    expect(ev.caducaEl).toBeNull();
  });
});
