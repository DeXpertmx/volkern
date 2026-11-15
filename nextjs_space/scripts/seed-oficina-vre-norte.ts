/**
 * Seed — oficina franquiciada de demostración: «VRE Norte» (hija de `vre`).
 *
 * Sirve para enseñar cómo queda la landing propia de una oficina dentro de la
 * red: el portal es la misma plantilla para todos, pero esta cuenta tiene su
 * propia marca y su propio catálogo, así que `/p/vre-norte` no se parece al de
 * la matriz en contenido ni en color.
 *
 * Crea (o actualiza, si ya existe):
 *   - Un `Tenant` hijo de `vre` con slug `vre-norte`, moneda EUR, los módulos de
 *     la matriz y branding ámbar propio.
 *   - Cuatro inmuebles de ejemplo (SKU `VN-001` … `VN-004`) que solo existen en
 *     esta oficina.
 *
 * Uso:
 *   npm run seed:oficina-norte          # crea o actualiza (idempotente)
 *   npm run seed:oficina-norte:borrar   # deshace: borra la oficina y sus inmuebles
 *
 * Equivalente sin npm (carga `.env.local`/`.env` igual que el resto de scripts):
 *   npx tsx --require ./scripts/cargar-entorno.cjs scripts/seed-oficina-vre-norte.ts
 *   npx tsx --require ./scripts/cargar-entorno.cjs scripts/seed-oficina-vre-norte.ts --borrar
 *
 * Solo para bases de desarrollo: apunta al `DATABASE_URL` del entorno cargado.
 * Aborta si `vre-norte` existe pero NO es hija de `vre` (sería una cuenta real
 * con el mismo slug), y el borrado se niega si la oficina ya tiene usuarios o
 * leads, para no arrastrar datos que no ha creado este script.
 */

import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const MATRIZ_SLUG = 'vre';

const OFICINA = {
  slug: 'vre-norte',
  nombre: 'VRE Norte',
  billingEmail: 'norte@vre.example',
  moneda: 'EUR',
  brandingConfig: {
    primaryColor: '#b45309',
    companyName: 'VRE Norte',
    logoUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=120&fit=crop',
    showPoweredBy: true,
  },
};

interface InmuebleSeed {
  sku: string;
  nombre: string;
  descripcion: string;
  precio: number;
  operacion: 'venta' | 'alquiler';
  tipo: string;
  zona: string;
  direccion: string;
  superficie: number;
  habitaciones: number;
  banos: number;
  estacionamientos: number;
  energia: string;
  destacado: boolean;
  foto: string;
  latitud: string;
  longitud: string;
}

const INMUEBLES: InmuebleSeed[] = [
  {
    sku: 'VN-001',
    nombre: 'Piso reformado en Ruzafa',
    descripcion:
      'Piso exterior de tres habitaciones a dos calles del mercado de Ruzafa, reformado en 2024 con cocina abierta y suelos de roble.',
    precio: 289000,
    operacion: 'venta',
    tipo: 'Piso',
    zona: 'Ruzafa, Valencia',
    direccion: 'Carrer de Cadis 41',
    superficie: 95,
    habitaciones: 3,
    banos: 2,
    estacionamientos: 0,
    energia: 'B',
    destacado: true,
    foto: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
    latitud: '39.4620',
    longitud: '-0.3740',
  },
  {
    sku: 'VN-002',
    nombre: 'Ático con terraza en El Cabanyal',
    descripcion:
      'Ático de obra nueva a 300 m de la playa, con terraza de 25 m² orientada al este y aerotermia.',
    precio: 355000,
    operacion: 'venta',
    tipo: 'Ático',
    zona: 'El Cabanyal, Valencia',
    direccion: 'Carrer de la Reina 88',
    superficie: 110,
    habitaciones: 2,
    banos: 2,
    estacionamientos: 1,
    energia: 'A',
    destacado: true,
    foto: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
    latitud: '39.4710',
    longitud: '-0.3300',
  },
  {
    sku: 'VN-003',
    nombre: 'Local a pie de calle en Benimaclet',
    descripcion:
      'Local diáfano de 70 m² con escaparate a la avenida, ideal para hostelería o comercio. Traspaso negociable.',
    precio: 1450,
    operacion: 'alquiler',
    tipo: 'Local Comercial',
    zona: 'Benimaclet, Valencia',
    direccion: 'Avinguda de Primat Reig 12',
    superficie: 70,
    habitaciones: 0,
    banos: 1,
    estacionamientos: 0,
    energia: 'C',
    destacado: false,
    foto: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
    latitud: '39.4850',
    longitud: '-0.3580',
  },
  {
    sku: 'VN-004',
    nombre: 'Casa adosada en La Eliana',
    descripcion:
      'Adosado de cuatro habitaciones con jardín privado y piscina comunitaria, en urbanización con colegio y transporte.',
    precio: 425000,
    operacion: 'venta',
    tipo: 'Casa',
    zona: 'La Eliana, Valencia',
    direccion: 'Carrer de la Pau 7',
    superficie: 180,
    habitaciones: 4,
    banos: 3,
    estacionamientos: 2,
    energia: 'B',
    destacado: false,
    foto: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800',
    latitud: '39.5680',
    longitud: '-0.5280',
  },
];

