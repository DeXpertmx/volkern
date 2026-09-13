// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Polyfill PointerEvent para Radix UI + jsdom (mismo patrón que tareas-page).
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
  if (!global.HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!global.HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => React.createElement('a', props, children),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import BandejaPage from '@/app/dashboard/hospitality/viajeros/page';

/** Fila de la bandeja con los campos que lee la página. */
function fila(extra: Partial<Record<string, unknown>> = {}) {
  return {
    reservationId: 'res-1',
    referencia: 'DEMO-001',
    estadoReservaHotel: 'confirmed',
    canal: 'DIRECT',
    checkIn: new Date(Date.now() + 86400000).toISOString(),
    checkOut: new Date(Date.now() + 6 * 86400000).toISOString(),
    huesped: 'María García',
    propiedad: 'Villa Mar Azul',
    unidad: 'Loft Marina',
    total: 1,
    registrados: 0,
    pendientes: 1,
    estado: 'datos_pendientes',
    etiqueta: '1 viajero · 0 registrados',
    listoParaEnviar: false,
    ultimoEnvio: null,
    mensajeError: null,
    enlacesSinResponder: 0,
    ultimoEnlaceEnviadoEn: null,
    ...extra,
  };
}

function mockBandeja(filas: unknown[]) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/hospitality/compliance')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            filas,
            total: filas.length,
            conteo: {},
            porcentajeEnviado: 0,
            estados: [],
            configuracion: { activo: false, entorno: 'pruebas' },
            esquemaDisponible: true,
            entornos: ['pruebas', 'produccion'],
            endpoints: {},
          }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv('TZ', 'UTC');
});

afterEach(() => {
  cleanup();
});

describe('el aviso de enlaces de WhatsApp sin responder más de 48 horas', () => {
  it('aparece con las referencias cuando el último envío supera las 48 horas', async () => {
    mockBandeja([
      fila({
        enlacesSinResponder: 2,
        ultimoEnlaceEnviadoEn: new Date(Date.now() - 60 * 3600 * 1000).toISOString(),
      }),
    ]);

    render(<BandejaPage />);

    await waitFor(() => {
      expect(screen.getByText(/sin respuesta desde hace más de 48 horas/i)).toBeDefined();
    });
    expect(screen.getByText(/DEMO-001: 2 viajeros/)).toBeDefined();
  });

  it('no aparece cuando el envío es reciente (menos de 48 horas)', async () => {
    mockBandeja([
      fila({
        enlacesSinResponder: 1,
        ultimoEnlaceEnviadoEn: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      }),
    ]);

    render(<BandejaPage />);

    await waitFor(() => {
      expect(screen.getByText(/registro de viajeros/i)).toBeDefined();
    });
    expect(screen.queryByText(/sin respuesta desde hace más de 48 horas/i)).toBeNull();
  });

  it('no aparece cuando no hay enlaces sin respuesta', async () => {
    mockBandeja([
      fila({
        enlacesSinResponder: 0,
        ultimoEnlaceEnviadoEn: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
      }),
    ]);

    render(<BandejaPage />);

    await waitFor(() => {
      expect(screen.getByText(/registro de viajeros/i)).toBeDefined();
    });
    expect(screen.queryByText(/sin respuesta desde hace más de 48 horas/i)).toBeNull();
  });

  it('usa el peor caso: un envío reciente y otro viejo activan el aviso con la referencia', async () => {
    mockBandeja([
      fila({
        reservationId: 'res-a',
        referencia: 'RES-A',
        enlacesSinResponder: 1,
        ultimoEnlaceEnviadoEn: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      }),
      fila({
        reservationId: 'res-b',
        referencia: 'RES-B',
        enlacesSinResponder: 3,
        ultimoEnlaceEnviadoEn: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
      }),
    ]);

    render(<BandejaPage />);

    await waitFor(() => {
      expect(screen.getByText(/sin respuesta desde hace más de 48 horas/i)).toBeDefined();
    });
    expect(screen.getByText(/RES-B: 3 viajeros/)).toBeDefined();
    expect(screen.queryByText(/RES-A: 1 viajero/)).toBeNull();
  });

  it('es cerrable y no vuelve a salir al re-renderizar', async () => {
    const usuario = userEvent.setup();
    mockBandeja([
      fila({
        enlacesSinResponder: 1,
        ultimoEnlaceEnviadoEn: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
      }),
    ]);

    render(<BandejaPage />);

    await waitFor(() => {
      expect(screen.getByText(/sin respuesta desde hace más de 48 horas/i)).toBeDefined();
    });

    await usuario.click(
      screen.getByRole('button', { name: 'Cerrar aviso de enlaces sin responder' })
    );
    expect(screen.queryByText(/sin respuesta desde hace más de 48 horas/i)).toBeNull();
  });
});
