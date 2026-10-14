// @vitest-environment jsdom
//
// El enlace ANTIGUO de reserva (`/booking/<id de propiedad>`) ya no es una
// página: desde que hay una sola página pública (`/reservar/<slug>`) es una
// redirección. Lo que se fija aquí:
//
//  - Redirige SIEMPRE que la propiedad esté publicada, con un 308 (permanente:
//    los enlaces que los hoteles ya repartieron y el buscador se quedan con la
//    dirección nueva).
//  - El criterio de publicación es el MISMO que el de la página única (la lista
//    que el hotel marca en su configuración), no el estado de la propiedad: una
//    propiedad retirada desde el panel ya no se puede reservar por el enlace
//    viejo.
//  - `?embed=1` sigue llevando al widget embebible y `?lang` conserva el idioma.
//  - Si no está publicada, la respuesta es la misma frase de «no disponible»
//    que da la página única (el enlace viejo no sirve nada distinto).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';

const prisma = vi.hoisted(() => ({
  hospitalityProperty: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));

import BookingLegacyPage from '@/app/booking/[slug]/page';

const SLUG = 'prop_a';

/** Configuración guardada del hotel: su página única y lo que publica. */
function conConfig(config: { slug: string; activo: boolean; propiedadesPublicadas: string[] } | null) {
  prisma.hospitalityProperty.findFirst.mockResolvedValue(
    config ? { id: SLUG, tenant: { hospitalityBookingConfig: config } } : null
  );
}

/** Llama a la página y devuelve la URL del `redirect` (o null si no redirige). */
async function destino(
  busqueda: Record<string, string> = {}
): Promise<string | null> {
  try {
    await BookingLegacyPage({
      params: Promise.resolve({ slug: SLUG }),
      searchParams: Promise.resolve(busqueda),
    });
    return null;
  } catch (error) {
    const digest = String((error as { digest?: string })?.digest || '');
    return digest || null;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  conConfig({ slug: 'mi-hotel', activo: true, propiedadesPublicadas: [SLUG] });
});

describe('enlace antiguo de reserva → página única', () => {
  it('una propiedad publicada redirige con 308 a /reservar/<slug>', async () => {
    const url = await destino();
    expect(url).toContain('NEXT_REDIRECT');
    expect(url).toContain('/reservar/mi-hotel');
    expect(url).toContain('308');
  });

  it('conserva el idioma pedido y lleva el embed a su propia ruta', async () => {
    expect(await destino({ lang: 'en' })).toContain('/reservar/mi-hotel?lang=en');
    expect(await destino({ embed: '1' })).toContain('/embed/reservar/mi-hotel');
  });

  it('una propiedad NO publicada no redirige: da la misma frase que la página única', async () => {
    // El hotel la retiró de la lista (o desactivó su página): el enlace viejo no
    // puede seguir vendiéndola. Es el criterio único de publicación.
    conConfig({ slug: 'mi-hotel', activo: true, propiedadesPublicadas: [] });
    expect(await destino()).toBeNull();
    render(
      (await BookingLegacyPage({
        params: Promise.resolve({ slug: SLUG }),
        searchParams: Promise.resolve({}),
      })) as ReactElement
    );
    expect(screen.getByText('Esta página de reservas no existe.')).toBeTruthy();
    cleanup();
  });

  it('sin configuración (o con la página desactivada) tampoco hay página', async () => {
    conConfig(null);
    expect(await destino()).toBeNull();

    conConfig({ slug: 'mi-hotel', activo: false, propiedadesPublicadas: [SLUG] });
    expect(await destino()).toBeNull();
  });
});
