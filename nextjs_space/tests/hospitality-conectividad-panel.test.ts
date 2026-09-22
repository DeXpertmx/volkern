// @vitest-environment node
//
// Guardia del panel de conectividad (app/admin/conectividad/page.tsx):
// - El badge nombra la causa del último fallo con la MISMA regla del módulo
//   puro (401/403 → credenciales; 5xx/timeout → servicio), no un duplicado.
// - La capa de lectura de secretos queda intacta: la pantalla solo ve
//   marcadores de presencia y el diagnóstico, nunca valores.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

describe('Panel de conectividad — diagnóstico del badge', () => {
  const fuente = leer('app/admin/conectividad/page.tsx');

  it('deriva la causa con la función del módulo puro, no con una copia', () => {
    expect(fuente).toContain('causaDeFalloConectividad');
    expect(fuente).toContain("from '@/lib/hospitality/conectividad-causa'");
  });

  it('alimenta el badge con el último fallo que entrega el estado', () => {
    expect(fuente).toContain('estado?.ultimoFallo');
  });

  it('muestra el texto y el consejo de la causa en el diagnóstico', () => {
    expect(fuente).toContain('causaUltimoFallo.texto');
    expect(fuente).toContain('causaUltimoFallo.consejo');
  });

  it('la tabla por propiedad consume el diagnóstico que calcula la API', () => {
    expect(fuente).toContain('causaUltimoError');
  });

  it('muestra la marca de última verificación y explica qué es', () => {
    expect(fuente).toContain('ultimaVerificacion');
    expect(fuente).toContain('Última verificación');
    expect(fuente).toContain('health-check');
    expect(fuente).toContain('sin esperar tráfico real');
  });

  it('el diálogo de prueba sanea la respuesta del proveedor al renderizarla (2ª capa)', () => {
    expect(fuente).toContain('sanitizarRespuestaExterna');
    // El render pasa por el saneador, no por JSON.stringify del cuerpo crudo.
    expect(fuente).toContain('sanitizarRespuestaExterna(testResult.respuestaExterna)');
  });

  it('no importa la capa de credenciales: los secretos jamás entran en la pantalla', () => {
    // La lectura de secretos vive en el servidor (getConnectivityCredentials);
    // el panel es un componente de cliente y solo ve getConnectivityPublic.
    expect(fuente).not.toContain('getConnectivityCredentials');
    expect(fuente).not.toContain("from '@/lib/hospitality/connectivity'");
    expect(fuente).not.toContain('decrypt');
  });
});

describe('getConnectivityPublic — la capa pública sigue sin exponer secretos', () => {
  it('la función que añade ultimoFallo es la misma de siempre (marcadores, no valores)', () => {
    const fuente = leer('lib/hospitality/connectivity.ts');
    // El diagóstico entra por la misma función que ya blindaban los tests de
    // la capa: marcadores de presencia y ningún campo cifrado expuesto.
    expect(fuente).toContain('partnerIdEnc ?');
    expect(fuente).toContain("usernameEnc ? '••••••'");
    // La consulta de diagnóstico selecciona solo campos acotados.
    expect(fuente).toContain('httpStatus: true, errorMensaje: true, fechaCreacion: true');
  });
});
