import { prisma } from '../lib/db';
import { generateApiKey } from '../lib/api-keys';

async function main() {
  console.log('🚀 Iniciando creación de Agencia de Prueba...');

  // 1. Buscar usuario Administrador principal
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@volkern.com' }
  });

  if (!admin) {
    console.error('❌ Error: No se encontró el usuario admin@volkern.com. Ejecuta el seed primero.');
    return;
  }

  // 2. Crear el Tenant de Agencia
  const agencySlug = 'agencia-expert-' + Math.random().toString(36).substring(7);
  const agency = await prisma.tenant.create({
    data: {
      nombre: 'Agencia Expert (PaaS Master)',
      slug: agencySlug,
      accountType: 'AGENCY',
      maxSlots: 3,
      plan: 'pro-agency',
      estado: 'activo',
      enabledModules: ['ia_agencia', 'crm', 'volkern-sign'],
      brandingConfig: {
        primaryColor: '#6366f1',
        logoUrl: 'https://volkern.com/logo-expert.png',
        showPoweredBy: false
      }
    }
  });

  console.log(`✅ Agencia creada: ${agency.nombre} (ID: ${agency.id})`);

  // 3. Generar API Key para la Agencia
  const { key, keyHash, prefix } = generateApiKey('prod');
  await prisma.apiKey.create({
    data: {
      tenantId: agency.id,
      userId: admin.id,
      nombre: 'Key de Producción - Expert',
      keyHash,
      prefix,
      scopes: ['admin', 'agent:skill']
    }
  });

  console.log(`🔑 API Key Generada: ${key}`);

  // 4. PRUEBA: Crear un Slot (Cliente)
  console.log('🧪 Probando creación de Slot (Cliente)...');
  
  const slotName = 'Cliente Inmobiliario Alfa';
  const slotSlug = 'alfa-realestate-' + Math.random().toString(36).substring(7);
  
  const slot = await prisma.tenant.create({
    data: {
      nombre: slotName,
      slug: slotSlug,
      parentId: agency.id,
      accountType: 'BUSINESS',
      plan: 'agency-slot',
      estado: 'activo',
      brandingConfig: agency.brandingConfig as any, // Hereda branding
      enabledModules: ['crm']
    }
  });

  console.log(`✅ Slot creado exitosamente y vinculado a la agencia.`);
  console.log(`   - Nombre: ${slot.nombre}`);
  console.log(`   - Parent ID: ${slot.parentId} (Matches Agency? ${slot.parentId === agency.id})`);

  console.log('\n✨ TEST DE AGENCIA COMPLETADO CON ÉXITO');
  console.log('-----------------------------------------');
  console.log(`Agency ID: ${agency.id}`);
  console.log(`Slot ID:   ${slot.id}`);
  console.log(`API Key:   ${key}`);
  console.log('-----------------------------------------');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
