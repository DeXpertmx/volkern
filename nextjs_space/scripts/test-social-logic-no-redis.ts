import { prisma } from '../lib/db';

// Mock de la lógica de SocialMediaService para evitar importar BullMQ/Redis
async function simulateSocialLogic() {
  console.log('🚀 Simulación de Lógica Social (Modo Aislado)\n');

  const tenant = await prisma.tenant.findFirst();
  const platforms = ['LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK'];

  console.log(`[Draft] Creando post omnicanal para ${tenant?.name}...`);
  
  const post = await prisma.socialPost.create({
    data: {
      tenantId: tenant!.id,
      content: "🚀 Prueba Omnicanal - Volkern Marketing Hub",
      platforms: platforms,
      status: 'SIMULATED'
    }
  });

  for (const platform of platforms) {
    console.log(`[${platform}] Enviando a API externa...`);
    // Simulación de delay de red
    await new Promise(r => setTimeout(r, 500));
    console.log(`✅ [${platform}] Recibido 200 OK por la API.`);
  }

  await prisma.socialPost.update({
    where: { id: post.id },
    data: { status: 'PUBLISHED', publishedAt: new Date() }
  });

  console.log(`\n🎉 ¡Post omnicanal publicado en las 5 redes!`);
  console.log(`Verifica en la DB: Post ID ${post.id}`);
}

simulateSocialLogic()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
