// @vitest-environment jsdom
//
// El fallo que vigila este test: Hospitality es una vertical de producto, pero
// las tarjetas del onboarding rápido son una lista escrita a mano. Un hotel que
// se registraba no podía elegir su vertical y nunca encendía el módulo
// `hospitality`. Aquí se prueba la conducta visible del flujo completo: la
// tarjeta existe, al elegirla preselecciona el hub y al pulsar «Comenzar» el
// módulo viaja en el POST que lo habilita.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
let searchParamsStub = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => searchParamsStub,
}));

import OnboardingQuickPage from '@/app/dashboard/onboarding-quick/page';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsStub = new URLSearchParams('');
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Etiqueta del contador de módulos seleccionados del paso 1. */
const contador = (n: number) => new RegExp(`Módulos a activar \\(${n}\\)`);

describe('Onboarding rápido — la vertical Hospitality es elegible', () => {
  it('la tarjeta Hospitality está en el selector desde el primer paso', () => {
    render(<OnboardingQuickPage />);
    expect(screen.getByText('Hospitality')).toBeTruthy();
    expect(screen.getByText('Hoteles y alojamientos')).toBeTruthy();
  });

  it('elegir Hospitality preselecciona su módulo y desbloquea Comenzar', async () => {
    const user = userEvent.setup();
    render(<OnboardingQuickPage />);

    // Antes de elegir: sin vertical, el botón está bloqueado y el grupo
    // Hospitality plegado (su módulo no se ve).
    expect((screen.getByRole('button', { name: /comenzar/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Propiedades, unidades alojativas y reservas')).toBeNull();

    await user.click(screen.getByText('Hospitality'));

    // El grupo se despliega y aparece el módulo del hub, ya marcado.
    expect(screen.getByText('Propiedades, unidades alojativas y reservas')).toBeTruthy();
    expect(screen.getByText(contador(6))).toBeTruthy();
    expect((screen.getByRole('button', { name: /comenzar/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('?vertical=hospitality (el salto desde el registro) llega con la vertical ya elegida', async () => {
    searchParamsStub = new URLSearchParams('vertical=hospitality');
    render(<OnboardingQuickPage />);

    await waitFor(() => expect(screen.getByText(contador(6))).toBeTruthy());
    expect((screen.getByRole('button', { name: /comenzar/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Comenzar envía el módulo hospitality en la activación de módulos', async () => {
    const user = userEvent.setup();
    render(<OnboardingQuickPage />);

    await user.click(screen.getByText('Hospitality'));
    await user.click(screen.getByRole('button', { name: /comenzar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/onboarding/quick');
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo.step).toBe('modules');
    expect(cuerpo.modules).toContain('hospitality');
  });
});
