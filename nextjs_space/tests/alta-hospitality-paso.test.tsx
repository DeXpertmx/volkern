// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AltaHospitalityPaso } from '@/components/admin/AltaHospitalityPaso';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function abrir() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /preparar hospitality ahora/i }));
  return user;
}

describe('Paso de Hospitality del alta guiada', () => {
  it('nace plegado: el operador decide cuándo dar el paso', () => {
    render(<AltaHospitalityPaso tenantId="t1" />);
    expect(screen.getByText(/preparar hospitality ahora/i)).toBeTruthy();
    expect(screen.queryByLabelText(/primera propiedad/i)).toBeNull();
  });

  it('envía la propiedad al endpoint del alta con el tenant recién creado', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        roles: { creados: ['Anfitrión'], completados: [], catalogo: ['Anfitrión'] },
        propiedad: { id: 'prop_1', nombre: 'Villa Mar Azul', estado: 'activa', creada: true },
        enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=prop_1',
      }),
    });

    render(<AltaHospitalityPaso tenantId="tenant_nuevo" />);
    const user = await abrir();

    await user.type(screen.getByLabelText(/primera propiedad/i), 'Villa Mar Azul');
    await user.type(screen.getByLabelText(/ciudad/i), 'Algeciras');
    await user.click(
      screen.getByRole('button', { name: /preparar roles y primera propiedad/i })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/hospitality/alta');
    expect(opciones.method).toBe('POST');
    expect(JSON.parse(opciones.body)).toEqual({
      tenantId: 'tenant_nuevo',
      propiedad: { nombre: 'Villa Mar Azul', ciudad: 'Algeciras', pais: undefined, timezone: undefined },
    });
  });

  it('tras el alta muestra el enlace por donde el cliente continúa', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        roles: { creados: ['Anfitrión', 'Agente'], completados: [], catalogo: [] },
        propiedad: { id: 'prop_1', nombre: 'Villa Mar Azul', estado: 'activa', creada: true },
        enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=prop_1',
      }),
    });

    render(<AltaHospitalityPaso tenantId="t1" />);
    const user = await abrir();
    await user.type(screen.getByLabelText(/primera propiedad/i), 'Villa Mar Azul');
    await user.click(
      screen.getByRole('button', { name: /preparar roles y primera propiedad/i })
    );

    await waitFor(() => expect(screen.getByText(/Anfitrión, Agente/)).toBeTruthy());
    const enlace = screen.getByRole('link', { name: /abrir el wizard del cliente/i });
    expect(enlace.getAttribute('href')).toBe(
      '/dashboard/hospitality/onboarding?propertyId=prop_1'
    );
  });

  it('si el servidor rechaza la zona horaria, lo dice y no finge éxito', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error: '«Marte/Olympus» no es una zona horaria válida' }),
    });

    render(<AltaHospitalityPaso tenantId="t1" />);
    const user = await abrir();
    await user.type(screen.getByLabelText(/primera propiedad/i), 'Villa Mar Azul');
    await user.type(screen.getByLabelText(/zona horaria/i), 'Marte/Olympus');
    await user.click(
      screen.getByRole('button', { name: /preparar roles y primera propiedad/i })
    );

    await waitFor(() => expect(screen.getByText(/no es una zona horaria válida/)).toBeTruthy());
    expect(screen.queryByRole('link', { name: /abrir el wizard/i })).toBeNull();
  });

  it('sin nombre de propiedad el botón queda deshabilitado', async () => {
    render(<AltaHospitalityPaso tenantId="t1" />);
    await abrir();
    const boton = screen.getByRole('button', {
      name: /preparar roles y primera propiedad/i,
    }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });
});
