import { PrismaClient } from '@prisma/client';
import { generate_offboarding_security_kit } from '../lib/skills/hr-management-skills';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  
  // 1. Identificar a un empleado con accesos críticos (ej: Carlos Jiménez)
  console.log('🔍 Buscando sujeto crítico para protocolo Kill-Switch...');
  const employee = await prisma.employee.findFirst({
    where: { tenantId, fullName: { contains: 'Carlos' } },
    include: { digitalAccess: true }
  });

  if (!employee) {
    console.error('❌ No se encontró un empleado de prueba (Carlos). Ejecuta primero scripts/seed-digital-assets.ts');
    return;
  }

  console.log(`👤 Sujeto identificado: ${employee.fullName}`);
  console.log(`📂 Accesos detectados: ${employee.digitalAccess.length}`);

  // 2. Ejecutar Skill de Offboarding
  console.log('🚀 Disparando Protocolo de Emergencia [SECURITY_OFFBOARDING]...');
  
  try {
    const result = await generate_offboarding_security_kit({
      tenantId,
      employeeId: employee.id
    });

    console.log('--- RESULTADO ---');
    console.log('Gemma Response:', result.text);
    console.log('Roadmap items:', result.roadmap.length);
    console.log('Items de prioridad CRITICAL:', result.roadmap.filter((r: any) => r.priority === 'CRITICAL').length);
    console.log('------------------');

    // 3. Verificar en el Trust Protocol
    const alert = await prisma.systemAlert.findFirst({
      where: { message: { contains: `[KILL-SWITCH] Iniciado protocolo de offboarding para ${employee.fullName}` } },
      orderBy: { createdAt: 'desc' }
    });

    if (alert) {
      console.log('✅ VALIDACIÓN EXITOSA: La alerta forense ha sido registrada.');
      console.log('Mensaje:', alert.message);
    } else {
      console.log('❌ FALLO: No se registró la alerta en el Trust Protocol.');
    }

    console.log('\n📡 Telegram Watchdog: Verifica el reporte de emergencia enviado al OWNER.');

  } catch (error: any) {
    console.error('❌ Error en el protocolo:', error.message);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
