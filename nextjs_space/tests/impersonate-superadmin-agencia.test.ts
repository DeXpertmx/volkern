import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * «Inyectar Sesión» y la regla de agencia.
 *
 * Caso real (25 sep 2026): el Superadmin de la plataforma pulsaba «Inyectar
 * Sesión» en `/admin/saas/tenants` y recibía
 *
 *   403 { error: 'Este tenant no pertenece a tu agencia' }
 *
 * No era falta de permiso: la cuenta `admin@volkern.app` ES Superadmin. Lo que
 * pasaba es que su tenant (`volkern-admin`) está marcado como `accountType =
 * 'AGENCY'`, así que la cuenta cumplía también `isAgency`, y la restricción de
 * agencia —«solo puedes suplantar a tus hijos»— se aplicaba al Superadmin sin
 * excluirlo. Y como NINGÚN tenant tiene `parentId`, el tenant de plataforma
 * tiene cero hijos: el resultado era que el único rol que existe para suplantar
 * no podía suplantar a nadie, nunca, con ningún tenant del sistema.
 *
 * Estas pruebas fijan las dos direcciones, en POST y en GET (el banner de
 * suplantación lee el GET; si la regla se aplica ahí también, el POST puede
 * devolver 200 y el banner no aparecer jamás):
 *
 *   · Superadmin cuyo tenant es AGENCY  → puede suplantar un tenant que NO es hijo suyo
 *   · Cuenta de AGENCY sin ser Superadmin → sigue limitada a sus hijos (403)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  tenant: { findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

/** Cookie store en memoria, para poder mirar lo que la ruta escribe. */
const cookieStore = vi.hoisted(() => {
  const valores = new Map<string, { value: string }>();
  return {
    valores,
    get: vi.fn((name: string) => valores.get(name)),
    set: vi.fn((name: string, value: string) => {
      valores.set(name, { value });
    }),
    delete: vi.fn((name: string) => {
      valores.delete(name);
    }),
  };
});

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Map()),
  cookies: vi.fn(() => cookieStore),
}));

// ─── Imports (después de los mocks) ───────────────────────────────────────

import { getServerSession } from 'next-auth';
import { POST, GET } from '@/app/api/admin/impersonate/route';

const TENANT_PLATAFORMA = { id: 'tenant-plataforma', accountType: 'AGENCY' };
const TENANT_AJENO = { id: 'tenant-ajeno', nombre: 'Hotel Piloto', slug: 'hotel-piloto', parentId: null };

function sesionDe(roleName: string) {
  return { user: { id: 'u1', email: 'admin@volkern.app', roleName } };
}

function peticion(tenantId: string) {
  return new Request('https://volkern.app/api/admin/impersonate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, action: 'start' }),
  });
}

/**
 * El POST decide el rol leyendo la BD (no la sesión), así que el mock del
 * usuario tiene que traer `role.nombre`: sin él la ruta ve un usuario sin rol y
 * devuelve 403 por el camino equivocado, y la prueba mediría otra cosa.
 */
function usuarioDe(roleName: string) {
  return { id: 'u1', role: { nombre: roleName }, tenant: TENANT_PLATAFORMA };
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.valores.clear();
  // Por defecto: cuenta normal del tenant de plataforma, que es AGENCY.
  prismaMock.user.findUnique.mockResolvedValue(usuarioDe('Admin'));
  prismaMock.tenant.findUnique.mockResolvedValue(TENANT_AJENO);
});

// ─── POST ─────────────────────────────────────────────────────────────────

describe('POST /api/admin/impersonate', () => {
  it('el Superadmin cuyo tenant es AGENCY puede suplantar un tenant que no es su hijo', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sesionDe('Superadmin') as never);
    prismaMock.user.findUnique.mockResolvedValue(usuarioDe('Superadmin'));

    const res = await POST(peticion(TENANT_AJENO.id) as never);

    expect(res.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalledWith('volkern_impersonate_id', TENANT_AJENO.id, expect.anything());
  });

  it('una cuenta de AGENCY que no es Superadmin sigue limitada a sus hijos', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sesionDe('Admin') as never);

    const res = await POST(peticion(TENANT_AJENO.id) as never);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('no pertenece a tu agencia');
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('una cuenta de AGENCY sí puede suplantar a un hijo suyo', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sesionDe('Admin') as never);
    prismaMock.tenant.findUnique.mockResolvedValue({ ...TENANT_AJENO, parentId: TENANT_PLATAFORMA.id });

    const res = await POST(peticion(TENANT_AJENO.id) as never);

    expect(res.status).toBe(200);
  });

  it('sin sesión no se suplanta a nadie (401)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const res = await POST(peticion(TENANT_AJENO.id) as never);

    expect(res.status).toBe(401);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

// ─── GET (el banner) ──────────────────────────────────────────────────────

describe('GET /api/admin/impersonate', () => {
  it('el banner se muestra al Superadmin suplantando un tenant que no es su hijo', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sesionDe('Superadmin') as never);
    cookieStore.set('volkern_impersonate_id', TENANT_AJENO.id);

    const res = await GET();
    const body = await res.json();

    expect(body.active).toBe(true);
    expect(body.tenant?.slug).toBe('hotel-piloto');
  });

  it('una cuenta de AGENCY no ve el banner si el tenant no es su hijo', async () => {
    vi.mocked(getServerSession).mockResolvedValue(sesionDe('Admin') as never);
    cookieStore.set('volkern_impersonate_id', TENANT_AJENO.id);

    const res = await GET();

    expect((await res.json()).active).toBe(false);
  });
});
