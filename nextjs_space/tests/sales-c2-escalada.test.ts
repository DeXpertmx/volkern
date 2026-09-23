// @vitest-environment node
//
// GUARDIA C2 · La escalada de dificultad usa el RÉCORD DEL VENDEDOR.
//
// El defecto confirmado: la consulta del mejor score histórico filtraba por
// `userId: tenantId` — un id que nunca existe como vendedor — así que el modo
// leyenda nunca arrancaba con el historial real de quien practica (el propio
// código lo confesaba en un comentario). Se congela en tres capas:
//
//   1. MÓDULO (training-skills.generateCustomerResponse): el where es
//      { userId: agentId, tenantId }; sin vendedor no hay consulta — nunca se
//      usa el récord de otro.
//   2. VÍA COMPLETA (ruta skill-handler): el skill recibe el OBJETO que espera
//      su firma — antes la llamada era posicional (leadId, tenantId, ...) y
//      jamás casaba con la firma — con el userId de la sesión.
//   3. FUENTE: el arreglo no puede revertirse sin que una prueba lo cace
//      (mismo patrón que las guardias de fuente de C4).
//
// La FRONTERA de la escalada (>85 → leyenda, temperaturas 0.7/0.9) ya está
// congelada en la guardia C1 (tests/sales-roleplay-gemelo.test.ts) — aquí no
// se repite: esta guardia vigila QUIÉN alimenta la frontera.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  skillCustomerResponse: vi.fn(),
  sessionFindFirst: vi.fn(),
  leadFindUnique: vi.fn(),
  callGemma: vi.fn(),
}));

// withTenantAuth: expone el handler de la ruta tras una autenticación
// controlada por la prueba (el patrón de las guardias de rutas de la familia).
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth:
    (handler: (req: Request, auth: unknown) => Promise<Response>) =>
    async (req: Request) => {
      const auth = await mocks.auth(req);
      return handler(req, auth);
    },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { findUnique: mocks.leadFindUnique },
    trainingSession: { findFirst: mocks.sessionFindFirst },
  },
}));

vi.mock('@/lib/ai/gemma-client', () => ({ callGemma: mocks.callGemma }));

// El catálogo de skills queda mockeado (es un módulo enorme con dependencias
// ajenas a esta guardia): para la ruta solo importa capturar QUÉ recibe
// generate_customer_response y con cuántos argumentos.
vi.mock('@/lib/skills', () => ({
  skills: new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'generate_customer_response' ? mocks.skillCustomerResponse : vi.fn(),
    }
  ),
  listSkills: () => [],
}));

import { generateCustomerResponse } from '@/lib/skills/training-skills';

const LEAD = { nombre: 'Carlos Mendoza', notasTimestamp: [], interacciones: [] };
const RESPUESTA = {
  customerResponse: 'Me interesa, pero el precio me parece alto.',
  objectionType: 'precio',
  sentiment: 'skeptical',
};

const LLAMADA = { leadId: 'lead-1', tenantId: 'tenant-1', agentMessage: 'Hola, soy Ana de Volkern.' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.leadFindUnique.mockResolvedValue(LEAD);
  mocks.callGemma.mockResolvedValue({ content: JSON.stringify(RESPUESTA), error: undefined });
});

// ── 1. MÓDULO: el récord consultado es el del vendedor ──────────────────────

describe('C2 · la consulta del mejor score filtra por el VENDEDOR (userId), no por tenant', () => {
  it('con vendedor: el where es { userId: agentId, tenantId }', async () => {
    mocks.sessionFindFirst.mockResolvedValue({ score: 40 });

    await generateCustomerResponse({ ...LLAMADA, agentId: 'user-1' });

    expect(mocks.sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', tenantId: 'tenant-1' },
        orderBy: { score: 'desc' },
      })
    );
  });

  it('sin vendedor NO hay consulta: ninguna sesión de nadie alimenta la escalada', async () => {
    await generateCustomerResponse(LLAMADA); // sin agentId

    expect(mocks.sessionFindFirst).not.toHaveBeenCalled();
    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('ESTÁNDAR');
    expect(prompt).not.toContain('MODO LEYENDA');
  });

  it('sin sesiones previas del vendedor: ESTÁNDAR, la primera práctica nunca es leyenda', async () => {
    mocks.sessionFindFirst.mockResolvedValue(null);

    await generateCustomerResponse({ ...LLAMADA, agentId: 'user-1' });

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('ESTÁNDAR');
    expect(prompt).not.toContain('MODO LEYENDA');
  });

  it('el récord de OTRO vendedor no puede aparecer: el where lleva el agentId de la llamada, no un id inventado', async () => {
    mocks.sessionFindFirst.mockResolvedValue({ score: 99 });

    await generateCustomerResponse({ ...LLAMADA, agentId: 'user-2' });

    const where = mocks.sessionFindFirst.mock.calls[0][0].where;
    expect(where.userId).toBe('user-2');
    // El defecto era exactamente este valor en la posición de userId:
    expect(where.userId).not.toBe('tenant-1');
  });
});

