/**
 * Test de Integración: Filtro por tipo de slot
 *
 * Usa la base de datos real para verificar que el endpoint GET /api/slots
 * filtra correctamente por ?type=agency y ?type=accounting.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';
import { GET } from '@/app/api/slots/route';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(url: string, apiKey: string): Request {
  return new Request(url, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });
}

// ─── Test Data (unique slugs to avoid collisions) ─────────────────────────

const TS = Date.now();
const AGENCY_SLUG = `test-filter-agency-${TS}`;
const BUSINESS_SLUG = `test-filter-business-${TS}`;

let agencyTenant: any;
let businessTenant: any;
let testUser: any;
let agencyApiKey: string;
let businessApiKey: string;
let isSuperadminUser = false;

// ─── Setup / Teardown ─────────────────────────────────────────────────────

describe('Integración: Filtro por tipo en GET /api/slots (DB real)', () => {
  beforeAll(async () => {
    // 1. Obtener usuario base
    testUser =
      (await prisma.user.findFirst({
        where: { role: { isNot: { nombre: 'Superadmin' } } },
      })) ||
      (await prisma.user.findFirst({ where: { email: { contains: 'volkern' } } })) ||
      (await prisma.user.findFirst());

    if (!testUser) {
      throw new Error('No se encontró ningún usuario en la base de datos para las pruebas');
    }

    const userWithRole = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { role: { select: { nombre: true } } },
    });
    isSuperadminUser = userWithRole?.role?.nombre === 'Superadmin';

    // 2. Crear tenant de tipo AGENCY
    agencyTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Filter Agency',
        slug: AGENCY_SLUG,
        accountType: 'AGENCY',
        enabledModules: ['ia_agencia', 'crm'],
        plan: 'pro-agency',
        maxSlots: 10,
      },
    });

    // 3. Crear API key para la agencia
    const { key: rawAgencyKey, keyHash: agencyHash, prefix: agencyPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Filter Agency Key',
        keyHash: agencyHash,
        prefix: agencyPrefix,
        tenantId: agencyTenant.id,
        userId: testUser.id,
        scopes: ['agent:skill'],
      },
    });
    agencyApiKey = rawAgencyKey;

    // 4. Crear tenant de tipo BUSINESS (para test 403)
    businessTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Filter Business',
        slug: BUSINESS_SLUG,
        accountType: 'BUSINESS',
        enabledModules: ['crm'],
        plan: 'basico',
      },
    });

    // 5. Crear API key para BUSINESS
    const { key: rawBizKey, keyHash: bizHash, prefix: bizPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Filter Business Key',
        keyHash: bizHash,
        prefix: bizPrefix,
        tenantId: businessTenant.id,
        userId: testUser.id,
        scopes: ['agent:skill'],
      },
    });
    businessApiKey = rawBizKey;

    // 6. Crear slots de prueba — mezcla de AGENCY_SLOT y ACCOUNTING_SLOT
    await prisma.tenant.createMany({
      data: [
        {
          nombre: 'Agency Slot Alpha',
          slug: `agency-alpha-${TS}`,
          accountType: 'BUSINESS',
          parentId: agencyTenant.id,
          plan: 'agency-slot',
          estado: 'activo',
          enabledModules: ['CRM', 'LEADS'],
        },
        {
          nombre: 'Agency Slot Beta',
          slug: `agency-beta-${TS}`,
          accountType: 'BUSINESS',
          parentId: agencyTenant.id,
          plan: 'agency-slot',
          estado: 'activo',
          enabledModules: ['CRM'],
        },
        {
          nombre: 'Accounting Slot Gamma',
          slug: `accounting-gamma-${TS}`,
          accountType: 'BUSINESS',
          parentId: agencyTenant.id,
          plan: 'accounting-slot',
          estado: 'activo',
          enabledModules: ['CONTABILIDAD', 'FACTURACION'],
        },
        {
          nombre: 'Accounting Slot Delta',
          slug: `accounting-delta-${TS}`,
          accountType: 'BUSINESS',
          parentId: agencyTenant.id,
          plan: 'accounting-slot',
          estado: 'activo',
          enabledModules: ['CONTABILIDAD'],
        },
        {
          nombre: 'Deleted Slot',
          slug: `deleted-slot-${TS}`,
          accountType: 'BUSINESS',
          parentId: agencyTenant.id,
          plan: 'agency-slot',
          estado: 'eliminado',
          enabledModules: ['CRM'],
        },
      ],
    });
  });

  afterAll(async () => {
    // Limpiar en orden inverso
    const tenantIds = [agencyTenant?.id, businessTenant?.id].filter(Boolean);
    if (tenantIds.length > 0) {
      const allTenantIds = [...tenantIds];
      const createdSlots = await prisma.tenant.findMany({
        where: { parentId: agencyTenant?.id },
        select: { id: true },
      });
      createdSlots.forEach((s: any) => allTenantIds.push(s.id));

      await prisma.apiKey.deleteMany({ where: { tenantId: { in: allTenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: allTenantIds } } });
    }
  });

  // ─── Tests: Filtro por tipo ──────────────────────────────────────────────

  describe('GET /api/slots — filtro por type', () => {
    it('sin type debe devolver todos los slots no eliminados (agency + accounting)', async () => {
      const response = await GET(makeRequest('https://volkern.app/api/slots', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(4); // 2 agency + 2 accounting, excluye el eliminado

      const plans = json.map((s: any) => s.plan);
      expect(plans).toContain('agency-slot');
      expect(plans).toContain('accounting-slot');
    });

    it("?type=agency debe devolver solo slots AGENCY_SLOT", async () => {
      const response = await GET(makeRequest('https://volkern.app/api/slots?type=agency', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(2); // 2 agency slots

      json.forEach((slot: any) => {
        expect(slot.plan).toBe('agency-slot');
      });

      // Verificar que son los correctos
      const names = json.map((s: any) => s.nombre).sort();
      expect(names).toEqual(['Agency Slot Alpha', 'Agency Slot Beta']);
    });

    it("?type=accounting debe devolver solo slots ACCOUNTING_SLOT", async () => {
      const response = await GET(makeRequest('https://volkern.app/api/slots?type=accounting', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(2); // 2 accounting slots

      json.forEach((slot: any) => {
        expect(slot.plan).toBe('accounting-slot');
      });

      // Verificar que son los correctos
      const names = json.map((s: any) => s.nombre).sort();
      expect(names).toEqual(['Accounting Slot Delta', 'Accounting Slot Gamma']);
    });

    it('?type=agency debe excluir slots accounting y viceversa (no solapamiento)', async () => {
      const [agencyRes, accountingRes] = await Promise.all([
        GET(makeRequest('https://volkern.app/api/slots?type=agency', agencyApiKey)),
        GET(makeRequest('https://volkern.app/api/slots?type=accounting', agencyApiKey)),
      ]);

      const agencyJson = await agencyRes.json();
      const accountingJson = await accountingRes.json();

      const agencyIds = agencyJson.map((s: any) => s.id);
      const accountingIds = accountingJson.map((s: any) => s.id);
      const overlap = agencyIds.filter((id: string) => accountingIds.includes(id));
      expect(overlap).toEqual([]);
    });

    it('?type=agency no debe incluir slots eliminados (soft delete)', async () => {
      const response = await GET(makeRequest('https://volkern.app/api/slots?type=agency', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();

      // "Deleted Slot" tiene estado 'eliminado' y plan 'agency-slot'
      const deleted = json.find((s: any) => s.nombre === 'Deleted Slot');
      expect(deleted).toBeUndefined();
    });

    it('slots deben incluir campos esperados (id, nombre, plan, estado, enabledModules)', async () => {
      const response = await GET(makeRequest('https://volkern.app/api/slots?type=agency', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();

      const slot = json[0];
      expect(slot).toHaveProperty('id');
      expect(slot).toHaveProperty('nombre');
      expect(slot).toHaveProperty('plan');
      expect(slot).toHaveProperty('estado');
      expect(slot).toHaveProperty('enabledModules');
      expect(slot).toHaveProperty('slug');
      expect(slot).toHaveProperty('billingEmail');
      expect(slot).toHaveProperty('_count');
      expect(slot._count).toHaveProperty('leads');
      expect(slot._count).toHaveProperty('users');
    });

    it('debe devolver 403 si el tenant no es AGENCY', async () => {
      if (isSuperadminUser) {
        console.warn('[SKIP] Usuario de prueba es Superadmin — no se puede probar 403 para BUSINESS');
        return;
      }

      const response = await GET(makeRequest('https://volkern.app/api/slots?type=agency', businessApiKey));

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Solo disponible para cuentas de Agencia');
    });

    it('debe devolver array vacío cuando no hay slots del tipo solicitado', async () => {
      // Crear tenant sin slots
      const emptyAgency = await prisma.tenant.create({
        data: {
          nombre: 'Empty Agency',
          slug: `empty-agency-${TS}`,
          accountType: 'AGENCY',
          enabledModules: ['crm'],
          plan: 'growth',
          maxSlots: 5,
        },
      });

      const { key: rawKey, keyHash: kh, prefix: pr } = generateApiKey('prod');
      await prisma.apiKey.create({
        data: {
          nombre: 'Empty Agency Key',
          keyHash: kh,
          prefix: pr,
          tenantId: emptyAgency.id,
          userId: testUser.id,
          scopes: ['agent:skill'],
        },
      });

      const response = await GET(makeRequest('https://volkern.app/api/slots?type=agency', rawKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual([]);

      // Limpiar
      await prisma.apiKey.deleteMany({ where: { tenantId: emptyAgency.id } });
      await prisma.tenant.deleteMany({ where: { id: emptyAgency.id } });
    });
  });
});
