#!/usr/bin/env node
/**
 * Ocasión Casa — seed de la cuenta de demostración
 *
 * Crea el tenant `ocasion-casa` con la marca real de la agencia, el catálogo
 * de campos inmobiliario, los datos de la empresa (razón social, CIF,
 * domicilio, teléfonos y correo publicados) y los inmuebles que la agencia
 * tiene publicados en ocasioncasa.com.
 *
 * Los inmuebles salen de un volcado de su web (`scripts/data/`): tipo,
 * población, zona, precio, superficies, distribución, descripción y las
 * fotografías reales de cada ficha. Lo que la web no publica —certificado
 * energético, coordenadas, propietario— se deja vacío: no se inventa.
 *
 * Uso (desde la raíz del proyecto, con la base de datos accesible):
 *   OCASION_DEMO_PASSWORD_HASH="$2b$12$..." node scripts/seed-demo-ocasion-casa.mjs
 *
 * En producción la base vive en el Postgres del VPS, así que el script se
 * ejecuta dentro del contenedor de la app (ver scripts/seed-remoto-ocasion.sh).
 *
 * Idempotente: los ids de inmueble se derivan de la referencia de la agencia,
 * de modo que re-ejecutarlo actualiza en lugar de duplicar.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// En el contenedor, `@prisma/client` no está en la ruta del script: se resuelve
// desde /app. En local basta con el paquete del proyecto.
const require = createRequire(import.meta.url);
const { PrismaClient } = require(process.env.PRISMA_CLIENT || '@prisma/client');

const prisma = new PrismaClient();
const aqui = dirname(fileURLToPath(import.meta.url));

// ─── La empresa ──────────────────────────────────────────────────────────────

const EMPRESA = {
  nombre: 'Ocasión Casa',
  slug: 'ocasion-casa',
  razonSocial: 'OCASIONCASA SERVICIOS INMOBILIARIOS S.L.',
  nifCif: 'B56050388',
  direccionFiscal: 'Av. del Cairo, 2 — 14007 Córdoba',
  telefono: '957 74 40 40',
  telefonoGratuito: '900 92 44 44',
  whatsapp: '607 035 688',
  email: 'soporte@ocasioncasa.com',
  emailAdministracion: 'administracion@ocasioncasa.com',
  web: 'https://www.ocasioncasa.com',
  latitud: 37.8847,
  longitud: -4.7794,
};

/** Logotipo real de la agencia (PNG con fondo transparente). */
const LOGO_URL = 'https://www.ocasioncasa.com/wp-content/uploads/2021/04/logo-ocasioncasa.png';

/** Colores corporativos medidos sobre el logotipo: rojo y gris azulado. */
const MARCA_ROJA = '#ea0a2a';
const MARCA_GRIS = '#474c5a';

const ADMIN_EMAIL = 'admin@ocasioncasa.com';
const AGENTE_EMAIL = 'comercial@ocasioncasa.com';
const PASSWORD_HASH = process.env.OCASION_DEMO_PASSWORD_HASH;

/**
 * Módulos que esta demo NO enseña: una agencia inmobiliaria no compra la
 * academia, la cartera de seguros, el motor de reservas turísticas ni la planta
 * industrial, y enseñarlos convierte la demo en un ERP genérico.
 */
const MODULOS_APAGADOS = [
  'cursos', 'estudiantes',
  'insurance',
  'hospitality',
  'calidad', 'produccion',
  'inventario', 'compras',
  'proyectos', 'taskforce',
  'logistica',
];

// ─── Catálogo de campos ──────────────────────────────────────────────────────

