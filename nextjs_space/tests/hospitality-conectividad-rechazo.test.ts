// @vitest-environment node
//
// Guardia de la pieza pura del último rechazo del webhook entrante
// (lib/hospitality/conectividad-rechazo.ts) y de la capa que la persiste y
// la expone (lib/hospitality/connectivity.ts):
// - normaliza lo que viene de la BD (Json) y descarta otra forma;
// - el rechazo persistido solo lleva metadatos, nunca el valor recibido;
// - getConnectivityPublic lo expone ya legible, sin tocar los secretos;
// - updateConnectivityStatus lo persiste en configuracion.ultimoRechazoWebhook
//   conservando el resto de esa configuración.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MOTIVOS_RECHAZO,
  normalizarRechazoWebhook,
  rechazoDesdeDiagnostico,
  rechazoLegible,
  ETIQUETAS_MOTIVO,
  CONSEJOS_MOTIVO,
} from '@/lib/hospitality/conectividad-rechazo';

const RAIZ = path.resolve(__dirname, '..');

const AHORA = new Date('2026-09-25T10:16:17.378Z');

const DIAGNOSTICO_COMPLETO = {
  motivo: 'credenciales_no_coinciden',
  esquema: 'basic',
  usuarioLen: 7,
  passwordLen: 11,
  usuarioHuella: 'fb41fd6bdba9',
  huella: '38f0996ec20e',
};

describe('conectividad-rechazo — normalización del diagnóstico', () => {
  it('los seis motivos del contrato tienen etiqueta y consejo', () => {
    expect([...MOTIVOS_RECHAZO]).toEqual([
      'sin_cabecera',
      'esquema_no_basic',
      'cabecera_malformada',
      'encoding_no_utf8',
      'sin_separador',
      'credenciales_no_coinciden',
    ]);
    for (const motivo of MOTIVOS_RECHAZO) {
      expect(ETIQUETAS_MOTIVO[motivo], motivo).toBeTruthy();
      expect(CONSEJOS_MOTIVO[motivo], motivo).toBeTruthy();
    }
  });

  it('convierte el diagnóstico del webhook en rechazo persistido con su hora', () => {
    const rechazo = rechazoDesdeDiagnostico(DIAGNOSTICO_COMPLETO, AHORA);
    expect(rechazo).toEqual({ ...DIAGNOSTICO_COMPLETO, fecha: '2026-09-25T10:16:17.378Z' });
  });

  it('descarta diagnósticos de otra forma (motivo desconocido, no objeto, array, vacío)', () => {
    expect(rechazoDesdeDiagnostico({ motivo: 'otra_cosa' }, AHORA)).toBeNull();
    expect(rechazoDesdeDiagnostico(null, AHORA)).toBeNull();
    expect(rechazoDesdeDiagnostico('sin_cabecera', AHORA)).toBeNull();
    expect(rechazoDesdeDiagnostico(['sin_cabecera'], AHORA)).toBeNull();
    expect(rechazoDesdeDiagnostico({}, AHORA)).toBeNull();
  });

  it('normaliza lo que llega de la BD (Json) y descarta basura sin romper', () => {
    const guardado = rechazoDesdeDiagnostico(DIAGNOSTICO_COMPLETO, AHORA);
    expect(normalizarRechazoWebhook(guardado)).toEqual(guardado);
    // Campos de otro tipo se descartan, el resto sobrevive.
    expect(
      normalizarRechazoWebhook({ motivo: 'sin_cabecera', esquema: 42, usuarioLen: 'x', fecha: null })
    ).toEqual({ motivo: 'sin_cabecera', esquema: null, fecha: '' });
    expect(normalizarRechazoWebhook(null)).toBeNull();
    expect(normalizarRechazoWebhook('nada')).toBeNull();
    expect(normalizarRechazoWebhook({})).toBeNull();
  });

  it('rechazoLegible añade etiqueta y consejo, y rellena nulls donde no hay datos', () => {
    const legible = rechazoLegible(rechazoDesdeDiagnostico(DIAGNOSTICO_COMPLETO, AHORA));
    expect(legible).toEqual({
      motivo: 'credenciales_no_coinciden',
      etiqueta: 'Credenciales distintas a las guardadas',
      consejo: expect.stringContaining('coteja las huellas'),
      esquema: 'basic',
      usuarioLen: 7,
      passwordLen: 11,
      usuarioHuella: 'fb41fd6bdba9',
      huella: '38f0996ec20e',
      fecha: '2026-09-25T10:16:17.378Z',
    });

    const sinCabecera = rechazoLegible({ motivo: 'sin_cabecera', esquema: null, fecha: AHORA.toISOString() });
    expect(sinCabecera?.etiqueta).toBe('Sin cabecera Authorization');
    expect(sinCabecera?.usuarioLen).toBeNull();
    expect(sinCabecera?.huella).toBeNull();

    expect(rechazoLegible({ motivo: 'inventado' })).toBeNull();
  });
});

describe('connectivity.ts — persistencia y exposición del último rechazo', () => {
  const fuente = fs.readFileSync(path.join(RAIZ, 'lib/hospitality/connectivity.ts'), 'utf8');

  it('updateConnectivityStatus persiste el rechazo conservando el resto de configuracion', () => {
    expect(fuente).toContain('registroRechazo?: Record<string, unknown>');
    expect(fuente).toContain('rechazoDesdeDiagnostico(input.registroRechazo, new Date())');
    // No pisa lo que ya había en configuracion (nota del partnerId anterior).
    expect(fuente).toContain(
      '...((provider.configuracion as Record<string, unknown> | null) ?? {})'
    );
    expect(fuente).toContain('ultimoRechazoWebhook: rechazo');
  });

  it('getConnectivityPublic expone el rechazo ya legible y el estado sin_configurar lo trae a null', () => {
    expect(fuente).toContain('ultimoRechazo: rechazoLegible(');
    expect(fuente).toContain('ultimoRechazoWebhook');
    expect(fuente).toContain('ultimoRechazo: null as RechazoLegible | null');
  });

  it('la pieza persistida solo lleva metadatos (el valor recibido jamás entra)', () => {
    // El tipo RechazoWebhook no tiene campo para el valor: la guardia viva es
    // que rechazoDesdeDiagnostico descarta cualquier campo extra.
    const rechazo = rechazoDesdeDiagnostico(
      { ...DIAGNOSTICO_COMPLETO, username: 'en_claro', password: 'tambien' },
      AHORA
    );
    const crudo = JSON.stringify(rechazo);
    expect(crudo).not.toContain('en_claro');
    expect(crudo).not.toContain('tambien');
  });
});
