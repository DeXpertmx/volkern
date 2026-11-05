/**
 * Test de Integración: Slots de Agencia
 * 
 * Usa la base de datos real para verificar que los endpoints GET y POST /api/agency/slots
 * funcionan correctamente, respetan límites y heredan configuración de la agencia.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';
import { GET, POST } from '@/app/api/agency/slots/route';

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
  return new Request('https://volkern.app/api/agency/slots', opts);
}

// ─── Test Data (unique slugs to avoid collisions) ─────────────────────────

const TS = Date.now();
const AGENCY_SLUG = `test-slots-agency-${TS}`;
const BUSINESS_SLUG = `test-slots-business-${TS}`;

let agencyTenant: any;
let businessTenant: any;
let testUser: any;
let agencyApiKey: string;
let businessApiKey: string;
let isSuperadminUser = false;

// ─── Setup / Teardown ─────────────────────────────────────────────────────

describe('Integración: Slots de Agencia (DB real)', () => {
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

    // 2. Crear tenant de tipo AGENCY con límite de slots
    agencyTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Slots Agency',
        slug: AGENCY_SLUG,
        accountType: 'AGENCY',
        enabledModules: ['ia_agencia', 'crm'],
        plan: 'growth',
        maxSlots: 5,
        brandingConfig: {
          logoUrl: 'https://agency.com/logo.png',
          primaryColor: '#7C3AED',
          showPoweredBy: true,
          customFooterText: 'By Test Agency',
        },
      },
    });

    // 3. Crear API key para la agencia
    const { key: rawAgencyKey, keyHash: agencyHash, prefix: agencyPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Slots Agency Key',
        keyHash: agencyHash,
        prefix: agencyPrefix,
        tenantId: agencyTenant.id,
        userId: testUser.id,
        scopes: ['agent:skill', 'team:read', 'team:write'],
      },
    });
    agencyApiKey = rawAgencyKey;

    // 4. Crear tenant de tipo BUSINESS (para test 403)
    businessTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Slots Business',
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
        nombre: 'Test Slots Business Key',
        keyHash: bizHash,
        prefix: bizPrefix,
        tenantId: businessTenant.id,
        userId: testUser.id,
        scopes: ['agent:skill', 'team:read', 'team:write'],
      },
    });
    businessApiKey = rawBizKey;
  });

  afterAll(async () => {
    // Limpiar en orden inverso
    const tenantIds = [agencyTenant?.id, businessTenant?.id].filter(Boolean);
    if (tenantIds.length > 0) {
      // También eliminar slots creados durante las pruebas (parentId = agency.id)
      // y sus API keys asociadas
      const allTenantIds = [...tenantIds];
      // Buscar slots creados durante tests
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

  describe('GET /api/agency/slots', () => {
    it('debe devolver lista vacía cuando no hay slots', async () => {
      const response = await GET(makeRequest('GET', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(0);
    });

    it('debe devolver 403 si el tenant no es AGENCY', async () => {
      if (isSuperadminUser) {
        console.warn('[SKIP] Usuario de prueba es Superadmin — no se puede probar 403 para BUSINESS');
        return;
      }

      const response = await GET(makeRequest('GET', businessApiKey));

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Solo disponible para cuentas de Agencia');
    });

    it('debe incluir slots creados previamente', async () => {
      // Crear un slot directamente para probar GET
      const slot = await prisma.tenant.create({
        data: {
          nombre: 'Pre Created Slot',
          slug: `pre-created-${TS}`,
          accountType: 'BUSINESS',
          parentId: agencyTenant.id,
          plan: 'agency-slot',
          estado: 'activo',
          enabledModules: ['CRM'],
        },
      });

      const response = await GET(makeRequest('GET', agencyApiKey));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.length).toBeGreaterThanOrEqual(1);
      const found = json.find((s: any) => s.id === slot.id);
      expect(found).toBeDefined();
      expect(found.nombre).toBe('Pre Created Slot');
      expect(found.plan).toBe('agency-slot');
      expect(found.estado).toBe('activo');
    });
  });

  // ─── POST ────────────────────────────────────────────────────────────

  describe('POST /api/agency/slots', () => {
    it('debe crear un slot correctamente y devolver 201', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Integration Client',
          admin_email: 'admin@integration.com',
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      expect(json.nombre).toBe('Integration Client');
      expect(json.accountType).toBe('BUSINESS');
      expect(json.parentId).toBe(agencyTenant.id);
      expect(json.plan).toBe('agency-slot');
      expect(json.estado).toBe('activo');
      expect(json.billingEmail).toBe('admin@integration.com');
      expect(json.slug).toMatch(/^integration-client-/);

      // Verificar persistencia en DB
      const dbSlot = await prisma.tenant.findUnique({ where: { id: json.id } });
      expect(dbSlot).not.toBeNull();
      expect(dbSlot?.nombre).toBe('Integration Client');
    });

    it('debe heredar brandingConfig de la agencia', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Branding Inherit Client',
          admin_email: 'admin@branding.com',
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      // Verificar en DB
      const dbSlot = await prisma.tenant.findUnique({
        where: { id: json.id },
        select: { brandingConfig: true },
      });

      const config = dbSlot?.brandingConfig as any;
      expect(config.logoUrl).toBe('https://agency.com/logo.png');
      expect(config.primaryColor).toBe('#7C3AED');
      expect(config.showPoweredBy).toBe(true);
    });

    it('debe respetar modules_enabled enviado en el body (normalizado a uppercase)', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Modules Client',
          admin_email: 'admin@modules.com',
          modules_enabled: ['crm', 'POS', 'ia_agencia'],
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      const dbSlot = await prisma.tenant.findUnique({
        where: { id: json.id },
        select: { enabledModules: true },
      });

      expect(dbSlot?.enabledModules).toEqual(['CRM', 'POS', 'IA_AGENCIA']);
    });

    it('debe usar CRM como default si no se envía modules_enabled', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Default Modules Client',
          admin_email: 'admin@default-modules.com',
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      const dbSlot = await prisma.tenant.findUnique({
        where: { id: json.id },
        select: { enabledModules: true },
      });

      expect(dbSlot?.enabledModules).toEqual(['CRM']);
    });

    it('debe devolver 403 si el tenant no es AGENCY', async () => {
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
      expect(json.error).toContain('Solo disponible para cuentas de Agencia');
    });

    it('debe devolver 400 si falta client_name', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          admin_email: 'admin@test.com',
        }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Datos del slot inválidos');
      expect(json.details).toBeDefined();
    });

    it('debe devolver 400 si falta admin_email', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, {
          client_name: 'Client',
        }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Datos del slot inválidos');
      expect(json.details).toBeDefined();
    });

    it('debe devolver 403 si se alcanzó el límite de slots', async () => {
      // Crear una agencia temporal con maxSlots = 2 y ya 2 slots
      const tempAgency = await prisma.tenant.create({
        data: {
          nombre: 'Temp Limited Agency',
          slug: `temp-limited-${TS}`,
          accountType: 'AGENCY',
          enabledModules: ['crm'],
          plan: 'growth',
          maxSlots: 2,
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
          scopes: ['agent:skill', 'team:read', 'team:write'],
        },
      });

      // Crear 2 slots para alcanzar el límite
      await prisma.tenant.create({
        data: {
          nombre: 'Slot 1',
          slug: `slot-1-${TS}`,
          accountType: 'BUSINESS',
          parentId: tempAgency.id,
          plan: 'agency-slot',
        },
      });
      await prisma.tenant.create({
        data: {
          nombre: 'Slot 2',
          slug: `slot-2-${TS}`,
          accountType: 'BUSINESS',
          parentId: tempAgency.id,
          plan: 'agency-slot',
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
      expect(json.error).toContain('Límite de slots alcanzado');

      // Limpiar
      await prisma.apiKey.deleteMany({ where: { tenantId: tempAgency.id } });
      await prisma.tenant.deleteMany({
        where: { OR: [{ id: tempAgency.id }, { parentId: tempAgency.id }] },
      });
    });

    it('debe devolver 500 si request.json() falla (body inválido)', async () => {
      const req = new Request('https://volkern.app/api/agency/slots', {
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
});