const CAMPOS = [
  ['tipo_operacion', 'Tipo de operación', 'select', { values: ['venta', 'alquiler', 'traspaso'] }, true, 'Información General', 1, null, 'venta'],
  ['tipo_inmueble', 'Tipo de inmueble', 'select', { values: ['Piso', 'Estudio', 'Ático', 'Dúplex', 'Adosado', 'Apartamento', 'Casa', 'Casa con terreno', 'Casa de campo', 'Chalet', 'Finca rústica', 'Solar', 'Parcela', 'Terreno', 'Local Comercial', 'Nave Industrial', 'Oficina', 'Edificio', 'Negocio', 'Garaje', 'Planta', 'Loft'] }, true, 'Información General', 2, null, null],
  ['estado', 'Estado', 'select', { values: ['disponible', 'reservada', 'vendida', 'alquilada'] }, false, 'Información General', 3, null, 'disponible'],

  ['direccion', 'Dirección', 'text', null, false, 'Ubicación', 4, 'Calle y número', null],
  ['zona', 'Zona / Barrio', 'text', null, false, 'Ubicación', 5, 'Ej: Centro — Tendillas', null],
  ['ciudad', 'Ciudad', 'text', null, false, 'Ubicación', 6, 'Ej: Córdoba', null],
  ['provincia', 'Provincia', 'text', null, false, 'Ubicación', 7, null, null],
  ['codigo_postal', 'Código postal', 'text', null, false, 'Ubicación', 8, null, null],
  ['latitud', 'Latitud', 'number', null, false, 'Ubicación', 9, null, null],
  ['longitud', 'Longitud', 'number', null, false, 'Ubicación', 10, null, null],

  ['superficie_total', 'Superficie total', 'number', null, false, 'Superficies', 11, null, null],
  ['superficie_construida', 'Superficie construida', 'number', null, false, 'Superficies', 12, null, null],
  ['habitaciones', 'Habitaciones', 'number', null, false, 'Distribución', 13, null, null],
  ['banos', 'Baños', 'number', null, false, 'Distribución', 14, null, null],
  ['estacionamientos', 'Estacionamientos', 'number', null, false, 'Distribución', 15, null, null],
  ['antiguedad', 'Antigüedad', 'number', null, false, 'Distribución', 16, null, null],

  ['ascensor', 'Ascensor', 'boolean', null, false, 'Extras', 17, null, null],
  ['estacionamiento', 'Plaza de garaje / parking', 'boolean', null, false, 'Extras', 18, null, null],
  ['trastero', 'Trastero', 'boolean', null, false, 'Extras', 19, null, null],
  ['terraza', 'Terraza', 'boolean', null, false, 'Extras', 20, null, null],
  ['balcon', 'Balcón', 'boolean', null, false, 'Extras', 21, null, null],
  ['alberca', 'Piscina', 'boolean', null, false, 'Extras', 22, null, null],
  ['jardin', 'Jardín', 'boolean', null, false, 'Extras', 23, null, null],
  ['calefaccion', 'Calefacción', 'boolean', null, false, 'Extras', 24, null, null],
  ['aire_acondicionado', 'Aire acondicionado', 'boolean', null, false, 'Extras', 25, null, null],
  ['amueblado', 'Amueblado', 'boolean', null, false, 'Extras', 26, null, null],
  ['orientacion', 'Orientación', 'select', { values: ['Norte', 'Sur', 'Este', 'Oeste', 'Noreste', 'Noroeste', 'Sureste', 'Suroeste'] }, false, 'Extras', 27, null, null],

  ['certificacion_energetica', 'Certificación energética', 'select', { values: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'En trámite'] }, false, 'Certificación Energética', 28, null, null],
  ['consumo_energetico', 'Consumo energético', 'number', null, false, 'Certificación Energética', 29, null, null],
  ['emisiones_co2', 'Emisiones CO₂', 'number', null, false, 'Certificación Energética', 30, null, null],

  ['destacada', 'Propiedad destacada', 'boolean', null, false, 'Marketing', 35, null, null],
  ['descripcion_larga', 'Descripción larga', 'textarea', null, false, 'Marketing', 36, null, null],
  ['tags_seo', 'Tags SEO', 'text', null, false, 'Marketing', 37, 'separados por comas', null],
  ['amenidades', 'Amenidades', 'textarea', null, false, 'Marketing', 38, null, null],

  ['propietario_nombre', 'Nombre del propietario', 'text', null, false, 'Propietario', 39, null, null],
  ['propietario_telefono', 'Teléfono del propietario', 'text', null, false, 'Propietario', 40, null, null],
  ['propietario_email', 'Email del propietario', 'text', null, false, 'Propietario', 41, null, null],
];

// ─── Inmuebles ───────────────────────────────────────────────────────────────

const INMUEBLES = JSON.parse(readFileSync(join(aqui, 'data', 'ocasion-casa-inmuebles.json'), 'utf8'));

