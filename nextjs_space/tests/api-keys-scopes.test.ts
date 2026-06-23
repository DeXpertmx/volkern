import { describe, it, expect } from "vitest";
import { AVAILABLE_SCOPES } from "@/lib/api-keys";

describe("API Key scopes — Partner API (Volkern Hostelería integration)", () => {
  it("contiene los 7 scopes partner definidos para la integración SaaS-a-SaaS", () => {
    // Defensa runtime contra eliminación accidental durante refactors.
    // Si alguien borra un scope en mantenimiento, este test falla en CI.
    const expected = [
      "partners:onboard",     // POST /api/v1/partner/onboard/tenant
      "attendance:write",     // POST /api/v1/partner/attendance/punch
      "attendance:read",      // GET marcajes históricos
      "employees:write",      // Alta/baja empleados desde SaaS partner
      "employees:read",
      "payroll:run",          // POST /api/v1/partner/payroll/run → engine + Verifactu + AEAT
      "audit:read",           // GET /api/v1/partner/audit-log (RGPD Art. 30)
    ];
    for (const scope of expected) {
      expect(AVAILABLE_SCOPES).toContain(scope);
    }
  });

  it("scopes preexistentes siguen disponibles (no rompemos backward compat)", () => {
    const preExisting = [
      "leads:read",
      "contacts:write",
      "deals:read",
      "hr:write",
      "payroll:write",
      "payroll:read",
      "accounting:read",
    ];
    for (const scope of preExisting) {
      expect(AVAILABLE_SCOPES).toContain(scope);
    }
  });

  it("todos los scopes son únicos (no duplicados accidentales)", () => {
    const set = new Set(AVAILABLE_SCOPES);
    expect(set.size).toBe(AVAILABLE_SCOPES.length);
  });
});
