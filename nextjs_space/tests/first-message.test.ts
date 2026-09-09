import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests del helper `markFirstMessageSeen` (extraído del GET de
 * check-first-message). Se mockea @/lib/db con el patrón del proyecto
 * (vi.hoisted para que el factory del mock vea la variable inicializada).
 */

const { upsert } = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ id: 'progress-1' })),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    onboardingProgress: { upsert },
  },
}));

import { markFirstMessageSeen } from '@/lib/onboarding/first-message';

beforeEach(() => {
  upsert.mockClear();
});

describe('markFirstMessageSeen', () => {
  it('hace upsert con primerMensaje=true y fecha', async () => {
    await markFirstMessageSeen('tenant-1');

    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: 'tenant-1' });
    expect(args.update.primerMensaje).toBe(true);
    expect(args.update.fechaPrimerMensaje).toBeInstanceOf(Date);
    expect(args.create.tenantId).toBe('tenant-1');
    expect(args.create.primerMensaje).toBe(true);
  });

  it('es idempotente: la segunda llamada usa exactamente el mismo update', async () => {
    await markFirstMessageSeen('tenant-1');
    await markFirstMessageSeen('tenant-1');

    expect(upsert).toHaveBeenCalledTimes(2);
    const [a, b] = upsert.mock.calls.map((c: any[]) => c[0].update);
    expect(a).toEqual(b);
    expect(a.primerMensaje).toBe(true);
  });
});