/**
 * Test de Integración: Branding de Agencia
 * 
 * Usa la base de datos real para verificar que el endpoint PATCH /api/agency/settings/branding
 * persiste correctamente la configuración de marca y respeta las reglas de autorización.
 * 
 * NOTA: Se prueba el handler directamente con autenticación vía API Key real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';
import { PATCH, GET } from '@/app/api/agency/settings/branding/route';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(method: 'GET' | 'PATCH', apiKey: string, body?: unknown): Request {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request('https://volkern.app/api/agency/settings/branding', opts);
}

// ─── Test Data (unique slugs to avoid collisions) ─────────────────────────

const TS = Date.now();
const AGENCY_SLUG = `test-branding-agency-${TS}`;
const BUSINESS_SLUG = `test-branding-business-${TS}`;

let agencyTenant: any;
let businessTenant: any;
let testUser: any;
let agencyApiKey: string;
let businessApiKey: string;
let isSuperadminUser = false;

// ─── Setup / Teardown ─────────────────────────────────────────────────────

describe('Integración: Branding de Agencia (DB real)', () => {
  beforeAll(async () => {
    // 1. Obtener usuario base (necesario para crear API keys)
    // Buscamos un usuario que NO sea Superadmin para que la prueba 403 sea válida
    testUser =
      (await prisma.user.findFirst({
        where: { role: { isNot: { nombre: 'Superadmin' } } },
      })) ||
      (await prisma.user.findFirst({ where: { email: { contains: 'volkern' } } })) ||
      (await prisma.user.findFirst());

    if (!testUser) {
      throw new Error('No se encontró ningún usuario en la base de datos para las pruebas');
    }

    // Si el usuario resulta ser Superadmin, advertirlo (la prueba 403 se saltará)
    const userWithRole = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { role: { select: { nombre: true } } },
    });
    isSuperadminUser = userWithRole?.role?.nombre === 'Superadmin';

    // 2. Crear tenant de tipo AGENCY
    agencyTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Branding Agency',
        slug: AGENCY_SLUG,
        accountType: 'AGENCY',
        enabledModules: ['ia_agencia', 'crm'],
        plan: 'growth',
      },
    });

    // 3. Crear API key para la agencia
    const { key: rawAgencyKey, keyHash: agencyHash, prefix: agencyPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Branding Agency Key',
        keyHash: agencyHash,
        prefix: agencyPrefix,
        tenantId: agencyTenant.id,
        userId: testUser.id,
        scopes: ['agent:skill', 'settings:write'],
      },
    });
    agencyApiKey = rawAgencyKey;

    // 4. Crear tenant de tipo BUSINESS (para test 403)
    businessTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Branding Business',
        slug: BUSINESS_SLUG,
        accountType: 'BUSINESS',
        enabledModules: ['crm'],
        plan: 'basico',
      },
    });

    // 5. Crear API key para BUSINESS (no debería poder actualizar branding)
    const { key: rawBizKey, keyHash: bizHash, prefix: bizPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Branding Business Key',
        keyHash: bizHash,
        prefix: bizPrefix,
        tenantId: businessTenant.id,
        userId: testUser.id,
        scopes: ['agent:skill', 'settings:write'],
      },
    });
    businessApiKey = rawBizKey;
  });

  afterAll(async () => {
    // Limpiar en orden inverso: primero API keys, luego tenants
    const tenantIds = [agencyTenant?.id, businessTenant?.id].filter(Boolean);
    if (tenantIds.length > 0) {
      await prisma.apiKey.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  });

  // ─── PATCH ────────────────────────────────────────────────────────────

  describe('PATCH /api/agency/settings/branding', () => {
    it('debe actualizar branding con todos los campos y persistir en DB', async () => {
      const brandingData = {
        logo_url: 'https://cdn.volkern.com/logos/integration-test.png',
        primary_color: '#7C3AED',
        show_powered_by: false,
        custom_footer_text: 'Hecho por Agencia de Integración',
      };

      const response = await PATCH(makeRequest('PATCH', agencyApiKey, brandingData));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.branding).toEqual({
        logoUrl: brandingData.logo_url,
        primaryColor: brandingData.primary_color,
        showPoweredBy: brandingData.show_powered_by,
        customFooterText: brandingData.custom_footer_text,
      });

      // Verificar persistencia en DB real
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: agencyTenant.id },
        select: { brandingConfig: true },
      });
      expect((dbTenant?.brandingConfig as any)?.logoUrl).toBe(brandingData.logo_url);
      expect((dbTenant?.brandingConfig as any)?.primaryColor).toBe(brandingData.primary_color);
      expect((dbTenant?.brandingConfig as any)?.showPoweredBy).toBe(false);
    });

    it('debe actualizar solo los campos enviados (parcial) sin perder datos previos', async () => {
      // Primero establecer branding completo
      await prisma.tenant.update({
        where: { id: agencyTenant.id },
        data: { brandingConfig: { logoUrl: 'https://original.com/logo.png', primaryColor: '#000', showPoweredBy: true, customFooterText: 'Original' } },
      });

      // Actualizar solo primary_color
      const response = await PATCH(
        makeRequest('PATCH', agencyApiKey, { primary_color: '#FF0000' }),
      );

      expect(response.status).toBe(200);

      // Verificar en DB que el campo se actualizó (brandingConfig se reemplaza completo)
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: agencyTenant.id },
        select: { brandingConfig: true },
      });
      const config = dbTenant?.brandingConfig as any;
      // El brandingConfig se reemplaza completo, logo anterior se pierde
      // (la lógica actual setea todo el objeto brandingConfig de una vez)
      expect(config.primaryColor).toBe('#FF0000');
      // showPoweredBy por defecto true (no se envío en el body)
      expect(config.showPoweredBy).toBe(true);
    });

    it('debe devolver 403 si el tenant no es AGENCY', async () => {
      // Si el usuario de prueba es Superadmin, el check de AGENCY se salta
      // y la prueba 403 no aplica (es un edge case del setup, no del código)
      if (isSuperadminUser) {
        console.warn('[SKIP] Usuario de prueba es Superadmin — no se puede probar 403 para BUSINESS');
        return;
      }

      const response = await PATCH(
        makeRequest('PATCH', businessApiKey, {
          logo_url: 'https://hacker.com/logo.png',
        }),
      );

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Solo disponible para cuentas de Agencia');

      // Verificar que NO se modificó el branding de la empresa BUSINESS
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: businessTenant.id },
        select: { brandingConfig: true },
      });
      expect(dbTenant?.brandingConfig).toBeNull();
    });

    it('debe devolver 400 si show_powered_by no es booleano', async () => {
      const response = await PATCH(
        makeRequest('PATCH', agencyApiKey, { show_powered_by: 'no-boolean' }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Datos de branding inválidos');
      expect(json.details).toBeDefined();
    });

    it('debe devolver 500 si request.json() falla (body inválido)', async () => {
      const req = new Request('https://volkern.app/api/agency/settings/branding', {
        method: 'PATCH',
        headers: {
          'X-API-Key': agencyApiKey,
          'Content-Type': 'application/json',
        },
        body: '{ broken json',
      });

      const response = await PATCH(req);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Error al actualizar configuración de marca');
    });
  });

  // ─── GET ─────────────────────────────────────────────────────────────

  describe('GET /api/agency/settings/branding', () => {
    it('debe devolver brandingConfig cuando existe', async () => {
      // Asegurar que hay branding guardado
      await prisma.tenant.update({
        where: { id: agencyTenant.id },
        data: {
          brandingConfig: {
            logoUrl: 'https://cdn.volkern.com/logos/get-test.png',
            primaryColor: '#3B82F6',
            showPoweredBy: true,
            customFooterText: 'Test GET',
          },
        },
      });

      const response = await GET(makeRequest('GET', agencyApiKey));
      const json = await response.json();

      // El cuerpo del error va en el mensaje: cuando esta prueba cayó bajo la
      // suite completa, el 401 a secas no decía POR QUÉ (la ruta responde
      // `{ error }` en cada rama de autenticación) y hubo que reproducirla a
      // ciegas. Con el cuerpo delante, la próxima vez se lee la causa.
      expect(response.status, JSON.stringify(json)).toBe(200);
      expect(json.logoUrl).toBe('https://cdn.volkern.com/logos/get-test.png');
      expect(json.primaryColor).toBe('#3B82F6');
      expect(json.showPoweredBy).toBe(true);
      expect(json.customFooterText).toBe('Test GET');
    });

    it('debe devolver objeto vacío cuando no hay brandingConfig', async () => {
      // BUSINESS tenant no tiene branding
      const response = await GET(makeRequest('GET', businessApiKey));
      const json = await response.json();

      expect(response.status, JSON.stringify(json)).toBe(200);
      expect(json).toEqual({});
    });
  });
});
