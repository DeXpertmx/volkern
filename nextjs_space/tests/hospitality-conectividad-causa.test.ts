// @vitest-environment node
//
// Módulo puro de diagnóstico del panel de conectividad
// (lib/hospitality/conectividad-causa.ts): la causa del último fallo en
// palabras, sin exponer secretos. La MISMA regla alimenta el badge global
// del panel y la columna de errores de la tabla por propiedad.

import { describe, it, expect } from 'vitest';
import {
  causaDeFalloConectividad,
  TIPOS_SYNC_CONECTIVIDAD,
  type FalloConectividad,
} from '@/lib/hospitality/conectividad-causa';

function fallo(extra: Partial<FalloConectividad> = {}): FalloConectividad {
  return {
    httpStatus: null,
    errorMensaje: null,
    fechaCreacion: new Date('2026-09-19T10:00:00Z'),
    ...extra,
  };
}

describe('causaDeFalloConectividad — el ID de socio nombrado por el proveedor', () => {
  it('«Partner is disabled!» (400) → «ID de socio deshabilitado», no un error genérico', () => {
    const causa = causaDeFalloConectividad(
      fallo({ httpStatus: 400, errorMensaje: 'Partner is disabled!' })
    );
    expect(causa.clave).toBe('partner_deshabilitado');
    expect(causa.texto).toMatch(/deshabilitado/i);
    // El arreglo es hablar con el proveedor, no rotar credenciales ni reintentar.
    expect(causa.consejo).toMatch(/habiliten/i);
    expect(causa.consejo.toLowerCase()).not.toContain('reintenta');
  });

  it('«partner desconocido» (403) → ID de socio desconocido, NO «credenciales rechazadas»', () => {
    // Este era el fallo real: el 403 del contrato mandaba a rotar credenciales
    // —que no tiene nada que ver— y el hotel no sabía que su ID estaba mal.
    const causa = causaDeFalloConectividad(
      fallo({ httpStatus: 403, errorMensaje: 'partner desconocido' })
    );
    expect(causa.clave).toBe('partner_desconocido');
    expect(causa.texto).toMatch(/no reconoce/i);
    expect(causa.consejo).toMatch(/quítalo|quitarlo/i);
  });

  it.each([
    'Partner is disabled!',
    'PARTNER IS DISABLED',
    'partner disabled',
  ])('el texto del proveedor se reconoce sin importar mayúsculas: «%s»', (mensaje) => {
    expect(causaDeFalloConectividad(fallo({ httpStatus: 400, errorMensaje: mensaje })).clave).toBe(
      'partner_deshabilitado'
    );
  });

  it.each(['partner desconocido', 'Partner not found', 'unknown partner', 'invalid partner'])(
    'las variantes de «no lo conozco» se reconocen: «%s»',
    (mensaje) => {
      expect(causaDeFalloConectividad(fallo({ httpStatus: 403, errorMensaje: mensaje })).clave).toBe(
        'partner_desconocido'
      );
    }
  );

  it('un 401 normal sigue siendo «credenciales rechazadas» (la regla no se come la autenticación)', () => {
    const causa = causaDeFalloConectividad(
      fallo({ httpStatus: 401, errorMensaje: 'Usuario o contraseña inválidos' })
    );
    expect(causa.clave).toBe('credenciales_rechazadas');
  });

  it('un 400 de datos que NO menciona al socio sigue siendo «Error»', () => {
    const causa = causaDeFalloConectividad(
      fallo({ httpStatus: 400, errorMensaje: 'campo available inválido' })
    );
    expect(causa.clave).toBe('otro_error');
  });
});

describe('causaDeFalloConectividad — el hotel que no está concedido a ese ID de socio', () => {
  it('403 «Access Denied - <hotelCode>» → hotel sin conceder, NO «credenciales rechazadas»', () => {
    // Texto verificado contra el servicio: con el par Basic y el ID de socio
    // CORRECTOS, un hotel que la cuenta no tiene asignado responde esto. Durante
    // semanas se leyó como «credenciales rechazadas» y mandaba a rotar unas
    // credenciales que funcionaban.
    const causa = causaDeFalloConectividad(
      fallo({ httpStatus: 403, errorMensaje: 'Access Denied - 75fdbbce2e' })
    );
    expect(causa.clave).toBe('hotel_sin_concesion');
    expect(causa.texto).toMatch(/no está concedido/i);
    expect(causa.consejo).toMatch(/asign/i);
    expect(causa.consejo.toLowerCase()).not.toContain('rotar');
  });

  it.each(['Access Denied - sandbox-pms', 'ACCESS DENIED', 'hotel not granted'])(
    'la variante «%s» se reconoce sin importar mayúsculas',
    (mensaje) => {
      expect(causaDeFalloConectividad(fallo({ httpStatus: 403, errorMensaje: mensaje })).clave).toBe(
        'hotel_sin_concesion'
      );
    }
  );

  it('el ID de socio sigue ganando: un «partner desconocido» con 403 no es un hotel sin conceder', () => {
    expect(
      causaDeFalloConectividad(fallo({ httpStatus: 403, errorMensaje: 'partner desconocido' })).clave
    ).toBe('partner_desconocido');
  });
});

