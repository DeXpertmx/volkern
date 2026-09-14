// @vitest-environment jsdom

/**
 * Guardia de interfaz del certificado de la entidad.
 *
 * Lo que se comprueba es que el administrador pueda instalarlo desde donde tiene
 * que poder (la configuración del registro de viajeros), que vea de quién es el que
 * está puesto y que se le avise antes de que caduque. El envío del fichero se prueba
 * de verdad: se sube un fichero y se mira qué viaja al guardar.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Polyfill PointerEvent para Radix UI + jsdom (mismo patrón que el resto de la suite).
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

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import BandejaPage from '@/app/dashboard/hospitality/viajeros/page';

const DIA = 24 * 60 * 60 * 1000;

function configuracion(extra: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    activo: true,
    entorno: 'pruebas',
    entidadNombre: 'ENTIDAD DE PRUEBA SL',
    entidadNif: 'B12345678',
    codigoArrendador: '0000000141',
    tieneUsuario: true,
    tienePassword: true,
    tieneCertificado: false,
    tieneCertificadoPassword: false,
    certificado: null,
    estadoConexion: 'configurada',
    ultimoEnvio: null,
    ultimoCodigo: null,
    ultimoError: null,
    ...extra,
  };
}

/** Lo que responde la API de la bandeja en el montaje de la página. */
function mockApi(opciones: { configuracion?: unknown; respuestaPut?: unknown } = {}) {
  const envios: Array<{ url: string; method: string; cuerpo: any }> = [];

  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    if (String(url).includes('/api/hospitality/compliance')) {
      envios.push({
        url: String(url),
        method: metodo,
        cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (metodo === 'PUT') {
        return Promise.resolve({
          ok: opciones.respuestaPut ? true : true,
          status: 200,
          json: () =>
            Promise.resolve(
              opciones.respuestaPut ?? { ok: true, configuracion: configuracion() }
            ),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            filas: [],
            total: 0,
            conteo: {},
            porcentajeEnviado: 0,
            estados: [],
            configuracion: opciones.configuracion ?? configuracion(),
            esquemaDisponible: true,
            entornos: ['pruebas', 'produccion'],
            endpoints: {},
          }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  return envios;
}

/** Abre el diálogo de configuración, que es donde vive el certificado. */
async function abrirConfiguracion() {
  const usuario = userEvent.setup();
  render(<BandejaPage />);
  await waitFor(() => expect(screen.getByText(/registro de viajeros/i)).toBeDefined());
  await usuario.click(screen.getByRole('button', { name: /configuración/i }));
  await waitFor(() =>
    expect(screen.getByText(/certificado digital de la entidad/i)).toBeDefined()
  );
  return usuario;
}

beforeEach(() => {
  mockFetch.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('el certificado se instala desde la configuración del registro de viajeros', () => {
  it('sin certificado ofrece subir el fichero y su contraseña', async () => {
    mockApi();
    await abrirConfiguracion();

    const fichero = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fichero).toBeTruthy();
    expect(fichero.accept).toContain('.p12');
    expect(screen.getByText(/elegir el fichero/i)).toBeDefined();
    expect(screen.getByText(/contraseña del certificado/i)).toBeDefined();
  });

  it('con el certificado instalado enseña de quién es y hasta cuándo vale', async () => {
    mockApi({
      configuracion: configuracion({
        tieneCertificado: true,
        tieneCertificadoPassword: true,
        certificado: {
          titular: 'MARIA GARCIA LOPEZ',
          nif: 'B12345678',
          emisor: 'AC COMPONENTES INFORMATICOS',
          huella: 'AA:BB:CC',
          vence: new Date(Date.now() + 300 * DIA).toISOString(),
          caducado: false,
        },
      }),
    });
    await abrirConfiguracion();

    expect(screen.getByText(/MARIA GARCIA LOPEZ · B12345678/)).toBeDefined();
    expect(screen.getByText(/vigente hasta el/i)).toBeDefined();
    expect(screen.queryByText(/caduca en/i)).toBeNull();
  });

  it('avisa cuando al certificado le quedan pocos días', async () => {
    mockApi({
      configuracion: configuracion({
        tieneCertificado: true,
        tieneCertificadoPassword: true,
        certificado: {
          titular: 'MARIA GARCIA LOPEZ',
          nif: 'B12345678',
          emisor: 'AC COMPONENTES INFORMATICOS',
          huella: 'AA:BB:CC',
          vence: new Date(Date.now() + 30 * DIA).toISOString(),
          caducado: false,
        },
      }),
    });
    await abrirConfiguracion();

    expect(screen.getByText(/caduca en 30 días/i)).toBeDefined();
  });

  it('con el certificado caducado lo dice y pide el renovado', async () => {
    mockApi({
      configuracion: configuracion({
        tieneCertificado: true,
        tieneCertificadoPassword: true,
        certificado: {
          titular: 'MARIA GARCIA LOPEZ',
          nif: 'B12345678',
          emisor: 'AC COMPONENTES INFORMATICOS',
          huella: 'AA:BB:CC',
          vence: new Date(Date.now() - 10 * DIA).toISOString(),
          caducado: true,
        },
      }),
    });
    await abrirConfiguracion();

    expect(screen.getByText(/caducó el/i)).toBeDefined();
    expect(screen.getByText(/instala el certificado renovado/i)).toBeDefined();
  });

  it('el fichero sube en Base64, sin el prefijo de datos y sin espacios', async () => {
    const envios = mockApi();
    const usuario = await abrirConfiguracion();

    const contenido = 'contenido-de-prueba-del-p12';
    const fichero = new File([contenido], 'entidad.p12', { type: 'application/x-pkcs12' });
    await usuario.upload(document.querySelector('input[type="file"]') as HTMLInputElement, fichero);

    await waitFor(() => expect(screen.getByText(/entidad\.p12/)).toBeDefined());
    await usuario.type(screen.getByLabelText(/contraseña del certificado/i), 'clave-de-la-entidad');
    await usuario.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() => expect(envios.some((e) => e.method === 'PUT')).toBe(true));
    const put = envios.find((e) => e.method === 'PUT')!;
    expect(put.cuerpo.certificado).toBe(Buffer.from(contenido).toString('base64'));
    expect(put.cuerpo.certificado).not.toContain('data:');
    expect(put.cuerpo.certificadoPassword).toBe('clave-de-la-entidad');
  });

  it('si el certificado no abre con su contraseña, la causa se enseña tal cual', async () => {
    mockApi();
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/api/hospitality/compliance')) {
        const metodo = init?.method ?? 'GET';
        if (metodo === 'PUT') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () =>
              Promise.resolve({
                error: 'La contraseña del certificado no es correcta (o el fichero no es un .p12/.pfx de la entidad)',
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              filas: [],
              total: 0,
              conteo: {},
              porcentajeEnviado: 0,
              estados: [],
              configuracion: configuracion(),
              esquemaDisponible: true,
              entornos: ['pruebas', 'produccion'],
              endpoints: {},
            }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    const usuario = await abrirConfiguracion();
    const fichero = new File(['p12'], 'entidad.p12', { type: 'application/x-pkcs12' });
    await usuario.upload(document.querySelector('input[type="file"]') as HTMLInputElement, fichero);
    await usuario.type(screen.getByLabelText(/contraseña del certificado/i), 'mala');
    await usuario.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/contraseña del certificado no es correcta/i);
  });

  it('rechaza un fichero que no es un .p12 antes de intentar subirlo', async () => {
    const envios = mockApi();
    await abrirConfiguracion();

    // Se dispara el cambio a mano: el selector ya filtra por extensión, y este
    // segundo guardia existe para que un fichero equivocado no llegue al servidor
    // aunque alguien quite ese filtro.
    const fichero = new File(['no soy un certificado'], 'certificado.crt', { type: 'text/plain' });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [fichero] },
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/\.p12 o \.pfx/i);
    expect(envios.some((e) => e.method === 'PUT')).toBe(false);
  });
});
