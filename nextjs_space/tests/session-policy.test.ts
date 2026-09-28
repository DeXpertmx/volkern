import { describe, it, expect } from 'vitest';
import {
  getSessionIdleTimeoutSeconds,
  isSessionIdleExpired,
  refreshSessionClaims,
  SESSION_COOKIE_NAME,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
} from '@/lib/session-policy';

describe('session-policy — timeout de inactividad', () => {
  it('por defecto 30 minutos (1800s)', () => {
    delete process.env.SESSION_IDLE_TIMEOUT_SECONDS;
    expect(getSessionIdleTimeoutSeconds()).toBe(1800);
  });

  it('se configura con SESSION_IDLE_TIMEOUT_SECONDS (900 = 15 min)', () => {
    process.env.SESSION_IDLE_TIMEOUT_SECONDS = '900';
    expect(getSessionIdleTimeoutSeconds()).toBe(900);
    delete process.env.SESSION_IDLE_TIMEOUT_SECONDS;
  });

  it('valores inválidos caen al defecto de 30 min', () => {
    process.env.SESSION_IDLE_TIMEOUT_SECONDS = 'abc';
    expect(getSessionIdleTimeoutSeconds()).toBe(1800);
    process.env.SESSION_IDLE_TIMEOUT_SECONDS = '-5';
    expect(getSessionIdleTimeoutSeconds()).toBe(1800);
    process.env.SESSION_IDLE_TIMEOUT_SECONDS = '0';
    expect(getSessionIdleTimeoutSeconds()).toBe(1800);
    delete process.env.SESSION_IDLE_TIMEOUT_SECONDS;
  });
});

describe('session-policy — expiración por inactividad', () => {
  const NOW = 1_800_000_000;

  it('expira si lastActivity es más antigua que el timeout', () => {
    delete process.env.SESSION_IDLE_TIMEOUT_SECONDS;
    const token = { lastActivity: NOW - 1801 };
    expect(isSessionIdleExpired(token, NOW)).toBe(true);
  });

  it('no expira dentro de la ventana (29 min)', () => {
    const token = { lastActivity: NOW - 1740 };
    expect(isSessionIdleExpired(token, NOW)).toBe(false);
  });

  it('el límite exacto NO expira (desigualdad estricta)', () => {
    const token = { lastActivity: NOW - 1800 };
    expect(isSessionIdleExpired(token, NOW)).toBe(false);
  });

  it('un token sin lastActivity (legacy/acuñado a mano) NO expira por inactividad', () => {
    expect(isSessionIdleExpired({}, NOW)).toBe(false);
    expect(isSessionIdleExpired({ sub: 'x' }, NOW)).toBe(false);
  });

  it('un token nulo/undefined no decide aquí (false)', () => {
    expect(isSessionIdleExpired(null, NOW)).toBe(false);
    expect(isSessionIdleExpired(undefined, NOW)).toBe(false);
  });
});

describe('session-policy — refresco deslizante', () => {
  it('refreshSessionClaims actualiza lastActivity y preserva el resto de claims', () => {
    const NOW = 1_800_000_000;
    const token = {
      sub: 'u1',
      tenantId: 't1',
      lastActivity: NOW - 300,
    };
    const refreshed = refreshSessionClaims(token, NOW + 60);
    expect(refreshed.lastActivity).toBe(NOW + 60);
    expect(refreshed.sub).toBe('u1');
    expect(refreshed.tenantId).toBe('t1');
  });
});

describe('session-policy — constantes', () => {
  it('cookie y vida absoluta coinciden con authOptions', () => {
    expect(SESSION_COOKIE_NAME).toBe('next-auth.session-token');
    expect(SESSION_ABSOLUTE_MAX_AGE_SECONDS).toBe(24 * 60 * 60);
  });
});