describe('causaDeFalloConectividad — credenciales rechazadas (401/403)', () => {
  it('401 → «Credenciales rechazadas»', () => {
    const causa = causaDeFalloConectividad(fallo({ httpStatus: 401, errorMensaje: 'HTTP 401 del proveedor' }));
    expect(causa.clave).toBe('credenciales_rechazadas');
    expect(causa.texto).toBe('Credenciales rechazadas');
  });

  it('403 → «Credenciales rechazadas» (prohibido, no solo no-autenticado)', () => {
    const causa = causaDeFalloConectividad(fallo({ httpStatus: 403 }));
    expect(causa.clave).toBe('credenciales_rechazadas');
    expect(causa.texto).toBe('Credenciales rechazadas');
  });

  it('el consejo apunta a rotar credenciales, no a reintentar', () => {
    const causa = causaDeFalloConectividad(fallo({ httpStatus: 401 }));
    expect(causa.consejo.toLowerCase()).toContain('credenciales');
    expect(causa.consejo.toLowerCase()).not.toContain('reintenta');
  });
});

describe('causaDeFalloConectividad — sin respuesta del servicio (5xx/timeout)', () => {
  it.each([500, 502, 503, 504])('HTTP %i → «Sin respuesta del servicio»', (status) => {
    const causa = causaDeFalloConectividad(fallo({ httpStatus: status }));
    expect(causa.clave).toBe('sin_respuesta_servicio');
    expect(causa.texto).toBe('Sin respuesta del servicio');
  });

  it('sin HTTP con mensaje de timeout del cliente → «Sin respuesta del servicio»', () => {
    const causa = causaDeFalloConectividad(fallo({ errorMensaje: 'The operation was aborted due to timeout' }));
    expect(causa.clave).toBe('sin_respuesta_servicio');
  });

  it.each([
    'fetch failed',
    'ECONNREFUSED 10.0.0.5:443',
    'ECONNRESET',
    'getaddrinfo ENOTFOUND api.proveedor.example',
    'socket hang up',
    'Request timed out',
  ])('indicio de red «%s» sin HTTP → «Sin respuesta del servicio»', (mensaje) => {
    expect(causaDeFalloConectividad(fallo({ errorMensaje: mensaje })).clave).toBe('sin_respuesta_servicio');
  });

  it('sin HTTP y sin mensaje → «Sin respuesta del servicio» (no llegó a contestar nada)', () => {
    const causa = causaDeFalloConectividad(fallo({}));
    expect(causa.clave).toBe('sin_respuesta_servicio');
  });

  it('el consejo deja claro que NO es un problema de credenciales', () => {
    const causa = causaDeFalloConectividad(fallo({ httpStatus: 503 }));
    expect(causa.consejo).toMatch(/no es un problema de credenciales/i);
  });
});

describe('causaDeFalloConectividad — otros errores', () => {
  it('400/404 de datos → «Error» con el detalle', () => {
    const causa = causaDeFalloConectividad(fallo({ httpStatus: 400, errorMensaje: '  campo tarifa inválido  ' }));
    expect(causa.clave).toBe('otro_error');
    expect(causa.texto).toBe('Error');
    expect(causa.consejo).toContain('campo tarifa inválido');
  });

  it('4xx sin mensaje → «Error» con el código HTTP', () => {
    const causa = causaDeFalloConectividad(fallo({ httpStatus: 422 }));
    expect(causa.clave).toBe('otro_error');
    expect(causa.consejo).toContain('HTTP 422');
  });

  it('error sin HTTP ni código con mensaje que no es de red → «Error» con el detalle', () => {
    const causa = causaDeFalloConectividad(fallo({ errorMensaje: 'XML malformado del proveedor' }));
    expect(causa.clave).toBe('otro_error');
    expect(causa.consejo).toContain('XML malformado');
  });

  it('sin ningún fallo previo → «Error» neutro (el badge no inventa causas)', () => {
    const causa = causaDeFalloConectividad(null);
    expect(causa.clave).toBe('otro_error');
    expect(causa.texto).toBe('Error');
  });
});

describe('TIPOS_SYNC_CONECTIVIDAD — el diagnóstico solo mira tráfico de la capa', () => {
  it('incluye los pushes y la reconciliación', () => {
    expect(TIPOS_SYNC_CONECTIVIDAD).toContain('inventory');
    expect(TIPOS_SYNC_CONECTIVIDAD).toContain('rates');
    expect(TIPOS_SYNC_CONECTIVIDAD).toContain('inventory_restrictions');
    expect(TIPOS_SYNC_CONECTIVIDAD).toContain('rates_restrictions');
    expect(TIPOS_SYNC_CONECTIVIDAD).toContain('reconciliacion');
  });

  it('excluye los tipos de otras superficies que comparten la tabla', () => {
    // La tabla HospitalitySyncLog se comparte: un fallo de otra superficie no
    // debe diagnosticarse como credenciales de canales rechazadas. Valores
    // reales escritos por: aviso-partes.ts (aviso al hotel), onboarding.ts
    // (prueba del onboarding), incidencias.ts/cron de vínculos (resumen y
    // vínculo automático).
    expect(TIPOS_SYNC_CONECTIVIDAD).not.toContain('aviso_partes_sin_reintentar');
    expect(TIPOS_SYNC_CONECTIVIDAD).not.toContain('reservacion_prueba');
    expect(TIPOS_SYNC_CONECTIVIDAD).not.toContain('resumen_vinculos_automaticos');
    expect(TIPOS_SYNC_CONECTIVIDAD).not.toContain('mapping_automatico');
  });
});
