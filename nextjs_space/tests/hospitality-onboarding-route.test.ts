// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  hospitalityProperty: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  connectivityProvider: { findUnique: vi.fn() },
  connectivityMapping: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  hospitalitySyncLog: { findMany: vi.fn(), create: vi.fn() },
  contact: { findFirst: vi.fn(), delete: vi.fn() },
  hospitalityReservation: { findFirst: vi.fn(), count: vi.fn(), delete: vi.fn() },
  hospitalityWebhookEvent: { deleteMany: vi.fn() },
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', async () => ({
  // La ruta comprueba permisos: se conserva el `hasPermission` real y solo se
  // sustituye la auditoría, que es lo que estas pruebas quieren aislar.
  ...(await vi.importActual<typeof import('@/lib/permissions')>('@/lib/permissions')),
  logAuditAction: mocks.logAuditAction
}));

const { GET } = await import('@/app/api/hospitality/onboarding/route');
const { POST: activar } = await import('@/app/api/hospitality/onboarding/activar/route');

const PROPIEDAD = {
  id: 'p1',
  nombre: 'Villa Mar Azul',
  codigo: 'VMA',
  ciudad: 'Playa del Carmen',
  pais: 'México',
  estado: 'activa',
  timezone: 'America/Cancun',
};

const UNIDAD_VINCULADA = {
  id: 'u1',
  nombre: 'Suite Oceano',
  codigo: 'SUI-101',
  tipo: 'apartamento',
  capacidad: 2,
  tarifaBase: null,
  moneda: 'MXN',
  estado: 'available',
  mappings: [
    { externalPropertyId: 'sandbox-pms', externalUnitCode: 'suite', externalRatePlanCode: 'suite-d-ep' },
  ],
  ratePlans: [{ id: 'rp1', codigo: 'suite-d-ep', tarifa: 3450 }],
};

function reqConBody(body: unknown, url = 'https://volkern.app/api/hospitality/onboarding') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({ valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } } });
  mocks.hospitalityProperty.findFirst.mockResolvedValue(PROPIEDAD);
  mocks.hospitalityProperty.findMany.mockResolvedValue([PROPIEDAD]);
  mocks.hospitalityProperty.update.mockResolvedValue({ ...PROPIEDAD, estado: 'conectada' });
  mocks.hospitalityUnit.findMany.mockResolvedValue([UNIDAD_VINCULADA]);
  mocks.connectivityProvider.findUnique.mockResolvedValue({
    providerKey: 'channel_connectivity',
    partnerIdEnc: 'x:y',
    usernameEnc: 'x:y',
    passwordEnc: 'x:y',
    estado: 'conectado',
  });
  mocks.connectivityMapping.findFirst.mockResolvedValue({ externalPropertyId: 'sandbox-pms' });
  // El código encadena .catch() a la auditoría: el mock debe ser una promesa.
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.hospitalitySyncLog.findMany.mockResolvedValue([
    { tipo: 'inventory', estado: 'exito' },
    { tipo: 'rates', estado: 'exito' },
    { tipo: 'reservacion_prueba', estado: 'exito' },
  ]);
});

describe('GET /api/hospitality/onboarding', () => {
  it('sin autenticación → 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'API key no proporcionada' });
    const res = await GET(new Request('https://volkern.app/api/hospitality/onboarding') as any);
    expect(res.status).toBe(401);
  });

  it('sin propertyId devuelve solo la lista de propiedades', async () => {
    const res = await GET(new Request('https://volkern.app/api/hospitality/onboarding') as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.onboarding).toBeNull();
    expect(body.propiedades).toHaveLength(1);
  });

  it('con todo cumplido: 10 pasos y activación disponible', async () => {
    const res = await GET(
      new Request('https://volkern.app/api/hospitality/onboarding?propertyId=p1') as any
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.onboarding.pasos).toHaveLength(10);
    expect(body.onboarding.puedeActivar.ok).toBe(true);
    expect(body.onboarding.hotelCode).toBe('sandbox-pms');
    expect(body.onboarding.unidadesVinculadas).toBe(1);
    expect(body.onboarding.pasos[9].estado).toBe('pendiente');
  });

  it('propiedad de otro tenant → 404', async () => {
    mocks.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await GET(
      new Request('https://volkern.app/api/hospitality/onboarding?propertyId=p9') as any
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/hospitality/onboarding/activar', () => {
  it('rechaza la activación si faltan requisitos y no toca la propiedad', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      { ...UNIDAD_VINCULADA, mappings: [], ratePlans: [], tarifaBase: null },
    ]);

    const res = await activar(reqConBody({ propertyId: 'p1' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.faltantes.length).toBeGreaterThan(0);
    expect(mocks.hospitalityProperty.update).not.toHaveBeenCalled();
  });

  it('activa la propiedad cuando todo está cumplido', async () => {
    const res = await activar(reqConBody({ propertyId: 'p1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.hospitalityProperty.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { estado: 'conectada' },
    });
  });

  it('si ya estaba conectada, no la vuelve a actualizar', async () => {
    mocks.hospitalityProperty.findFirst.mockResolvedValue({ ...PROPIEDAD, estado: 'conectada' });
    const res = await activar(reqConBody({ propertyId: 'p1' }));
    const body = await res.json();
    expect(body.yaConectada).toBe(true);
    expect(mocks.hospitalityProperty.update).not.toHaveBeenCalled();
  });
});
