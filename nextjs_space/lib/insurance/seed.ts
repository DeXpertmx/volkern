/**
 * Volkern Insurance Module — Seed
 *
 * Seed inicial al activar el módulo de seguros para un tenant.
 * Crea:
 *   1. Pipeline stages de nuevas pólizas + renovaciones
 *   2. Automatizaciones pre-configuradas
 *   3. Aseguradoras de ejemplo
 *   4. Productos de ejemplo
 *
 * Siguiendo el patrón de lib/real-estate/seed.ts
 */

import { prisma, getTenantDb, dbContext } from '@/lib/db';
import {
  setupInsurancePipelines,
  INSURANCE_NEW_POLICY_STAGES,
  INSURANCE_RENEWAL_STAGES,
} from './setup-pipeline';

// ─── Aseguradoras de ejemplo ──────────────────────────────────────────────────

const ASEGURADORAS_SEED = [
  { nombre: 'AXA', nif: 'A-12345678' },
  { nombre: 'Qualitas', nif: 'Q-87654321' },
  { nombre: 'GNP', nif: 'G-11223344' },
  { nombre: 'MAPFRE', nif: 'M-55667788' },
  { nombre: 'Allianz', nif: 'A-99887766' },
];

// ─── Productos de ejemplo ─────────────────────────────────────────────────────

interface ProductoSeed {
  aseguradoraIdx: number;
  nombre: string;
  ramo: string;
  subramo?: string;
  primaReferencia?: number;
  comisionPct?: number;
}

const PRODUCTOS_SEED: ProductoSeed[] = [
  { aseguradoraIdx: 0, nombre: 'Seguro Auto Terceros Ampliado', ramo: 'AUTO', subramo: 'Terceros ampliado', primaReferencia: 450, comisionPct: 15 },
  { aseguradoraIdx: 0, nombre: 'Seguro Auto Todo Riesgo', ramo: 'AUTO', subramo: 'Todo riesgo', primaReferencia: 850, comisionPct: 15 },
  { aseguradoraIdx: 0, nombre: 'Seguro Hogar Protección Familiar', ramo: 'HOGAR', subramo: 'Hogar completo', primaReferencia: 320, comisionPct: 20 },
  { aseguradoraIdx: 0, nombre: 'Seguro Vida Protección Familiar', ramo: 'VIDA', subramo: 'Vida entera', primaReferencia: 600, comisionPct: 25 },
  { aseguradoraIdx: 0, nombre: 'Seguro Salud Integral', ramo: 'SALUD', primaReferencia: 1200, comisionPct: 12 },
  { aseguradoraIdx: 1, nombre: 'Auto Qualitas Terceros', ramo: 'AUTO', subramo: 'Terceros', primaReferencia: 380, comisionPct: 15 },
  { aseguradoraIdx: 1, nombre: 'Auto Qualitas Amplio', ramo: 'AUTO', subramo: 'Amplio', primaReferencia: 620, comisionPct: 15 },
  { aseguradoraIdx: 2, nombre: 'Vida GNP Protección', ramo: 'VIDA', subramo: 'Vida temporal', primaReferencia: 480, comisionPct: 20 },
  { aseguradoraIdx: 2, nombre: 'Gastos Médicos GNP', ramo: 'GASTOS_MEDICOS', primaReferencia: 1500, comisionPct: 10 },
  { aseguradoraIdx: 3, nombre: 'Hogar MAPFRE', ramo: 'HOGAR', primaReferencia: 350, comisionPct: 18 },
  { aseguradoraIdx: 3, nombre: 'Auto MAPFRE Todo Riesgo', ramo: 'AUTO', subramo: 'Todo riesgo', primaReferencia: 780, comisionPct: 15 },
  { aseguradoraIdx: 3, nombre: 'Vida MAPFRE Ahorro', ramo: 'VIDA', subramo: 'Vida ahorro', primaReferencia: 900, comisionPct: 22 },
  { aseguradoraIdx: 4, nombre: 'RC Profesional Allianz', ramo: 'RESPONSABILIDAD_CIVIL', primaReferencia: 550, comisionPct: 12 },
  { aseguradoraIdx: 4, nombre: 'Empresarial Allianz', ramo: 'EMPRESARIAL', primaReferencia: 2500, comisionPct: 10 },
  { aseguradoraIdx: 4, nombre: 'Vida Allianz Jubilación', ramo: 'JUBILACION', primaReferencia: 1200, comisionPct: 20 },
];

// ─── Main Seed Function ───────────────────────────────────────────────────────

