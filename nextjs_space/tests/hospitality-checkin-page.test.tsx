// @vitest-environment jsdom
//
// Guardia de render de la PÁGINA pública de check-in online: monta la página
// real con la forma exacta de la respuesta de su API y recorre el flujo del
// huésped (prerelleno → completar los documentos → guardar).
//
// Es un test de render y no de fuente a propósito: lo que hay que garantizar es
// que el huésped puede DE VERDAD completar los datos desde el móvil y que lo que
// viaja al servidor es la lista de viajeros en el orden que la pantalla muestra
// (el primero es el titular: el registro de viajeros le asigna el rol por
// posición). Grepear el código no ve un formulario que no se puede rellenar.

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Polyfills jsdom para Radix/cmdk (el combobox de país usa cmdk, que mide con
// ResizeObserver y hace scrollIntoView; jsdom no los trae — mismo apaño que el
// resto de suites UI).
beforeAll(() => {
  if (!global.ResizeObserver) {
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
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
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import CheckinPublico from '@/app/checkin/[token]/page';

const TOKEN = 'TOKEN-CHECKIN';

interface LlamadaFetch {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

let llamadas: LlamadaFetch[] = [];

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Respuesta REAL del GET: titular prerrellenado y lista de lo que falta. */
const GET_RESPUESTA = {
  referencia: 'BE-77',
  estado: 'confirmed',
  checkIn: '2026-09-20T15:00:00.000Z',
  checkOut: '2026-09-23T12:00:00.000Z',
  propiedad: 'Hotel Volcán',
  ciudad: 'San Cristóbal',
  unidad: 'Loft Bosque',
  viajeros: [{ nombre: 'Ana', apellido1: 'García', correo: 'ana@mail.com', telefono: '666666666' }],
  documentacion: {
    total: 1,
    completos: 0,
    faltan: ['tipoDocumento', 'numeroDocumento', 'fechaNacimiento', 'direccion.calle'],
    recomendados: ['nacionalidad', 'sexo'],
    completa: false,
  },
};

beforeEach(() => {
  llamadas = [];
  window.history.pushState({}, '', `/checkin/${TOKEN}`);
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entrada);
      const metodo = init?.method || 'GET';
      llamadas.push({ url, metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : null });

      if (metodo === 'POST') {
        return json({
          ok: true,
          viajeros: 2,
          descartados: 0,
          documentacion: { total: 2, completos: 2, faltan: [], recomendados: [], completa: true },
          envio: { enviado: false, motivo: 'servicio_no_iniciado' },
        });
      }
      return json(GET_RESPUESTA);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Página pública de check-in', () => {
  it('carga la estancia, prerrellena al titular y enseña qué falta', async () => {
    render(<CheckinPublico />);

    expect(await screen.findByText('Hotel Volcán')).toBeTruthy();
    expect(screen.getByText(/BE-77/)).toBeTruthy();
    // La lista de lo que hay que revisar está a la vista desde el primer segundo.
    expect(screen.getByText(/Aún hay que revisar/)).toBeTruthy();
    // «Tipo de documento» aparece en la lista de pendientes Y como etiqueta del
    // campo: las dos cosas son necesarias.
    expect(screen.getAllByText(/Tipo de documento/).length).toBeGreaterThan(1);

    // Y el titular llega prerrellenado: el huésped no reescribe su nombre.
    const nombre = screen.getAllByLabelText(/^Nombre/) [0] as HTMLInputElement;
    expect(nombre.value).toBe('Ana');
  });

  it('el huésped completa los documentos y se guardan como lista de viajeros', async () => {
    render(<CheckinPublico />);
    await screen.findByText('Hotel Volcán');

    // El primer apellido ya venía prerrellenado del titular.
    expect((screen.getAllByLabelText(/^Primer apellido/)[0] as HTMLInputElement).value).toBe('García');
    await userEvent.type(screen.getAllByLabelText(/^Tipo de documento/)[0], 'NIF');
    await userEvent.type(screen.getAllByLabelText(/^Número de documento/)[0], '00000000T');
    await userEvent.type(screen.getAllByLabelText(/^Número de soporte/)[0], '999999999');
    await userEvent.type(screen.getAllByLabelText(/^Segundo apellido/)[0], 'López');
    await userEvent.type(screen.getAllByLabelText(/^Fecha de nacimiento/)[0], '1990-01-01');
    await userEvent.type(screen.getAllByLabelText(/^Dirección/)[0], 'C/Mayor 1');
    await userEvent.type(screen.getAllByLabelText(/^Código postal/)[0], '28001');
    // País y municipio van con selectores de catálogo (ya no hay input libre):
    // abrir el combobox, elegir España y luego provincia → municipio INE.
    await userEvent.click(screen.getAllByLabelText(/^País/)[0]);
    await userEvent.click(await screen.findByText('España'));
    await userEvent.selectOptions(await screen.findByLabelText('Provincia'), '28');
    await userEvent.selectOptions(await screen.findByLabelText('Municipio (código INE)'), '28079');

    // Un acompañante más: la ficha vacía no viaja como persona si no se rellena.
    await userEvent.click(screen.getByRole('button', { name: /Añadir acompañante/ }));
    expect(screen.getByText(/Acompañante 1/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Guardar y enviar/ }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true);
    });

    const post = llamadas.find((l) => l.metodo === 'POST')!;
    expect(post.url).toContain(`/api/public/checkin/${TOKEN}`);
    const viajeros = post.cuerpo?.viajeros as Array<Record<string, unknown>>;
    expect(viajeros).toHaveLength(2);
    // El titular va primero (rol por posición) con lo que escribió el huésped.
    expect(viajeros[0]).toMatchObject({ nombre: 'Ana', apellido1: 'García', tipoDocumento: 'NIF' });
    expect((viajeros[0].direccion as Record<string, string>).codigoPostal).toBe('28001');
    // El consentimiento de la dirección compartida viaja explícito.
    expect(post.cuerpo?.heredarDireccion).toBe(true);
  });

  it('con todo completo confirma al huésped que su grupo está listo', async () => {
    render(<CheckinPublico />);
    await screen.findByText('Hotel Volcán');

    await userEvent.click(screen.getByRole('button', { name: /Guardar y enviar/ }));

    expect(await screen.findByText(/¡Listo! Ya tenemos todos los datos de tu grupo/)).toBeTruthy();
  });

  it('un enlace caducado o inválido lo dice con claridad, sin formulario', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ estado: 'cerrada' }, 410)));
    render(<CheckinPublico />);

    expect(await screen.findByText(/Esta reserva ya no está activa/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Guardar y enviar/ })).toBeNull();
  });
});