/** Las comodidades que publica la web, a los campos del catálogo. */
const EXTRAS = {
  ascensor: 'ascensor',
  terraza: 'terraza',
  'terraza y balcón': 'terraza',
  balcón: 'balcon',
  balcon: 'balcon',
  piscina: 'alberca',
  'piscina comunitaria': 'alberca',
  jardín: 'jardin',
  jardin: 'jardin',
  garaje: 'estacionamiento',
  'plaza de garaje': 'estacionamiento',
  parking: 'estacionamiento',
  trastero: 'trastero',
  'aire acondicionado': 'aire_acondicionado',
  calefacción: 'calefaccion',
  calefaccion: 'calefaccion',
  amueblado: 'amueblado',
  'amueblado/a': 'amueblado',
  porche: 'terraza',
  patio: 'terraza',
};

function valoresInmueble(p, destacada) {
  const valores = {
    tipo_operacion: p.operacion,
    tipo_inmueble: p.tipo,
    estado: 'disponible',
    direccion: p.zona || p.poblacion,
    zona: p.zona || p.poblacion,
    ciudad: p.poblacion,
    provincia: p.provincia,
    destacada,
    descripcion_larga: p.descripcion.join('\n\n'),
    tags_seo: [p.tipo, p.poblacion, p.zona, p.operacion].filter(Boolean).join(','),
  };

  if (p.superficie) {
    valores.superficie_total = p.superficie;
    valores.superficie_construida = p.superficie;
  }
  if (p.habitaciones) valores.habitaciones = p.habitaciones;
  if (p.banos) valores.banos = p.banos;

  for (const extra of p.extras || []) {
    const campo = EXTRAS[String(extra).toLowerCase().trim()];
    if (campo) valores[campo] = true;
  }
  if (/aire acondicionado/i.test(p.descripcion.join(' '))) valores.aire_acondicionado = true;
  if (/ascensor/i.test(p.descripcion.join(' '))) valores.ascensor = true;

  return valores;
}

/** Id estable por inmueble: la referencia de la agencia, no el índice. */
function idInmueble(p, indice) {
  const base = (p.ref || String(indice)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `inm-ocasion-${base}`;
}

function nombreInmueble(p) {
  const zona = p.zona && p.zona !== p.poblacion ? `${p.zona}, ${p.poblacion}` : p.poblacion;
  return `${p.tipo} en ${p.operacion === 'alquiler' ? 'alquiler' : 'venta'} en ${zona || p.provincia}`;
}

function resumen(p) {
  const texto = (p.descripcion[0] || '').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  const partes = [];
  if (p.superficie) partes.push(`${p.superficie} m²`);
  if (p.habitaciones) partes.push(`${p.habitaciones} hab`);
  if (p.banos) partes.push(`${p.banos} ${p.banos === 1 ? 'baño' : 'baños'}`);
  const ficha = partes.length ? `${partes.join(' · ')}. ` : '';
  return (ficha + texto).slice(0, 260).trim();
}

// ─── Permisos de los roles ───────────────────────────────────────────────────

const PERMISOS_ADMIN = {
  leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true, ver_todos: true },
  citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
  pipeline: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
  contactos: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
  empresas: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
  automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true, gestionar: true },
  campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true, gestionar: true },
  mensajes: { ver: true, enviar: true, responder: true, gestionar: true },
  analytics: { ver: true, exportar: true, gestionar: true },
  configuracion: { ver: true, editar: true, gestionar: true },
  equipo: { ver: true, crear: true, editar: true, eliminar: true, invitar: true, gestionar: true },
  integraciones: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
  pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
};

