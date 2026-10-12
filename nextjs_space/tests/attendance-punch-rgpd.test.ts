import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted: se evalúan antes de `vi.mock`)
// ────────────────────────────────────────────────────────────────────────────────

const __mockPrisma = vi.hoisted(() => {
  const m: Record<string, any> = {
    employee: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    attendanceRules: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    attendance: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    idempotencyKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  m.$transaction = vi.fn((cb: any) => cb(m));
  return m;
});

vi.mock('@/lib/db', () => ({
  prisma: __mockPrisma,
}));

vi.mock('@/lib/api-key-auth', () => {
  // Para el test idempotency replay necesitamos invocar el inner handler con un
  // auth mockeado. Usamos el mismo pattern que reconciliation.test.ts.
  return {
    withTenantAuth: (handler: any) => async (request: Request) => {
      const auth = {
        user: {
          id: 'user-1',
          accountType: 'BUSINESS',
          email: 'emp@volkern.app',
          role: { nombre: 'OPERATOR' },
        },
        tenant: { id: 'tenant-rgpd-test', nombre: 'Tenant RGPD Test' },
      };
      return handler(request, auth, {});
    },
  };
});

vi.mock('@/lib/validation', () => ({
  validateBody: (schema: any, raw: any) => raw, // passthrough para tests
}));

// ────────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────────

// Madrid ↔ Tokyo: ~9.700 km en línea recta → velocidad inverosímil (>250 km/h).
const MADRID = { lat: 40.4168, lng: -3.7038 };
const TOKYO = { lat: 35.6762, lng: 139.6503 };

const FIXED_NOW = new Date('2026-07-15T08:00:00.000Z');

function buildEmployee(overrides: Record<string, any> = {}) {
  return {
    id: 'emp-rgpd-1',
    tenantId: 'tenant-rgpd-test',
    fullName: 'Ana García Test',
    email: 'ana@tenant.test',
    isActive: true,
    baseGPSLat: MADRID.lat,
    baseGPSLng: MADRID.lng,
    homeOfficeLat: null,
    homeOfficeLng: null,
    isTeleworkAllowed: false,
    teleworkRadius: 100,
    noticeAcknowledgedAt: FIXED_NOW,
    noticeVersionAccepted: 'v2-2026-vps',
    acceptedPolicies: ['v2-2026-vps'],
    ...overrides,
  };
}

function buildRules(overrides: Record<string, any> = {}) {
  return {
    tenantId: 'tenant-rgpd-test',
    requireGPS: true,
    gracePeriodMinutes: 3,
    antiSpoofingLevel: 'HIGH',
    minPunchIntervalSec: 30,
    maxTravelKmh: 250,
    retentionDays: 1460,
    noticeVersion: 'v2-2026-vps',
    blockIfNotNoticed: false,
    ...overrides,
  };
}

function buildPreviousPunch(overrides: Record<string, any> = {}) {
  return {
    id: 'att-prev-1',
    employeeId: 'emp-rgpd-1',
    tenantId: 'tenant-rgpd-test',
    type: 'IN',
    timestamp: new Date(FIXED_NOW.getTime() - 60_000), // hace 60 s
    method: 'WEB',
    locationLat: MADRID.lat,
    locationLng: MADRID.lng,
    integrityHash: crypto
      .createHmac(
        'sha256',
        process.env.ATTENDANCE_INTEGRITY_SECRET || 'v0lkern_attendance_secure_v2',
      )
      .update(`emp-rgpd-1|${new Date(FIXED_NOW.getTime() - 60_000).toISOString()}|IN|tenant-rgpd-test`)
      .digest('hex'),
    isAnomaly: false,
    anomalyType: null,
    ...overrides,
  };
}

// Helper: asegura que `promise` rechaza con un Error cuyo `.code` o `.message`
// contiene `code`. Soporta los 2 shapes conocidos del service:
//   • plain Error: throw new Error('CODE: msg')    → matchea por .message
//   • Error con .code: h = err.code ?? err.message  → matchea por .code
// Un cambio en el shape del throw no rompe este matcher.
async function expectRejectionContaining(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  const identifier = String(
    (err as any)?.code ?? (err as Error)?.message ?? err,
  );
  expect(identifier).toContain(code);
}

// Helper: construye el Request que consume el POST handler.
function buildPostRequest(body: any, idempotencyKey?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': 'test-api-key',
  };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  return new Request('https://volkern.app/api/erp/attendance/punch', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// TESTS — servicio: 3 críticos RGPD
// Cobertura:
//   • RGPD Art. 5.1.c (minimización)        → rate-limit
//   • RGPD Art. 5.1.d (exactitud)           → impossible-travel flag
//   • LOPDGDD Art. 88 (deber de información) → notice not acknowledged
// ────────────────────────────────────────────────────────────────────────────────

describe('RGPD/LOPDGDD — AttendanceService.registerPunch compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults seguros para métodos Prisma que esta suite no cubre explícitamente.
    // Si el service invoca algo que no está mockeado por test, evita TypeError silencioso.
    __mockPrisma.attendance.update.mockResolvedValue({});
    __mockPrisma.attendance.findMany.mockResolvedValue([]);
    __mockPrisma.idempotencyKey.create.mockResolvedValue({});
    // Congelamos tiempo para reproducibilidad. El service usa `new Date()`.
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── RGPD Art. 5.1.c + 5.1.a · Rate-limit (RGPD: minimización + anti-brute-force)
  it('RGPD Art. 5.1.c — lanza RATE_LIMITED cuando el último marcaje está dentro de minPunchIntervalSec', async () => {
    __mockPrisma.employee.findUnique.mockResolvedValue(buildEmployee() as any);
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(buildRules({
      minPunchIntervalSec: 30, // 30 s de cooldown
    }) as any);
    // Marcaje previo hace 5 segundos (< 30 s).
    __mockPrisma.attendance.findFirst.mockResolvedValue(
      buildPreviousPunch({
        timestamp: new Date(FIXED_NOW.getTime() - 5_000),
      }) as any,
    );
    __mockPrisma.attendance.create.mockResolvedValue({} as any);

    const { AttendanceService } = await import('@/lib/erp/attendance-service');

    await expectRejectionContaining(
      AttendanceService.registerPunch({
        employeeId: 'emp-rgpd-1',
        tenantId: 'tenant-rgpd-test',
        type: 'IN',
        method: 'WEB',
        locationLat: MADRID.lat,
        locationLng: MADRID.lng,
      }),
      'RATE_LIMITED',
    );

    // Anti-spam: NO debe persistir ni saltar a geofencing/impossible travel.
    expect(__mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  // ── RGPD Art. 5.1.d · Impossible Travel (RGPD: integridad + exactitud)
  it('RGPD Art. 5.1.d — marca isAnomaly=true con anomalyType GPS_IMPLAUSIBLE_XKMH cuando velocidad > maxTravelKmh', async () => {
    __mockPrisma.employee.findUnique.mockResolvedValue(buildEmployee() as any);
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(buildRules({
      // Ajustamos maxTravelKmh a 200 para que Madrid→Tokyo en 5 min
      // (~117.000 km/h) supere el threshold claramente sin ambigüedad.
      maxTravelKmh: 200,
      gracePeriodMinutes: 3,
    }) as any);
    // Primer marcaje en TOKYO hace 5 min, segundo (actual) en MADRID:
    // distancia Haversine ~9.700 km / 0,083 h ≈ 117.000 km/h.
    __mockPrisma.attendance.findFirst.mockResolvedValue(
      buildPreviousPunch({
        locationLat: TOKYO.lat,
        locationLng: TOKYO.lng,
        timestamp: new Date(FIXED_NOW.getTime() - 5 * 60_000),
      }) as any,
    );

    // Capturamos el body del create para verificar isAnomaly y anomalyType.
    const createSpy = vi.fn().mockImplementation((args: any) => ({
      id: 'att-new-rgpd',
      ...args.data,
      createdAt: new Date(),
    }));
    __mockPrisma.attendance.create.mockImplementation(createSpy);

    const { AttendanceService } = await import('@/lib/erp/attendance-service');

    const result = await AttendanceService.registerPunch({
      employeeId: 'emp-rgpd-1',
      tenantId: 'tenant-rgpd-test',
      type: 'IN',
      method: 'WEB',
      locationLat: MADRID.lat,
      locationLng: MADRID.lng,
    });

    expect(result.ok).toBe(true);
    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyType).toMatch(/^GPS_IMPLAUSIBLE_\d+KMH$/);

    // Verificamos que se persistió con flag de anomalía.
    const persisted = createSpy.mock.calls[0]?.[0]?.data;
    expect(persisted).toMatchObject({
      employeeId: 'emp-rgpd-1',
      tenantId: 'tenant-rgpd-test',
      isAnomaly: true,
      type: 'IN',
    });
    expect(persisted.anomalyType).toMatch(/^GPS_IMPLAUSIBLE_\d+KMH$/);
    // El marcaje NO se bloquea — sólo se flaggea (Art. 22 RGPD: revisión humana).
    expect(persisted.integrityHash).toBeDefined();
  });

  // ── LOPDGDD Art. 88 · Notice not acknowledged (deber de información prévia)
  it('LOPDGDD Art. 88 — lanza NOTICE_NOT_ACKNOWLEDGED cuando blockIfNotNoticed=true y noticeAcknowledgedAt=null', async () => {
    __mockPrisma.employee.findUnique.mockResolvedValue(
      buildEmployee({
        // Empleado creado pero SIN firmar la cláusula informativa LOPDGDD.
        noticeAcknowledgedAt: null,
        noticeVersionAccepted: null,
        acceptedPolicies: [],
      }) as any,
    );
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(
      buildRules({
        blockIfNotNoticed: true, // tenant obliga firmado antes de marcar
      }) as any,
    );
    __mockPrisma.attendance.findFirst.mockResolvedValue(null); // sin marcaje previo
    __mockPrisma.attendance.create.mockResolvedValue({} as any);

    const { AttendanceService } = await import('@/lib/erp/attendance-service');

    await expectRejectionContaining(
      AttendanceService.registerPunch({
        employeeId: 'emp-rgpd-1',
        tenantId: 'tenant-rgpd-test',
        type: 'IN',
        method: 'WEB',
        locationLat: MADRID.lat,
        locationLng: MADRID.lng,
      }),
      'NOTICE_NOT_ACKNOWLEDGED',
    );

    // Anti-bypass: NO debe persistir ni siquiera llegar a geofencing.
    expect(__mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  // ── BONUS · Smoke / happy path
  it('happy path: punch válido se persiste con HMAC integrity y sin flags de anomalía', async () => {
    __mockPrisma.employee.findUnique.mockResolvedValue(buildEmployee() as any);
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(buildRules() as any);
    __mockPrisma.attendance.findFirst.mockResolvedValue(
      buildPreviousPunch({
        timestamp: new Date(FIXED_NOW.getTime() - 60_000), // > 30 s de cooldown
      }) as any,
    );

    const expectedHash = crypto
      .createHmac(
        'sha256',
        process.env.ATTENDANCE_INTEGRITY_SECRET || 'v0lkern_attendance_secure_v2',
      )
      .update(`emp-rgpd-1|${FIXED_NOW.toISOString()}|IN|tenant-rgpd-test`)
      .digest('hex');

    const createSpy = vi.fn().mockImplementation((args: any) => ({
      id: 'att-happy-1',
      ...args.data,
    }));
    __mockPrisma.attendance.create.mockImplementation(createSpy);

    const { AttendanceService } = await import('@/lib/erp/attendance-service');

    const result = await AttendanceService.registerPunch({
      employeeId: 'emp-rgpd-1',
      tenantId: 'tenant-rgpd-test',
      type: 'IN',
      method: 'WEB',
      locationLat: MADRID.lat,
      locationLng: MADRID.lng,
    });

    expect(result.ok).toBe(true);
    expect(result.isAnomaly).toBe(false);
    expect(result.anomalyType).toBeNull();
    expect(createSpy).toHaveBeenCalledTimes(1);
    const persisted = createSpy.mock.calls[0][0].data;
    expect(persisted.integrityHash).toBe(expectedHash);
    expect(persisted.locationLat).toBe(MADRID.lat);
    expect(persisted.locationLng).toBe(MADRID.lng);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// TESTS — route handler: Idempotency-Key replay safety (RGPD: minimización de
// datos duplicados, defensa contra reintentos de red)
// ────────────────────────────────────────────────────────────────────────────────

describe('RGPD: minimización — POST /api/erp/attendance/punch Idempotency-Key replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults seguros
    __mockPrisma.employee.findUnique.mockResolvedValue(buildEmployee() as any);
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(buildRules() as any);
    __mockPrisma.attendance.findFirst.mockResolvedValue(null);
    __mockPrisma.attendance.update.mockResolvedValue({});
    __mockPrisma.attendance.findMany.mockResolvedValue([]);
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cache hit: reintento con mismo x-idempotency-key devuelve respuesta cacheada sin ejecutar servicio', async () => {
    const cachedResponse = {
      ok: true,
      id: 'att-cached-1',
      isAnomaly: false,
      anomalyType: null,
      message: 'Marcaje Entrada registrado con éxito.',
    };

    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      tenantId: 'tenant-rgpd-test',
      scope: 'attendance.punch',
      key: 'idem-test-123',
      responseJson: cachedResponse,
      createdAt: new Date(),
      expiresAt: new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000),
    } as any);

    const { POST } = await import('@/app/api/erp/attendance/punch/route');

    const req = buildPostRequest(
      {
        employeeId: 'emp-rgpd-1',
        type: 'IN',
        locationLat: MADRID.lat,
        locationLng: MADRID.lng,
      },
      'idem-test-123',
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      id: 'att-cached-1',
      idempotent: true,
      message: cachedResponse.message,
    });

    // Sanity: el servicio NO se ejecutó (evita doble-marcaje).
    expect(__mockPrisma.idempotencyKey.create).not.toHaveBeenCalled();
    expect(__mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  it('cache miss: primera ejecución persiste marcaje e indexa la IdempotencyKey con TTL 24h', async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);

    __mockPrisma.attendance.create.mockImplementation((args: any) => ({
      id: 'att-fresh-1',
      ...args.data,
    }));

    const { POST } = await import('@/app/api/erp/attendance/punch/route');

    const req = buildPostRequest(
      {
        employeeId: 'emp-rgpd-1',
        type: 'IN',
        locationLat: MADRID.lat,
        locationLng: MADRID.lng,
      },
      'idem-fresh-1',
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toBe('att-fresh-1');
    expect(json.idempotent).toBeUndefined(); // sólo true en cache hit

    // Verificamos que se indexó la clave con el response completo y TTL 24h.
    expect(__mockPrisma.idempotencyKey.create).toHaveBeenCalledTimes(1);
    const cachedArgs = __mockPrisma.idempotencyKey.create.mock.calls[0][0];
    expect(cachedArgs.data).toMatchObject({
      tenantId: 'tenant-rgpd-test',
      scope: 'attendance.punch',
      key: 'idem-fresh-1',
      responseJson: { ok: true, id: 'att-fresh-1' },
    });
    expect(cachedArgs.data.expiresAt).toBeInstanceOf(Date);
  });

  // ── Test crítico RGPD (de regresión):
  // dos requests consecutivos con el MISMO x-idempotency-key:
  //   • request#1: cache miss → attendance.create + idempotencyKey.create
  //   • request#2: cache hit  → respuesta cacheada, NO re-marcaje
  // ASERCIÓN CRÍTICA: prisma.attendance.create debe ejecutarse EXACTAMENTE 1 vez.
  it('ciclo completo miss→hit: prisma.attendance.create llamado EXACTAMENTE UNA vez entre 2 requests', async () => {
    // PETICIÓN #1: cache miss
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValueOnce(null);
    __mockPrisma.attendance.create.mockImplementationOnce((args: any) => ({
      id: 'att-cycle-1',
      ...args.data,
    }));
    __mockPrisma.idempotencyKey.create.mockResolvedValueOnce({} as any);

    const { POST } = await import('@/app/api/erp/attendance/punch/route');

    const body = {
      employeeId: 'emp-rgpd-1',
      type: 'IN',
      locationLat: MADRID.lat,
      locationLng: MADRID.lng,
    };
    const key = 'idem-cycle-regression';

    // ── REQUEST #1 (miss)
    const req1 = buildPostRequest(body, key);
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.id).toBe('att-cycle-1');
    expect(json1.idempotent).toBeUndefined();

    // PETICIÓN #2: cache hit (devolvemos la misma fila cacheada que la route
    // habría persistido al final del request#1)
    const cachedResponseFromRequest1 = {
      ok: true,
      id: 'att-cycle-1',
      isAnomaly: false,
      anomalyType: null,
      message: 'Marcaje Entrada registrado con éxito.',
    };
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValueOnce({
      tenantId: 'tenant-rgpd-test',
      scope: 'attendance.punch',
      key,
      responseJson: cachedResponseFromRequest1,
      createdAt: FIXED_NOW,
      expiresAt: new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000),
    } as any);

    // ── REQUEST #2 (hit): la route NO debe invocar registerPunch
    const req2 = buildPostRequest(body, key);
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2).toMatchObject({
      ok: true,
      id: 'att-cycle-1',
      idempotent: true,
    });

    // ── ASERCIONES CRÍTICAS (anti-regresión):
    // 1) Marcaje persistido EXACTAMENTE una vez entre los 2 requests.
    expect(__mockPrisma.attendance.create).toHaveBeenCalledTimes(1);

    // 2) IdempotencyKey.findUnique llamado 2 veces (1 por request — política estándar).
    expect(__mockPrisma.idempotencyKey.findUnique).toHaveBeenCalledTimes(2);

    // 3) IdempotencyKey.create llamado 1 vez (sólo en el miss).
    expect(__mockPrisma.idempotencyKey.create).toHaveBeenCalledTimes(1);

    // 4) employee.findUnique sólo se invoca en el request#1 (cache hit no entra al handler).
    expect(__mockPrisma.employee.findUnique).toHaveBeenCalledTimes(1);
  });
});
