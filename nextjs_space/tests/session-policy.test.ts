import { describe, it, expect } from 'vitest';
import {
  getSessionIdleTimeoutSeconds,
  getSessionWarningSeconds,
  isSessionIdleExpired,
  refreshSessionClaims,
  secondsUntilIdleExpiry,
  shouldWarnIdleExpiry,
  SESSION_COOKIE_NAME,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_STATUS_PATH,
  SESSION_RENEW_PATH,
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

describe('session-policy — aviso de expiración inminente', () => {
  const NOW = 1_800_000_000;

  it('la ventana de aviso es de 2 min con el timeout de 30 min', () => {
    delete process.env.SESSION_IDLE_TIMEOUT_SECONDS;
    expect(getSessionWarningSeconds()).toBe(120);
  });

  it('la ventana de aviso nunca supera la mitad del timeout', () => {
    expect(getSessionWarningSeconds(120)).toBe(60);
    expect(getSessionWarningSeconds(60)).toBe(30);
    expect(getSessionWarningSeconds(1)).toBe(1); // nunca 0
  });

  it('secondsUntilIdleExpiry devuelve los segundos que quedan', () => {
    delete process.env.SESSION_IDLE_TIMEOUT_SECONDS;
    expect(secondsUntilIdleExpiry({ lastActivity: NOW - 1700 }, NOW)).toBe(100);
  });

  it('secondsUntilIdleExpiry puede ser negativo si ya expiró', () => {
    expect(secondsUntilIdleExpiry({ lastActivity: NOW - 3600 }, NOW)).toBe(-1800);
  });

  it('secondsUntilIdleExpiry es null sin lastActivity (sesión legacy: no expira por inactividad)', () => {
    expect(secondsUntilIdleExpiry({}, NOW)).toBeNull();
    expect(secondsUntilIdleExpiry(null, NOW)).toBeNull();
    expect(secondsUntilIdleExpiry(undefined, NOW)).toBeNull();
  });

  it('shouldWarnIdleExpiry avisa solo dentro de la ventana', () => {
    delete process.env.SESSION_IDLE_TIMEOUT_SECONDS;
    expect(shouldWarnIdleExpiry({ lastActivity: NOW - 1700 }, 120, NOW)).toBe(true); // quedan 100 s
    expect(shouldWarnIdleExpiry({ lastActivity: NOW - 1600 }, 120, NOW)).toBe(false); // quedan 200 s
  });

  it('shouldWarnIdleExpiry también avisa si la sesión ya expiró', () => {
    expect(shouldWarnIdleExpiry({ lastActivity: NOW - 3600 }, 120, NOW)).toBe(true);
  });

  it('una sesión legacy (sin lastActivity) nunca dispara el aviso', () => {
    expect(shouldWarnIdleExpiry({}, 120, NOW)).toBe(false);
    expect(shouldWarnIdleExpiry(null, 120, NOW)).toBe(false);
  });
});

describe('session-policy — constantes', () => {
  it('cookie y vida absoluta coinciden con authOptions', () => {
    expect(SESSION_COOKIE_NAME).toBe('next-auth.session-token');
    expect(SESSION_ABSOLUTE_MAX_AGE_SECONDS).toBe(24 * 60 * 60);
  });

  it('las rutas del aviso son las que exime/refresca el middleware', () => {
    expect(SESSION_STATUS_PATH).toBe('/api/session/status');
    expect(SESSION_RENEW_PATH).toBe('/api/session/renew');
  });
});
