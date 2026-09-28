// @vitest-environment jsdom
//
// Guardia de render del aviso de sesión a punto de expirar: monta el
// componente real y comprueba las tres conductas que importan —
//   1. con tiempo de sobra no aparece nada;
//   2. dentro de la ventana aparece el aviso con cuenta atrás;
//   3. el botón «Seguir conectado» renueva por POST y retira el aviso.
// El tiempo restante lo fija el servidor (GET /api/session/status), así que aquí
// se mockea esa respuesta; lo que se valida es la reacción de la UI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ status: 'authenticated', data: { user: { id: 'u1' } } })),
}));

import { SessionIdleWarning } from '@/components/session-idle-warning';

function respuesta(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const INFO_ACTIVA = {
  authenticated: true,
  remainingSeconds: 1500,
  warnSeconds: 120,
  idleTimeoutSeconds: 1800,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('SessionIdleWarning — aviso de expiración por inactividad', () => {
  it('con tiempo de sobra no muestra el aviso', async () => {
    global.fetch = vi.fn(async () => respuesta(INFO_ACTIVA)) as unknown as typeof fetch;

    render(<SessionIdleWarning />);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/session/status', expect.anything())
    );
    expect(screen.queryByText(/a punto de cerrarse/i)).toBeNull();
  });

  it('dentro de la ventana muestra el aviso con la cuenta atrás', async () => {
    global.fetch = vi.fn(async () =>
      respuesta({ ...INFO_ACTIVA, remainingSeconds: 95 })
    ) as unknown as typeof fetch;

    render(<SessionIdleWarning />);

    expect(await screen.findByText(/a punto de cerrarse/i)).toBeDefined();
    // Cuenta atrás mm:ss (95 s ≈ 1:35; la tolerancia cubre el tic de 1 s).
    expect(screen.getByText(/^1:3\d$/)).toBeDefined();
  });

  it('el botón «Seguir conectado» renueva por POST y retira el aviso', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/session/renew'
        ? respuesta({ renewed: true, idleTimeoutSeconds: 1800 })
        : respuesta({ ...INFO_ACTIVA, remainingSeconds: 90 })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<SessionIdleWarning />);

    const boton = await screen.findByRole('button', { name: /seguir conectado/i });
    await userEvent.click(boton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/session/renew',
        expect.objectContaining({ method: 'POST' })
      )
    );
    await waitFor(() => expect(screen.queryByText(/a punto de cerrarse/i)).toBeNull());
  });

  it('si la sesión ya expiró, ofrece volver a iniciar sesión', async () => {
    global.fetch = vi.fn(async () =>
      respuesta({ error: 'Sesión expirada por inactividad', code: 'SESSION_IDLE_EXPIRED' }, 401)
    ) as unknown as typeof fetch;

    render(<SessionIdleWarning />);

    expect(await screen.findByText(/sesión cerrada por inactividad/i)).toBeDefined();
    expect(
      screen.getByRole('link', { name: /iniciar sesión/i }).getAttribute('href')
    ).toContain('/auth/login?callbackUrl=');
  });
});

describe('SessionIdleWarning — montaje en el dashboard (guardia de fuente)', () => {
  const readFileSync = require('node:fs').readFileSync;

  it('el layout del dashboard monta el aviso una sola vez', () => {
    const fuente = readFileSync('components/dashboard-layout.tsx', 'utf8');
    const importaciones = fuente.match(/from '@\/components\/session-idle-warning'/g) ?? [];
    const usos = fuente.match(/<SessionIdleWarning \/>/g) ?? [];
    expect(importaciones).toHaveLength(1);
    expect(usos).toHaveLength(1);
  });
});
