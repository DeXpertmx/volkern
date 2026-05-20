import { prisma } from '../lib/db';

const DEFAULT_UNITS = [
  // Weight
  { code: 'kg', name: 'Kilogramo', type: 'weight', factorToBase: 1 },
  { code: 'g', name: 'Gramo', type: 'weight', factorToBase: 0.001 },
  { code: 'lb', name: 'Libra', type: 'weight', factorToBase: 0.453592 },
  { code: 'oz', name: 'Onza', type: 'weight', factorToBase: 0.0283495 },
  { code: 'ton', name: 'Tonelada', type: 'weight', factorToBase: 1000 },

  // Length
  { code: 'm', name: 'Metro', type: 'length', factorToBase: 1 },
  { code: 'cm', name: 'Centímetro', type: 'length', factorToBase: 0.01 },
  { code: 'mm', name: 'Milímetro', type: 'length', factorToBase: 0.001 },
  { code: 'km', name: 'Kilómetro', type: 'length', factorToBase: 1000 },
  { code: 'in', name: 'Pulgada', type: 'length', factorToBase: 0.0254 },
  { code: 'ft', name: 'Pie', type: 'length', factorToBase: 0.3048 },

  // Volume
  { code: 'L', name: 'Litro', type: 'volume', factorToBase: 1 },
  { code: 'ml', name: 'Mililitro', type: 'volume', factorToBase: 0.001 },
  { code: 'gal', name: 'Galón', type: 'volume', factorToBase: 3.78541 },

  // Unit
  { code: 'pz', name: 'Pieza', type: 'unit', factorToBase: 1 },
  { code: 'par', name: 'Par', type: 'unit', factorToBase: 2 },
  { code: 'caja', name: 'Caja', type: 'unit', factorToBase: 1 },
  { code: 'paquete', name: 'Paquete', type: 'unit', factorToBase: 1 },
  { code: 'rollo', name: 'Rollo', type: 'unit', factorToBase: 1 },

  // Area
  { code: 'm2', name: 'Metro cuadrado', type: 'area', factorToBase: 1 },
  { code: 'cm2', name: 'Centímetro cuadrado', type: 'area', factorToBase: 0.0001 },
];

const DEFAULT_CATEGORIES = [
  {
    name: 'Productos',
    slug: 'productos',
    children: [
      { name: 'Electrónica', slug: 'electronica' },
      { name: 'Ropa y Moda', slug: 'ropa-moda' },
      { name: 'Hogar y Jardín', slug: 'hogar-jardin' },
      { name: 'Deportes', slug: 'deportes' },
      { name: 'Alimentos', slug: 'alimentos' },
      { name: 'Salud y Belleza', slug: 'salud-belleza' },
      { name: 'Juguetes', slug: 'juguetes' },
      { name: 'Automotriz', slug: 'automotriz' },
    ],
  },
  {
    name: 'Servicios',
    slug: 'servicios',
    children: [
      { name: 'Consultoría', slug: 'consultoria' },
      { name: 'Mantenimiento', slug: 'mantenimiento' },
      { name: 'Instalación', slug: 'instalacion' },
      { name: 'Formación', slug: 'formacion' },
      { name: 'Soporte Técnico', slug: 'soporte-tecnico' },
    ],
  },
  {
    name: 'Digital',
    slug: 'digital',
    children: [
      { name: 'Software', slug: 'software' },
      { name: 'Cursos Online', slug: 'cursos-online' },
      { name: 'Ebooks', slug: 'ebooks' },
      { name: 'Suscripciones', slug: 'suscripciones' },
    ],
  },
  {
    name: 'Suscripciones',
    slug: 'suscripciones',
    children: [],
  },
];

async function seedDefaults(tenantId: string) {
  console.log(`Seeding defaults for tenant: ${tenantId}`);

  // Seed units of measure
  for (const unit of DEFAULT_UNITS) {
    const existing = await prisma.unitOfMeasure.findUnique({
      where: { tenantId_code: { tenantId, code: unit.code } },
    });

    if (!existing) {
      await prisma.unitOfMeasure.create({
        data: {
          tenantId,
          ...unit,
        },
      });
      console.log(`  Created unit: ${unit.code} (${unit.name})`);
    }
  }

  // Seed categories
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await prisma.productCategory.findUnique({
      where: { tenantId_slug: { tenantId, slug: cat.slug } },
    });

    let parentId: string | null = null;

    if (!existing) {
      const created = await prisma.productCategory.create({
        data: {
          tenantId,
          name: cat.name,
          slug: cat.slug,
          orden: DEFAULT_CATEGORIES.indexOf(cat),
        },
      });
      parentId = created.id;
      console.log(`  Created category: ${cat.name}`);
    } else {
      parentId = existing.id;
    }

    // Seed children
    for (const child of cat.children) {
      const childExisting = await prisma.productCategory.findUnique({
        where: { tenantId_slug: { tenantId, slug: child.slug } },
      });

      if (!childExisting) {
        await prisma.productCategory.create({
          data: {
            tenantId,
            name: child.name,
            slug: child.slug,
            parentId,
            orden: cat.children.indexOf(child),
          },
        });
        console.log(`    Created subcategory: ${child.name}`);
      }
    }
  }

  console.log('Seed completed!');
}

// Run if called directly
if (require.main === module) {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: tsx scripts/seed-ecommerce-defaults.ts <tenantId>');
    process.exit(1);
  }

  seedDefaults(tenantId)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { seedDefaults, DEFAULT_UNITS, DEFAULT_CATEGORIES };
