/**
 * Script de migración: Servicios y Cursos -> Catálogo Central
 * 
 * Este script migra los servicios y cursos existentes a la tabla CatalogoItem,
 * vinculando los registros originales con sus nuevos ítems de catálogo.
 * 
 * Ejecución: npx tsx scripts/migrate-to-catalogo.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateServiciosToCatalogo() {
  console.log('\n=== Migrando Servicios al Catálogo ===');
  
  // Obtener todos los servicios que no tienen catalogoItemId
  const servicios = await prisma.servicio.findMany({
    where: {
      catalogoItemId: null,
      tenantId: { not: null },
    },
  });

  console.log(`Encontrados ${servicios.length} servicios para migrar`);

  let migrados = 0;
  let errores = 0;

  for (const servicio of servicios) {
    try {
      // Crear el ítem de catálogo
      const catalogoItem = await prisma.catalogoItem.create({
        data: {
          tenantId: servicio.tenantId!,
          nombre: servicio.nombre,
          descripcion: servicio.descripcion,
          tipo: 'servicio',
          precioBase: servicio.precio,
          moneda: servicio.moneda || 'EUR',
          categoriaFiscal: 'general',
          duracionMinutos: servicio.duracionMinutos,
          modalidad: servicio.modalidad,
          unidad: 'servicio',
          activo: servicio.activo,
        },
      });

      // Vincular el servicio al catálogo
      await prisma.servicio.update({
        where: { id: servicio.id },
        data: { catalogoItemId: catalogoItem.id },
      });

      console.log(`  ✓ Servicio "${servicio.nombre}" migrado`);
      migrados++;
    } catch (error) {
      console.error(`  ✗ Error al migrar servicio "${servicio.nombre}":`, error);
      errores++;
    }
  }

  console.log(`\nServicios: ${migrados} migrados, ${errores} errores`);
  return { migrados, errores };
}

async function migrateCursosToCatalogo() {
  console.log('\n=== Migrando Cursos al Catálogo ===');
  
  // Obtener todos los cursos que no tienen catalogoItemId
  const cursos = await prisma.curso.findMany({
    where: {
      catalogoItemId: null,
      tenantId: { not: null },
    },
  });

  console.log(`Encontrados ${cursos.length} cursos para migrar`);

  let migrados = 0;
  let errores = 0;

  for (const curso of cursos) {
    try {
      // Crear el ítem de catálogo
      const catalogoItem = await prisma.catalogoItem.create({
        data: {
          tenantId: curso.tenantId!,
          nombre: curso.titulo,
          descripcion: curso.descripcion,
          tipo: 'academia',
          precioBase: curso.precio,
          moneda: curso.moneda || 'EUR',
          categoriaFiscal: 'general',
          duracionMinutos: curso.duracionEstimadaHoras ? curso.duracionEstimadaHoras * 60 : null,
          unidad: curso.tipoMonetizacion === 'subscription' ? 'mes' : 'unidad',
          activo: curso.publicado,
        },
      });

      // Vincular el curso al catálogo
      await prisma.curso.update({
        where: { id: curso.id },
        data: { catalogoItemId: catalogoItem.id },
      });

      console.log(`  ✓ Curso "${curso.titulo}" migrado`);
      migrados++;
    } catch (error) {
      console.error(`  ✗ Error al migrar curso "${curso.titulo}":`, error);
      errores++;
    }
  }

  console.log(`\nCursos: ${migrados} migrados, ${errores} errores`);
  return { migrados, errores };
}

async function main() {
  console.log('=========================================');
  console.log('  MIGRACIÓN AL CATÁLOGO CENTRALIZADO');
  console.log('=========================================');

  try {
    const serviciosResult = await migrateServiciosToCatalogo();
    const cursosResult = await migrateCursosToCatalogo();

    console.log('\n=========================================');
    console.log('           RESUMEN DE MIGRACIÓN');
    console.log('=========================================');
    console.log(`Servicios: ${serviciosResult.migrados} migrados, ${serviciosResult.errores} errores`);
    console.log(`Cursos: ${cursosResult.migrados} migrados, ${cursosResult.errores} errores`);
    console.log(`Total migrado: ${serviciosResult.migrados + cursosResult.migrados} ítems`);
    console.log('=========================================');

  } catch (error) {
    console.error('Error durante la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