export async function seedInsuranceModule(tenantId: string) {
  console.log(`🛡️  Seeding módulo de seguros para tenant ${tenantId}...`);

  const tenantClient = await getTenantDb(tenantId);

  return await dbContext.run({ tenantId, client: tenantClient }, async () => {
    // 1. Crear pipeline stages
    const { newPolicyCreated, renewalCreated } = await setupInsurancePipelines(tenantId);
    console.log(`📊 Pipeline nuevas pólizas: ${newPolicyCreated} etapas creadas`);
    console.log(`📊 Pipeline renovaciones: ${renewalCreated} etapas creadas`);

    // 2. Crear aseguradoras de ejemplo
    const aseguradoraIds: string[] = [];
    for (const ase of ASEGURADORAS_SEED) {
      const existing = await prisma.aseguradora.findFirst({
        where: { tenantId, nombre: ase.nombre },
      });
      if (!existing) {
        const created = await prisma.aseguradora.create({
          data: { tenantId, ...ase },
        });
        aseguradoraIds.push(created.id);
      } else {
        aseguradoraIds.push(existing.id);
      }
    }
    console.log(`🏢 ${ASEGURADORAS_SEED.length} aseguradoras de ejemplo listas`);

    // 3. Crear productos de ejemplo
    let productosCreados = 0;
    for (const prod of PRODUCTOS_SEED) {
      const aseId = aseguradoraIds[prod.aseguradoraIdx];
      if (!aseId) continue;

      const existing = await prisma.productoSeguro.findFirst({
        where: { tenantId, aseguradoraId: aseId, nombre: prod.nombre },
      });
      if (!existing) {
        await prisma.productoSeguro.create({
          data: {
            tenantId,
            aseguradoraId: aseId,
            nombre: prod.nombre,
            ramo: prod.ramo as any,
            subramo: prod.subramo,
            primaReferencia: prod.primaReferencia,
            comisionPct: prod.comisionPct,
          },
        });
        productosCreados++;
      }
    }
    console.log(`📦 ${productosCreados} productos de seguro creados`);

    // 4. Crear automatizaciones base
    const automations = [
      {
        nombre: 'Alerta renovación 90 días - Seguros',
        descripcion: 'Envía notificación al agente cuando una póliza está a 90 días de vencer',
        trigger: 'INSURANCE_RENEWAL_90D',
        flowData: {
          nodes: [
            {
              id: '1',
              type: 'notify',
              data: {
                channel: 'in-app',
                message: '📋 Póliza {{poliza.numeroPoliza}} de {{cliente.nombre}} vence en 90 días',
              },
            },
          ],
        },
        activo: true,
      },
      {
        nombre: 'Alerta renovación 30 días - Seguros',
        descripcion: 'Marca renovación como en riesgo y notifica al agente',
        trigger: 'INSURANCE_RENEWAL_30D',
        flowData: {
          nodes: [
            {
              id: '1',
              type: 'update_renovacion',
              data: { riesgoPerdida: true, motivoRiesgo: 'Vence en 30 días sin contacto' },
            },
            {
              id: '2',
              type: 'notify',
              data: {
                channel: 'email',
                message: '🔴 ALERTA: Póliza {{poliza.numeroPoliza}} vence en 30 días. Sin contacto registrado.',
              },
            },
          ],
          edges: [{ from: '1', to: '2' }],
        },
        activo: true,
      },
      {
        nombre: 'Bienvenida nueva póliza - Seguros',
        descripcion: 'Cuando se emite una nueva póliza, envía email de bienvenida y programa renovación',
        trigger: 'INSURANCE_POLICY_CREATED',
        flowData: {
          nodes: [
            {
              id: '1',
              type: 'send_email',
              data: {
                template: 'insurance-welcome',
                to_field: 'cliente.email',
              },
            },
            {
              id: '2',
              type: 'create_renovacion',
              data: {
                diasAntelacion: 90,
              },
            },
          ],
          edges: [{ from: '1', to: '2' }],
        },
        activo: true,
      },
      {
        nombre: 'Cumpleaños cliente - Seguros',
        descripcion: 'Envía mensaje personalizado de cumpleaños al cliente asegurado',
        trigger: 'INSURANCE_CLIENT_BIRTHDAY',
        flowData: {
          nodes: [
            {
              id: '1',
              type: 'send_whatsapp',
              data: {
                template: 'insurance-birthday',
                message: '🎂 Feliz cumpleaños {{cliente.nombre}}. Gracias por confiar en nosotros.',
              },
            },
          ],
        },
        activo: true,
      },
    ];

    for (const auto of automations) {
      const existing = await prisma.automation.findFirst({
        where: { tenantId, nombre: auto.nombre },
      });
      if (!existing) {
        await prisma.automation.create({
          data: { tenantId, ...auto },
        });
      }
    }
    console.log('✅ Automatizaciones base de seguros creadas');

    console.log(`✅ Módulo de seguros listo para tenant ${tenantId}`);
    return { success: true };
  });
}
