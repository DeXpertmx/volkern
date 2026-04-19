import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { validateApiKey } from '@/lib/api-key-auth';
import { NextRequest } from 'next/server';
import { generateApiKey } from '@/lib/api-keys';

/**
 * Test de Integración: Aislamiento de Agencias y Seguridad (v3 - Targeted)
 * Valida la "Regla de Oro" y el cumplimiento de cuotas (PaaS).
 * 
 * NOTA: Testeamos directamente validateApiKey para evitar errores de 
 * "request scope" de Next.js/Next-Auth en el entorno Vitest.
 */
describe('Volkern Agency Security & Isolation (Targeted Logic)', () => {
  let agencyA: any;
  let agencyB: any;
  let slotA: any;
  let apiKeyA: string;
  let apiKeyB: string;
  let testUser: any;

  beforeAll(async () => {
    // 1. Obtener un usuario base
    testUser = await prisma.user.findFirst({
      where: { email: { contains: 'volkern' } }
    }) || await prisma.user.findFirst();

    // 2. Setup Agencia A
    agencyA = await prisma.tenant.create({
      data: {
        nombre: 'Agencia Alfa',
        slug: 'agencia-alfa-' + Date.now(),
        accountType: 'AGENCY',
        maxSlots: 1,
        enabledModules: ['ia_agencia', 'crm']
      }
    });

    const { key: rawKeyA, keyHash: hashA, prefix: prefA } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Key Alfa',
        keyHash: hashA,
        prefix: prefA,
        tenantId: agencyA.id,
        userId: testUser.id,
        scopes: ['agent:skill']
      }
    });
    apiKeyA = rawKeyA;

    // 3. Setup Slot 1 (Hijo de Agencia A)
    slotA = await prisma.tenant.create({
      data: {
        nombre: 'Slot de Alfa',
        slug: 'slot-alfa-1-' + Date.now(),
        parentId: agencyA.id,
        accountType: 'BUSINESS',
        enabledModules: ['crm']
      }
    });

    // 4. Setup Agencia B (El Intruso)
    agencyB = await prisma.tenant.create({
      data: {
        nombre: 'Agencia Beta',
        slug: 'agencia-beta-' + Date.now(),
        accountType: 'AGENCY',
        maxSlots: 5
      }
    });

    const { key: rawKeyB, keyHash: hashB, prefix: prefB } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Key Beta',
        keyHash: hashB,
        prefix: prefB,
        tenantId: agencyB.id,
        userId: testUser.id,
        scopes: ['agent:skill']
      }
    });
    apiKeyB = rawKeyB;
  });

  afterAll(async () => {
    if (agencyA?.id) {
      await prisma.apiKey.deleteMany({ where: { tenantId: { in: [agencyA.id, agencyB?.id].filter(Boolean) } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [slotA?.id, agencyA.id, agencyB?.id].filter(Boolean) } } });
    }
  });

  it('HAPPY PATH: validateApiKey debe permitir que Agencia A acceda a su propio Slot', async () => {
    const req = new NextRequest(`http://localhost/api?target_account_id=${slotA.id}`, {
      headers: { 'X-API-Key': apiKeyA }
    });

    const auth = await validateApiKey(req, ['agent:skill']);
    
    expect(auth.valid).toBe(true);
    expect(auth.tenant?.id).toBe(slotA.id); // Validamos que el tenant de destino es el slot
    expect(auth.agencyContext).toBe(true); // Validamos que se reconoce el contexto de agencia
  });

  it('SECURITY: validateApiKey debe RECHAZAR que Agencia B acceda al Slot de Agencia A', async () => {
    const req = new NextRequest(`http://localhost/api?target_account_id=${slotA.id}`, {
      headers: { 'X-API-Key': apiKeyB } // Key de Agencia B
    });

    const auth = await validateApiKey(req, ['agent:skill']);
    
    expect(auth.valid).toBe(false);
    expect(auth.error).toContain('Violación de jerarquía');
  });

  it('MODELS: validateApiKey debe usar el tenant de la Agencia si no hay target_account_id', async () => {
    const req = new NextRequest(`http://localhost/api`, {
      headers: { 'X-API-Key': apiKeyA }
    });

    const auth = await validateApiKey(req);
    
    expect(auth.valid).toBe(true);
    expect(auth.tenant?.id).toBe(agencyA.id);
  });

  it('FORMAT: validateApiKey debe rechazar keys con formato inválido', async () => {
    const req = new NextRequest(`http://localhost/api`, {
      headers: { 'X-API-Key': 'invalid-key' }
    });

    const auth = await validateApiKey(req);
    
    expect(auth.valid).toBe(false);
    expect(auth.error).toContain('Formato');
  });
});
