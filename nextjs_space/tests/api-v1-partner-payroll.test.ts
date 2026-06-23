/**
 * Vitest — Volkern Partner API · Phase 2 payroll run + AEAT submission.
 *
 * Cubre:
 *   - POST /api/v1/partner/payroll/run — happy path multi-empleado.
 *   - POST idempotency cache hit (partner.payroll.run scope).
 *   - POST 401 cuando llega por sesión NextAuth.
 *   - POST 400 cuando x-idempotency-key >255 chars.
 *   - POST 400 cuando body Zod falla (period inválido).
 *   - POST 400 cuando hay externalEmployeeId duplicados.
 *   - POST 404 cuando algún externalEmployeeId no existe en el tenant.
 *   - POST 409 cuando ya hay un run SELLADO para (tenant, period).
 *   - POST firma cada PayrollRecordES via PayrollSealer (auditHash/chainedHash).
 *   - POST enví­a a AEAT via shipNominaToAEAT y actualiza fiscalStatus.
 *   - GET receipts: salarios cifrados NO aparecen; totales sí.
 *   - GET aeat-status: distribution AEAT PENDING|SIGNED coherente.
 *   - AuditLog: cada llamada escribe con accion PARTNER_PAYROLL_*.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks hoisted ──────────────────────────────────────────────────────────
// Wrap en `vi.hoisted` para que el factory de `vi.mock("@/lib/db", ...)`
// pueda resolver `__mockPrisma` cuando Vitest eleva los mocks al top del
// archivo. Sin el hoist, vitest resuelve el factory antes de que el let
// exista y los mocks prisma NO se aplican.
const __mockPrisma = vi.hoisted(() => ({
  payrollRunES: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  payrollRecordES: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  payrollLineES: {
    createMany: vi.fn(),
  },
  employee: {
    findMany: vi.fn(),
  },
  tenant: {
    findUnique: vi.fn(),
  },
  idempotencyKey: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: __mockPrisma }));

vi.mock("@/lib/api-key-auth", () => ({
  withTenantAuth:
    (
      handler: (req: Request, auth: any) => Promise<Response>,
      scopesOrOptions: { requiredScopes: string[] }
    ) =>
    async (req: Request) => {
      const wantsNextAuth = req.headers.get("x-test-auth") === "nextauth";
      const requiredScopes = scopesOrOptions.requiredScopes ?? [];
      const providedScopes = (req.headers.get("x-test-scopes") ?? "")
        .split(",")
        .filter(Boolean);

      if (!wantsNextAuth) {
        const scopesOk = requiredScopes.every((s) =>
          providedScopes.includes(s)
        );
        if (!scopesOk) {
          return new Response(
            JSON.stringify({
              error: "API key no tiene el scope requerido.",
              required: requiredScopes,
              provided: providedScopes,
            }),
            {
              status: 403,
              headers: { "content-type": "application/json" },
            }
          );
        }
      }

      if (wantsNextAuth) {
        return handler(req, {
          authMethod: "session",
          apiKey: undefined,
          tenant: { id: "tenant-nextauth" },
          user: { id: "user-1", email: "rrhh@volkern.es" },
        });
      }

      return handler(req, {
        authMethod: "apikey",
        apiKey: {
          id: "key-1",
          nombre: "Volkern Hostelería · Test",
          scopes: providedScopes,
        },
        tenant: { id: "tenant-1" },
        user: { id: "user-1", email: "ops@volkern.es" },
      });
    },
}));

// lib/finance/payroll/es/payroll-engine-es — mock calculatePayroll to return DRAFT.
const MOCK_ENGINE_RESULT = {
  // toFixed(2) incluido: la route usa .toFixed(2) en el push a records.
  // Sin toFixed, lanza TypeError → catch (empErr) → errors[] (no records).
  grossTotal: { toNumber: () => 1813.0, toFixed: (_d?: number) => "1813.00" },
  netTotal: { toNumber: () => 1389.0, toFixed: (_d?: number) => "1389.00" },
  socialSecurityWorker: { toNumber: () => 115.13 },
  socialSecurityEmp: { toNumber: () => 427.85 },
  irpfTotal: { toNumber: () => 308.86 },
  lines: [
    {
      conceptCode: "101",
      conceptType: "SALARY",
      amount: { toNumber: () => 1500 },
      notes: "Salario Base (30 días)",
    },
    {
      conceptCode: "102",
      conceptType: "SALARY",
      amount: { toNumber: () => 313 },
      notes: "Complemento Salarial",
    },
    {
      conceptCode: "801",
      conceptType: "DEDUCTION",
      amount: { toNumber: () => -115.13 },
      notes: "Seguridad Social Trabajador",
    },
  ],
};
vi.mock("@/lib/finance/payroll/es/payroll-engine-es", () => ({
  PayrollEngineES: {
    calculatePayroll: vi.fn().mockResolvedValue(MOCK_ENGINE_RESULT),
  },
}));

// lib/finance/payroll/es/payroll-sealer — mock sealPayroll.
vi.mock("@/lib/finance/payroll/es/payroll-sealer", () => ({
  PayrollSealer: {
    sealPayroll: vi.fn(async (recordId: string) => ({
      id: recordId,
      auditHash: `mockhash_${recordId.slice(0, 6)}`.padEnd(64, "0"),
      chainedHash: "0".repeat(64),
      sealedAt: new Date(),
      status: "SEALED",
    })),
  },
}));

// lib/erp/aeat-nomina-adapter — mock shipNominaToAEAT.
vi.mock("@/lib/erp/aeat-nomina-adapter", () => ({
  shipNominaToAEAT: vi.fn(
    async (opts: { payrollRecordId: string; runId: string }) => ({
      submissionId: `${opts.runId}:${opts.payrollRecordId}:test`,
      status: "ACCEPTED" as const,
      message: "mock AEAT submission",
    })
  ),
}));

// VaultService (descifrado NIF del empleado para AEAT receptor).
// En los tests, NIF del mock es '12345678A' como placeholder no sensible.
vi.mock("@/lib/security/vault", () => ({
  VaultService: {
    decrypt: vi.fn().mockReturnValue("12345678A"),
  },
}));

// Tenant.findUnique (con vaultSeed en happy path).
// Mockeado ad-hoc en cada test que lo requiera (ver combinaciones más abajo).

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish top-level mocks (vi.clearAllMocks clears call history but
  // implementations set at vi.mock time remain — re-set defensively en caso
  // que vitest los haya reasignado).
  __mockPrisma.auditLog.create.mockResolvedValue({});
  __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makePost(body: Record<string, unknown>, opts: {
  scopes?: string;
  idempotencyKey?: string | null;
  authMode?: "apikey" | "nextauth";
} = {}) {
  return new Request(
    "http://localhost/api/v1/partner/payroll/run",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "vk_test_xxx",
        "x-test-scopes": opts.scopes ?? "payroll:run",
        ...(opts.idempotencyKey
          ? { "x-idempotency-key": opts.idempotencyKey }
          : {}),
        ...(opts.authMode && opts.authMode !== "apikey"
          ? { "x-test-auth": opts.authMode }
          : {}),
      },
      body: JSON.stringify(body),
    }
  );
}

function makeGet(path: string, scopes = "payroll:read") {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      "x-api-key": "vk_test_xxx",
      "x-test-scopes": scopes,
    },
  });
}

async function importRunRoute() {
  return await import("@/app/api/v1/partner/payroll/run/route");
}
async function importReceiptsRoute() {
  return await import("@/app/api/v1/partner/payroll/[runId]/receipts/route");
}
async function importAeatStatusRoute() {
  return await import(
    "@/app/api/v1/partner/payroll/[runId]/aeat-status/route"
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Volkern Partner API — /payroll (Phase 2)", () => {
  describe("POST /api/v1/partner/payroll/run", () => {
    it("401 cuando llega por sesión NextAuth", async () => {
      const req = makePost(
        {
          period: "2026-07",
          employees: [{ externalEmployeeId: "EMP-1" }],
        },
        { authMode: "nextauth" }
      );
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("403 cuando scope no es payroll:run", async () => {
      const req = makePost(
        { period: "2026-07", employees: [{ externalEmployeeId: "EMP-1" }] },
        { scopes: "payroll:read" }
      );
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("400 cuando x-idempotency-key >255 chars", async () => {
      const req = makePost(
        { period: "2026-07", employees: [{ externalEmployeeId: "EMP-1" }] },
        { idempotencyKey: "k".repeat(256) }
      );
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Idempotency-Key/i);
    });

    it("400 cuando body Zod falla (period inválido)", async () => {
      const req = makePost({
        period: "2026-13-99",
        employees: [{ externalEmployeeId: "EMP-1" }],
      });
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("400 cuando hay externalEmployeeId duplicados en el body", async () => {
      const req = makePost({
        period: "2026-07",
        employees: [
          { externalEmployeeId: "EMP-1" },
          { externalEmployeeId: "EMP-1" },
        ],
      });
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/duplicados/i);
    });

    it("404 cuando algún externalEmployeeId no existe en el tenant", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce(null); // (tenant,period) check
      __mockPrisma.employee.findMany.mockResolvedValueOnce([
        {
          id: "emp_A",
          tenantId: "tenant-1",
          externalEmployeeId: "EMP-A",
          fullName: "A",
          governmentIdEncrypted: "VAULT_SHOULD_NOT_LEAK",
          salaryEncrypted: "VAULT_SHOULD_NOT_LEAK",
          bankDetailsEncrypted: "VAULT_SHOULD_NOT_LEAK",
        },
      ]);
      __mockPrisma.tenant.findUnique.mockImplementation(async (args: any) => {
        // 1ª llamada: convenPage lookup. 2ª llamada: vaultSeed lookup (post-fix #7).
        // Devolvemos un objeto distinto según el `select` pedido.
        const select = args?.select ?? {};
        if (Object.keys(select).includes("vaultSeed")) {
          return { vaultSeed: "test-vault-seed" };
        }
        return { configuracion: { convenioCode: "ES_HOSTELERIA_ESTATAL" } };
      });
      __mockPrisma.payrollRunES.upsert.mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        period: "2026-07",
        status: "RUNNING",
      });
      const req = makePost({
        period: "2026-07",
        employees: [
          { externalEmployeeId: "EMP-A" },
          { externalEmployeeId: "NOEXISTE" },
        ],
      });
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.missing).toContain("NOEXISTE");
    });

    it("happy path: calcula + sella + envía AEAT por cada empleado", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce(null); // (tenant,period) free
      __mockPrisma.employee.findMany.mockResolvedValueOnce([
        {
          id: "emp_A",
          tenantId: "tenant-1",
          externalEmployeeId: "EMP-A",
          fullName: "Camarera A",
          salaryEncrypted: "VAULT_A",
          governmentIdEncrypted: "VAULT_A",
          bankDetailsEncrypted: "VAULT_A",
        },
        {
          id: "emp_B",
          tenantId: "tenant-1",
          externalEmployeeId: "EMP-B",
          fullName: "Barman B",
          salaryEncrypted: "VAULT_B",
          governmentIdEncrypted: "VAULT_B",
          bankDetailsEncrypted: "VAULT_B",
        },
      ]);
      __mockPrisma.tenant.findUnique.mockImplementation(async (args: any) => {
        // 1ª llamada: convenPage lookup. 2ª llamada: vaultSeed lookup (post-fix #7).
        // Devolvemos un objeto distinto según el `select` pedido.
        const select = args?.select ?? {};
        if (Object.keys(select).includes("vaultSeed")) {
          return { vaultSeed: "test-vault-seed" };
        }
        return { configuracion: { convenioCode: "ES_HOSTELERIA_ESTATAL" } };
      });
      __mockPrisma.payrollRunES.upsert.mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        period: "2026-07",
        status: "RUNNING",
      });
      __mockPrisma.payrollRecordES.create
        .mockResolvedValueOnce({
          id: "rec-A",
          tenantId: "tenant-1",
          employeeId: "emp_A",
          grossTotal: { toString: () => "1813.00" },
          netTotal: { toString: () => "1389.00" },
          socialSecurityWorker: { toString: () => "115.13" },
          socialSecurityEmp: { toString: () => "427.85" },
          irpfTotal: { toString: () => "308.86" },
        })
        .mockResolvedValueOnce({
          id: "rec-B",
          tenantId: "tenant-1",
          employeeId: "emp_B",
          grossTotal: { toString: () => "1813.00" },
          netTotal: { toString: () => "1389.00" },
          socialSecurityWorker: { toString: () => "115.13" },
          socialSecurityEmp: { toString: () => "427.85" },
          irpfTotal: { toString: () => "308.86" },
        });
      // Fix test gap post-#7: el adapter llama findUnique internamente
      // para resolver NIF emisor + NIF receptor via vault. Devolvemos
      // un record con los campos que `shipNominaToAEAT` lee, incluyendo
      // el `tenant` anidado (con NIF emisor) para pasar Fix #6 guard.
      __mockPrisma.payrollRecordES.findUnique.mockImplementation(
        async (args: any) => {
          const id = args?.where?.id;
          if (id === "rec-A") {
            return {
              id: "rec-A",
              tenantId: "tenant-1",
              employeeId: "emp_A",
              grossTotal: { toNumber: () => 1813.0 },
              auditHash: "abc123".padEnd(64, "0"),
              chainedHash: "0".repeat(64),
              sealedAt: new Date(),
              createdAt: new Date(),
              employee: {
                id: "emp_A",
                fullName: "Camarera A",
                governmentIdEncrypted: "VAULT_A",
                tenant: {
                  nif: "B12345678",
                  nombre: "Tenant Test S.L.",
                  vaultSeed: "test-vault-seed",
                },
              },
            };
          }
          if (id === "rec-B") {
            return {
              id: "rec-B",
              tenantId: "tenant-1",
              employeeId: "emp_B",
              grossTotal: { toNumber: () => 1813.0 },
              auditHash: "def456".padEnd(64, "0"),
              chainedHash: "0".repeat(64),
              sealedAt: new Date(),
              createdAt: new Date(),
              employee: {
                id: "emp_B",
                fullName: "Barman B",
                governmentIdEncrypted: "VAULT_B",
                tenant: {
                  nif: "B12345678",
                  nombre: "Tenant Test S.L.",
                  vaultSeed: "test-vault-seed",
                },
              },
            };
          }
          return null;
        }
      );
      // Tenant.findUnique con select:{tenant:true} (nested include en shipNominaToAEAT).
      // El implement del mock global solo maneja 2 selects — añadir un tercero
      // para cuando el adapter pide el tenant anidado via include.
      __mockPrisma.tenant.findUnique.mockImplementation(async (args: any) => {
        if (args?.include?.employee?.include?.tenant) {
          return {
            configuracion: { convenioCode: "ES_HOSTELERIA_ESTATAL" },
            vaultSeed: "test-vault-seed",
            nif: "B12345678",
            nombre: "Tenant Test S.L.",
          };
        }
        const select = args?.select ?? {};
        if (Object.keys(select).includes("vaultSeed")) {
          return { vaultSeed: "test-vault-seed" };
        }
        return { configuracion: { convenioCode: "ES_HOSTELERIA_ESTATAL" } };
      });
      // Re-establecer mocks de módulos externos limpiados por vi.clearAllMocks().
      // PayrollEngineES.calculatePayroll, PayrollSealer.sealPayroll, shipNominaToAEAT
      // se definieron en vi.mock() factories al cargar el archivo, pero beforeEach
      // ejecuta clearAllMocks() que los resetear a undefined. Los re-mockeamos aquí.
      (await import("@/lib/finance/payroll/es/payroll-engine-es")).PayrollEngineES
        .calculatePayroll.mockResolvedValue(MOCK_ENGINE_RESULT);
      (await import("@/lib/finance/payroll/es/payroll-sealer")).PayrollSealer
        .sealPayroll.mockImplementation(async (recordId: string) => ({
          id: recordId,
          auditHash: `mockhash_${recordId.slice(0, 6)}`.padEnd(64, "0"),
          chainedHash: "0".repeat(64),
          sealedAt: new Date(),
          status: "SEALED",
        }));
      (await import("@/lib/erp/aeat-nomina-adapter")).shipNominaToAEAT
        .mockImplementation(async (opts: { payrollRecordId: string; runId: string }) => ({
          submissionId: `${opts.runId}:${opts.payrollRecordId}:test`,
          status: "ACCEPTED" as const,
          message: "mock AEAT submission",
        }));
      (await import("@/lib/security/vault")).VaultService
        .decrypt.mockReturnValue("12345678A");

      __mockPrisma.payrollLineES.createMany.mockResolvedValue({ count: 4 });
      __mockPrisma.payrollRunES.update.mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        period: "2026-07",
        status: "AEAT_SUBMITTED",
        totalRecords: 2,
        acceptedCount: 2,
        rejectedCount: 0,
        errorCount: 0,
        convenioCode: "ES_HOSTELERIA_ESTATAL",
        createdAt: new Date(),
        completedAt: new Date(),
        submittedAt: new Date(),
        externalRunRef: null,
      });
      const req = makePost({
        period: "2026-07",
        employees: [
          {
            externalEmployeeId: "EMP-A",
            overrides: [
              {
                conceptCode: "501",
                type: "EARNING",
                amount: 50.0,
                taxable: true,
                cotizable: true,
                notes: "Horas extra",
              },
            ],
          },
          { externalEmployeeId: "EMP-B" },
        ],
      });
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.run.id).toBe("run-1");
      expect(json.run.status).toBe("AEAT_SUBMITTED");
      expect(json.records).toHaveLength(2);
      expect(json.records[0].recordId).toBe("rec-A");
      // RGPD: cifrados NO deben aparecer en la respuesta.
      expect(json.records[0]).not.toHaveProperty("salaryEncrypted");
      expect(json.errors).toHaveLength(0);
      // AuditLog PARTNER_PAYROLL_RUN escrito (RGPD Art. 30).
      // El `extra` que escribe writePartnerAuditLog contiene {total, accepted, errors, convenio}.
      // La identidad del run va en `entidadId`, no en metadata.
      expect(__mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accion: "PARTNER_PAYROLL_RUN",
            entidad: "PayrollRunES",
            entidadId: "run-1",
            metadata: expect.objectContaining({
              total: 2,
              accepted: 2,
              errors: [],
              convenio: "ES_HOSTELERIA_ESTATAL",
            }),
          }),
        })
      );
    });

    it("idempotency cache hit → respuesta cached sin re-correr engine", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce({
        id: "run-cached",
        tenantId: "tenant-1",
        period: "2026-07",
        status: "AEAT_SUBMITTED",
        totalRecords: 5,
        acceptedCount: 5,
        rejectedCount: 0,
        errorCount: 0,
        createdAt: new Date(),
        submittedAt: new Date(),
      });
      const req = makePost({
        period: "2026-07",
        employees: [{ externalEmployeeId: "EMP-A" }],
      }, { idempotencyKey: "idem-key-1" });
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.idempotent).toBe(true);
      expect(json.run.id).toBe("run-cached");
      // No se llamaron calculatePayroll ni sealPayroll ni shipNominaToAEAT.
      const { PayrollEngineES } = await import(
        "@/lib/finance/payroll/es/payroll-engine-es"
      );
      expect(PayrollEngineES.calculatePayroll).not.toHaveBeenCalled();
    });

    it("409 cuando run YA SELLADO para (tenant, period)", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce({
        id: "run-old",
        tenantId: "tenant-1",
        period: "2026-07",
        status: "SEALED",
      });
      const req = makePost({
        period: "2026-07",
        employees: [{ externalEmployeeId: "EMP-A" }],
      });
      const { POST } = await importRunRoute();
      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toMatch(/sellado|atrasos/i);
    });
  });

  describe("GET /api/v1/partner/payroll/[runId]/receipts", () => {
    it("401 cuando llega por sesión NextAuth", async () => {
      const req = new Request(
        "http://localhost/api/v1/partner/payroll/run-1/receipts",
        {
          method: "GET",
          headers: {
            "x-api-key": "vk_test_xxx",
            "x-test-auth": "nextauth",
            "x-test-scopes": "payroll:read",
          },
        }
      );
      const { GET } = await importReceiptsRoute();
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("404 cuando runId no existe en el tenant", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce(null);
      const req = makeGet(
        "/api/v1/partner/payroll/run-fantasma/receipts"
      );
      const { GET } = await importReceiptsRoute();
      const res = await GET(req);
      expect(res.status).toBe(404);
    });

    it("devuelve recibos sanitizados sin cifrados", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        period: "2026-07",
        status: "AEAT_SUBMITTED",
        totalRecords: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        errorCount: 0,
        convenioCode: "ES_HOSTELERIA_ESTATAL",
        createdAt: new Date(),
        completedAt: new Date(),
        submittedAt: new Date(),
        records: [
          {
            id: "rec-A",
            period: "2026-07",
            status: "SEALED",
            fiscalStatus: "SIGNED",
            grossTotal: { toString: () => "1813.00" },
            netTotal: { toString: () => "1389.00" },
            socialSecurityWorker: { toString: () => "115.13" },
            socialSecurityEmp: { toString: () => "427.85" },
            irpfTotal: { toString: () => "308.86" },
            auditHash: "abc123",
            chainedHash: "0".repeat(64),
            sealedAt: new Date(),
            employee: { externalEmployeeId: "EMP-A" },
            lines: [
              {
                conceptCode: "101",
                conceptType: "SALARY",
                amount: { toString: () => "1500" },
                taxable: true,
                cotizable: true,
                isOverride: false,
                notes: "Salario Base",
              },
            ],
          },
        ],
      });
      const req = makeGet("/api/v1/partner/payroll/run-1/receipts");
      const { GET } = await importReceiptsRoute();
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.receipts).toHaveLength(1);
      const r = json.receipts[0];
      expect(r.externalEmployeeId).toBe("EMP-A");
      expect(r.totals.gross).toBe("1813.00");
      expect(r.totals.net).toBe("1389.00");
      expect(r.totals.irpf).toBe("308.86");
      expect(r.lines[0].conceptCode).toBe("101");
      // RGPD: cifrados NO deben aparecer.
      expect(r).not.toHaveProperty("salaryEncrypted");
      expect(r).not.toHaveProperty("governmentIdEncrypted");
      expect(r).not.toHaveProperty("bankDetailsEncrypted");
    });
  });

  describe("GET /api/v1/partner/payroll/[runId]/aeat-status", () => {
    it("404 cuando runId no existe en el tenant", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce(null);
      const req = makeGet(
        "/api/v1/partner/payroll/run-fantasma/aeat-status"
      );
      const { GET } = await importAeatStatusRoute();
      const res = await GET(req);
      expect(res.status).toBe(404);
    });

    it("devuelve distribution PENDING|SIGNED + summary humano", async () => {
      __mockPrisma.payrollRunES.findUnique.mockResolvedValueOnce({
        id: "run-2",
        tenantId: "tenant-1",
        period: "2026-08",
        status: "AEAT_SUBMITTED",
        totalRecords: 3,
        acceptedCount: 2,
        rejectedCount: 0,
        errorCount: 0,
        lastError: null,
        createdAt: new Date(),
        submittedAt: new Date(),
        records: [
          {
            id: "r1",
            employeeId: "e1",
            status: "SEALED",
            fiscalStatus: "SIGNED",
            sealedAt: new Date(),
            employee: { externalEmployeeId: "E1" },
          },
          {
            id: "r2",
            employeeId: "e2",
            status: "SEALED",
            fiscalStatus: "PENDING",
            sealedAt: new Date(),
            employee: { externalEmployeeId: "E2" },
          },
          {
            id: "r3",
            employeeId: "e3",
            status: "SEALED",
            fiscalStatus: "PENDING",
            sealedAt: new Date(),
            employee: { externalEmployeeId: "E3" },
          },
        ],
      });
      const req = makeGet(
        "/api/v1/partner/payroll/run-2/aeat-status"
      );
      const { GET } = await importAeatStatusRoute();
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.aeat.distribution.SIGNED).toBe(1);
      expect(json.aeat.distribution.PENDING).toBe(2);
      expect(json.aeat.summary).toBe("MIXED");
      expect(json.records).toHaveLength(3);
    });
  });
});
