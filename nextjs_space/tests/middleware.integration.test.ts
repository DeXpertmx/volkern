import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks de módulos externos del middleware ─────────────────────────
// getToken: sin sesión por defecto (verifica redirect a login)
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(async () => null),
}));

// Rate limiters: no queremos red/Upstash en el test
vi.mock('@/lib/rate-limit/upstash-edge-rate-limit', () => ({
  checkPartnerRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 100,
    limit: 100,
    resetAt: Date.now() + 60_000,
  })),
}));

vi.mock('@/lib/edge-rate-limiter', () => ({
  checkEdgeRateLimit: vi.fn(() => ({
    allowed: true,
    remaining: 30,
    limit: 30,
    resetAt: Date.now() + 60_000,
  })),
}));

// El middleware real (con resolveLegacyRedirect real, sin mock)
import { middleware } from '@/middleware';
import { getToken } from 'next-auth/jwt';

const BASE = 'https://volkern.app';

function makeRequest(
  path: string,
  opts: { host?: string; method?: string; origin?: string; xApiKey?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    host: opts.host ?? 'volkern.app',
  };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.xApiKey) headers['x-api-key'] = opts.xApiKey;
  return new NextRequest(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
  });
}

beforeEach(() => {
  process.env.NEXTAUTH_URL = BASE;
  vi.mocked(getToken).mockResolvedValue(null);
});

describe('middleware — redirects legacy (308 + CORS + requestId + Location absoluta)', () => {
  it('dashboard legacy: 308 con Location absoluta, CORS y requestId', async () => {
    const res = await middleware(makeRequest('/empresa-de-prueba/dashboard/finanzas/proveedores'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${BASE}/dashboard/finanzas/proveedores`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('x-request-id')).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
  });

  it('dashboard legacy con sub-ruta: preserva el resto del path', async () => {
    const res = await middleware(makeRequest('/empresa/dashboard/pipeline'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${BASE}/dashboard/pipeline`);
  });

  it('sección legacy: /{slug}/academy/dashboard → /academy/dashboard', async () => {
    const res = await middleware(makeRequest('/empresa/academy/dashboard'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${BASE}/academy/dashboard`);
  });

  it('sección legacy: /{slug}/tarjeta/abc → /tarjeta/abc', async () => {
    const res = await middleware(makeRequest('/empresa/tarjeta/abc'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${BASE}/tarjeta/abc`);
  });

  it('pageSlug legacy: /{slug}/{page} → /p/{slug}/{page}', async () => {
    const res = await middleware(makeRequest('/empresa-de-prueba/mi-pagina'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${BASE}/p/empresa-de-prueba/mi-pagina`);
  });

  it('mapeo LEGACY_PARENT: /{slug}/dashboard/equality → /dashboard/perfil', async () => {
    const res = await middleware(makeRequest('/empresa/dashboard/equality'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${BASE}/dashboard/perfil`);
  });

  it('refleja el origin de CORS cuando viene en la petición', async () => {
    const res = await middleware(
      makeRequest('/empresa/dashboard/pipeline', { origin: 'http://192.168.0.22:3000' })
    );

    expect(res.status).toBe(308);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://192.168.0.22:3000');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });
});

describe('middleware — rutas canónicas pasan (sin redirección)', () => {
  it('no redirige /academy/dashboard (canónica real)', async () => {
    const res = await middleware(makeRequest('/academy/dashboard'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('no redirige /soluciones/marketing (pública)', async () => {
    const res = await middleware(makeRequest('/soluciones/marketing'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('/admin/marketing exige auth (no es redirect legacy, sino login)', async () => {
    const res = await middleware(makeRequest('/admin/marketing'));

    // El bug original era que redirigía a /marketing; ahora no toca la ruta
    // legacy pero /admin/* exige sesión → redirect a login (307)
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/login');
    expect(res.headers.get('location')).not.toContain('/marketing');
  });

  it('no redirige /tarjeta/{id}, /booking/{slug} ni /p/{slug}/{page}', async () => {
    for (const p of ['/tarjeta/abc123', '/booking/xyz', '/p/empresa/propiedades']) {
      const res = await middleware(makeRequest(p));
      expect(res.status, p).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('el check-in del huésped es público: su credencial es el token, no una sesión', async () => {
    // Sin esto, el enlace que recibe el huésped acaba en /auth/login y los
    // documentos del registro de viajeros no se recogen nunca.
    const res = await middleware(makeRequest('/checkin/TOKEN-abc123'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('añade requestId y CORS también en respuestas que pasan', async () => {
    const res = await middleware(makeRequest('/tarjeta/abc123'));

    expect(res.headers.get('x-request-id')).toMatch(/^req_/);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('middleware — preflight OPTIONS', () => {
  it('responde 200 JSON con cabeceras CORS completas', async () => {
    const res = await middleware(makeRequest('/dashboard', { method: 'OPTIONS', origin: 'https://app.example.com' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('X-API-Key');
  });
});

describe('middleware — auth en /dashboard', () => {
  it('sin sesión: redirige a /auth/login con callbackUrl', async () => {
    const res = await middleware(makeRequest('/dashboard'));

    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location.startsWith(`${BASE}/auth/login?callbackUrl=`)).toBe(true);
  });

  it('sin sesión en subdominio de tenant: redirige al login del MISMO subdominio conservando callbackUrl', async () => {
    const res = await middleware(makeRequest('/dashboard', { host: 'dexpert.volkern.app' }));

    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location.startsWith('https://dexpert.volkern.app/auth/login?callbackUrl=')).toBe(true);
    expect(location).toContain('callbackUrl=%2Fdashboard');
  });

  it('sin sesión con Host header desconocido: cae al apex canónico (anti Host-header injection)', async () => {
    const res = await middleware(makeRequest('/dashboard', { host: 'evil.example.com' }));

    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location.startsWith(`${BASE}/auth/login?callbackUrl=`)).toBe(true);
  });

  it('sin sesión con host interno (0.0.0.0): cae al apex canónico', async () => {
    const res = await middleware(makeRequest('/dashboard', { host: '0.0.0.0:3000' }));

    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location.startsWith(`${BASE}/auth/login?callbackUrl=`)).toBe(true);
  });

  it('con sesión: deja pasar a /dashboard', async () => {
    vi.mocked(getToken).mockResolvedValueOnce({ name: 'Test', email: 't@v.app' } as never);

    const res = await middleware(makeRequest('/dashboard'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('middleware — subdominio en raíz', () => {
  it('marca x-tenant-subdomain en la raíz de un subdominio', async () => {
    const res = await middleware(makeRequest('/', { host: 'empresa.volkern.app' }));

    expect(res.headers.get('x-tenant-subdomain')).toBe('empresa');
  });
});
