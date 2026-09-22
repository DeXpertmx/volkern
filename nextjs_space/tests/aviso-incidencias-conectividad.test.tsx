// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import AvisoIncidenciasConectividad from '@/components/hospitality/aviso-incidencias-conectividad';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

function incidencia(overrides: Record<string, unknown> = {}) {
  return {
    hotelCode: 'sandbox-pms',
    propertyId: 'p1',
    property: 'Villa Mar Azul',
    roomCode: 'Penthouse',
    rateplanCode: 'penthouse-ep',
    tipo: 'roomcode_sin_mapping',
    intentos: 2,
    ultimaFecha: new Date(Date.now() - 60_000).toISOString(),
    vinculo: null,
    ...overrides,
  };
}

function respuesta(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => respuesta({ incidencias: [], resumen: { pendientes: 0, vinculadas: 0, resueltas: 0, eventosAnalizados: 0 } }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AvisoIncidenciasConectividad', () => {
  it('no pinta nada cuando no hay incidencias', async () => {
    const { container } = render(<AvisoIncidenciasConectividad />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/hospitality/incidencias'));
    expect(container.innerHTML).toBe('');
  });

  it('avisa de las reservas sin vínculo y enlaza a la propiedad', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respuesta({
          incidencias: [incidencia(), incidencia({ roomCode: 'cabanas', rateplanCode: null })],
          resumen: { pendientes: 2, vinculadas: 0, resueltas: 0, eventosAnalizados: 3 },
        })
      )
    );

    render(<AvisoIncidenciasConectividad />);

    expect(
      await screen.findByText('2 habitación(es) con reservas sin registrar por falta de vínculo')
    ).toBeTruthy();
    expect(screen.getByText(/Penthouse · Villa Mar Azul · habitación sin vincular/)).toBeTruthy();

    const enlace = screen.getByRole('link', { name: /Revisar en Puesta en marcha/ });
    expect(enlace.getAttribute('href')).toBe('/dashboard/hospitality/onboarding?propertyId=p1');
  });

  it('distingue las que solo hay que reenviar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respuesta({
          incidencias: [incidencia({ vinculo: { unitId: 'u1', unit: 'Suite Oceano', externalUnitCode: 'suite' } })],
          resumen: { pendientes: 0, vinculadas: 1, resueltas: 0, eventosAnalizados: 1 },
        })
      )
    );

    render(<AvisoIncidenciasConectividad />);

    expect(
      await screen.findByText('1 habitación(es) con reservas pendientes de reenviar')
    ).toBeTruthy();
    expect(screen.getByText(/Penthouse · Villa Mar Azul · lista para reenviar/)).toBeTruthy();
  });

  it('sin propiedad única enlaza al listado de Puesta en marcha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respuesta({
          incidencias: [
            incidencia(),
            incidencia({ propertyId: 'p2', property: 'Casa Centro', roomCode: 'cabanas' }),
          ],
          resumen: { pendientes: 2, vinculadas: 0, resueltas: 0, eventosAnalizados: 2 },
        })
      )
    );

    render(<AvisoIncidenciasConectividad />);

    const enlace = await screen.findByRole('link', { name: /Revisar en Puesta en marcha/ });
    expect(enlace.getAttribute('href')).toBe('/dashboard/hospitality/onboarding');
  });

  it('resume el resto cuando hay más de tres incidencias', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        respuesta({
          incidencias: [
            incidencia({ roomCode: 'a' }),
            incidencia({ roomCode: 'b' }),
            incidencia({ roomCode: 'c' }),
            incidencia({ roomCode: 'd' }),
            incidencia({ roomCode: 'e' }),
          ],
          resumen: { pendientes: 5, vinculadas: 0, resueltas: 0, eventosAnalizados: 5 },
        })
      )
    );

    render(<AvisoIncidenciasConectividad />);

    expect(await screen.findByText('y 2 más')).toBeTruthy();
  });

  it('si la consulta falla no rompe la página', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respuesta({ error: 'boom' }, false)));
    const { container } = render(<AvisoIncidenciasConectividad />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
