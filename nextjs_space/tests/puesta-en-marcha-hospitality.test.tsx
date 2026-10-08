// @vitest-environment jsdom
//
// Tarjeta de puesta en marcha de Hospitality en el detalle de tenant.
//
// El caso que la motivó: un cliente YA registrado al que hay que dar de alta la
// vertical. La tarjeta tiene que decir qué falta leyéndolo del servidor, dejar
// dar el paso (reusando el mismo alta, idempotente) y ofrecer el enlace exacto
// por donde el cliente continúa.

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

import { PuestaEnMarchaHospitality } from '@/components/admin/PuestaEnMarchaHospitality';

const fetchMock = vi.fn();

const ESTADO_URL = '/api/admin/hospitality/alta?tenantId=tenant_viejo';

function estadoConRoles(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    tenant: { id: 'tenant_viejo', nombre: 'Cliente Antiguo' },
    roles: {
      catalogo: 5,
      alDia: 1,
      completos: false,
      // El detalle es el catálogo entero, como lo devuelve el servidor: si no,
      // el «por preparar» de la interfaz no cuadraría con el «1/5».
      detalle: [
        {
          nombre: 'Anfitrión',
          descripcion: 'Administra la propiedad entera.',
          estado: 'al_dia',
          faltantes: [],
        },
        {
          nombre: 'Agente',
          descripcion: 'Gestiona por encargo de terceros.',
          estado: 'ausente',
          faltantes: [],
        },
        {
          nombre: 'Mantenimiento',
          descripcion: 'Arregla lo que se rompe.',
          estado: 'ausente',
          faltantes: [],
        },
        {
          nombre: 'Limpieza',
          descripcion: 'Prepara las unidades.',
          estado: 'incompleto',
          faltantes: ['hospitality_operaciones.checkin'],
        },
        {
          nombre: 'Huésped',
          descripcion: 'Solo ve lo suyo.',
          estado: 'incompleto',
          faltantes: ['hospitality_reservas.ver'],
        },
      ],
    },
    propiedades: [],
    enlaceWizard: '/dashboard/hospitality/onboarding',
    listo: false,
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

describe('Puesta en marcha de Hospitality (cliente ya registrado)', () => {
  it('pregunta por el cliente exacto y separa ausentes de incompletos', async () => {
    fetchMock.mockResolvedValue(respuesta(estadoConRoles()));

    render(<PuestaEnMarchaHospitality tenantId="tenant_viejo" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(ESTADO_URL);

    // El contador vive partido en dos nodos (cifra + total): se lee del bloque
    // del resumen en vez de exigirle al texto una forma concreta.
    const resumenRoles = (await screen.findByText('Roles del catálogo')).parentElement!;
    expect(resumenRoles.textContent).toContain('1/5');
    expect(resumenRoles.textContent).toContain('4 por preparar');
    expect(screen.getAllByText('Falta')).toHaveLength(2);
    expect(screen.getAllByText('Incompleto')).toHaveLength(2);
    expect(screen.getByText(/Le faltan: hospitality_operaciones\.checkin/)).toBeTruthy();
  });

  it('con propiedad ya creada ofrece el enlace exacto y avisa de que está lista', async () => {
    fetchMock.mockResolvedValue(
      respuesta(
        estadoConRoles({
          roles: { catalogo: 5, alDia: 5, completos: true, detalle: [] },
          propiedades: [
            {
              id: 'prop_1',
              nombre: 'Villa Mar Azul',
              ciudad: 'Algeciras',
              pais: 'España',
              estado: 'activa',
              unidades: 3,
              enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=prop_1',
            },
          ],
          enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=prop_1',
          listo: true,
        })
      )
    );

    render(<PuestaEnMarchaHospitality tenantId="tenant_viejo" />);

    const enlace = await screen.findByRole('link', { name: /wizard/i });
    expect(enlace.getAttribute('href')).toBe(
      '/dashboard/hospitality/onboarding?propertyId=prop_1'
    );
    expect(screen.getByText(/Algeciras, España · 3 unidad\(es\)/)).toBeTruthy();
    expect(screen.getByText(/Cuenta preparada/)).toBeTruthy();
    expect(screen.getByText('Roles del catálogo').parentElement!.textContent).toContain('5/5');
  });

  it('con el módulo apagado lo dice antes de dejar preparar nada', async () => {
    fetchMock.mockResolvedValue(respuesta(estadoConRoles()));

    render(<PuestaEnMarchaHospitality tenantId="tenant_viejo" moduloActivo={false} />);

    expect(await screen.findByText(/está apagado para este cliente/)).toBeTruthy();
    // El paso sigue disponible (es idempotente y reversible), pero el operador
    // ya sabe por qué el cliente no lo vería.
    expect(screen.getByRole('button', { name: /preparar hospitality ahora/i })).toBeTruthy();
  });

  it('si el servidor no responde, lo dice y no finge estado', async () => {
    fetchMock.mockResolvedValue(respuesta({ ok: false, error: 'Acceso denegado' }, 403));

    render(<PuestaEnMarchaHospitality tenantId="tenant_viejo" />);

    expect(await screen.findByText('Acceso denegado')).toBeTruthy();
    expect(screen.queryByText(/Roles del catálogo/i)).toBeNull();
  });

  it('tras el alta refresca el estado: no deja la tarjeta mintiendo', async () => {
    fetchMock.mockImplementation(async (url: string, opciones?: { method?: string }) => {
      if (url === ESTADO_URL && opciones?.method !== 'POST') {
        return respuesta(estadoConRoles());
      }
      return respuesta({
        ok: true,
        roles: { creados: ['Anfitrión'], completados: [], catalogo: ['Anfitrión'] },
        propiedad: { id: 'prop_1', nombre: 'Villa Mar Azul', estado: 'activa', creada: true },
        enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=prop_1',
      });
    });

    render(<PuestaEnMarchaHospitality tenantId="tenant_viejo" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /preparar hospitality ahora/i }));
    await user.type(screen.getByLabelText(/primera propiedad/i), 'Villa Mar Azul');
    await user.click(screen.getByRole('button', { name: /preparar roles y primera propiedad/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    // 1) estado inicial · 2) alta · 3) estado otra vez, ya con la propiedad
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/hospitality/alta');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[2][0]).toBe(ESTADO_URL);
  });
});
