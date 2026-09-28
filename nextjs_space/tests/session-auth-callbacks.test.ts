import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────
// prisma: la validación de sesión única consulta tokenVersion en BD
const prismaUserFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => prismaUserFindUnique(...args),
    },
  },
}));

// logger: silencioso en tests
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// 2FA: no forma parte de lo que se prueba aquí (misma ruta resuelta que
// el import relativo './security/two-factor' de lib/auth.ts)
vi.mock('@/lib/security/two-factor', () => ({
  TwoFactorService: {},
}));

import { authOptions } from '../lib/auth';

const callbacks = authOptions.callbacks as {
  jwt: (params: { token?: any; user?: any }) => Promise<any>;
  session: (params: { session: any; token: any }) => Promise<any>;
};

function makeSession() {
  return { user: { name: 'Test', email: 't@v.app' }, expires: '2099-01-01T00:00:00Z' };
}

beforeEach(() => {
  prismaUserFindUnique.mockReset();
});

describe('authOptions — inactividad en el session callback', () => {
  // Epoch del momento del test: los offsets se aplican sobre el reloj real
  // para que lastActivity siempre quede en el pasado/presente real.
  const NOW = Math.floor(Date.now() / 1000);

  it('sesión expirada por inactividad → sesión vacía', async () => {
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 3600 },
    });
    expect(res).toEqual({});
  });

  it('sesión activa dentro de la ventana → sesión completa', async () => {
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60 },
    });
    expect(res.user.email).toBe('t@v.app');
  });

  it('token sin lastActivity (legacy) no se cierra por inactividad', async () => {
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1' },
    });
    expect(res.user.email).toBe('t@v.app');
  });
});

describe('authOptions — sesión única (sessionVersion) en el session callback', () => {
  const NOW = Math.floor(Date.now() / 1000);

  it('sessionVersion coincide con BD → sesión completa', async () => {
    prismaUserFindUnique.mockResolvedValueOnce({ tokenVersion: 3 });
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60, sessionVersion: 3 },
    });
    expect(res.user.email).toBe('t@v.app');
    expect(prismaUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { tokenVersion: true },
    });
  });

  it('sessionVersion distinta de BD (login posterior en otro dispositivo) → sesión vacía', async () => {
    prismaUserFindUnique.mockResolvedValueOnce({ tokenVersion: 7 });
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60, sessionVersion: 3 },
    });
    expect(res).toEqual({});
  });

  it('token legacy sin sessionVersion: compara con tokenVersion del claim', async () => {
    prismaUserFindUnique.mockResolvedValueOnce({ tokenVersion: 5 });
    const ok = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60, tokenVersion: 5 },
    });
    expect(ok.user.email).toBe('t@v.app');

    prismaUserFindUnique.mockResolvedValueOnce({ tokenVersion: 6 });
    const ko = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60, tokenVersion: 5 },
    });
    expect(ko).toEqual({});
  });

  it('token sin sessionVersion ni tokenVersion: se acepta (sesiones pre-cambio/acuñadas)', async () => {
    prismaUserFindUnique.mockResolvedValueOnce({ tokenVersion: 9 });
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60 },
    });
    expect(res.user.email).toBe('t@v.app');
    expect(prismaUserFindUnique).not.toHaveBeenCalled();
  });

  it('usuario eliminado de BD → sesión vacía', async () => {
    prismaUserFindUnique.mockResolvedValueOnce(null);
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60, sessionVersion: 1 },
    });
    expect(res).toEqual({});
  });

  it('error de BD: fail-open (se permite la sesión)', async () => {
    prismaUserFindUnique.mockRejectedValueOnce(new Error('db down'));
    const res = await callbacks.session({
      session: makeSession(),
      token: { sub: 'u1', lastActivity: NOW - 60, sessionVersion: 1 },
    });
    expect(res.user.email).toBe('t@v.app');
  });
});