// ── 2. VÍA COMPLETA: la ruta pasa el objeto con el userId de la sesión ──────

const POST = async (body: unknown, auth: unknown) => {
  const { POST: handler } = await import('@/app/api/ai/skill-handler/route');
  const req = new Request('https://volkern.app/api/ai/skill-handler', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  mocks.auth.mockResolvedValue(auth);
  return handler(req);
};

const AUTH = { tenant: { id: 'tenant-1' }, user: { id: 'user-1' } };
const PAYLOAD = {
  action_name: 'generate_customer_response',
  payload: { leadId: 'lead-1', agentMessage: 'Hola', history: [{ role: 'agent', content: 'Hola' }] },
};

describe('C2 · vía completa: /api/ai/skill-handler entrega al skill la firma correcta', () => {
  it('pasa el OBJETO que espera la firma (no una llamada posicional) con agentId de la sesión', async () => {
    mocks.skillCustomerResponse.mockResolvedValue(RESPUESTA);

    const res = await POST(PAYLOAD, AUTH);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(RESPUESTA);

    // UN argumento, con forma de objeto: la llamada posicional antigua
    // (leadId, tenantId, ...) jamás casaba con la firma del skill.
    expect(mocks.skillCustomerResponse).toHaveBeenCalledTimes(1);
    const args = mocks.skillCustomerResponse.mock.calls[0];
    expect(args).toHaveLength(1);
    expect(args[0]).toEqual(
      expect.objectContaining({
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        agentMessage: 'Hola',
        history: PAYLOAD.payload.history,
        agentId: 'user-1',
      })
    );
  });

  it('sin usuario en la sesión: agentId indefinido — sin récord, nunca el de otro', async () => {
    mocks.skillCustomerResponse.mockResolvedValue(RESPUESTA);

    await POST(PAYLOAD, { tenant: { id: 'tenant-1' }, user: null });

    const arg = mocks.skillCustomerResponse.mock.calls[0][0];
    expect(arg.agentId).toBeUndefined();
    expect(arg.tenantId).toBe('tenant-1');
  });
});

// ── 3. FUENTE: el arreglo no puede revertirse sin que una prueba lo cace ────

describe('C2 · contratos de fuente (el filtro no puede volver al defecto)', () => {
  const modulo = () => readFileSync('lib/skills/training-skills.ts', 'utf8');

  it('la consulta del módulo filtra por userId del vendedor y ya no por el tenant', () => {
    const fuente = modulo();
    expect(fuente).toMatch(/where:\s*\{\s*userId:\s*input\.agentId,\s*tenantId/);
    // El defecto original, en su forma de CÓDIGO (los comentarios que lo
    // narran no cuentan — este test también lo narra).
    expect(fuente).not.toMatch(/where:\s*\{\s*userId:\s*tenantId/);
  });

  it('el wrapper de skills propaga el userId como agentId hacia el módulo', () => {
    const fuente = readFileSync('lib/skills/index.ts', 'utf8');
    expect(fuente).toMatch(/agentId:\s*input\.userId/);
  });

  it('la ruta pasa agentId desde la sesión y llama al skill con la firma de objeto', () => {
    const fuente = readFileSync('app/api/ai/skill-handler/route.ts', 'utf8');
    expect(fuente).toMatch(/generate_customer_response\(\{/); // objeto, no posicional
    expect(fuente).toMatch(/agentId:\s*userId\s*\|\|\s*undefined/);
  });
});
