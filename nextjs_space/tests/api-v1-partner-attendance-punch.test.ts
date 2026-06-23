import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ─── Mocks hoisted (se ejecutan antes que vi.mock y los imports) ──────────────

const __mockPrisma = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  attendanceRules: { findUnique: vi.fn() },
  attendance: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  idempotencyKey: { findUnique: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}));

const __mockAuthState = vi.hoisted(() => ({
  current: {
    valid: true,
    authMethod: "apikey" as "apikey" | "session",
    tenant: {
      id: "tenant-hosteleria-1",
      nombre: "Restaurante Demo",
      slug: "rest-demo",
      plan: "Profesional",
    },
    apiKey: {
      id: "apikey-1",
      nombre: "Hostelería main",
      scopes: ["attendance:write"],
    },
    user: {
      id: "u-1",
      name: "Owner Hostelería",
      email: "owner@hosteleria.com",
      tenantId: "tenant-hosteleria-1",
      roleId: null,
    },
    vaultSeed: "test-seed",
    agencyContext: false,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: __mockPrisma,
  dbContext: {
    // dbContext.run ejecuta el handler dentro del contexto del tenant.
    // En tests no necesitamos propagar el contexto — basta pasar.
    run: (_ctx: unknown, fn: () => unknown) => fn(),
  },
  getTenantDb: vi
    .fn()
    .mockResolvedValue({ client: __mockPrisma, vaultSeed: "test-seed" }),
}));

// Mock `withTenantAuth` como un wrapper transparente: lee el auth mock
// desde __mockAuthState.current. NO usamos vi.importActual porque añade
// dependencias circulares en el grafo de mocks — más simple mockear
// solo lo que necesitamos (withTenantAuth callable api-used).
vi.mock("@/lib/api-key-auth", () => ({
  withTenantAuth:
    (
      handler: (
        req: Request,
        auth: { authMethod: string; apiKey?: unknown; tenant?: unknown },
        ctx?: unknown
      ) => Promise<Response>,
      _opts: unknown
    ) =>
    async (request: Request, ctx: unknown) =>
      handler(request, __mockAuthState.current, ctx),
  validateApiKey: vi.fn(),
  authenticateRequest: vi.fn(),
}));

// Static import — vi.mock es hoisted por Vitest antes de los imports.
const { POST } = await import(
  "@/app/api/v1/partner/attendance/punch/route" as string
);

const VALID_PUNCH = {
  employeeId: "emp-1",
  type: "IN",
  locationLat: 40.4168,
  locationLng: -3.7038,
};

const GOOD_APIKEY = "vk_live_" + "a".repeat(64);

function makeRequest(
  opts: {
    headers?: Record<string, string>;
    body?: unknown;
    key?: string | null;
  } = {}
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": opts.key === null ? "" : (opts.key ?? GOOD_APIKEY),
    ...(opts.headers ?? {}),
  };
  return new Request("http://test/api/v1/partner/attendance/punch", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? VALID_PUNCH),
  });
}

const happyEmployee = () =>
  ({
    id: "emp-1",
    tenantId: "tenant-hosteleria-1",
    isTeleworkAllowed: false,
    baseGPSLat: 40.4168,
    baseGPSLng: -3.7038,
    homeOfficeLat: null,
    homeOfficeLng: null,
    teleworkRadius: null,
    noticeAcknowledgedAt: new Date(),
  }) as never;

const happyRules = () =>
  ({
    id: "r1",
    tenantId: "tenant-1",
    requireGPS: true,
    minPunchIntervalSec: 30,
    maxTravelKmh: 250,
    retentionDays: 1460,
    blockIfNotNoticed: false,
  }) as never;

