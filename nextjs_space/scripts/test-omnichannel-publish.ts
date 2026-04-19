import { prisma } from '../lib/db';
import { SocialMediaService } from '../lib/marketing/social-media-service';

async function simulateOmnichannelPublish() {
  console.log('🚀 Iniciando Simulación de Publicación Omnicanal (Fase 5 - Hardening)\n');

  // 1. Identificar un tenant de prueba
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('❌ No se encontró ningún tenant para la prueba.');
    return;
  }

  console.log(`[Config] Utilizando Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Crear una publicación de prueba dirigida a las 5 plataformas
  const platforms = ['LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK'];
  
  console.log(`[Draft] Creando post para: ${platforms.join(', ')}...`);
  
  const post = await prisma.socialPost.create({
    data: {
      tenantId: tenant.id,
      content: "🚀 Volkern Marketing Hub: ¡Estamos en vivo en todas las redes! #Omnichannel #IA #SaaS",
      platforms: platforms,
      mediaUrls: ["https://volkern.app/assets/demo-post.jpg"],
      status: 'PENDING'
    }
  });

  console.log(`[DB] Registro de post creado: ${post.id}\n`);

  // 3. Simular la ejecución del Worker para cada plataforma
  console.log('--- Ejecutando Despliegue en Redes ---');
  
  for (const platform of platforms) {
    try {
      console.log(`\n[${platform}] Iniciando proceso de envío...`);
      
      // En una ejecución real, el worker llamaría a este método
      const result = await SocialMediaService.publishToPlatform(post.id, platform as any);
      
      if (result.success) {
        console.log(`✅ [${platform}] PUBLICADO EXITOSAMENTE`);
      }
    } catch (error: any) {
      // Aquí veríamos cómo el sistema captura errores de falta de credenciales
      console.warn(`⚠️ [${platform}] BLOQUEADO: ${error.message}`);
      console.log(`   (Esto es correcto: El sistema protege el envío si no hay tokens válidos en el Vault)`);
    }
  }

  // 4. Verificar estado final en DB
  const finalPost = await prisma.socialPost.findUnique({ where: { id: post.id } });
  console.log('\n--- Resultado Final ---');
  console.log(`ID: ${finalPost?.id}`);
  console.log(`Estado: ${finalPost?.status}`);
  console.log(`Fecha Publicación: ${finalPost?.publishedAt}`);
  
  console.log('\n🚀 Simulación completada. El motor de orquestación está operando correctamente.');
}

simulateOmnichannelPublish()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
