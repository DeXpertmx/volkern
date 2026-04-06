
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPages() {
  try {
    const pages = await prisma.page.findMany({
      where: {
        slug: 'preuba-2'
      }
    });
    
    console.log('PAGE DATA:');
    pages.forEach(page => {
      console.log('ID:', page.id);
      console.log('Slug:', page.slug);
      console.log('Estado:', page.estado);
      console.log('CSS Personalizado length:', page.cssPersonalizado?.length || 0);
      console.log('Contenido type:', typeof page.contenido);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.();
  }
}

checkPages();