/** Payload del catálogo: el mismo en el alta y en la actualización. */
function datosInmueble(tenantId: string, d: InmuebleSeed): Prisma.CatalogoItemUncheckedCreateInput {
  return {
    tenantId,
    nombre: d.nombre,
    descripcion: d.descripcion,
    sku: d.sku,
    tipo: 'inmueble',
    precioBase: d.precio,
    moneda: 'EUR',
    activo: true,
    destacado: d.destacado,
    categorias: ['inmueble', d.operacion, d.tipo.toLowerCase()],
    etiquetas: [d.tipo.toLowerCase(), d.operacion],
    media: [{ url: d.foto, alt: d.nombre, tipo: 'imagen', orden: 0 }],
    pricing: { sale: { price: d.precio } },
    customFieldValues: {
      tipo_operacion: d.operacion,
      tipo_inmueble: d.tipo,
      zona: d.zona,
      direccion: d.direccion,
      superficie_total: String(d.superficie),
      superficie_construida: String(d.superficie),
      habitaciones: String(d.habitaciones),
      banos: String(d.banos),
      estacionamientos: String(d.estacionamientos),
      estacionamiento: d.estacionamientos > 0,
      certificacion_energetica: d.energia,
      estado: 'disponible',
      destacada: d.destacado,
      latitud: d.latitud,
      longitud: d.longitud,
      descripcion_larga: d.descripcion,
    },
  };
}

async function matrizOVariar() {
  const matriz = await prisma.tenant.findUnique({ where: { slug: MATRIZ_SLUG } });
  if (!matriz) {
    throw new Error(
      `No existe la cuenta matriz «${MATRIZ_SLUG}». Crea primero esa cuenta (o ajusta MATRIZ_SLUG) antes de sembrar la oficina.`,
    );
  }
  return matriz;
}

/**
 * La oficina existente se reutiliza solo si de verdad es hija de la matriz: un
 * tenant con el mismo slug que no cuelgue de ella es otra cuenta y no se toca.
 */
async function oficinaExistente(matrizId: string) {
  const oficina = await prisma.tenant.findUnique({ where: { slug: OFICINA.slug } });
  if (oficina && oficina.parentId !== matrizId) {
    throw new Error(
      `Ya existe un tenant «${OFICINA.slug}» que no es hijo de «${MATRIZ_SLUG}» (parentId ${oficina.parentId ?? 'ninguno'}). No se modifica nada.`,
    );
  }
  return oficina;
}

async function sembrar() {
  const matriz = await matrizOVariar();
  const existente = await oficinaExistente(matriz.id);

  const oficina = await prisma.tenant.upsert({
    where: { slug: OFICINA.slug },
    create: {
      slug: OFICINA.slug,
      nombre: OFICINA.nombre,
      accountType: 'BUSINESS',
      parentId: matriz.id,
      plan: 'agency-slot',
      moneda: OFICINA.moneda,
      estado: 'activo',
      billingEmail: OFICINA.billingEmail,
      enabledModules: matriz.enabledModules,
      brandingConfig: OFICINA.brandingConfig,
    },
    update: {
      nombre: OFICINA.nombre,
      parentId: matriz.id,
      plan: 'agency-slot',
      moneda: OFICINA.moneda,
      estado: 'activo',
      billingEmail: OFICINA.billingEmail,
      enabledModules: matriz.enabledModules,
      brandingConfig: OFICINA.brandingConfig,
    },
  });

  for (const inmueble of INMUEBLES) {
    const datos = datosInmueble(oficina.id, inmueble);
    await prisma.catalogoItem.upsert({
      where: { tenantId_sku: { tenantId: oficina.id, sku: inmueble.sku } },
      create: datos,
      update: datos,
    });
  }

  const total = await prisma.catalogoItem.count({
    where: { tenantId: oficina.id, tipo: 'inmueble', sku: { in: INMUEBLES.map((i) => i.sku) } },
  });

  console.log(
    `${existente ? 'Actualizada' : 'Creada'} la oficina "${OFICINA.nombre}" (${OFICINA.slug}) hija de ${MATRIZ_SLUG}: ${total}/${INMUEBLES.length} inmuebles de ejemplo.`,
  );
  console.log(`Portal: /p/${OFICINA.slug} · Catálogo: /p/${OFICINA.slug}/propiedades`);
}

async function borrar() {
  const matriz = await matrizOVariar();
  const oficina = await oficinaExistente(matriz.id);

  if (!oficina) {
    console.log(`No existe la oficina "${OFICINA.slug}": nada que borrar.`);
    return;
  }

  // Solo se borra lo que siembra este script. Si la oficina ya se usó de verdad
  // (usuarios, leads), se avisa en vez de arrastrar datos ajenos.
  const [usuarios, leads] = await Promise.all([
    prisma.user.count({ where: { tenantId: oficina.id } }),
    prisma.lead.count({ where: { tenantId: oficina.id } }),
  ]);

  if (usuarios > 0 || leads > 0) {
    throw new Error(
      `La oficina "${OFICINA.slug}" tiene ${usuarios} usuario(s) y ${leads} lead(s). No se borra automáticamente: elimina antes esos datos si de verdad quieres quitarla.`,
    );
  }

  const inmuebles = await prisma.catalogoItem.deleteMany({
    where: { tenantId: oficina.id, sku: { in: INMUEBLES.map((i) => i.sku) } },
  });
  await prisma.tenant.delete({ where: { id: oficina.id } });

  console.log(
    `Borrada la oficina "${OFICINA.nombre}" (${OFICINA.slug}) y sus ${inmuebles.count} inmuebles de ejemplo.`,
  );
}

const borrarSolicitado = process.argv.includes('--borrar');

(borrarSolicitado ? borrar() : sembrar())
  .catch((error: unknown) => {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
