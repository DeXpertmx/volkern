import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regresión: la llave que emite Perfil → IA Agent Skills → Generar Nueva
 * Conexión se guardaba solo con `agent:skill`. El panel anuncia conexión por
 * protocolo MCP, y `POST /mcp` (tools/call) exige `mcp:execute`: la llave se
 * generaba bien pero el cliente MCP recibía 401. Aquí se fija el contrato.
 */

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  apiKeyUpdateMany: vi.fn(),
  apiKeyCreate: vi.fn(),
  getCrmEntitlements: vi.fn(),
  crmAllows: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/lib/db', () => ({
  globalPrisma: {
    user: { findUnique: mocks.userFindUnique },
    apiKey: {
      updateMany: mocks.apiKeyUpdateMany,
      create: mocks.apiKeyCreate,
    },
  },
}));

vi.mock('@/lib/crm-entitlements', () => ({
  getCrmEntitlements: mocks.getCrmEntitlements,
  crmAllows: mocks.crmAllows,
  upgradeMessage: () => 'Esta función requiere el nivel Avanzado. Tu plan actual es Esencial.',
}));

import { POST as crearSkillKey } from '@/app/api/users/me/skill-key/route';
import type { NextRequest } from 'next/server';

function makeRequest(): NextRequest {
  return new Request('http://localhost:3000/api/users/me/skill-key', {
    method: 'POST',
  }) as unknown as NextRequest;
}

beforeEach(() => {
  mocks.getServerSession.mockReset().mockResolvedValue({ user: { email: 'ana@volkern.test' } });
  mocks.userFindUnique.mockReset().mockResolvedValue({ id: 'u1', tenantId: 't1', name: 'Ana' });
  mocks.apiKeyUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.apiKeyCreate.mockReset().mockImplementation(async ({ data }: any) => ({
    id: 'key-1',
    createdAt: new Date('2026-10-19T10:00:00Z'),
    scopes: data.scopes,
  }));
  mocks.getCrmEntitlements.mockReset().mockResolvedValue({ tier: 'avanzado', tierName: 'Avanzado', legacy: false, seats: 5, limits: { api: true } });
  mocks.crmAllows.mockReset().mockReturnValue(true);
});

describe('POST /api/users/me/skill-key — scopes de la conexión', () => {
  it('emite la llave con agent:skill y los scopes MCP, para que /mcp tools/call no dé 401', async () => {
    const res = await crearSkillKey(makeRequest());
    expect(res.status).toBe(200);

    const saved = mocks.apiKeyCreate.mock.calls[0][0].data;
    expect(saved.scopes).toEqual(expect.arrayContaining(['agent:skill', 'mcp:execute', 'mcp:read']));

    const body = await res.json();
    expect(body.key).toMatch(/^vk_live_/);
    expect(body.scopes).toEqual(expect.arrayContaining(['mcp:execute', 'mcp:read']));
  });

  it('desactiva las llaves de agente anteriores del usuario (una conexión activa a la vez)', async () => {
    await crearSkillKey(makeRequest());
    expect(mocks.apiKeyUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', activo: true, scopes: { has: 'agent:skill' } }),
      }),
    );
  });

  it('sin nivel con acceso a API no emite llave y devuelve el motivo', async () => {
    mocks.crmAllows.mockReturnValue(false);

    const res = await crearSkillKey(makeRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('nivel Avanzado');
    expect(mocks.apiKeyCreate).not.toHaveBeenCalled();
  });
});
