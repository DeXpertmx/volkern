import { PrismaClient } from '@prisma/client';
import { VaultService } from '../lib/security/vault';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  
  // 1. Asegurar vaultSeed
  const vaultSeed = 'volkern-demo-seed-xyz-123';
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { vaultSeed }
  });

  console.log('✅ Tenant vaultSeed actualizado.');

  // 2. Buscar empleados de la demo
  const ana = await prisma.employee.findFirst({ where: { fullName: 'Ana García', tenantId } });
  const carlos = await prisma.employee.findFirst({ where: { fullName: 'Carlos Jiménez', tenantId } });

  if (!ana || !carlos) {
    console.error('❌ Empleados de demo no encontrados.');
    return;
  }

  // 3. Limpiar previos
  await prisma.digitalAccess.deleteMany({ where: { tenantId } });

  // 4. Crear accesos digitales
  const assets = [
    {
      employeeId: ana.id,
      tenantId,
      environment: 'Repositorios',
      accessLevel: 'Owner / Admin',
      resourceName: 'GitHub Organization (Volkern-Core)',
      identifier: 'ana.garcia.admin',
      isCritical: true,
      credentialEncrypted: VaultService.encrypt('ghp_token_mock_123456789', tenantId, vaultSeed)
    },
    {
      employeeId: carlos.id,
      tenantId,
      environment: 'Producción',
      accessLevel: 'Root',
      resourceName: 'VPC DigitalOcean (Nexus-Main-01)',
      identifier: 'root@165.22.x.x',
      isCritical: true,
      credentialEncrypted: VaultService.encrypt('ssh-key-mock-carlos-2024', tenantId, vaultSeed)
    },
    {
      employeeId: carlos.id,
      tenantId,
      environment: 'Cloudflare',
      accessLevel: 'Super Admin',
      resourceName: 'Panel de Zonas - volkern.app',
      identifier: 'carlos@volkern.app',
      isCritical: true,
      credentialEncrypted: VaultService.encrypt('cf-api-key-mock', tenantId, vaultSeed)
    }
  ];

  for (const asset of assets) {
    await prisma.digitalAccess.create({ data: asset });
  }

  console.log('🚀 Digital Access Assets cargados con éxito.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
