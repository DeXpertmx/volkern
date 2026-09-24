// @vitest-environment jsdom
//
// Guardia de la PÁGINA pública de reserva (FASE 3.D): renderiza la página real
// con la forma exacta de la respuesta de la API pública y completa el flujo
// hasta la confirmación.
//
// Nace del ensayo E2E del 2026-09-17: la guardia anterior miraba el código
// fuente (patrones de texto) y no veía que la cotización identifica la unidad
// con `unitId` mientras la página la buscaba por `id`. Resultado real en el
// navegador: todas las unidades aparecían «Elegida», el formulario de huésped
// no salía y el POST viajaba sin unidad. Un test de render lo detecta; grepear
// el fuente, no.

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import BookingPublico from '@/app/booking/[slug]/page';

const SLUG = 'prop_e2e';

beforeAll(() => {
  if (!global.PointerEvent) {
    (global as unknown as { PointerEvent: unknown }).PointerEvent = class PointerEvent extends Event {
      button = 0;
      pointerType = 'mouse';
      isPrimary = true;
      hasPointerCapture() {
        return false;
      }
      releasePointerCapture() {}
      constructor(type: string, init?: EventInit) {
        super(type, init);
      }
    };
  }
});

/** Respuesta de la API pública con la forma REAL (unitId, no id). */
const COTIZACION = {
  propiedad: { id: SLUG, nombre: 'Hotel Volcán', ciudad: 'San Cristóbal', moneda: 'MXN' },
  cotizacion: {
    checkIn: '2026-09-19',
    checkOut: '2026-09-21',
    noches: 2,
    moneda: 'MXN',
    disponible: true,
    unidades: [
      {
        unitId: 'unit_ocupada',
        nombre: 'Suite Volcán',
        tipo: 'apartamento',
        capacidad: 2,
        descripcion: null,
        fotos: [],
        amenidades: [],
        tarifaNoche: 1500,
        moneda: 'MXN',
        disponible: false,
        motivo: 'ocupada',
        noches: 2,
        precioTotal: null,
      },
      {
        unitId: 'unit_libre',
        nombre: 'Loft Bosque',
        tipo: 'apartamento',
        capacidad: 3,
        descripcion: null,
        fotos: [],
        amenidades: [],
        tarifaNoche: 1200,
        moneda: 'MXN',
        disponible: true,
        noches: 2,
        precioTotal: 2400,
      },
    ],
  },
};

const CATALOGO = {
  propiedad: {
    id: SLUG,
    nombre: 'Hotel Volcán',
    descripcion: 'Cabañas en el bosque',
    ciudad: 'San Cristóbal',
    fotos: [],
    moneda: 'MXN',
  },
  unidades: [
    { id: 'unit_ocupada', nombre: 'Suite Volcán', tipo: 'apartamento', capacidad: 2, descripcion: null, fotos: [], amenidades: [], tarifaNoche: 1500, moneda: 'MXN' },
    { id: 'unit_libre', nombre: 'Loft Bosque', tipo: 'apartamento', capacidad: 3, descripcion: null, fotos: [], amenidades: [], tarifaNoche: 1200, moneda: 'MXN' },
  ],
};

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

