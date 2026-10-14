// @vitest-environment jsdom
//
// La PÁGINA pública de reserva (/reservar/<slug>), renderizada de verdad: lo que
// ve el huésped cuando el hotel abre su enlace.
//
// La página es un componente de servidor: se resuelve el componente (con la
// lectura de datos doblada) y se renderiza el árbol que devuelve. Es el único
// sitio donde se juntan la lista de propiedades publicadas, la plantilla elegida
// y la galería, y hasta ahora nadie lo miraba entero: la portada publicada podía
// no llegar nunca a la pantalla sin que saltara una alerta.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';

const dobles = vi.hoisted(() => ({ datosPaginaPublica: vi.fn() }));

vi.mock('@/lib/hospitality/booking-public', () => ({
  datosPaginaPublica: dobles.datosPaginaPublica,
}));

// El asistente real cotiza contra la API; aquí solo interesa el marco y sus fotos.
vi.mock('@/components/hospitality/booking/BookingWizard', () => ({
  BookingWizard: () => <div>asistente de reserva</div>,
}));

import ReservarPage from '@/app/reservar/[slug]/page';

function pagina(over: { plantilla?: string; fotos?: string[]; unidadesFotos?: string[][] } = {}) {
  const fotos = over.fotos ?? ['https://cdn/fachada.jpg', 'https://cdn/salon.jpg'];
  const unidadesFotos = over.unidadesFotos ?? [[]];
  return {
    ok: true as const,
    datos: {
      slug: 'mi-hotel',
      alojamiento: 'Ciudad Patio Cuarenta',
      moneda: 'MXN',
      config: {
        // Sin título propio, la página se titula con el alojamiento: es lo que
        // acaba en el `alt` de la portada (y lo que lee un lector de pantalla).
        titulo: null,
        descripcion: null,
        emailContacto: null,
        telefonoContacto: null,
        politicaCancelacion: null,
        anticipoPorcentaje: 0,
        tarifaLimpieza: null,
        requierePagoOnline: false,
        pagoOnlineDisponible: false,
      },
      propiedades: [
        {
          id: 'prop_a',
          nombre: 'Ciudad Patio Cuarenta',
          ciudad: 'Madrid',
          direccion: null,
          descripcion: null,
          fotos,
          unidades: unidadesFotos.map((fu, i) => ({
            id: `unit_${i}`,
            propertyId: 'prop_a',
            nombre: `Apartamento ${i + 1}`,
            codigo: null,
            tipo: 'apartamento',
            capacidad: 4,
            descripcion: null,
            tarifaPorNoche: 120,
            tarifaDesde: null,
            fotos: fu,
            amenidades: [],
            detalle: null,
          })),
        },
      ],
      plantilla: over.plantilla ?? 'clasica',
      personalizacion: {
        colorPrimario: '#0f766e',
        colorFondo: '#ffffff',
        colorTexto: '#0f172a',
        radioTarjeta: '0.75rem',
      },
      logo: null,
    },
  };
}

/** Resuelve la página (componente de servidor) y la renderiza. */
async function renderizar(busqueda: Record<string, string> = {}) {
  const jsx = (await ReservarPage({
    params: Promise.resolve({ slug: 'mi-hotel' }),
    searchParams: Promise.resolve(busqueda),
  })) as ReactElement;
  render(jsx);
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.datosPaginaPublica.mockResolvedValue(pagina());
});

afterEach(cleanup);

describe('Página pública de reserva — la portada del hotel', () => {
  it('la plantilla clásica sale con la galería y la portada publicada', async () => {
    await renderizar();

    expect(screen.getByAltText('Ciudad Patio Cuarenta').getAttribute('src')).toBe(
      'https://cdn/fachada.jpg'
    );
    expect(screen.getByText('asistente de reserva')).toBeTruthy();
  });

  it('sin fotos en la ficha usa las de las unidades, y si no hay ninguna, ninguna', async () => {
    dobles.datosPaginaPublica.mockResolvedValue(
      pagina({ fotos: [], unidadesFotos: [['https://cdn/unidad-1.jpg']] })
    );
    await renderizar();
    expect(screen.getByAltText('Ciudad Patio Cuarenta').getAttribute('src')).toBe(
      'https://cdn/unidad-1.jpg'
    );

    cleanup();
    dobles.datosPaginaPublica.mockResolvedValue(pagina({ fotos: [], unidadesFotos: [[]] }));
    await renderizar();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('la plantilla moderna pone la portada de cabecera', async () => {
    dobles.datosPaginaPublica.mockResolvedValue(pagina({ plantilla: 'moderna' }));
    await renderizar();

    expect(screen.getByAltText('Ciudad Patio Cuarenta').getAttribute('src')).toBe(
      'https://cdn/fachada.jpg'
    );
  });

  it('una página no disponible no rompe: enseña el aviso', async () => {
    dobles.datosPaginaPublica.mockResolvedValue({
      ok: false,
      motivo: 'no_existe',
      mensaje: 'Esta página de reservas no existe.',
    });

    await renderizar();

    expect(screen.getByText('Esta página de reservas no existe.')).toBeTruthy();
  });
});
