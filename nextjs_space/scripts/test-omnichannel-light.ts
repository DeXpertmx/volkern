import { prisma } from '../lib/db';
import { SocialMediaService } from '../lib/marketing/social-media-service';

async function simulateLightOmnichannel() {
  console.log('🚀 Iniciando Simulación LIGERA (Sin Redis)\n');

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('❌ No se encontró ningún tenant.');
    return;
  }

  const platforms = ['LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK'];
  
  // 1. Crear post (sin encolar, usando el método directo)
  const post = await prisma.socialPost.create({
    data: {
      tenantId: tenant.id,
      content: "🚀 Prueba Omnicanal Volkern - Fase 5 Hardening",
      platforms: platforms,
      status: 'SIMULATED'
    }
  });

  console.log(`[DB] Post ${post.id} creado para: ${platforms.join(', ')}\n`);

  // 2. Ejecutar lógica de publicación (Simulada)
  for (const platform of platforms) {
    console.log(`\n[${platform}] Procesando...`);
    
    // El método publishToPlatform ya tiene mocks internos
    try {
      const result = await SocialMediaService.publishToPlatform(post.id, platform as any);
      if (result.success) {
        console.log(`✅ [${platform}] PUBLICADO (Simulación)`);
      }
    } catch (e: any) {
      console.warn(`⚠️ [${platform}] BLOQUEADO: Credenciales faltantes`);
    }
  }

  const final = await prisma.socialPost.findUnique({ where: { id: post.id } });
  console.log(`\n[Status Final] ${final?.status} | ${final?.publishedAt}`);
}

simulateLightOmnichannel()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
