/**
 * Test de Integración: Slots de Asesoría Contable
 * 
 * Usa la base de datos real para verificar que los endpoints GET y POST /api/accounting/slots
 * funcionan correctamente, respetan límites, heredan configuración y fuerzan showPoweredBy=true.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';
import { GET, POST } from '@/app/api/accounting/slots/route';
import { GET as GET_BRANDING, PATCH as PATCH_BRANDING } from '@/app/api/accounting/settings/branding/route';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(method: 'GET' | 'POST', apiKey: string, body?: unknown): Request {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request('https://volkern.app/api/accounting/slots', opts);
}

function makeBrandingRequest(method: 'GET' | 'PATCH', apiKey: string, body?: unknown): Request {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request('https://volkern.app/api/accounting/settings/branding', opts);
}

// ─── Test Data (unique slugs to avoid collisions) ─────────────────────────

const TS = Date.now();
const AGENCY_SLUG = `test-acc-agency-${TS}`;
const BUSINESS_SLUG = `test-acc-business-${TS}`;

let agencyTenant: any;
let businessTenant: any;
let testUser: any;
let agencyApiKey: string;
let businessApiKey: string;
let isSuperadminUser = false;

// ─── Setup / Teardown ─────────────────────────────────────────────────────

if (!process.env.INTEGRATION_TESTS) {
  describe.skip('Integración: Slots de Asesoría Contable (DB real)', () => {});
} else {
  describe('Integración: Slots de Asesoría Contable (DB real)', () => {
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

    // 2. Crear tenant de tipo AGENCY (despacho contable)
    agencyTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Accounting Agency',
        slug: AGENCY_SLUG,
        accountType: 'AGENCY',
        enabledModules: ['ia_agencia', 'crm', 'finanzas', 'conciliacion'],
        plan: 'pro-accounting',
        maxSlots: 5,
        brandingConfig: {
          logoUrl: 'https://ejemplo.com/logo-contable.png',
          primaryColor: '#059669',
          showPoweredBy: true,
          customFooterText: 'Despacho Contable de Prueba',
        },
        estado: 'activo',
      },
    });

    // 3. Crear API key para la agencia
    const { key: rawAgencyKey, keyHash: agencyHash, prefix: agencyPrefix } = generateApiKey('prod');      await prisma.apiKey.create({
        data: {
          nombre: 'Test Accounting Agency Key',
          keyHash: agencyHash,
          prefix: agencyPrefix,
          tenantId: agencyTenant.id,
          userId: testUser.id,
          scopes: ['accounting:write'],
        },
      });
      agencyApiKey = rawAgencyKey;

    // 4. Crear tenant de tipo BUSINESS (para test 403)
    businessTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Accounting Business',
        slug: BUSINESS_SLUG,
        accountType: 'BUSINESS',
        enabledModules: ['crm'],
        plan: 'basico',
        estado: 'activo',
      },
    });

    // 5. Crear API key para BUSINESS
    const { key: rawBizKey, keyHash: bizHash, prefix: bizPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Accounting Business Key',
        keyHash: bizHash,
        prefix: bizPrefix,
        tenantId: businessTenant.id,
        userId: testUser.id,
        scopes: ['accounting:write'],
      },
    });
    businessApiKey = rawBizKey;
  }, 30000);

  afterAll(async () => {
    // Limpiar en orden inverso
    const tenantIds = [agencyTenant?.id, businessTenant?.id].filter(Boolean);
    if (tenantIds.length > 0) {
      // También eliminar slots creados durante las pruebas (parentId = agency.id)
      // y sus API keys asociadas
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

  // ─── GET ─────────────────────────────────────────────────────────────

  describe('GET /api/accounting/slots', () => {
    it('debe retornar lista vacía cuando no hay slots', async () => {
      const response = await GET(makeRequest('GET', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(0);
    });

    it('debe retornar 403 si el tenant no es AGENCY', async () => {
      if (isSuperadminUser) {
        console.warn('[SKIP] Usuario de prueba es Superadmin — no se puede probar 403 para BUSINESS');
        return;
      }

      const response = await GET(makeRequest('GET', businessApiKey));

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Solo disponible para cuentas de Asesoría');
    });

    it('debe incluir slots creados previamente', async () => {
      // Crear un slot directamente para probar GET
      const slot = await prisma.tenant.create({
        data: {
          nombre: 'Pre Created Client',
          slug: `pre-client-${TS}`,
          accountType: 'BUSINESS',
          parentId: agencyTenant.id,
          plan: 'accounting-slot',
          estado: 'activo',
          brandingConfig: { showPoweredBy: true },
          enabledModules: ['CRM', 'FINANZAS'],
        },
      });

      const response = await GET(makeRequest('GET', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBeGreaterThanOrEqual(1);
      const found = json.find((s: any) => s.id === slot.id);
      expect(found).toBeDefined();
      expect(found.nombre).toBe('Pre Created Client');
      expect(found.plan).toBe('accounting-slot');
      expect(found.estado).toBe('activo');
    });
  });

  // ─── POST ────────────────────────────────────────────────────────────

  describe('POST /api/accounting/slots', () => {
    it('debe crear un slot correctamente y devolver 201', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Integration Client Test',
          admin_email: 'admin@integracion-test.com',
          modules_enabled: ['crm', 'finanzas'],
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      expect(json.nombre).toBe('Integration Client Test');
      expect(json.accountType).toBe('BUSINESS');
      expect(json.parentId).toBe(agencyTenant.id);
      expect(json.plan).toBe('accounting-slot');
      expect(json.estado).toBe('activo');
      expect(json.billingEmail).toBe('admin@integracion-test.com');
      expect(json.slug).toMatch(/^integration-client-test-/);

      // Verificar persistencia en DB
      const dbSlot = await prisma.tenant.findUnique({ where: { id: json.id } });
      expect(dbSlot).not.toBeNull();
      expect(dbSlot?.nombre).toBe('Integration Client Test');
    }, 30000);

    it('debe heredar brandingConfig con showPoweredBy forzado a true', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Branding Client',
          admin_email: 'branding@test.com',
          modules_enabled: ['crm'],
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      const dbSlot = await prisma.tenant.findUnique({
        where: { id: json.id },
        select: { brandingConfig: true },
      });

      const bc: any = dbSlot?.brandingConfig;
      expect(bc).toBeDefined();
      expect(bc.showPoweredBy).toBe(true);
      expect(bc.primaryColor).toBe('#059669');
      expect(bc.logoUrl).toBe('https://ejemplo.com/logo-contable.png');
    }, 30000);

    it('debe respetar modules_enabled enviado en el body (normalizado a uppercase)', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Modules Client',
          admin_email: 'modules@test.com',
          modules_enabled: ['crm', 'finanzas', 'conciliacion', 'marketing'],
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      const dbSlot = await prisma.tenant.findUnique({
        where: { id: json.id },
        select: { enabledModules: true },
      });

      expect(dbSlot?.enabledModules).toEqual(['CRM', 'FINANZAS', 'CONCILIACION', 'MARKETING']);
    }, 30000);

    it('debe usar CRM como default si no se envía modules_enabled', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Default Modules Client',
          admin_email: 'default-mod@test.com',
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      const dbSlot = await prisma.tenant.findUnique({
        where: { id: json.id },
        select: { enabledModules: true },
      });

      expect(dbSlot?.enabledModules).toEqual(['CRM']);
    }, 30000);

    it('debe retornar 403 si el tenant no es AGENCY', async () => {
      if (isSuperadminUser) {
        console.warn('[SKIP] Usuario de prueba es Superadmin — no se puede probar 403 para BUSINESS');
        return;
      }

      const response = await POST(
        makeRequest('POST', businessApiKey, {
          client_name: 'Hacker Client',
          admin_email: 'hacker@evil.com',
        }),
      );

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Solo disponible para cuentas de Asesoría');
    });

    it('debe retornar 400 si faltan campos requeridos', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Solo Nombre', // falta admin_email
        }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Datos del slot inválidos');
      expect(json.details).toBeDefined();
    });

    it('debe retornar 403 si se alcanzó el límite de clientes', async () => {
      // Crear agencia temporal con maxSlots=2
      const tempAgency = await prisma.tenant.create({
        data: {
          nombre: 'Temp Limited Agency',
          slug: `temp-limited-${TS}`,
          accountType: 'AGENCY',
          enabledModules: ['crm', 'finanzas'],
          plan: 'pro-accounting',
          maxSlots: 2,
          brandingConfig: { showPoweredBy: true },
          estado: 'activo',
        },
      });

      const { key: rawKey, keyHash: kh, prefix: pr } = generateApiKey('prod');
      await prisma.apiKey.create({
        data: {
          nombre: 'Temp Limited Agency Key',
          keyHash: kh,
          prefix: pr,
          tenantId: tempAgency.id,
          userId: testUser.id,
          scopes: ['accounting:write'],
        },
      });

      // Crear 2 slots para alcanzar el límite
      await prisma.tenant.create({
        data: {
          nombre: 'Slot 1',
          slug: `slot-1-${TS}`,
          accountType: 'BUSINESS',
          parentId: tempAgency.id,
          plan: 'accounting-slot',
          enabledModules: ['CRM'],
          brandingConfig: { showPoweredBy: true },
        },
      });
      await prisma.tenant.create({
        data: {
          nombre: 'Slot 2',
          slug: `slot-2-${TS}`,
          accountType: 'BUSINESS',
          parentId: tempAgency.id,
          plan: 'accounting-slot',
          enabledModules: ['CRM'],
          brandingConfig: { showPoweredBy: true },
        },
      });

      const response = await POST(
        makeRequest('POST', rawKey, {
          client_name: 'Overflow Client',
          admin_email: 'admin@overflow.com',
        }),
      );

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Límite de clientes alcanzado');

      // Limpiar
      await prisma.apiKey.deleteMany({ where: { tenantId: tempAgency.id } });
      await prisma.tenant.deleteMany({
        where: { OR: [{ id: tempAgency.id }, { parentId: tempAgency.id }] },
      });
    });

    it('debe retornar 500 si request.json() falla (body inválido)', async () => {
      const req = new Request('https://volkern.app/api/accounting/slots', {
        method: 'POST',
        headers: {
          'X-API-Key': agencyApiKey,
          'Content-Type': 'application/json',
        },
        body: '{ broken json',
      });

      const response = await POST(req);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Error al crear el slot del cliente');
    });
  });

  // ─── Branding ─────────────────────────────────────────────────────────

  describe('Branding /api/accounting/settings/branding', () => {
    it('debe obtener branding por GET', async () => {
      const response = await GET_BRANDING(makeBrandingRequest('GET', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.primaryColor).toBe('#059669');
      expect(json.logoUrl).toBe('https://ejemplo.com/logo-contable.png');
      expect(json.showPoweredBy).toBe(true);
    });

    it('debe actualizar branding y forzar showPoweredBy=true', async () => {
      const response = await PATCH_BRANDING(
        makeBrandingRequest('PATCH', agencyApiKey, {
          primary_color: '#7C3AED',
          custom_footer_text: 'Despacho de Prueba',
        }),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.branding.primaryColor).toBe('#7C3AED');
      expect(json.branding.showPoweredBy).toBe(true); // Forzado
      expect(json.branding.customFooterText).toBe('Despacho de Prueba');
      expect(json.note).toContain('showPoweredBy');

      // Restaurar el branding original
      await prisma.tenant.update({
        where: { id: agencyTenant.id },
        data: {
          brandingConfig: {
            primaryColor: '#059669',
            logoUrl: 'https://ejemplo.com/logo-contable.png',
            showPoweredBy: true,
            customFooterText: 'Despacho Contable de Prueba',
          },
        },
      });
    });
  });
});
}