const PERMISOS_AGENTE = {
  leads: { ver: true, crear: true, editar: true, eliminar: false, asignar: false, exportar: false },
  citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
  pipeline: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
  contactos: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
  empresas: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
  automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false, gestionar: false },
  campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false, gestionar: false },
  mensajes: { ver: true, enviar: true, responder: true, gestionar: false },
  analytics: { ver: true, exportar: false, gestionar: false },
  configuracion: { ver: false, editar: false, gestionar: false },
  equipo: { ver: false, crear: false, editar: false, eliminar: false, invitar: false, gestionar: false },
  integraciones: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false },
  pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
};

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Preparando la demo de Ocasión Casa...');

  const datosTenant = {
    nombre: EMPRESA.nombre,
    subdomain: EMPRESA.slug,
    plan: 'profesional',
    estado: 'activo',
    moneda: 'EUR',
    enabledModules: ['crm', 'real-estate', 'leads', 'calendario'],
    razonSocial: EMPRESA.razonSocial,
    nifCif: EMPRESA.nifCif,
    direccionFiscal: EMPRESA.direccionFiscal,
    billingEmail: EMPRESA.email,
    sector: 'inmobiliaria',
    baseLatitude: EMPRESA.latitud,
    baseLongitude: EMPRESA.longitud,
    brandingConfig: {
      primaryColor: MARCA_ROJA,
      logoUrl: LOGO_URL,
      companyName: EMPRESA.nombre,
      showPoweredBy: true,
    },
  };

  const tenant = await prisma.tenant.upsert({
    where: { slug: EMPRESA.slug },
    update: datosTenant,
    create: { ...datosTenant, slug: EMPRESA.slug },
  });
  console.log(`✅ Cuenta: ${tenant.nombre} (${tenant.slug} · ${tenant.id})`);

  await prisma.tenantFeature.upsert({
    where: { tenantId_feature: { tenantId: tenant.id, feature: 'white_label' } },
    update: { habilitado: true },
    create: {
      tenantId: tenant.id,
      feature: 'white_label',
      habilitado: true,
      razon: 'Ocasión Casa — marca blanca habilitada para la demo',
      habilitadoPor: 'seed-demo-ocasion-casa',
    },
  });

  for (const modulo of MODULOS_APAGADOS) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_feature: { tenantId: tenant.id, feature: modulo } },
      update: { habilitado: false, razon: 'Fuera del alcance de la demo inmobiliaria', habilitadoPor: 'seed-demo-ocasion-casa' },
      create: {
        tenantId: tenant.id,
        feature: modulo,
        habilitado: false,
        razon: 'Fuera del alcance de la demo inmobiliaria',
        habilitadoPor: 'seed-demo-ocasion-casa',
      },
    });
  }
  console.log(`✅ ${MODULOS_APAGADOS.length} módulos ajenos al vertical apagados.`);

  // Identidad visual y datos de contacto de la empresa.
  const configuracion = [
    ['business_name', EMPRESA.nombre],
    ['logo_corporativo', LOGO_URL],
    ['business_email', EMPRESA.email],
    ['business_phone', EMPRESA.telefono],
    ['business_address', EMPRESA.direccionFiscal],
    ['business_website', EMPRESA.web],
  ];
  for (const [clave, valor] of configuracion) {
    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId: tenant.id, clave } },
      update: { valor: JSON.stringify(valor) },
      create: { tenantId: tenant.id, clave, valor: JSON.stringify(valor) },
    });
  }
  console.log(`✅ Marca y datos de empresa (${EMPRESA.nifCif} · ${EMPRESA.telefono}).`);

  // Roles
  const roles = {};
  for (const [nombre, permisos] of [['Admin', PERMISOS_ADMIN], ['Sales Agent', PERMISOS_AGENTE]]) {
    const existente = await prisma.role.findFirst({ where: { tenantId: tenant.id, nombre } });
    const rol = existente
      ? await prisma.role.update({ where: { id: existente.id }, data: { permisos } })
      : await prisma.role.create({
          data: { tenantId: tenant.id, nombre, descripcion: `Rol ${nombre} de la cuenta de demostración`, permisos, esPersonalizado: false },
        });
    roles[nombre] = rol.id;
  }

  // Usuarios con acceso al panel (la contraseña llega como hash, nunca en claro).
  if (!PASSWORD_HASH) {
    console.warn('⚠️  OCASION_DEMO_PASSWORD_HASH no está definida: se omiten los usuarios del panel.');
  } else {
    for (const usuario of [
      { email: ADMIN_EMAIL, name: 'Dirección Ocasión Casa', roleId: roles.Admin, fullName: 'Equipo Ocasión Casa', jobTitle: 'Dirección' },
      { email: AGENTE_EMAIL, name: 'Comercial Ocasión Casa', roleId: roles['Sales Agent'], fullName: 'Departamento Comercial', jobTitle: 'Agente inmobiliario' },
    ]) {
      const user = await prisma.user.upsert({
        where: { email: usuario.email },
        update: { name: usuario.name, tenantId: tenant.id, roleId: usuario.roleId, estado: 'activo', password: PASSWORD_HASH },
        create: { name: usuario.name, email: usuario.email, password: PASSWORD_HASH, tenantId: tenant.id, roleId: usuario.roleId, estado: 'activo' },
      });
      await prisma.employee.upsert({
        where: { userId: user.id },
        update: { fullName: usuario.fullName, tenantId: tenant.id, jobTitle: usuario.jobTitle, department: 'Comercial' },
        create: {
          fullName: usuario.fullName,
          email: usuario.email,
          tenantId: tenant.id,
          jobTitle: usuario.jobTitle,
          department: 'Comercial',
          isActive: true,
          userId: user.id,
        },
      });
    }
    console.log(`✅ Usuarios: ${ADMIN_EMAIL} y ${AGENTE_EMAIL}.`);
  }

  // Catálogo de campos
  for (const [fieldKey, label, type, options, required, categoria, orden, placeholder, valorDefecto] of CAMPOS) {
    const data = {
      label,
      type,
      options: options || null,
      required: Boolean(required),
      orden,
      categoria,
      placeholder: placeholder || null,
      unidad: /superficie|consumo|emisiones|antiguedad/i.test(fieldKey) ? (fieldKey === 'antiguedad' ? 'años' : fieldKey === 'consumo_energetico' ? 'kWh/m²/año' : fieldKey === 'emisiones_co2' ? 'kg CO₂/m²/año' : 'm²') : null,
      valorDefecto: valorDefecto || null,
      activo: true,
    };
    await prisma.catalogoFieldDefinition.upsert({
      where: { tenantId_fieldKey: { tenantId: tenant.id, fieldKey } },
      update: data,
      create: { tenantId: tenant.id, fieldKey, ...data },
    });
  }
  console.log(`✅ ${CAMPOS.length} campos del catálogo inmobiliario.`);

  // Inmuebles
  let creados = 0;
  let destacados = 0;
  const nombres = new Set();

  for (const [indice, p] of INMUEBLES.entries()) {
    let nombre = nombreInmueble(p);
    // Dos locales del mismo barrio con el mismo tipo necesitan distinguirse
    // por algo que el visitante reconozca: la superficie, no la referencia.
    if (nombres.has(nombre)) nombre = `${nombre} · ${p.superficie ? `${p.superficie} m²` : p.ref}`;
    nombres.add(nombre);

    const destacada = indice % 7 === 0;
    if (destacada) destacados += 1;

    const id = idInmueble(p, indice);
    const media = (p.imagenes || []).map((url, orden) => ({ url, tipo: 'imagen', orden, alt: nombre }));
    const pricing = p.precio > 0 ? (p.operacion === 'alquiler' ? { rent: { price: p.precio } } : { sale: { price: p.precio } }) : undefined;

    const base = {
      nombre,
      descripcion: resumen(p),
      precioBase: p.precio || 0,
      moneda: 'EUR',
      activo: true,
      destacado: destacada,
      customFieldValues: valoresInmueble(p, destacada),
      media,
      categorias: ['inmueble', p.operacion, p.tipo.toLowerCase()],
      etiquetas: [p.tipo, p.poblacion, p.zona, p.operacion, 'ocasion-casa'].filter(Boolean),
    };

    await prisma.catalogoItem.upsert({
      where: { id },
      update: { ...base, ...(pricing ? { pricing } : {}) },
      create: {
        id,
        tenantId: tenant.id,
        sku: p.ref || `OC-${String(indice + 1).padStart(3, '0')}`,
        tipo: 'inmueble',
        ...base,
        ...(pricing ? { pricing } : {}),
      },
    });
    creados += 1;
  }

  console.log(`✅ ${creados} inmuebles reales de ocasioncasa.com (${destacados} destacados).`);
  console.log(`\nPortal público: /p/${EMPRESA.slug}/propiedades`);
  console.log('Listo. Re-ejecutar este script actualiza, no duplica.');
}

main()
  .catch((error) => {
    console.error('❌', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
