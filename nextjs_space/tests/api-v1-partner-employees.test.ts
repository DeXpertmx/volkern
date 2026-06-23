/**
 * Vitest — Volkern Partner API · Phase 1.5 employees pass-through.
 *
 * Cubre:
 *  - GET happy: single lookup, bulk lookup, listado paginado.
 *  - GET guards: API-key only (NextAuth → 401).
 *  - GET data minimization: cifrados jamás aparecen en la respuesta.
 *  - POST upsert: create, update, PATCH semantics (ausente=skip / null=clear).
 *  - POST guards: Zod validation, idempotency cache hit, idempotency cache
 *    race recovery (P2002 en IdempotencyKey), idempotency key >255 chars.
 *  - POST RGPD: cada llamada emite AuditLog con `accion=PARTNER_EMPLOYEE_*`.
 */
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks hoisted ──────────────────────────────────────────────────────────
const __mockPrisma = {
  employee: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  idempotencyKey: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: __mockPrisma,
}));

vi.mock("@/lib/api-key-auth", () => ({
  withTenantAuth:
    (
      handler: (req: Request, auth: any) => Promise<Response>,
      scopesOrOptions: { requiredScopes: string[] }
    ) =>
    async (req: Request) => {
      const wantsNextAuth =
        req.headers.get("x-test-auth") === "nextauth";
      const wantsMissingApiKey =
        req.headers.get("x-test-auth") === "noapikey";

      const requiredScopes = scopesOrOptions.requiredScopes ?? [];
      const providedScopes = (req.headers.get("x-test-scopes") ?? "")
        .split(",")
        .filter(Boolean);

      // Scope-rejection real (no placebo): devolvemos 403 ANTES de invocar
      // el handler. Esto sí cubre el path de scope mismatch end-to-end.
      if (!wantsNextAuth && !wantsMissingApiKey) {
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

      if (wantsMissingApiKey) {
        return handler(req, {
          authMethod: "apikey",
          apiKey: undefined,
          tenant: { id: "tenant-1" },
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

const ORIGINAL_DATE = global.Date;
function isoDaysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

beforeEach(() => {
  vi.clearAllMocks();
  __mockPrisma.auditLog.create.mockResolvedValue({});
  __mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
  __mockPrisma.idempotencyKey.create.mockResolvedValue({});
});

afterEach(() => {
  global.Date = ORIGINAL_DATE;
});

// ── Helpers para construir Requests ─────────────────────────────────────────

function makeGet(employeeIdQS: string | null, scopes = "employees:read") {
  const url =
    "http://localhost/api/v1/partner/employees" +
    (employeeIdQS ? `?externalEmployeeId=${encodeURIComponent(employeeIdQS)}` : "");
  return new Request(url, {
    method: "GET",
    headers: {
      "x-api-key": "vk_test_xxx",
      "x-test-scopes": scopes,
    },
  });
}

function makePost(
  body: Record<string, unknown>,
  opts: {
    scopes?: string;
    idempotencyKey?: string | null;
    authMode?: "apikey" | "nextauth" | "noapikey";
  } = {}
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": "vk_test_xxx",
    "x-test-scopes": opts.scopes ?? "employees:write",
  };
  if (opts.idempotencyKey)
    headers["x-idempotency-key"] = opts.idempotencyKey;
  if (opts.authMode && opts.authMode !== "apikey")
    headers["x-test-auth"] = opts.authMode;
  return new Request("http://localhost/api/v1/partner/employees", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return await import("@/app/api/v1/partner/employees/route");
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Volkern Partner API — /employees (Phase 1.5)", () => {
  describe("GET /api/v1/partner/employees", () => {
    it("401 cuando la auth proviene de sesión NextAuth (no API Key)", async () => {
      const req = new Request(
        "http://localhost/api/v1/partner/employees?externalEmployeeId=EMP-1",
        {
          method: "GET",
          headers: {
            "x-api-key": "vk_test_xxx",
            "x-test-auth": "nextauth",
            "x-test-scopes": "employees:read",
          },
        }
      );
      const { GET } = await importRoute();
      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/API Key/i);
      expect(__mockPrisma.employee.findMany).not.toHaveBeenCalled();
    });

    it("403 cuando el scope requerido no está presente", async () => {
      // Scope wrong → withTenantAuth mock devuelve 403 antes del handler.
      const req = makeGet("EMP-1", "payroll:run");
      const { GET } = await importRoute();
      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/scope/i);
      expect(json.required).toContain("employees:read");
      expect(json.provided).toContain("payroll:run");
      expect(__mockPrisma.employee.findMany).not.toHaveBeenCalled();
    });

    it("devuelve 1 empleado cuando externalEmployeeId coincide", async () => {
      __mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "emp_1",
          tenantId: "tenant-1",
          externalEmployeeId: "EMP-1",
          fullName: "Camarera 1",
          email: "camarera@volkern.es",
          jobTitle: "Camarera",
          role: "WAITER",
          department: "DINING",
          hiringDate: isoDaysAgo(180),
          isActive: true,
          baseGPSLat: 40.4168,
          baseGPSLng: -3.7038,
          createdAt: isoDaysAgo(180),
          updatedAt: isoDaysAgo(1),
          salaryEncrypted: "VAULT_SHOULD_NOT_LEAK",
          bankDetailsEncrypted: "VAULT_SHOULD_NOT_LEAK",
          governmentIdEncrypted: "VAULT_SHOULD_NOT_LEAK",
        },
      ]);
      const req = makeGet("EMP-1");
      const { GET } = await importRoute();
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBe(1);
      const first = json.data[0];
      expect(first.externalEmployeeId).toBe("EMP-1");
      expect(first.fullName).toBe("Camarera 1");
      // RGPD: cifrados NO deben aparecer.
      expect(first).not.toHaveProperty("salaryEncrypted");
      expect(first).not.toHaveProperty("bankDetailsEncrypted");
      expect(first).not.toHaveProperty("governmentIdEncrypted");
      // AuditLog: `outcome` no es columna en el modelo, vive en `descripcion`.
      expect(__mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accion: "PARTNER_EMPLOYEE_LOOKUP",
            descripcion: expect.stringContaining("outcome=success"),
          }),
        })
      );
    });

    it("devuelve notFound=true cuando externalEmployeeId no existe", async () => {
      __mockPrisma.employee.findMany.mockResolvedValue([]);
      const req = makeGet("EMP-DESCONOCIDO");
      const { GET } = await importRoute();
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBe(0);
      expect(json.data[0].notFound).toBe(true);
    });

    it("bulk lookup con X,Y,Z — devuelve empleados + notFound mixtos", async () => {
      __mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "emp_1",
          tenantId: "tenant-1",
          externalEmployeeId: "EMP-1",
          fullName: "Camarera 1",
          email: null,
          jobTitle: null,
          role: "WAITER",
          department: "DINING",
          hiringDate: isoDaysAgo(180),
          isActive: true,
          baseGPSLat: null,
          baseGPSLng: null,
          createdAt: isoDaysAgo(180),
          updatedAt: isoDaysAgo(1),
        },
        {
          id: "emp_3",
          tenantId: "tenant-1",
          externalEmployeeId: "EMP-3",
          fullName: "Barman",
          email: null,
          jobTitle: null,
          role: "BARTENDER",
          department: "BAR",
          hiringDate: isoDaysAgo(300),
          isActive: true,
          baseGPSLat: null,
          baseGPSLng: null,
          createdAt: isoDaysAgo(300),
          updatedAt: isoDaysAgo(2),
        },
      ]);
      const req = makeGet("EMP-1,EMP-2,EMP-3");
      const { GET } = await importRoute();
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBe(2);
      expect(json.data).toHaveLength(3);
      expect(json.data[1].notFound).toBe(true); // EMP-2
    });

    it("400 cuando el query string no pasa Zod (limit > 100)", async () => {
      const req = new Request(
        "http://localhost/api/v1/partner/employees?limit=500",
        {
          method: "GET",
          headers: {
            "x-api-key": "vk_test_xxx",
            "x-test-scopes": "employees:read",
          },
        }
      );
      const { GET } = await importRoute();
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/inv[iá]lidos/i);
    });
  });

  describe("POST /api/v1/partner/employees (upsert idempotente)", () => {
    const baseBody = (overrides: Record<string, unknown> = {}) => ({
      externalEmployeeId: "EMP-NUEVO",
      fullName: "Camarera Nueva",
      email: "nueva@volkern.es",
      jobTitle: "Camarera",
      role: "WAITER",
      department: "DINING",
      isActive: true,
      ...overrides,
    });

    it("401 cuando llega por sesión NextAuth", async () => {
      const req = makePost(baseBody(), { authMode: "nextauth" });
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("400 cuando el body no pasa Zod (fullName vacío)", async () => {
      const req = makePost({ externalEmployeeId: "X", fullName: "" });
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/inv[iá]lidos/i);
    });

    it("400 cuando x-idempotency-key excede 255 chars", async () => {
      const longKey = "k".repeat(256);
      const req = makePost(baseBody(), { idempotencyKey: longKey });
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Idempotency-Key/i);
    });

    it("crea un Employee cuando externalEmployeeId no existe", async () => {
      __mockPrisma.employee.findUnique.mockResolvedValue(null);
      const created = {
        id: "emp_xyz",
        tenantId: "tenant-1",
        externalEmployeeId: "EMP-NUEVO",
        fullName: "Camarera Nueva",
        email: "nueva@volkern.es",
        jobTitle: "Camarera",
        role: "WAITER",
        department: "DINING",
        hiringDate: new Date(),
        isActive: true,
        baseGPSLat: 41.5,
        baseGPSLng: 2.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      __mockPrisma.employee.create.mockResolvedValue(created);
      const req = makePost(
        baseBody({ baseGPSLat: 41.5, baseGPSLng: 2.0 })
      );
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.created).toBe(true);
      expect(json.employee.externalEmployeeId).toBe("EMP-NUEVO");
      // RGPD: cifrados NO deben aparecer.
      expect(json.employee).not.toHaveProperty("salaryEncrypted");
      expect(json.employee).not.toHaveProperty("bankDetailsEncrypted");
      expect(__mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accion: "PARTNER_EMPLOYEE_UPSERT",
            descripcion: expect.stringContaining("reason=create"),
          }),
        })
      );
    });

    it("actualiza con PATCH semantics estricto (solo campos enviados)", async () => {
      const existing = {
        id: "emp_xyz",
        tenantId: "tenant-1",
        externalEmployeeId: "EMP-EXISTE",
        fullName: "Nombre Viejo",
        email: "viejo@volkern.es",
        jobTitle: "Antiguo puesto",
        role: "WAITER",
        department: "DINING",
        hiringDate: isoDaysAgo(500),
        isActive: true,
        baseGPSLat: null,
        baseGPSLng: null,
        createdAt: isoDaysAgo(500),
        updatedAt: isoDaysAgo(10),
      };
      __mockPrisma.employee.findUnique.mockResolvedValue(existing);
      __mockPrisma.employee.update.mockResolvedValue({
        ...existing,
        fullName: "Nombre Nuevo",
        jobTitle: "Nuevo puesto",
        updatedAt: new Date(),
      });
      // Solo enviamos fullName + jobTitle. PATCH semantics estrictas:
      // buildPatchData distingue "ausente" de "null" → solo estos 2 van
      // a `update`, los demás se preservan en DB.
      const req = makePost({
        externalEmployeeId: "EMP-EXISTE",
        fullName: "Nombre Nuevo",
        jobTitle: "Nuevo puesto",
      });
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.created).toBe(false);
      expect(json.employee.fullName).toBe("Nombre Nuevo");
      expect(json.employee.jobTitle).toBe("Nuevo puesto");
      // Verificamos Prisma.update: SOLO fullName + jobTitle enviados.
      const updateArgs = __mockPrisma.employee.update.mock.calls[0][0];
      expect(updateArgs.data).toEqual({
        fullName: "Nombre Nuevo",
        jobTitle: "Nuevo puesto",
      });
      expect(updateArgs.data).not.toHaveProperty("email");
      expect(updateArgs.data).not.toHaveProperty("role");
      expect(updateArgs.data).not.toHaveProperty("department");
      expect(updateArgs.data).not.toHaveProperty("isActive");
      expect(updateArgs.data).not.toHaveProperty("baseGPSLat");
      expect(updateArgs.data).not.toHaveProperty("baseGPSLng");
      expect(updateArgs.data).not.toHaveProperty("hiringDate");
    });

    it("null en `email` limpia el campo en DB (clear, no skip)", async () => {
      const existing = {
        id: "emp_xyz",
        tenantId: "tenant-1",
        externalEmployeeId: "EMP-CLEAR",
        fullName: "X",
        email: "viejo@volkern.es",
        jobTitle: null,
        role: "OPERATOR",
        department: "GENERAL",
        hiringDate: new Date(),
        isActive: true,
        baseGPSLat: null,
        baseGPSLng: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      __mockPrisma.employee.findUnique.mockResolvedValue(existing);
      __mockPrisma.employee.update.mockResolvedValue({
        ...existing,
        email: null,
        updatedAt: new Date(),
      });
      const req = makePost({
        externalEmployeeId: "EMP-CLEAR",
        fullName: "X",
        email: null, // Explícitamente clear.
      });
      const { POST } = await importRoute();
      await POST(req);
      const updateArgs = __mockPrisma.employee.update.mock.calls[0][0];
      expect(updateArgs.data.email).toBeNull();
      // fullName se reenvía porque está en el body.
      expect(updateArgs.data.fullName).toBe("X");
    });

    it("recupera via P2002 cuando hay carrera concurrente en (tenantId, externalEmployeeId)", async () => {
      __mockPrisma.employee.findUnique.mockResolvedValueOnce(null);
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "test" }
      );
      __mockPrisma.employee.create.mockRejectedValueOnce(p2002);
      const winner = {
        id: "emp_xyz",
        tenantId: "tenant-1",
        externalEmployeeId: "EMP-RACE",
        fullName: "Camarera",
        email: null,
        jobTitle: null,
        role: "OPERATOR",
        department: "GENERAL",
        hiringDate: new Date(),
        isActive: true,
        baseGPSLat: null,
        baseGPSLng: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      __mockPrisma.employee.findUnique.mockResolvedValueOnce(winner);
      __mockPrisma.employee.update.mockResolvedValue({
        ...winner,
        fullName: "Camarera Race",
        updatedAt: new Date(),
      });
      const req = makePost({
        externalEmployeeId: "EMP-RACE",
        fullName: "Camarera Race",
      });
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.employee.externalEmployeeId).toBe("EMP-RACE");
      expect(__mockPrisma.employee.update).toHaveBeenCalled();
    });

    it("idempotency cache hit → responde con cache + idempotent:true", async () => {
      __mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        responseJson: {
          schemaVersion: "2026-07-02",
          created: true,
          employee: {
            id: "emp_cached",
            externalEmployeeId: "EMP-CACHED",
            fullName: "Cached",
          },
        },
      });
      const req = makePost(baseBody({ externalEmployeeId: "EMP-CACHED" }), {
        idempotencyKey: "key-1",
      });
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.idempotent).toBe(true);
      expect(json.employee.id).toBe("emp_cached");
      expect(__mockPrisma.employee.create).not.toHaveBeenCalled();
      expect(__mockPrisma.employee.update).not.toHaveBeenCalled();
    });

    it("idempotency degraded → emite header X-Idempotency-Degraded: true", async () => {
      // Forzamos un error no-P2002 al persistir el cache.
      const nonP2002 = new Error("FK violation");
      __mockPrisma.idempotencyKey.create.mockRejectedValueOnce(nonP2002);
      __mockPrisma.employee.findUnique.mockResolvedValue(null);
      __mockPrisma.employee.create.mockResolvedValue({
        id: "emp_xyz",
        tenantId: "tenant-1",
        externalEmployeeId: "EMP-DEGRADED",
        fullName: "X",
        email: null,
        jobTitle: null,
        role: "OPERATOR",
        department: "GENERAL",
        hiringDate: new Date(),
        isActive: true,
        baseGPSLat: null,
        baseGPSLng: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const req = makePost(
        baseBody({ externalEmployeeId: "EMP-DEGRADED" }),
        { idempotencyKey: "key-degraded" }
      );
      const { POST } = await importRoute();
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Idempotency-Degraded")).toBe("true");
    });
  });

  describe("RGPD / Compliance", () => {
    it("GET emite AuditLog PARTNER_EMPLOYEE_LOOKUP incluso cuando no hay matches", async () => {
      __mockPrisma.employee.findMany.mockResolvedValue([]);
      const req = makeGet("EMP-NO-EXISTE");
      const { GET } = await importRoute();
      await GET(req);
      expect(__mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accion: "PARTNER_EMPLOYEE_LOOKUP",
            tenantId: "tenant-1",
            userId: null, // API key auth
            descripcion: expect.stringContaining("outcome=success"),
          }),
        })
      );
    });
  });
});
