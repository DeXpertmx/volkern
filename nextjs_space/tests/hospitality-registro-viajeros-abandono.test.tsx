// @vitest-environment jsdom
//
// Los partes que el sistema dejó de reintentar, en el panel del HOTEL
// (RD 933/2021). Antes este abandono solo lo veía el operador de plataforma en
// el panel de estado de crons: el hotel, que es quien tiene los documentos y las
// credenciales, no tenía forma de saber que tenía estancias sin comunicar.
//
// Lo que se vigila aquí es la decisión, no el color: la tarjeta aparece solo si
// hay abandonados, dice el motivo del Ministerio y qué corregir, ofrece la
// salida que sirve según el ámbito del rechazo (formulario del huésped o
// reenvío), y las filas abandonadas se distinguen de las que aún se reintentan.

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Polyfill PointerEvent para Radix UI en jsdom (mismo apaño que el resto de
// tests de páginas con Select).
beforeAll(() => {
  if (!global.PointerEvent) {
    (global as any).PointerEvent = class PointerEvent extends Event {
      button = 0;
      pointerType = 'mouse';
      isPrimary = true;
      hasPointerCapture() {
        return false;
      }
      releasePointerCapture() {}
      constructor(type: string, init?: any) {
        super(type, init);
      }
    } as any;
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { olvidarRolCacheado } from '@/hooks/use-capacidades-hospitality';
import RegistroViajerosPage from '@/app/dashboard/hospitality/registro-viajeros/page';

/** Respuesta de la API del registro: solo se informa lo que mira la pantalla. */
function estadoDeLaApi(extra: Record<string, unknown>) {
  return {
    config: {
      configurado: true,
      activo: true,
      codigoArrendador: 'ARR-1',
      aplicacion: 'Volkern',
      entorno: 'pre',
      tieneCredenciales: true,
      tipoPagoDefecto: '01',
      tiposPagoConfigurados: 1,
      listoParaEnviar: true,
      ultimoEnvio: null,
      ultimoError: null,
    },
    conteo: {},
    total: 0,
    propiedades: [],
    propiedadesSinCodigo: [],
    ultimas: [],
    sinReintentar: 0,
    partesSinReintentar: [],
    partes: {
      aceptadas: 0,
      sinReintentar: 0,
      rechazadasEnCurso: 0,
      esperandoAlHuesped: 0,
      otras: 0,
      total: 0,
      cerradas: 0,
      tasaSinReintentar: null,
    },
    reservas: { habilitadas: true, motivo: null },
    ...extra,
  };
}

/** Parte abandonado por un dato del huésped: se arregla en el formulario. */
const ABANDONADO_DATOS = {
  id: 'com-1',
  reservationId: 'res-1',
  referencia: 'REF-ANA',
  estado: 'rechazada',
  intentos: 5,
  fechaEdicion: '2026-09-18T10:00:00.000Z',
  diagnostico: {
    codigo: '10130',
    motivo: 'El campo persona[0].numeroDocumento no tiene un formato válido de NIF o NIE',
    campos: ['numeroDocumento'],
    ambito: 'datos',
  },
};

/** Abandonado por configuración: completar datos no arregla nada. */
const ABANDONADO_CONFIG = {
  id: 'com-2',
  reservationId: 'res-2',
  referencia: 'REF-BRUNO',
  estado: 'rechazada',
  intentos: 5,
  fechaEdicion: '2026-09-18T11:00:00.000Z',
  diagnostico: {
    codigo: '10103',
    motivo: 'El código de arrendador no existe en el sistema',
    campos: [],
    ambito: 'configuracion',
  },
};

/**
 * Abandonado porque el servicio no llegó a recibir el parte: aquí NO hay dato
 * del huésped que corregir — el Ministerio no ha visto el parte — y la única
 * salida es reintentar.
 */
const ABANDONADO_SIN_ENTREGAR = {
  id: 'com-3',
  reservationId: 'res-3',
  referencia: 'REF-CARLA',
  estado: 'error',
  intentos: 5,
  fechaEdicion: '2026-09-18T12:00:00.000Z',
  diagnostico: {
    desenlace: 'sin_entregar',
    codigo: null,
    motivo: 'No se pudo entregar la comunicación: fetch failed',
    campos: [],
    ambito: 'envio',
  },
};

function montarFetch(estado: unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    // Qué acciones ofrece la pantalla depende del rol de la sesión
    // (`useCapacidadesHospitality`). Aquí el operador del hotel puede todo:
    // esta prueba vigila el abandono de partes, no los permisos.
    if (String(url).includes('/api/users/me')) {
      return {
        ok: true,
        json: async () => ({ role: { id: 'rol-1', nombre: 'Admin', permisos: { all: true } } }),
      };
    }
    if (String(url).includes('/api/hospitality/registro-viajeros')) {
      if (init?.method === 'POST') {
        const cuerpo = JSON.parse(String(init.body));
        if (cuerpo.accion === 'enviar') {
          return { ok: true, json: async () => ({ ok: true, estado: 'enviada' }) };
        }
        return { ok: true, json: async () => ({ ok: true, url: 'https://volkern.app/checkin/tok' }) };
      }
      return { ok: true, json: async () => estado };
    }
    throw new Error(`petición no esperada: ${url}`);
  });
}

describe('Panel del hotel: partes sin reintentar', () => {
  beforeEach(() => {
    // El rol se cachea en el módulo del hook: cada prueba parte sin rol.
    olvidarRolCacheado();
    vi.clearAllMocks();
    global.fetch = montarFetch(estadoDeLaApi({})) as unknown as typeof fetch;
  });

  it('sin abandonados no aparece la tarjeta (un «0» permanente se ignora)', async () => {
    render(<RegistroViajerosPage />);
    await screen.findByText('Últimas comunicaciones');

    expect(screen.queryByText(/Partes sin reintentar/)).toBeNull();
  });

  it('nombra los partes abandonados con el motivo del Ministerio y qué corregir', async () => {
    global.fetch = montarFetch(
      estadoDeLaApi({
        sinReintentar: 1,
        partesSinReintentar: [ABANDONADO_DATOS],
        partes: {
          aceptadas: 0,
          sinReintentar: 1,
          rechazadasEnCurso: 0,
          esperandoAlHuesped: 0,
          otras: 0,
          total: 1,
          cerradas: 1,
          tasaSinReintentar: 1,
        },
      })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);

    expect(await screen.findByText(/Partes sin reintentar \(1\)/)).toBeTruthy();
    expect(screen.getByText('REF-ANA')).toBeTruthy();
    // El motivo, tal cual lo dijo el servicio.
    expect(screen.getByText(/no tiene un formato válido de NIF o NIE/)).toBeTruthy();
    // Y qué hacer con él, con el campo en el idioma del formulario.
    expect(screen.getByText(/Corrige estos datos y vuelve a guardar: Número de documento/)).toBeTruthy();
    // La lectura del abandono la produce el módulo puro (con un solo parte
    // cerrado, declara que la proporción todavía es ruido).
    expect(screen.getByText(/es todavía ruido/)).toBeTruthy();
    expect(screen.getByText(/el sistema intenta cada parte hasta 5 veces/i)).toBeTruthy();
  });

  it('desde el abandonado de datos se abre el formulario del huésped', async () => {
    const usuario = userEvent.setup();
    global.fetch = montarFetch(
      estadoDeLaApi({ sinReintentar: 1, partesSinReintentar: [ABANDONADO_DATOS] })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);
    await screen.findByText(/Partes sin reintentar/);

    await usuario.click(screen.getByRole('button', { name: /Corregir los datos/ }));

    expect(await screen.findByText('Datos del viajero')).toBeTruthy();
    expect(screen.getByText(/Reserva REF-ANA/)).toBeTruthy();
  });

  it('un rechazo de configuración no manda a rellenar datos: ofrece reenviar', async () => {
    global.fetch = montarFetch(
      estadoDeLaApi({ sinReintentar: 1, partesSinReintentar: [ABANDONADO_CONFIG] })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);
    await screen.findByText(/Partes sin reintentar/);

    expect(screen.getByText(/No es un problema del huésped/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reenviar el parte/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Corregir los datos/ })).toBeNull();
  });

  it('reenviar un parte abandonado llama a la acción que lo vuelve a enviar', async () => {
    const usuario = userEvent.setup();
    global.fetch = montarFetch(
      estadoDeLaApi({ sinReintentar: 1, partesSinReintentar: [ABANDONADO_CONFIG] })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);
    await screen.findByText(/Partes sin reintentar/);

    await usuario.click(screen.getByRole('button', { name: /Reenviar el parte/ }));

    await waitFor(() => {
      const reenvio = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[1]?.method === 'POST' && String(c[1].body).includes('"accion":"enviar"')
      );
      expect(reenvio).toBeTruthy();
      expect(JSON.parse(reenvio![1].body)).toEqual({ accion: 'enviar', reservaId: 'res-2' });
    });
  });

  it('una entrega que no llegó se nombra como tal y NO manda a corregir datos', async () => {
    global.fetch = montarFetch(
      estadoDeLaApi({ sinReintentar: 1, partesSinReintentar: [ABANDONADO_SIN_ENTREGAR] })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);
    await screen.findByText(/Partes sin reintentar/);

    // La causa, dicha: el Ministerio no lo recibió (no es un rechazo suyo).
    expect(screen.getByText(/el servicio no lo recibió/)).toBeTruthy();
    expect(screen.getByText(/fetch failed/)).toBeTruthy();
    expect(screen.getByText(/No es un problema de los datos del huésped/)).toBeTruthy();
    // Y la salida que sirve: reenviar. El formulario del huésped no arregla una
    // caída del servicio.
    expect(screen.getByRole('button', { name: /Reenviar el parte/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Corregir los datos/ })).toBeNull();
  });

  it('un rechazo del Ministerio se sigue nombrando como rechazo', async () => {
    global.fetch = montarFetch(
      estadoDeLaApi({ sinReintentar: 1, partesSinReintentar: [ABANDONADO_DATOS] })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);
    await screen.findByText(/Partes sin reintentar/);

    expect(screen.getByText(/rechazado por el Ministerio/)).toBeTruthy();
    expect(screen.queryByText(/el servicio no lo recibió/)).toBeNull();
  });

  it('la fila del abandonado lo marca y cambia el verbo: ya no lo reintenta el sistema', async () => {
    global.fetch = montarFetch(
      estadoDeLaApi({
        sinReintentar: 1,
        partesSinReintentar: [ABANDONADO_DATOS],
        ultimas: [
          {
            id: 'com-1',
            estado: 'rechazada',
            referencia: 'REF-ANA',
            lote: 'LOTE-9',
            codigoComunicacion: null,
            codigoRetorno: '10130',
            descripcion: 'El campo persona[0].numeroDocumento no tiene un formato válido de NIF o NIE',
            intentos: 5,
            errores: [],
            fechaEnvio: '2026-09-17T10:00:00.000Z',
            reservationId: 'res-1',
          },
          {
            id: 'com-3',
            estado: 'rechazada',
            referencia: 'REF-CARLA',
            lote: 'LOTE-9',
            codigoComunicacion: null,
            codigoRetorno: '10130',
            descripcion: 'Otro rechazo con intentos de sobra',
            intentos: 1,
            errores: [],
            fechaEnvio: '2026-09-18T10:00:00.000Z',
            reservationId: 'res-3',
          },
        ],
      })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);
    await screen.findByText('Últimas comunicaciones');

    // Solo la fila con el tope agotado lleva la marca…
    expect(screen.getAllByText(/sin reintentos automáticos/)).toHaveLength(1);
    // …y solo esa cambia el botón: el sistema ya no lo reintenta, lo reenvía el hotel.
    expect(screen.getByRole('button', { name: 'Reenviar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('el aviso de abandono aparece con volumen y tasa altos, y no con poco volumen', async () => {
    const unusado = {
      id: 'x',
      reservationId: 'res-1',
      referencia: 'REF',
      estado: 'rechazada',
      intentos: 5,
      fechaEdicion: '',
      diagnostico: ABANDONADO_DATOS.diagnostico,
    };
    global.fetch = montarFetch(
      estadoDeLaApi({
        sinReintentar: 3,
        partesSinReintentar: [unusado],
        partes: {
          aceptadas: 1,
          sinReintentar: 3,
          rechazadasEnCurso: 0,
          esperandoAlHuesped: 0,
          otras: 0,
          total: 4,
          cerradas: 4,
          tasaSinReintentar: 0.75,
        },
      })
    ) as unknown as typeof fetch;
    const { unmount } = render(<RegistroViajerosPage />);

    expect(await screen.findByText(/3 de 4 partes cerrados en el período se quedaron sin reintentar/)).toBeTruthy();
    unmount();

    // Con un solo parte cerrado la tasa es ruido: el módulo puro decide, la
    // página no avisa por su cuenta.
    global.fetch = montarFetch(
      estadoDeLaApi({
        sinReintentar: 1,
        partesSinReintentar: [ABANDONADO_DATOS],
        partes: {
          aceptadas: 0,
          sinReintentar: 1,
          rechazadasEnCurso: 0,
          esperandoAlHuesped: 0,
          otras: 0,
          total: 1,
          cerradas: 1,
          tasaSinReintentar: 1,
        },
      })
    ) as unknown as typeof fetch;
    render(<RegistroViajerosPage />);
    await screen.findByText(/Partes sin reintentar/);

    expect(screen.queryByText(/partes cerrados en el período se quedaron sin reintentar/)).toBeNull();
  });
});
