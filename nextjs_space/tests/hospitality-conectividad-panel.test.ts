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
import {
  MOTIVOS_RECHAZO,
  ETIQUETAS_MOTIVO,
  CONSEJOS_MOTIVO,
} from '@/lib/hospitality/conectividad-rechazo';

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

describe('Panel «Cómo debe llamarnos el PMS» — contrato del webhook sin secretos', () => {
  const fuente = leer('app/admin/conectividad/page.tsx');

  it('existe el panel y nombra las cabeceras que exige el contrato', () => {
    expect(fuente).toContain('Cómo debe llamarnos el PMS');
    expect(fuente).toContain('Authorization: Basic base64(USUARIO_API:CONTRASEÑA_API)');
    expect(fuente).toContain('Content-Type: application/json');
  });

  it('el ejemplo curl usa marcadores, nunca credenciales reales', () => {
    expect(fuente).toContain("-u 'USUARIO_API:CONTRASEÑA_API'");
    expect(fuente).toContain('HOTEL_CODE');
    expect(fuente).toContain('ROOM_CODE');
    // El ejemplo explica la idempotencia: repetir bookingId responde duplicado.
    expect(fuente).toContain('duplicado');
    expect(fuente).toContain('bookingId');
  });

  it('el catálogo de motivos se consume de la pieza pura, no de copias', () => {
    expect(fuente).toContain("from '@/lib/hospitality/conectividad-rechazo'");
    expect(fuente).toContain('MOTIVOS_RECHAZO.map');
    expect(fuente).toContain('ETIQUETAS_MOTIVO[motivo]');
    expect(fuente).toContain('CONSEJOS_MOTIVO[motivo]');
  });

  it('la pieza pura cubre TODOS los motivos con etiqueta y consejo', () => {
    // Si mañana se añade un motivo nuevo al webhook y nadie le escribe su
    // consejo, esta guardia lo detecta: el panel no puede renderizar huecos.
    for (const motivo of MOTIVOS_RECHAZO) {
      expect(ETIQUETAS_MOTIVO[motivo], `sin etiqueta: ${motivo}`).toBeTruthy();
      expect(CONSEJOS_MOTIVO[motivo], `sin consejo: ${motivo}`).toBeTruthy();
    }
  });
});

describe('Panel de conectividad — noches sin justificar en el proveedor (§29)', () => {
  const fuente = leer('app/admin/conectividad/page.tsx');

  it('pinta el barrido que entrega la API de divergencias', () => {
    expect(fuente).toContain('setInventario(data.inventario || [])');
    expect(fuente).toContain('/api/admin/conectividad/divergencias');
    expect(fuente).toContain('Noches sin justificar en el proveedor');
  });

  it('distingue los DOS sentidos: ventas perdidas y riesgo de sobreventa', () => {
    // La parte de la guardia que más importa: no son la misma enfermedad.
    expect(fuente).toContain('sin vender y libres aquí');
    expect(fuente).toContain('vendibles y ocupadas aquí');
  });

  it('no promete cobertura completa: enseña lo comparado y lo que quedó sin dato', () => {
    expect(fuente).toContain('noche(s) comparadas');
    expect(fuente).toContain('sin dato (nunca se empujaron)');
  });

  it('dice que se arregla empujando, no que se arregle solo', () => {
    expect(fuente).toContain('nada se corrige solo');
  });

  it('sin barrido distingue «todavía no corrió» de «cuadra»', () => {
    expect(fuente).toContain('Sin barrido todavía');
    expect(fuente).toContain('Todavía no hay barrido');
    expect(fuente).toContain('cuadra con el estado interno');
  });
});

describe('Panel de conectividad — mensajes de un hotel_id sin vínculo', () => {
  const fuente = leer('app/admin/conectividad/page.tsx');

  it('consume la API de incidencias de mensajes sin mapping', () => {
    expect(fuente).toContain('/api/admin/conectividad/mensajes-sin-mapping');
    expect(fuente).toContain('setMensajesSinMapping(data.incidencias || [])');
  });

  it('enseña el código, el canal y el contador de intentos', () => {
    expect(fuente).toContain('Mensajes sin hotel vinculado');
    expect(fuente).toContain('Código en el canal');
    expect(fuente).toContain('Intentos');
    expect(fuente).toContain('{m.hotelCode ||');
    expect(fuente).toContain('{m.intentos}');
  });

  it('dice por qué se reintenta solo (404 con Retry-After) y cómo se arregla', () => {
    expect(fuente).toContain('Retry-After');
    expect(fuente).toContain('Onboarding → mapping');
    expect(fuente).toContain('mensajes sin mapping');
  });

  it('avisa de lo que ya existe en Volkern para ese código (inactivo incluido)', () => {
    expect(fuente).toContain('m.vinculos');
    expect(fuente).toContain('el código no está vinculado');
  });

  it('un fallo de esta tarjeta no rompe la pantalla (es informativa)', () => {
    expect(fuente).toContain('loadMensajesSinMapping');
    expect(fuente).toContain("if (!res.ok) return;");
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
