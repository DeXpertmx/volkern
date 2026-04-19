import { PrismaClient } from '@prisma/client';
import { HRService } from '../lib/erp/hr-service';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  const ana = await prisma.employee.findFirst({ where: { fullName: 'Ana García', tenantId } });

  if (!ana) {
    console.error('❌ Ana García no encontrada.');
    return;
  }

  console.log(`🔍 Probando Logistics Sniffer 2.0 para: ${ana.fullName} (ID: ${ana.id})`);

  const result = await HRService.checkVacationPolicy(
    ana.id,
    tenantId,
    new Date('2026-08-01'),
    new Date('2026-08-15')
  );

  console.log('--- RESULTADO ---');
  console.log('Alerta Digital:', result.digitalFootprintAlert);
  console.log('Accesos Detectados:', result.digitalAccess.length);
  result.digitalAccess.forEach((d: any) => {
    console.log(` - [${d.level}] ${d.resource} (${d.env})`);
  });
  console.log('Riesgo Digital Activo:', result.hasDigitalRisk);
  console.log('------------------');

  if (result.hasDigitalRisk && result.digitalAccess.length > 0) {
    console.log('✅ VALIDACIÓN EXITOSA: La huella digital técnica ha sido detectada correctamente.');
  } else {
    console.log('❌ FALLO DE VALIDACIÓN: No se detectaron los activos digitales.');
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
