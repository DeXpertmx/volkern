require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function checkServices() {
  const prisma = new PrismaClient();
  
  try {
    const tenantId = 'cmhmjkvra0000p99kz0pjz7k5';
    
    console.log('1. Verificando tenant...');
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });
    
    if (!tenant) {
      console.log('❌ Tenant no encontrado');
      return;
    }
    
    console.log('✅ Tenant encontrado:', tenant.nombre || tenant.id);
    
    console.log('\n2. Verificando servicios...');
    const servicios = await prisma.servicio.findMany({
      where: {
        tenantId: tenantId
      }
    });
    
    console.log(`Total servicios en DB: ${servicios.length}`);
    
    if (servicios.length > 0) {
      console.log('\nServicios encontrados:');
      servicios.forEach((s, i) => {
        console.log(`${i + 1}. ${s.nombre}`);
        console.log(`   - ID: ${s.id}`);
        console.log(`   - Activo: ${s.activo ? '✅' : '❌'}`);
        console.log(`   - Duración: ${s.duracionMinutos} min`);
        console.log(`   - Precio: ${s.precio} ${s.moneda}`);
      });
      
      const activos = servicios.filter(s => s.activo);
      console.log(`\n✅ Servicios activos: ${activos.length}`);
      
      if (activos.length === 0) {
        console.log('\n⚠️  No hay servicios activos. Para que aparezcan en el embed, necesitas activar al menos un servicio en /dashboard/servicios');
      }
    } else {
      console.log('❌ No hay servicios creados para este tenant');
      console.log('\n💡 Solución: Ve a /dashboard/servicios y crea al menos un servicio activo');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkServices();
