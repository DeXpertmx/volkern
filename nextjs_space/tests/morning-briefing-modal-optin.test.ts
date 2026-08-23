import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (vi.hoisted()) ────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  generateBriefing: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));
vi.mock('@/lib/sales/morning-briefing-service', () => ({
  MorningBriefingService: { generateBriefing: mocks.generateBriefing },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
import { GET } from '@/app/api/sales/morning-briefing/route';

const SESSION = { user: { id: 'u1', tenantId: 't1', email: 'test@volkern.app' } };

function jsonReq(url: string): Request {
  return new Request(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue(SESSION);
  mocks.userFindUnique.mockResolvedValue({ metadata: {} });
  mocks.generateBriefing.mockResolvedValue({
    topDeals: [],
    riskyDeals: [],
    newDiamonds: [],
    motivationalQuote: 'Hoy es un gran día.',
  });
});

describe('GET /api/sales/morning-briefing — respeta notifications.briefing', () => {
  it('401 sin sesión', async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const res = await GET(jsonReq('https://volkern.app/api/sales/morning-briefing'));
    expect(res.status).toBe(401);
    expect(mocks.generateBriefing).not.toHaveBeenCalled();
  });

  it('200 con briefing cuando la preferencia está activada (briefing: true)', async () => {
    mocks.userFindUnique.mockResolvedValue({ metadata: { notifications: { briefing: true } } });
    const res = await GET(jsonReq('https://volkern.app/api/sales/morning-briefing'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.motivationalQuote).toBe('Hoy es un gran día.');
    expect(data.disabled).toBeUndefined();
    expect(mocks.generateBriefing).toHaveBeenCalledWith('u1', 't1');
  });

  it('200 con briefing cuando no hay metadata (default activo)', async () => {
    mocks.userFindUnique.mockResolvedValue({ metadata: {} });
    const res = await GET(jsonReq('https://volkern.app/api/sales/morning-briefing'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.topDeals).toBeDefined();
    expect(mocks.generateBriefing).toHaveBeenCalledTimes(1);
  });

  it('devuelve { disabled: true } y NO genera briefing si notifications.briefing === false', async () => {
    mocks.userFindUnique.mockResolvedValue({ metadata: { notifications: { briefing: false } } });
    const res = await GET(jsonReq('https://volkern.app/api/sales/morning-briefing'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.disabled).toBe(true);
    expect(mocks.generateBriefing).not.toHaveBeenCalled();
  });

  it('500 si el servicio falla', async () => {
    mocks.generateBriefing.mockRejectedValue(new Error('Gemma caída'));
    const res = await GET(jsonReq('https://volkern.app/api/sales/morning-briefing'));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('Gemma caída');
  });
});