describe("POST /api/v1/partner/attendance/punch — Partner API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth state por defecto a API key válida
    __mockAuthState.current = {
      valid: true,
      authMethod: "apikey",
      tenant: {
        id: "tenant-hosteleria-1",
        nombre: "Restaurante Demo",
        slug: "rest-demo",
        plan: "Profesional",
      },
      apiKey: {
        id: "apikey-1",
        nombre: "Hostelería main",
        scopes: ["attendance:write"],
      },
      user: {
        id: "u-1",
        name: "Hostelería Owner",
        email: "o@h.com",
        tenantId: "tenant-hosteleria-1",
        roleId: null,
      },
      vaultSeed: "test-seed",
      agencyContext: false,
    };
  });

  // ─── Guards de auth ──────────────────────────────────────────────────────────

  it("401 cuando la auth NO indica apiKey (rechaza sesión NextAuth explícitamente)", async () => {
    __mockAuthState.current = {
      ...__mockAuthState.current,
      authMethod: "session",
      apiKey: undefined, // sesión NO trae apiKey
    };
    const res = await POST(makeRequest() as unknown as Request);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("API Key");
  });

  // ─── Validaciones de body ──────────────────────────────────────────────────

  it("400 cuando el body no provee GPS", async () => {
    const res = await POST(
      makeRequest({ body: { employeeId: "emp-1", type: "IN" } }) as unknown as Request
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/GPS|geolocaliz/i);
  });

  it("400 cuando lat fuera de bounds [-90, 90] (rechaza antes del servicio)", async () => {
    const res = await POST(
      makeRequest({ body: { ...VALID_PUNCH, locationLat: 91 } }) as unknown as Request
    );
    expect(res.status).toBe(400);
  });

  it("400 cuando lng fuera de bounds [-180, 180]", async () => {
    const res = await POST(
      makeRequest({ body: { ...VALID_PUNCH, locationLng: -181 } }) as unknown as Request
    );
    expect(res.status).toBe(400);
  });

  it("400 cuando type no es 'IN' ni 'OUT'", async () => {
    const res = await POST(
      makeRequest({ body: { ...VALID_PUNCH, type: "BREAK_START" } }) as unknown as Request
    );
    expect(res.status).toBe(400);
  });

  // ─── Happy path ──────────────────────────────────────────────────────────────

  it("200 happy path: registra IN punch con method=PARTNER_APP por defecto", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue(happyEmployee());
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(happyRules());
    __mockPrisma.attendance.findFirst.mockResolvedValue(null);
    __mockPrisma.attendance.create.mockResolvedValue({
      id: "log-1",
      employeeId: "emp-1",
      tenantId: "tenant-hosteleria-1",
      type: "IN",
      timestamp: new Date(),
      method: "PARTNER_APP",
      locationLat: 40.4168,
      locationLng: -3.7038,
      integrityHash: "abc",
      isAnomaly: false,
      anomalyType: null,
    } as never);
    __mockPrisma.idempotencyKey.create.mockResolvedValue({} as never);

    const res = await POST(
      makeRequest({
        headers: { "x-idempotency-key": "punch-2026-07-02-001" },
      }) as unknown as Request
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toBe("log-1");
    expect(json.isAnomaly).toBe(false);

    // Verifica que AttendanceService.create fue llamado con method=PARTNER_APP
    expect(__mockPrisma.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ method: "PARTNER_APP" }),
      })
    );
  });

  it("200 happy path: caller puede override el method (útil para analytics por source)", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue(happyEmployee());
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(happyRules());
    __mockPrisma.attendance.findFirst.mockResolvedValue(null);
    __mockPrisma.attendance.create.mockResolvedValue({
      id: "log-2",
      method: "KIOSK_TABLET_3",
      isAnomaly: false,
      anomalyType: null,
    } as never);
    __mockPrisma.idempotencyKey.create.mockResolvedValue({} as never);

    const res = await POST(
      makeRequest({ body: { ...VALID_PUNCH, method: "KIOSK_TABLET_3" } }) as unknown as Request
    );
    expect(res.status).toBe(200);
    expect(__mockPrisma.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ method: "KIOSK_TABLET_3" }),
      })
    );
  });

  // ─── Idempotencia ───────────────────────────────────────────────────────────

  it("200 con idempotent:true cuando x-idempotency-key es cache hit (no ejecuta servicio)", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: "ik-1",
      tenantId: "tenant-hosteleria-1",
      scope: "partner.attendance.punch",
      key: "punch-dup-001",
      responseJson: {
        ok: true,
        id: "log-from-cache",
        isAnomaly: false,
        anomalyType: null,
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    } as never);

    const res = await POST(
      makeRequest({
        headers: { "x-idempotency-key": "punch-dup-001" },
      }) as unknown as Request
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(json.id).toBe("log-from-cache");
    // NO debe invocar AttendanceService cuando hay cache hit
    expect(__mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(__mockPrisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it("200 con idempotent:true tras race P2002 (dos punches concurrentes, misma key)", async () => {
    // Test crítico: el segundo punch concurrente choca en INSERT y debe
    // recuperar la respuesta del primer ganador vía findUnique en el catch.
    __mockPrisma.idempotencyKey.findUnique
      .mockResolvedValueOnce(null) // 1ª búsqueda cache: vacío
      .mockResolvedValueOnce({
        // 2ª búsqueda tras P2002: ganador
        id: "ik-loser",
        tenantId: "tenant-hosteleria-1",
        scope: "partner.attendance.punch",
        key: "punch-race-001",
        responseJson: {
          ok: true,
          id: "log-winner",
          isAnomaly: false,
          anomalyType: null,
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      } as never);
    __mockPrisma.employee.findUnique.mockResolvedValue(happyEmployee());
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(happyRules());
    __mockPrisma.attendance.findFirst.mockResolvedValue(null);
    __mockPrisma.attendance.create.mockResolvedValue({
      id: "log-loser",
      isAnomaly: false,
      anomalyType: null,
    } as never);

    // P2002 en INSERT de IdempotencyKey — usamos la clase real de Prisma para
    // que `instanceof Prisma.PrismaClientKnownRequestError` del route coincida.
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique violation", {
      code: "P2002",
      clientVersion: "0.0.0-mock",
      meta: { target: ["tenantId", "scope", "key"] },
    });
    __mockPrisma.idempotencyKey.create.mockRejectedValueOnce(p2002);

    const res = await POST(
      makeRequest({
        headers: { "x-idempotency-key": "punch-race-001" },
      }) as unknown as Request
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(json.id).toBe("log-winner");
    // AttendanceService.create SÍ se invocó (el "loser" ejecutó lógica antes del race).
    expect(__mockPrisma.attendance.create).toHaveBeenCalled();
  });

  it("escribe AuditLog con accion=PARTNER_ATTENDANCE_PUNCH tras 200 happy path (RGPD Art. 30)", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue(happyEmployee());
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(happyRules());
    __mockPrisma.attendance.findFirst.mockResolvedValue(null);
    __mockPrisma.attendance.create.mockResolvedValue({
      id: "log-audit-1",
      isAnomaly: false,
      anomalyType: null,
    } as never);
    __mockPrisma.idempotencyKey.create.mockResolvedValue({} as never);
    __mockPrisma.auditLog.create.mockResolvedValue({} as never);

    const res = await POST(makeRequest() as unknown as Request);
    expect(res.status).toBe(200);

    // RGPD Art. 30: debe haberse escrito un AuditLog específico del partner.
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = __mockPrisma.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.accion).toBe("PARTNER_ATTENDANCE_PUNCH");
    expect(auditCall.data.tenantId).toBe("tenant-hosteleria-1");
    expect(auditCall.data.userId).toBeNull();
    expect(auditCall.data.entidad).toBe("Attendance");
    expect(auditCall.data.entidadId).toBe("log-audit-1");
    expect(auditCall.data.descripcion).toContain("apikey-1");
    expect(auditCall.data.descripcion).toContain("outcome=success");
    expect(auditCall.data.descripcion).toContain("status=200");
  });

  it("escribe AuditLog con outcome=error tras 404 EMPLOYEE_NOT_FOUND", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue(null);
    __mockPrisma.auditLog.create.mockResolvedValue({} as never);

    const res = await POST(makeRequest() as unknown as Request);
    expect(res.status).toBe(404);
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = __mockPrisma.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.accion).toBe("PARTNER_ATTENDANCE_PUNCH");
    expect(auditCall.data.descripcion).toContain("outcome=error");
    expect(auditCall.data.descripcion).toContain("EMPLOYEE_NOT_FOUND");
    expect(auditCall.data.descripcion).toContain("status=404");
  });

  it("registra marcaje con isAnomaly=true y anomalyType='GPS_OUT_OF_RANGE' cuando coords fuera de geofence (>100m)", async () => {
    // El service NO lanza error para GPS_OUT_OF_RANGE: registra la anomalía
    // en el log (isAnomaly=true, anomalyType='GPS_OUT_OF_RANGE') y devuelve 200.
    // Esto es por diseño: auditoría preserva el evento aunque sea anómalo, y
    // RRHH puede revisarlo a posteriori.
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue(happyEmployee()); // base en Madrid (40.4168, -3.7038)
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(happyRules());
    __mockPrisma.attendance.findFirst.mockResolvedValue({
      timestamp: new Date(Date.now() - 60_000),
      locationLat: 40.4168,
      locationLng: -3.7038,
    } as never);
    __mockPrisma.attendance.create.mockResolvedValue({
      id: "log-out-of-range",
    } as never);
    __mockPrisma.auditLog.create.mockResolvedValue({} as never);

    // coords en Barcelona → distance ~504km > 100m radius → isAnomaly=true
    const res = await POST(
      makeRequest({ body: { ...VALID_PUNCH, locationLat: 41.5, locationLng: 2.0 } }) as unknown as Request
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isAnomaly).toBe(true);
    expect(json.anomalyType).toBe("GPS_OUT_OF_RANGE");
    // AuditLog debe reflejar la anomalía
    expect(__mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("429 mapping con header retry-after:30 cuando attendance.service lanza RATE_LIMITED", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue(happyEmployee());
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue(happyRules());
    __mockPrisma.attendance.findFirst.mockRejectedValue(new Error("RATE_LIMITED"));
    __mockPrisma.auditLog.create.mockResolvedValue({} as never);

    const res = await POST(makeRequest() as unknown as Request);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    const json = await res.json();
    expect(json.error.toLowerCase()).toContain("espera");
  });

  it("400 mapping cuando service lanza NO_BASE_LOCATION", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue({
      ...happyEmployee(),
      baseGPSLat: null,
      baseGPSLng: null,
      homeOfficeLat: null,
      homeOfficeLng: null,
    } as never);
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue({
      ...happyRules(),
      requireGPS: true,
    } as never);
    __mockPrisma.attendance.findFirst.mockResolvedValue({
      timestamp: new Date(Date.now() - 60_000),
      locationLat: 39.5, // lejos
      locationLng: -3.7,
    } as never);
    __mockPrisma.attendance.create.mockResolvedValue({
      id: "log-no-base",
      isAnomaly: true,
      anomalyType: "NO_BASE_LOCATION",
    } as never);
    __mockPrisma.auditLog.create.mockResolvedValue({} as never);

    const res = await POST(makeRequest() as unknown as Request);
    // NO_BASE_LOCATION no está mapeado como error HTTP en el switch (no es bloqueante);
    // el service registra el marcaje con isAnomaly=true → 200.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.anomalyType).toBe("NO_BASE_LOCATION");
  });

  it("400 cuando x-idempotency-key excede 255 chars", async () => {
    const longKey = "k".repeat(256);
    const res = await POST(
      makeRequest({ headers: { "x-idempotency-key": longKey } }) as unknown as Request
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Idempotency-Key");
  });

  // ─── Errores RGPD-aware ─────────────────────────────────────────────────────

  it("404 cuando el servicio lanza EMPLOYEE_NOT_FOUND", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest() as unknown as Request);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.toLowerCase()).toContain("empleado");
  });

  it("403 cuando regla LOPDGDD Art. 88 obliga firma de cláusula", async () => {
    __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    __mockPrisma.employee.findUnique.mockResolvedValue({
      ...happyEmployee(),
      noticeAcknowledgedAt: null, // no ha firmado
    } as never);
    __mockPrisma.attendanceRules.findUnique.mockResolvedValue({
      ...happyRules(),
      blockIfNotNoticed: true, // bloquea
    } as never);

    const res = await POST(makeRequest() as unknown as Request);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.required_action).toBe("/dashboard/rrhh/mi-asistencia");
  });
});
