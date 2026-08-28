import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findBookingUserBySlug,
  findDigitalCardByUrlUnica,
  isCardAliasAvailable,
} from '@/lib/public-slug-lookup';

// Mock de Prisma (default y named export: el helper importa el default)
// vi.hoisted: el factory de vi.mock se eleva por encima de las declaraciones
const mockPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  digitalCard: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ default: mockPrisma, prisma: mockPrisma }));

const SELECT = { id: true, bookingSlug: true };
const INCLUDE = { user: { select: { bookingSlug: true } } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findBookingUserBySlug', () => {
  it('con subdominio resuelto: busca scoped por tenant y NO cae al global si encuentra', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-A' });
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', bookingSlug: 'bruno-hess' });

    const res = await findBookingUserBySlug('bruno-hess', 'dexpert', { select: SELECT });

    expect(res).toEqual({ id: 'u1', bookingSlug: 'bruno-hess' });
    expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { subdomain: 'dexpert' },
      select: { id: true },
    });
    expect(mockPrisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      select: SELECT,
      where: { bookingSlug: 'bruno-hess', tenantId: 'tenant-A' },
    });
  });

  it('scoped miss: hace fallback global sin tenantId', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-A' });
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null) // scoped
      .mockResolvedValueOnce({ id: 'u-otro-tenant', bookingSlug: 'bruno-hess' }); // global

    const res = await findBookingUserBySlug('bruno-hess', 'dexpert', { select: SELECT });

    expect(res).toEqual({ id: 'u-otro-tenant', bookingSlug: 'bruno-hess' });
    expect(mockPrisma.user.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.findFirst).toHaveBeenLastCalledWith({
      select: SELECT,
      where: { bookingSlug: 'bruno-hess' },
    });
  });

  it('sin subdominio (apex/custom domain): lookup global directo, sin query de tenant', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', bookingSlug: 'bruno-hess' });

    const res = await findBookingUserBySlug('bruno-hess', null, { select: SELECT });

    expect(res).toEqual({ id: 'u1', bookingSlug: 'bruno-hess' });
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      select: SELECT,
      where: { bookingSlug: 'bruno-hess' },
    });
  });

  it('subdominio inexistente en BD: resuelve global (null tenantId)', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', bookingSlug: 'bruno-hess' });

    const res = await findBookingUserBySlug('bruno-hess', 'noexiste', { select: SELECT });

    expect(res).toEqual({ id: 'u1', bookingSlug: 'bruno-hess' });
    expect(mockPrisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      select: SELECT,
      where: { bookingSlug: 'bruno-hess' },
    });
  });
});

describe('findDigitalCardByUrlUnica', () => {
  it('con subdominio: scoped primero, fallback global si no encuentra', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-A' });
    mockPrisma.digitalCard.findFirst
      .mockResolvedValueOnce(null) // scoped
      .mockResolvedValueOnce({ id: 'c1', urlUnica: 'brunokhess', user: { bookingSlug: 'bruno-hess' } });

    const res = await findDigitalCardByUrlUnica('brunokhess', 'dexpert', { include: INCLUDE });

    expect(res).toEqual({ id: 'c1', urlUnica: 'brunokhess', user: { bookingSlug: 'bruno-hess' } });
    expect(mockPrisma.digitalCard.findFirst).toHaveBeenLastCalledWith({
      include: INCLUDE,
      where: { urlUnica: 'brunokhess' },
    });
  });

  it('scoped hit: una sola query, sin fallback', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-A' });
    mockPrisma.digitalCard.findFirst.mockResolvedValueOnce({ id: 'c1', urlUnica: 'brunokhess' });

    const res = await findDigitalCardByUrlUnica('brunokhess', 'dexpert', { include: INCLUDE });

    expect(res).toEqual({ id: 'c1', urlUnica: 'brunokhess' });
    expect(mockPrisma.digitalCard.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.digitalCard.findFirst).toHaveBeenCalledWith({
      include: INCLUDE,
      where: { urlUnica: 'brunokhess', tenantId: 'tenant-A' },
    });
  });
});

describe('isCardAliasAvailable', () => {
  it('alias libre en el tenant: true', async () => {
    mockPrisma.digitalCard.findFirst.mockResolvedValueOnce(null);

    const res = await isCardAliasAvailable('mi-alias', 'tenant-A', 'user-1');

    expect(res).toBe(true);
    expect(mockPrisma.digitalCard.findFirst).toHaveBeenCalledWith({
      where: { urlUnica: 'mi-alias', tenantId: 'tenant-A', NOT: { userId: 'user-1' } },
      select: { id: true },
    });
  });

  it('alias usado por otro usuario del mismo tenant: false', async () => {
    mockPrisma.digitalCard.findFirst.mockResolvedValueOnce({ id: 'c-otro' });

    const res = await isCardAliasAvailable('mi-alias', 'tenant-A', 'user-1');

    expect(res).toBe(false);
  });

  it('usuario sin tenant (null): disponible sin consultar', async () => {
    const res = await isCardAliasAvailable('mi-alias', null, 'user-1');

    expect(res).toBe(true);
    expect(mockPrisma.digitalCard.findFirst).not.toHaveBeenCalled();
  });
});
