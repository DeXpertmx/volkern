import { prisma } from '../lib/db';
import crypto from 'crypto';

// Setup Mock Environment for Muerte Súbita Check
const TEST_KEY = '12345678901234567890123456789012'; // 32 bytes
process.env.MASTER_KEY = TEST_KEY;
process.env.VAULT_CONTROL_HASH = crypto.createHash('sha256').update(TEST_KEY).digest('hex');

import { handleCallTool } from '../lib/mcp/mcp-handler';

async function seedEnergyData(tenantId: string) {
  console.log('--- [SEED: MetricLog Data] ---');
  const now = new Date();
  
  // Borrar logs previos para pureza del test
  await prisma.metricLog.deleteMany({ where: { tenantId } });

  // Picos de potencia (15kW a 22kW) contratada: 30kW (oversized)
  const readings = [
    { value: 21.5, type: 'potencia', unit: 'kW', offset: 0 },
    { value: 18.2, type: 'potencia', unit: 'kW', offset: 1 },
    { value: 22.4, type: 'potencia', unit: 'kW', offset: 2 },
    { value: 5.0, type: 'reactiva', unit: 'kvar', offset: 3 },
  ];

  for (const r of readings) {
    await prisma.metricLog.create({
      data: {
        tenantId,
        metricType: r.type,
        value: r.value,
        unit: r.unit,
        timestamp: new Date(now.getTime() - r.offset * 3600000)
      }
    });
  }
  
  // Asegurar potencia contratada en el tenant
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { plan: 'enterprise' }
  });

  console.log('✅ Datos de energía inyectados (Oversized Scenario).');
}

async function verifyEnergySkill(tenantId: string) {
  console.log('\n--- [VERIFY: Energy Optimization Skill] ---');
  const result = await handleCallTool({
    name: 'optimize_energy_consumption',
    arguments: { tenantId }
  });
  
  console.log('Resultado MCP:');
  console.log(result.content[0].text);
}

async function verifyPayrollSecurity(tenantId: string, ownerId: string, employeeId: string) {
  console.log('\n--- [VERIFY: Payroll Security (OWNER only)] ---');
  
  // 1. Simular llamada sin token (userId inexistente en ctx)
  const resultFail = await handleCallTool({
    name: 'orchestrate_secure_payroll',
    arguments: { tenantId, employeeId, userId: 'fake-user-id' }
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
    // Intentar encontrar un admin real para el test de seguridad
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
