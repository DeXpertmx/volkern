// @vitest-environment jsdom
//
// Listado de puestas en marcha de Hospitality (panel de plataforma).
//
// La tabla es lo que el operador mira para saber a quién empujar: se prueba que
// lee del servidor, que arranca en «pendientes» (que es la pregunta), que enseña
// lo que falta en palabras y que marca la avería del módulo apagado.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

import { PuestasEnMarchaHospitality } from '@/components/admin/PuestasEnMarchaHospitality';
import AdminHospitality from '@/app/admin/hospitality/page';

const fetchMock = vi.fn();

const URL_LISTADO = '/api/admin/hospitality/puesta-en-marcha';

function fila(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant_a',
    tenant: 'Hotel Volcán',
    plan: 'profesional',
    desde: '2026-01-01T00:00:00.000Z',
    moduloApagado: false,
    roles: { catalogo: 5, alDia: 1, pendientes: ['Agente', 'Limpieza'] },
    propiedades: { total: 1, unidades: 3, primera: { id: 'p1', nombre: 'Loft' } },
    enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=p1',
    faltantes: ['4 de 5 roles por preparar: Agente, Limpieza'],
    listo: false,
    ...overrides,
  };
}

function listado(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    generadoEn: new Date().toISOString(),
    totales: { tenants: 1, pendientes: 1, listos: 0, apagados: 0 },
    truncado: false,
    tenants: [fila()],
    ...overrides,
  };
}

function respuesta(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Puestas en marcha de Hospitality (panel)', () => {
  it('consulta el listado y enseña lo que falta, con el enlace del wizard', async () => {
    fetchMock.mockResolvedValue(respuesta(listado()));

    render(<PuestasEnMarchaHospitality />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(URL_LISTADO);

    expect(await screen.findByText('Hotel Volcán')).toBeTruthy();
    expect(screen.getByText('1 cliente con Hospitality')).toBeTruthy();
    expect(screen.getByText(/1 con la puesta en marcha a medias/)).toBeTruthy();
    expect(screen.getByText('4 de 5 roles por preparar: Agente, Limpieza')).toBeTruthy();
    expect(screen.getByText('Agente, Limpieza')).toBeTruthy();

    const enlace = screen.getByRole('link', { name: /wizard/i });
    expect(enlace.getAttribute('href')).toBe(
      '/dashboard/hospitality/onboarding?propertyId=p1'
    );
    // Y el atajo a la ficha del cliente, donde está el paso de alta.
    const ficha = screen.getByRole('link', { name: 'Hotel Volcán' });
    expect(ficha.getAttribute('href')).toBe('/admin/saas/tenants/tenant_a');
  });

  it('arranca en «pendientes» y el botón «Todos» enseña a los que ya están listos', async () => {
    fetchMock.mockResolvedValue(
      respuesta(
        listado({
          totales: { tenants: 2, pendientes: 1, listos: 1, apagados: 0 },
          tenants: [
            fila(),
            fila({
              tenantId: 'tenant_b',
              tenant: 'Casa del Mar',
              roles: { catalogo: 5, alDia: 5, pendientes: [] },
              faltantes: [],
              listo: true,
            }),
          ],
        })
      )
    );

    render(<PuestasEnMarchaHospitality />);
    expect(await screen.findByText('Hotel Volcán')).toBeTruthy();

    // La pregunta de la pantalla es «a quién hay que empujar»: los listos no estorban.
    expect(screen.queryByText('Casa del Mar')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Todos' }));

    expect(screen.getByText('Casa del Mar')).toBeTruthy();
    expect(screen.getByText(/Listo para el cliente/)).toBeTruthy();
  });

  it('marca la avería: cliente con datos y el módulo apagado', async () => {
    fetchMock.mockResolvedValue(
      respuesta(
        listado({
          totales: { tenants: 1, pendientes: 1, listos: 0, apagados: 1 },
          tenants: [fila({ moduloApagado: true })],
        })
      )
    );

    render(<PuestasEnMarchaHospitality />);

    expect(await screen.findByText('módulo apagado')).toBeTruthy();
    expect(screen.getByText(/1 con el módulo apagado/)).toBeTruthy();
  });

  it('avisa cuando el listado quedó corto', async () => {
    fetchMock.mockResolvedValue(respuesta(listado({ truncado: true })));

    render(<PuestasEnMarchaHospitality />);

    expect(await screen.findByText('listado parcial')).toBeTruthy();
  });

  it('sin clientes con Hospitality lo dice, y no finge una tabla vacía', async () => {
    fetchMock.mockResolvedValue(
      respuesta(
        listado({ totales: { tenants: 0, pendientes: 0, listos: 0, apagados: 0 }, tenants: [] })
      )
    );

    render(<PuestasEnMarchaHospitality />);

    expect(await screen.findByText(/Todavía no hay ningún cliente con Hospitality/)).toBeTruthy();
  });

  it('está montado en el panel de Hospitality, no solo escrito', async () => {
    // La página trae su propio estado (crons y holds): se le sirve lo mínimo
    // para poder comprobar que la sección nueva se monta de verdad.
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith(URL_LISTADO)) return respuesta(listado());
      if (String(url).startsWith('/api/cron-status')) return respuesta({ jobs: [] });
      if (String(url).includes('holds')) {
        return respuesta({
          ventanaDias: 30,
          desde: '',
          total: 0,
          truncado: false,
          tenants: [],
          generadoEn: new Date().toISOString(),
        });
      }
      return respuesta({});
    });

    render(<AdminHospitality />);

    expect(await screen.findByText(/Puestas en marcha de Hospitality/)).toBeTruthy();
    expect(await screen.findByText('Hotel Volcán')).toBeTruthy();
  });

  it('si el servidor falla lo dice y no enseña una lista inventada', async () => {
    fetchMock.mockResolvedValue(respuesta({ ok: false, error: 'Acceso denegado' }, 403));

    render(<PuestasEnMarchaHospitality />);

    expect(await screen.findByText('Acceso denegado')).toBeTruthy();
    expect(screen.queryByText('Hotel Volcán')).toBeNull();
    expect(screen.queryByText(/Nadie tiene la puesta en marcha a medias/)).toBeNull();
  });
});
