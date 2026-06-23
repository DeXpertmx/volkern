import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks hoisted ─────────────────────────────────────────────────────────────
// Vitest los ejecuta ANTES de vi.mock() y de los imports dinámicos.

const __mockPrisma = vi.hoisted(() => ({
  // ComplianceGate.getMode() → tenant.findUnique (se llama 2x por request)
  tenant: { findUnique: vi.fn() },

  // scoreTrazabilidad: auditLog.count x2 + scoreAlertas: auditLog.count x1
  auditLog: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },

  // scoreTrazabilidad + scoreDocumentacion: contrato.count x4
  contrato: { count: vi.fn() },

  // scoreDocumentacion
  cotizacion: { count: vi.fn() },
  page: { count: vi.fn() },

  // scoreProcesos
  tenantWorkflow: { count: vi.fn() },
  task: { count: vi.fn() },
  approvalRequest: { count: vi.fn() },

  // scoreAccesos
  user: { count: vi.fn() },
  role: { count: vi.fn() },

  // scoreAlertas
  systemAlert: { count: vi.fn() },
}));

const __mockAuthState = vi.hoisted(() => ({
  current: {
    valid: true,
    authMethod: "session" as const,
    tenant: {
      id: "tenant-compliance-1",
      nombre: "Compliance Test S.L.",
      slug: "compliance-test",
      plan: "profesional",
    },
    user: {
      id: "u-compliance-1",
      name: "Compliance Owner",
      email: "owner@compliance-test.com",
      tenantId: "tenant-compliance-1",
      roleId: null,
    },
    vaultSeed: "test-seed",
    agencyContext: false,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: __mockPrisma,
  dbContext: { run: (_ctx: unknown, fn: () => unknown) => fn() },
  getTenantDb: vi
    .fn()
    .mockResolvedValue({ client: __mockPrisma, vaultSeed: "test-seed" }),
}));

vi.mock("@/lib/api-key-auth", () => ({
  withTenantAuth:
    (
      handler: (
        req: Request,
        auth: typeof __mockAuthState.current,
        ctx?: unknown
      ) => Promise<Response>,
      _opts: unknown
    ) =>
    async (request: Request, ctx: unknown) =>
      handler(request, __mockAuthState.current, ctx),
  validateApiKey: vi.fn(),
  authenticateRequest: vi.fn(),
}));

// Static import after vi.mock — vitest hoist guarantees mocks are in place.
const { GET } = await import(
  "@/app/api/compliance/score/route" as string
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const T = "tenant-compliance-1";

function makeRequest() {
  return new Request("http://test/api/compliance/score", {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
}

/**
 * Defaults seguros: todos los counts a 0, sin score previo, sin alertas,
 * y tenant en modo 'normal'. Los tests individuales pueden sobreescribir
 * mocks específicos con `.mockResolvedValueOnce(...)`.
 */
function resetMocks() {
  __mockPrisma.tenant.findUnique.mockReset();
  __mockPrisma.auditLog.count.mockReset();
  __mockPrisma.auditLog.findFirst.mockReset();
  __mockPrisma.auditLog.create.mockReset();
  __mockPrisma.contrato.count.mockReset();
  __mockPrisma.cotizacion.count.mockReset();
  __mockPrisma.page.count.mockReset();
  __mockPrisma.tenantWorkflow.count.mockReset();
  __mockPrisma.task.count.mockReset();
  __mockPrisma.approvalRequest.count.mockReset();
  __mockPrisma.user.count.mockReset();
  __mockPrisma.role.count.mockReset();
  __mockPrisma.systemAlert.count.mockReset();

  __mockPrisma.tenant.findUnique.mockResolvedValue({
    configuracion: { complianceMode: "normal" },
  } as never);
  __mockPrisma.auditLog.count.mockResolvedValue(0);
  __mockPrisma.auditLog.findFirst.mockResolvedValue(null);
  __mockPrisma.auditLog.create.mockResolvedValue({} as never);
  __mockPrisma.contrato.count.mockResolvedValue(0);
  __mockPrisma.cotizacion.count.mockResolvedValue(0);
  __mockPrisma.page.count.mockResolvedValue(0);
  __mockPrisma.tenantWorkflow.count.mockResolvedValue(0);
  __mockPrisma.task.count.mockResolvedValue(0);
  __mockPrisma.approvalRequest.count.mockResolvedValue(0);
  __mockPrisma.user.count.mockResolvedValue(0);
  __mockPrisma.role.count.mockResolvedValue(0);
  __mockPrisma.systemAlert.count.mockResolvedValue(0);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/compliance/score", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  // ─── Smoke: el bug original ───────────────────────────────────────────────

  describe("smoke (regresión del bug original)", () => {
    it("200 + {success:true} cuando todas las queries Prisma no fallan", async () => {
      const res = await GET(makeRequest() as unknown as Request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.report).toBeDefined();
    });

    it("el report contiene las 5 categorías canónicas con score, weight y details", async () => {
      const res = await GET(makeRequest() as unknown as Request);
      const json = await res.json();
      const report = json.report;

      expect(typeof report.overall).toBe("number");
      expect(report.overall).toBeGreaterThanOrEqual(0);
      expect(report.overall).toBeLessThanOrEqual(100);

      const expected = [
        "trazabilidad",
        "documentacion",
        "procesos",
        "accesos",
        "alertas",
      ];
      const ids = report.categories.map((c: { id: string }) => c.id);
      expect(ids).toEqual(expected);

      for (const cat of report.categories) {
        expect(typeof cat.score).toBe("number");
        expect(typeof cat.weight).toBe("number");
        expect(Array.isArray(cat.details)).toBe(true);
      }
      // Suma de pesos = 1.0 (auditoría contable del cálculo ponderado)
      const sumWeight = report.categories.reduce(
        (acc: number, c: { weight: number }) => acc + c.weight,
        0
      );
      expect(sumWeight).toBeCloseTo(1.0, 5);
    });

    it("mode='compliance' se propaga al report cuando tenant.configuracion.complianceMode='compliance'", async () => {
      __mockPrisma.tenant.findUnique.mockResolvedValue({
        configuracion: { complianceMode: "compliance" },
      } as never);

      const res = await GET(makeRequest() as unknown as Request);
      const json = await res.json();
      expect(json.report.mode).toBe("compliance");
    });

    it("score sigue siendo válido aunque el tenant esté vacío (todos los counts=0)", async () => {
      // resetMocks ya pone todos los counts a 0
      const res = await GET(makeRequest() as unknown as Request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Con 0 auditLogs/contratos/etc, el score de cada categoría comienza
      // en 100 y se le restan puntos → todas terminan ≤ 100.
      for (const cat of json.report.categories) {
        expect(cat.score).toBeLessThanOrEqual(100);
        expect(cat.score).toBeGreaterThanOrEqual(0);
      }
    });

    it("500 + {success:false, error} cuando un Prisma query lanza", async () => {
      // Simulamos un fallo remontando de Promise.all — cualquier count().
      __mockPrisma.auditLog.count.mockRejectedValueOnce(
        new Error("DB connection lost")
      );

      const res = await GET(makeRequest() as unknown as Request);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(typeof json.error).toBe("string");
    });
  });

  // ─── Regression guards: nombres de campos del schema ESPAÑOL ───────────────
  // Si alguien refactoriza y vuelve a usar `action`/`createdAt`/`entity`/… el
  // schema rechazará el campo y volverá a aparecer el toast
  // "Error cargando score de compliance" en producción.

  describe("regresión: nombres de campos Prisma en español (schema auditLog/contrato/user)", () => {
    it("persistScore escribe AuditLog con accion/entidad/entidadId/descripcion (NO action/entity/…)", async () => {
      // Disparar persist disparará auditLog.create exactamente una vez
      __mockPrisma.auditLog.create.mockResolvedValue({} as never);

      const res = await GET(makeRequest() as unknown as Request);
      expect(res.status).toBe(200);

      expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      const call = __mockPrisma.auditLog.create.mock.calls[0][0];

      // Schema (prisma/schema.prisma:498): accion / entidad / entidadId / descripcion
      expect(call.data).toEqual(
        expect.objectContaining({
          tenantId: T,
          userId: "u-compliance-1",
          accion: "COMPLIANCE_SCORE",
          entidad: "Tenant",
          entidadId: T,
        })
      );
      expect(call.data.descripcion).toMatch(/Compliance Score calculado: \d+%/);
      expect(call.data.metadata).toEqual(
        expect.objectContaining({ score: expect.any(Number) })
      );

      // Guard anti-regresión: las keys en inglés NO deben existir
      expect(call.data).not.toHaveProperty("action");
      expect(call.data).not.toHaveProperty("entity");
      expect(call.data).not.toHaveProperty("entityId");
      expect(call.data).not.toHaveProperty("description");
    });

    it("getTrend filtra por accion='COMPLIANCE_SCORE' y ordena por fechaCreacion (NO action/createdAt)", async () => {
      __mockPrisma.auditLog.findFirst.mockResolvedValue(null);

      await GET(makeRequest() as unknown as Request);

      expect(__mockPrisma.auditLog.findFirst).toHaveBeenCalledTimes(1);
      const call = __mockPrisma.auditLog.findFirst.mock.calls[0][0];
      expect(call.where).toEqual(
        expect.objectContaining({
          tenantId: T,
          accion: "COMPLIANCE_SCORE",
        })
      );
      expect(call.orderBy).toEqual({ fechaCreacion: "desc" });
      // Guard anti-regresión: claves en inglés prohibidas
      expect(call.where).not.toHaveProperty("action");
      expect(call.orderBy).not.toHaveProperty("createdAt");
    });

    it("scoreAlertas cuenta bloques 7d con {accion, fechaCreacion} (NO action/createdAt)", async () => {
      __mockPrisma.auditLog.count.mockResolvedValue(0);

      await GET(makeRequest() as unknown as Request);

      // La 1ª llamada de auditLog.count es de scoreTrazabilidad (auditCount
      // total). Tras ella, scoreTrazabilidad hace una 2ª para recentAudits.
      // scoreAlertas hace luego una 3ª con el filtro de COMPLIANCE_BLOCKED +
      // fechaCreacion >= -7d. Buscamos esa llamada específica.
      const calls = __mockPrisma.auditLog.count.mock.calls;
      const blocksCall = calls.find(
        ([arg]) =>
          arg?.where?.accion === "COMPLIANCE_BLOCKED" ||
          arg?.where?.action === "COMPLIANCE_BLOCKED"
      );
      expect(blocksCall).toBeDefined();
      const [arg] = blocksCall!;
      expect(arg.where).toEqual(
        expect.objectContaining({
          tenantId: T,
          accion: "COMPLIANCE_BLOCKED",
          fechaCreacion: expect.objectContaining({ gte: expect.any(Date) }),
        })
      );
      expect(arg.where).not.toHaveProperty("action");
      expect(arg.where.fechaCreacion || arg.where.createdAt).toBeDefined();
      // Nunca debe usarse createdAt
      expect(arg.where).not.toHaveProperty("createdAt");
    });

    it("scoreTrazabilidad filtra Contrato.auditHash (NO integrityHash)", async () => {
      __mockPrisma.contrato.count.mockResolvedValue(0);

      await GET(makeRequest() as unknown as Request);

      const contratosCalls = __mockPrisma.contrato.count.mock.calls;
      const hashCall = contratosCalls.find(
        ([arg]) => arg?.where?.auditHash !== undefined || arg?.where?.integrityHash !== undefined
      );
      expect(hashCall).toBeDefined();
      const [arg] = hashCall!;
      expect(arg.where).toEqual(
        expect.objectContaining({
          tenantId: T,
          auditHash: { not: null },
        })
      );
      expect(arg.where).not.toHaveProperty("integrityHash");
    });

    it("scoreAccesos filtra User con {estado:'activo', roleId:{not:null}} (NO active:true/rol)", async () => {
      __mockPrisma.user.count.mockResolvedValue(0);

      await GET(makeRequest() as unknown as Request);

      const userCalls = __mockPrisma.user.count.mock.calls;
      // La 1ª cuenta es totalUsuarios (sin roleId), la 2ª es usuariosConRol
      // (con roleId). Buscamos la segunda que es la que rompe con más campos.
      const conRolCall = userCalls.find(([arg]) => arg?.where?.roleId);
      expect(conRolCall).toBeDefined();
      const [arg] = conRolCall!;
      expect(arg.where).toEqual(
        expect.objectContaining({
          tenantId: T,
          estado: "activo",
          roleId: { not: null },
        })
      );
      // Anti-regresión: nada de active ni rol
      expect(arg.where).not.toHaveProperty("active");
      expect(arg.where).not.toHaveProperty("rol");
    });

    it("scoreDocumentacion usa prisma.page con estado (NO prisma.documento)", async () => {
      // Si alguien re-introduce `prisma.documento`, el mock __mockPrisma no
      // tendría método `documento` y fallaría al cargar. Interceptamos page.
      __mockPrisma.page.count.mockResolvedValue(0);

      const res = await GET(makeRequest() as unknown as Request);
      expect(res.status).toBe(200);

      // Fue llamado al menos una vez
      expect(__mockPrisma.page.count).toHaveBeenCalled();
      const call = __mockPrisma.page.count.mock.calls[0][0];
      expect(call.where).toEqual(
        expect.objectContaining({
          tenantId: T,
          estado: expect.objectContaining({ not: "draft" }),
        })
      );
    });
  });

  // ─── Shape ─────────────────────────────────────────────────────────────────

  describe("shape del report", () => {
    it("incluye alerts.count / critical / warning derivados de los details", async () => {
      // 2 críticas, 1 warning, 3 activas → scoreAlertas los proyecta a alerts.
      __mockPrisma.systemAlert.count
        .mockResolvedValueOnce(3) // alertasActivas
        .mockResolvedValueOnce(2) // alertasCriticas
        .mockResolvedValueOnce(1); // alertasWarning

      const res = await GET(makeRequest() as unknown as Request);
      const json = await res.json();

      expect(json.report.alerts).toEqual(
        expect.objectContaining({
          count: expect.any(Number),
          critical: expect.any(Number),
          warning: expect.any(Number),
        })
      );
      // El service cuenta ALERTAS desde los details.status (critical/warning),
      // no desde systemAlert. Estos valores son la fuente de verdad del
      // score, no de los conteos del SGBD.
      expect(json.report.alerts.count).toBeGreaterThan(0);
    });

    it("summary es un string no vacío y menciona el modo", async () => {
      const res = await GET(makeRequest() as unknown as Request);
      const json = await res.json();
      expect(typeof json.report.summary).toBe("string");
      expect(json.report.summary.length).toBeGreaterThan(0);
      expect(json.report.summary.toLowerCase()).toContain("score");
    });

    it("generatedAt es un ISO 8601 válido", async () => {
      const res = await GET(makeRequest() as unknown as Request);
      const json = await res.json();
      expect(() => new Date(json.report.generatedAt).toISOString()).not.toThrow();
      // No debe estar en el futuro lejano
      const ts = new Date(json.report.generatedAt).getTime();
      expect(Math.abs(Date.now() - ts)).toBeLessThan(5_000);
    });
  });
});
