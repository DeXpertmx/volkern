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
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
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

  it('el registro abre en modal al Elegir y se cierra sin reservar', async () => {
    await cotizarYVerUnidades();

    // Sin elegir, no hay diálogo.
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Elegir' }));

    // El modal se abre con el título interpolado («Tus datos · Ámbar») y el
    // formulario dentro.
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/Tus datos ·/)).toBeTruthy();
    expect(within(dialogo).getByLabelText(/Nombre completo/)).toBeTruthy();

    // «Elegir» (elegir otra unidad) cierra el modal sin crear reserva: ningún POST.
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Elegir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(0);
  });

  it('muestra el total y la tarifa por noche de la unidad', async () => {
    await cotizarYVerUnidades();

    expect(screen.getByText(/2,400\.00/)).toBeTruthy();
    expect(screen.getByText(/1,200\.00\/noche/)).toBeTruthy();
  });

  it('al elegir la unidad pide los datos del huésped en el MODAL y reserva con ESA unidad', async () => {
    await cotizarYVerUnidades();

    await userEvent.click(screen.getByRole('button', { name: 'Elegir' }));

    // Paso 3: ahora vive en un modal — los dos formularios (modal y respaldo en
    // flujo) están montados, así que se consulta el que está DENTRO del diálogo.
    const dialogo = await screen.findByRole('dialog');
    const nombre = await within(dialogo).findByLabelText(/Nombre completo/);
    await userEvent.type(nombre, 'Ana García');
    await userEvent.type(within(dialogo).getByLabelText(/Email/), 'ana@mail.com');

    await userEvent.click(within(dialogo).getByRole('button', { name: /Confirmar reserva/ }));

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

//
// Ficha pública de la propiedad (fotos y datos).
//
// Qué vigila: que la página ENSEÑE lo que la API pública ya devuelve. El defecto
// real era el contrario: la API mandaba fotos, ubicación y servicios desde el
// primer día y la página no pintaba ninguno — el cliente veía un formulario y
// ningún alojamiento. Con fotos de por medio, además, la ausencia de foto no
// puede acabar en una imagen rota: se enseña el marco de relleno.
//
const FICHA = {
  id: SLUG,
  nombre: 'Villa Mar Azul',
  descripcion: 'Villa frente al mar con piscina privada',
  ciudad: 'Playa del Carmen',
  estadoProvincia: 'Quintana Roo',
  pais: 'México',
  direccion: 'Calle 10 Norte',
  latitud: 20.6,
  longitud: -87.07,
  fotos: ['https://cdn.test/portada.jpg', 'https://cdn.test/salon.jpg', 'https://cdn.test/piscina.jpg'],
  moneda: 'MXN',
};

const CATALOGO_CON_FICHA = {
  propiedad: FICHA,
  unidades: [
    {
      id: 'u1',
      nombre: 'Loft Marina',
      tipo: 'loft',
      capacidad: 3,
      descripcion: 'Loft con vistas al mar',
      // Foto propia: la tarjeta no usa la de la propiedad.
      fotos: ['https://cdn.test/loft.jpg'],
      amenidades: ['WiFi', 'Piscina'],
      tarifaNoche: 1200,
      moneda: 'MXN',
    },
    {
      id: 'u2',
      nombre: 'Suite Oceano',
      tipo: 'suite',
      capacidad: 4,
      descripcion: null,
      // Sin foto propia: cae a la galería de la propiedad.
      fotos: [],
      amenidades: ['Estacionamiento'],
      tarifaNoche: 1800,
      moneda: 'MXN',
    },
  ],
  resenas: null,
  extras: [],
};

describe('Página pública de reserva — ficha de la propiedad', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => json(CATALOGO_CON_FICHA)));
  });

  it('enseña la galería, la ubicación, la capacidad y los servicios publicados', async () => {
    render(<BookingPublico />);
    await screen.findByText('Villa Mar Azul');

    // La portada es la primera foto publicada.
    expect(screen.getByAltText('Villa Mar Azul')).toBeTruthy();
    expect(screen.getByText('Playa del Carmen · Quintana Roo · México')).toBeTruthy();
    expect(screen.getByText('Hasta 4 personas')).toBeTruthy();
    expect(screen.getByText('2 unidades')).toBeTruthy();
    expect(screen.getByText('Villa frente al mar con piscina privada')).toBeTruthy();
    expect(screen.getByText('Servicios del alojamiento')).toBeTruthy();

    // Servicios de la ficha: los de las unidades, sin repetir. Cada uno sale
    // además en la tarjeta de la unidad que lo tiene, de ahí los dos matches.
    expect(screen.getAllByText('WiFi')).toHaveLength(2); // ficha + Loft Marina
    expect(screen.getAllByText('Piscina')).toHaveLength(2); // ficha + Loft Marina
    expect(screen.getAllByText('Estacionamiento')).toHaveLength(2); // ficha + Suite Oceano

    // Coordenadas publicadas: el enlace al mapa las usa antes que la dirección.
    const mapa = screen.getByRole('link', { name: /Ver en el mapa/ });
    expect(mapa.getAttribute('href')).toContain('20.6,-87.07');
  });

  it('cada alojamiento publicado se ve con su foto, su capacidad y el precio desde', async () => {
    render(<BookingPublico />);
    await screen.findByText('Alojamientos disponibles');

    // La unidad con foto propia la usa; la que no la tiene cae a la de la propiedad.
    expect(screen.getByAltText('Loft Marina').getAttribute('src')).toBe('https://cdn.test/loft.jpg');
    expect(screen.getByAltText('Suite Oceano').getAttribute('src')).toBe('https://cdn.test/portada.jpg');

    expect(screen.getByText('Loft con vistas al mar')).toBeTruthy();
    expect(screen.getAllByText('desde')).toHaveLength(2);
    expect(screen.getByText(/1,200\.00/)).toBeTruthy();
    expect(screen.getByText(/1,800\.00/)).toBeTruthy();
  });

  it('sin fotos publicadas enseña el marco de relleno, no una imagen rota', async () => {
    // El mismo caso con una propiedad SIN fotos publicadas.
    vi.stubGlobal('fetch', vi.fn(() => json(CATALOGO)));
    render(<BookingPublico />);
    await screen.findByText('Hotel Volcán');

    expect(screen.getByRole('img', { name: 'La propiedad aún no ha publicado fotos' })).toBeTruthy();
    expect(screen.queryByAltText('Hotel Volcán')).toBeNull();
  });

  it('la cotización no recorta la ficha: la galería y la ubicación siguen en pantalla', async () => {
    const conFicha = {
      propiedad: FICHA,
      cotizacion: {
        ...COTIZACION.cotizacion,
        unidades: [
          {
            ...COTIZACION.cotizacion.unidades[1],
            fotos: ['https://cdn.test/loft.jpg'],
            amenidades: ['WiFi'],
          },
        ],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((entrada: RequestInfo | URL) => {
        const url = String(entrada);
        return url.includes('checkIn=') ? json(conFicha) : json(CATALOGO_CON_FICHA);
      })
    );

    render(<BookingPublico />);
    await screen.findByText('Villa Mar Azul');
    await userEvent.click(screen.getByRole('button', { name: /Ver disponibilidad/ }));

    expect(await screen.findByText(/2 noches/)).toBeTruthy();
    expect(screen.getByAltText('Villa Mar Azul')).toBeTruthy();
    expect(screen.getByText('Playa del Carmen · Quintana Roo · México')).toBeTruthy();
    expect(screen.getByAltText('Loft Bosque')).toBeTruthy();
  });
});

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
