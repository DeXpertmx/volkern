import { PrismaClient } from '@prisma/client';
import { HRService } from '../lib/erp/hr-service';
import { VaultService } from '../lib/security/vault';

const prisma = new PrismaClient();

async function main() {
  const tenantA = 'cmo09jrkc0000mf0ebul7xe9q'; // DimX
  const tenantB = 'cmo09jrkc0001mf0ebul7xe9q'; // Test Tenant 2
  
  console.log('🚀 Iniciando Test de Certificación SaaS Multitenant...\n');

  // 1. Verificar Aislamiento de Bóveda
  console.log('🛡️ 1. Verificando Aislamiento Criptográfico...');
  const employeeA = await prisma.employee.findFirst({ where: { tenantId: tenantA } });
  
  if (employeeA && employeeA.salaryEncrypted) {
    const tenantA_Info = await prisma.tenant.findUnique({ where: { id: tenantA }, select: { vaultSeed: true } });
    const tenantB_Info = await prisma.tenant.findUnique({ where: { id: tenantB }, select: { vaultSeed: true } });

    if (!tenantA_Info?.vaultSeed || !tenantB_Info?.vaultSeed) {
      console.log('⚠️ Salteando: Uno de los tenants no tiene vaultSeed.');
    } else {
      // Descifrar con llave correcta
      const salaryA = VaultService.decrypt(employeeA.salaryEncrypted, tenantA, tenantA_Info.vaultSeed);
      console.log(`✅ Tenant A puede ver su propio dato: ${salaryA !== '[[CIFRADO - SIN ACCESO]]'}`);

      // Intentar descifrar con llave de Tenant B
      const leakAttempt = VaultService.decrypt(employeeA.salaryEncrypted, tenantB, tenantB_Info.vaultSeed);
      if (leakAttempt === '[[CIFRADO - SIN ACCESO]]') {
        console.log('✅ ÉXITO: Tenant B no pudo descifrar datos de Tenant A (Leak prevented).');
      } else {
        console.error('❌ FALLO: ¡Fuga de datos detectada! Tenant B pudo descifrar datos de Tenant A.');
      }
    }
  }

  // 2. Verificar Branding en PDF
  console.log('\n🎨 2. Verificando Personalización de Branding...');
  const tenantData = await prisma.tenant.findUnique({ where: { id: tenantA } });
  if (tenantData) {
     console.log(`Empresa: ${tenantData.nombre}`);
     console.log(`Razón Social: ${tenantData.razonSocial || 'N/A'}`);
     console.log(`NIF/CIF: ${tenantData.nifCif || 'N/A'}`);
     if (tenantData.razonSocial && tenantData.nifCif) {
       console.log('✅ Certificado: Datos fiscales listos para inyección en PDF.');
     } else {
       console.log('⚠️ Advertencia: Datos fiscales incompletos para sellado digital legal.');
     }
  }

  // 3. Verificar Layout Isolation
  console.log('\nBentley 3. Verificando Aislamiento de Layout...');
  const user = await prisma.user.findFirst({ where: { email: 'bruno@dimensionexpert.com' } });
  if (user && user.metadata) {
    const metadata = user.metadata as any;
    const hasIsolation = Object.keys(metadata).some(k => k.startsWith('hrLayout_'));
    if (hasIsolation) {
      console.log('✅ ÉXITO: Los layouts están aislados por tenantId en los metadatos del usuario.');
    } else {
      console.log('❌ FALLO: No se detectaron layouts aislados por tenant.');
    }
  }

  console.log('\n🏁 Test de Certificación Finalizado.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
