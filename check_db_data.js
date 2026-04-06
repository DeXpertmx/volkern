const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Buscar la página específica
    const page = await prisma.page.findFirst({
      where: {
        slug: 'preuba-2'
      }
    });

    if (page) {
      console.log('=== PAGE DATA ===');
      console.log('ID:', page.id);
      console.log('Title:', page.titulo);
      console.log('Slug:', page.slug);
      console.log('Estado:', page.estado);
      console.log('CSS Length:', page.cssPersonalizado ? page.cssPersonalizado.length : 0);

      // Verificar si el CSS contiene estilos de Zephyr
      if (page.cssPersonalizado) {
        const hasZephyrSection = page.cssPersonalizado.includes('.zephyr-section');
        const hasBackgroundColor = page.cssPersonalizado.includes('background-color: #000');
        console.log('Contains .zephyr-section:', hasZephyrSection);
        console.log('Contains black background:', hasBackgroundColor);

        // Mostrar parte del CSS relacionado con zephyr-section
        const zephyrMatch = page.cssPersonalizado.match(/\.zephyr-section\s*{[^}]*}/);
        if (zephyrMatch) {
          console.log('Zephyr section CSS:', zephyrMatch[0]);
        }
      }

      // Verificar contenido HTML
      if (page.contenido && typeof page.contenido === 'object') {
        console.log('Format:', page.contenido.format);
        console.log('HTML Length:', page.contenido.html ? page.contenido.html.length : 0);

        // Verificar si el HTML contiene la clase zephyr-section
        if (page.contenido.html) {
          const hasZephyrClass = page.contenido.html.includes('zephyr-section');
          console.log('HTML contains zephyr-section class:', hasZephyrClass);

          // Mostrar parte del HTML
          const htmlPreview = page.contenido.html.substring(0, 300);
          console.log('HTML Preview:', htmlPreview);
        }
      }
    } else {
      console.log('Página no encontrada');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();