beforeEach(() => {
  llamadas = [];
  window.history.pushState({}, '', `/booking/${SLUG}`);
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entrada);
      const metodo = init?.method || 'GET';
      llamadas.push({
        url,
        metodo,
        cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
      });

      if (metodo === 'POST') {
        return json(
          {
            reservationId: 'res_e2e',
            referencia: 'BE-PAGINA-E2E',
            total: 2400,
            moneda: 'MXN',
            paymentUrl: null,
          },
          201
        );
      }
      if (url.includes('checkIn=')) return json(COTIZACION);
      return json(CATALOGO);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Página pública de reserva', () => {
  async function cotizarYVerUnidades() {
    render(<BookingPublico />);
    // Catálogo cargado.
    await screen.findByText('Hotel Volcán');
    await userEvent.click(screen.getByRole('button', { name: /Ver disponibilidad/ }));
    await screen.findByText(/2 noches/);
  }

  it('identifica cada unidad con su id: la disponible se puede ELEGIR', async () => {
    await cotizarYVerUnidades();

    // La unidad libre ofrece elegirse (con el bug del id indefinido, todas
    // aparecían ya "Elegida" y no había forma de seleccionar ninguna).
    expect(screen.getByRole('button', { name: 'Elegir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Elegida' })).toBeNull();

    // La ocupada no se ofrece, con su motivo legible.
    expect(screen.getByText('No disponible en esas fechas')).toBeTruthy();
  });

  it('muestra el total y la tarifa por noche de la unidad', async () => {
    await cotizarYVerUnidades();

    expect(screen.getByText(/2,400\.00/)).toBeTruthy();
    expect(screen.getByText(/1,200\.00\/noche/)).toBeTruthy();
  });

  it('al elegir la unidad pide los datos del huésped y reserva con ESA unidad', async () => {
    await cotizarYVerUnidades();

    await userEvent.click(screen.getByRole('button', { name: 'Elegir' }));

    // Paso 3: datos del huésped.
    const nombre = await screen.findByLabelText(/Nombre completo/);
    await userEvent.type(nombre, 'Ana García');
    await userEvent.type(screen.getByLabelText(/Email/), 'ana@mail.com');

    await userEvent.click(screen.getByRole('button', { name: /Confirmar reserva/ }));

    // El POST lleva el id REAL de la unidad elegida, no undefined.
    await waitFor(() => {
      const post = llamadas.find((l) => l.metodo === 'POST');
      expect(post).toBeTruthy();
    });
    const post = llamadas.find((l) => l.metodo === 'POST')!;
    expect(post.url).toContain(`/api/public/booking/${SLUG}`);
    expect(post.cuerpo?.unitId).toBe('unit_libre');
    expect(post.cuerpo?.huespedNombre).toBe('Ana García');
    expect(typeof post.cuerpo?.idempotencyKey).toBe('string');

    // Confirmación con la referencia del servidor.
    expect(await screen.findByText('¡Reserva confirmada!')).toBeTruthy();
    expect(screen.getByText('BE-PAGINA-E2E')).toBeTruthy();
  });
});

/** La misma respuesta, con la estancia dentro de temporada. */
const COTIZACION_TEMPORADA = {
  propiedad: { id: SLUG, nombre: 'Hotel Volcán', ciudad: 'San Cristóbal', moneda: 'MXN' },
  cotizacion: {
    checkIn: '2026-09-19',
    checkOut: '2026-09-22',
    noches: 3,
    moneda: 'MXN',
    disponible: true,
    unidades: [
      {
        unitId: 'unit_libre',
        nombre: 'Loft Bosque',
        tipo: 'apartamento',
        capacidad: 3,
        descripcion: null,
        fotos: [],
        amenidades: [],
        // La tarifa del plan (la media) y el detalle noche a noche que la
        // sustituye en la pantalla.
        tarifaNoche: 1200,
        moneda: 'MXN',
        disponible: true,
        noches: 3,
        precioTotal: 4200,
        desgloseNoches: [
          { fecha: '2026-09-19', tarifa: 1200 },
          { fecha: '2026-09-20', tarifa: 1500 },
          { fecha: '2026-09-21', tarifa: 1500 },
        ],
      },
    ],
  },
};

describe('Página pública de reserva — estancia en temporada', () => {
  it('enseña el precio de CADA noche y no la media del rango', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.includes('checkIn=')) return json(COTIZACION_TEMPORADA);
        return json(CATALOGO);
      })
    );

    render(<BookingPublico />);
    await screen.findByText('Hotel Volcán');
    await userEvent.click(screen.getByRole('button', { name: /Ver disponibilidad/ }));

    // El desglose noche a noche, con la fecha de cada noche.
    expect(await screen.findByText('Precio por noche')).toBeTruthy();
    expect(screen.getAllByText(/septiembre/)).toHaveLength(3);
    expect(screen.getByText(/1,200\.00/)).toBeTruthy();
    expect(screen.getAllByText(/1,500\.00/)).toHaveLength(2);

    // El total sigue siendo el del servidor…
    expect(screen.getByText(/4,200\.00/)).toBeTruthy();
    // …y la media por noche no se enseña: no es el precio de ninguna noche.
    expect(screen.queryByText(/\/noche/)).toBeNull();
  });
});
