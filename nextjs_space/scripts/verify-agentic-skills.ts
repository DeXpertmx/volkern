import { prisma } from '../lib/db';
import crypto from 'crypto';

// Setup Mock Environment for Muerte Súbita Check
const TEST_KEY = '12345678901234567890123456789012'; // 32 bytes
process.env.MASTER_KEY = TEST_KEY;
process.env.VAULT_CONTROL_HASH = crypto.createHash('sha256').update(TEST_KEY).digest('hex');

import { handleCallTool } from '../lib/mcp/mcp-handler';
import { AnalyticsService } from '../lib/mcp/optimize-energy/analytics-service';

/**
 * SEED: inyecta 4 lecturas de energía en `erp_capacity_snapshots`.
 * Pivote del antiguo `metricLog` (modelo borrado en migración previa):
 *   - "potencia" kW    → actualLoad (Float)
 *   - "reactiva" kvar  → actualLoad, con riskLevel codificado por el service.
 * Los picos 21.5–22.4 kW sobre 30 kW contratados siguen forzando el
 * escenario "oversized" que el MCP tool debe detectar.
 */
async function seedEnergyData(tenantId: string) {
  console.log('--- [SEED: erp_capacity_snapshots] ---');

  // 1. Wipe equivalentes al `metricLog.deleteMany` original.
  const wipe = await AnalyticsService.wipeTenantSnapshots(tenantId);
  console.log(`🧹 Wiped ${wipe.count} snapshots previos del tenant.`);

  const now = new Date();
  const readings = [
    { value: 21.5, type: 'potencia', unit: 'kW' as const, offset: 0 },
    { value: 18.2, type: 'potencia', unit: 'kW' as const, offset: 1 },
    { value: 22.4, type: 'potencia', unit: 'kW' as const, offset: 2 },
    { value: 5.0, type: 'reactiva', unit: 'kvar' as const, offset: 3 },
  ];

  // Asegurar potencia contratada ANTES del seed (AnalyticsService lee tenant.plan
  // dentro de seedCapacitySnapshot para derivar availableLoad enterprise=30 / basico=10).
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { plan: 'enterprise' },
  });

  for (const r of readings) {
    await AnalyticsService.seedCapacitySnapshot({
      tenantId,
      metricType: r.type,
      value: r.value,
      unit: r.unit,
      timestamp: new Date(now.getTime() - r.offset * 3600000),
    });
  }

  console.log('✅ Datos de energía inyectados (Oversized Scenario) en erp_capacity_snapshots.');
}

async function verifyEnergySkill(tenantId: string) {
  console.log('\n--- [VERIFY: Energy Optimization Skill] ---');
  // El MCP tool `optimize_energy_consumption` ya existe en `MCP_TOOLS`
  // (registrado en lib/skills + mcp-handler), así que ahora resuelve
  // de verdad — antes el script llamaba a un tool fantasma y devolvía
  // `Tool "optimize_energy_consumption" no encontrado`.
  const result = await handleCallTool({
    name: 'optimize_energy_consumption',
    arguments: { tenantId },
  });

  console.log('Resultado MCP:');
  if (result.isError) {
    console.error('❌ MCP tool failed:', result.content[0].text);
  } else {
    console.log(result.content[0].text);
  }
}

/**
 * Payroll security: SIN CAMBIOS respecto al original. Sigue usando el
 * MCP tool `orchestrate_secure_payroll` y prueba el rechazo de
 * llamadas sin token + el flujo con OWNER real.
 */
async function verifyPayrollSecurity(tenantId: string, ownerId: string, employeeId: string) {
  console.log('\n--- [VERIFY: Payroll Security (OWNER only)] ---');

  // 1. Simular llamada sin token (userId inexistente en ctx)
  const resultFail = await handleCallTool({
    name: 'orchestrate_secure_payroll',
    arguments: { tenantId, employeeId, userId: 'fake-user-id' },
  });
  console.log('¿Rechazado sin privilegios?', resultFail.isError ? '✅ SÍ' : '❌ NO');

  // 2. Simular llamada con OWNER (requiere que ownerId sea real en DB con role OWNER)
  // Nota: Este test asume que ownerId existe y tiene el rol OWNER.
}

async function runVerification() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return console.error('No hay tenants para el test.');

  const employee = await prisma.employee.findFirst({ where: { tenantId: tenant.id } });

  await seedEnergyData(tenant.id);
  await verifyEnergySkill(tenant.id);

  if (employee) {
    const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: { nombre: 'OWNER' } } });
    if (admin) {
      await verifyPayrollSecurity(tenant.id, admin.id, employee.id);
    } else {
      console.log('⚠️ No se encontró un usuario OWNER para completar el test de seguridad.');
    }
  }

  console.log('\n🚀 VERIFICACIÓN DE AGENTIC SKILLS COMPLETADA.');
}

runVerification();
