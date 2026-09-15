/**
 * Demo Real Estate — Seed de demo para cliente de renta vacacional (Airbnb / Booking)
 *
 * Crea un tenant "Demo Real Estate" con:
 *   - Branding inmobiliario + módulos habilitados
 *   - Roles (Superadmin / Admin / Sales Agent) con permisos
 *   - Usuarios demo (director + agente) con contraseña compartida
 *   - Catálogo de campos inmobiliarios + 12 propiedades en destinos turísticos
 *     (6 de ellas tipo_operacion=alquiler_temporada, estilo Airbnb/Booking)
 *   - Pipelines: "Renta Vacacional (Airbnb/Booking)" y "Venta de Propiedades"
 *   - Leads, Contactos, Deals, Citas, Tareas y Notas de historial
 *
 * Uso:  npx tsx --require dotenv/config scripts/seed-demo-real-estate.ts
 * Idempotente: puede re-ejecutarse sin duplicar datos.
 *
 * ⚠️ NUNCA commitear contraseñas: la contraseña compartida de los usuarios
 * demo se lee de la variable de entorno DEMO_RE_PASSWORD y el script aborta
 * si no está definida.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Configuración de la demo ────────────────────────────────────────────────

const TENANT_SLUG = 'demo-real-estate';
const DEMO_PASSWORD = process.env.DEMO_RE_PASSWORD;
const ADMIN_EMAIL = 'admin@demorealestate.com';
const AGENT_EMAIL = 'agente@demorealestate.com';

// ─── Propiedades (catálogo inmobiliario) ─────────────────────────────────────

interface PropertySeed {
  nombre: string;
  descripcion: string;
  precioBase: number;
  moneda: string;
  customFieldValues: Record<string, any>;
}

const FIELD_DEFINITIONS = [
  { fieldKey: 'tipo_operacion', label: 'Tipo de operación', type: 'select', categoria: 'Información General', options: { values: ['venta', 'alquiler', 'traspaso', 'alquiler_temporada'] }, placeholder: 'Selecciona tipo', required: true, orden: 1 },
  { fieldKey: 'tipo_inmueble', label: 'Tipo de inmueble', type: 'select', categoria: 'Información General', options: { values: ['Casa', 'Departamento', 'Ático', 'Bungalow', 'Villa', 'Loft', 'Local', 'Terreno'] }, placeholder: 'Selecciona tipo', required: true, orden: 2 },
  { fieldKey: 'estado', label: 'Estado', type: 'select', categoria: 'Información General', options: { values: ['disponible', 'reservada', 'vendida', 'alquilada'] }, valorDefecto: 'disponible', orden: 3 },
  { fieldKey: 'direccion', label: 'Dirección', type: 'text', categoria: 'Ubicación', placeholder: 'Calle y número', orden: 4 },
  { fieldKey: 'zona', label: 'Zona / Ciudad', type: 'text', categoria: 'Ubicación', placeholder: 'Ej: Madrid Centro', orden: 5 },
  { fieldKey: 'latitud', label: 'Latitud', type: 'number', categoria: 'Ubicación', orden: 6 },
  { fieldKey: 'longitud', label: 'Longitud', type: 'number', categoria: 'Ubicación', orden: 7 },
  { fieldKey: 'superficie_total', label: 'Superficie total (m²)', type: 'number', categoria: 'Superficies', unidad: 'm²', orden: 8 },
  { fieldKey: 'habitaciones', label: 'Habitaciones', type: 'number', categoria: 'Distribución', orden: 9 },
  { fieldKey: 'banos', label: 'Baños', type: 'number', categoria: 'Distribución', orden: 10 },
  { fieldKey: 'huespedes_max', label: 'Huéspedes máximos', type: 'number', categoria: 'Distribución', orden: 11 },
  { fieldKey: 'estacionamientos', label: 'Estacionamientos', type: 'number', categoria: 'Distribución', orden: 12 },
  { fieldKey: 'ascensor', label: 'Ascensor', type: 'boolean', categoria: 'Extras', orden: 13 },
  { fieldKey: 'alberca', label: 'Alberca / Piscina', type: 'boolean', categoria: 'Extras', orden: 14 },
  { fieldKey: 'jardin', label: 'Jardín', type: 'boolean', categoria: 'Extras', orden: 15 },
  { fieldKey: 'wifi', label: 'WiFi', type: 'boolean', categoria: 'Extras', orden: 16 },
  { fieldKey: 'aire_acondicionado', label: 'Aire acondicionado', type: 'boolean', categoria: 'Extras', orden: 17 },
  { fieldKey: 'amueblado', label: 'Amueblado', type: 'boolean', categoria: 'Extras', orden: 18 },
  { fieldKey: 'destacada', label: 'Propiedad destacada', type: 'boolean', categoria: 'Marketing', orden: 19 },
  { fieldKey: 'descripcion_larga', label: 'Descripción larga', type: 'textarea', categoria: 'Marketing', orden: 20 },
  { fieldKey: 'tags_seo', label: 'Tags SEO', type: 'text', categoria: 'Marketing', placeholder: 'separados por comas', orden: 21 },
];

const PROPERTIES: PropertySeed[] = [
  // ── Renta vacacional (estilo Airbnb/Booking) ───────────────────────────────
  {
    nombre: 'Loft con vistas al mar en Playa del Carmen',
    descripcion: 'Loft a 2 calles de la playa, ideal para parejas. Alta ocupación todo el año.',
    precioBase: 1850,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'alquiler_temporada', tipo_inmueble: 'Loft', estado: 'disponible',
      direccion: 'Av. Constituyentes 120, Ed. Marina Blanca Depto 302',
      zona: 'Playa del Carmen, Quintana Roo', latitud: '20.6296', longitud: '-87.0733',
      superficie_total: '55', habitaciones: '1', banos: '1', huespedes_max: '3', estacionamientos: '1',
      ascensor: true, alberca: true, jardin: false, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: true,
      descripcion_larga: 'Loft moderno en rooftop con alberca y vistas al mar Caribe. A 5 minutos caminando de la playa Mamitas y de la 5ª Avenida. Totalmente equipado: cocina integral, smart TV, WiFi de alta velocidad y aire acondicionado inverter. Registro Airbnb con 4.9 estrellas y 120 reseñas.',
      tags_seo: 'loft,playa_del_carmen,renta_vacacional,airbnb,vistas_mar,rooftop',
    },
  },
  {
    nombre: 'Villa privada con alberca en Tulum',
    descripcion: 'Villa ecológica de 3 recámaras en Aldea Zamá, a 10 min de la playa.',
    precioBase: 4200,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'alquiler_temporada', tipo_inmueble: 'Villa', estado: 'disponible',
      direccion: 'Cenote Tortuga 45, Aldea Zamá',
      zona: 'Tulum, Quintana Roo', latitud: '20.2114', longitud: '-87.4654',
      superficie_total: '220', habitaciones: '3', banos: '3', huespedes_max: '8', estacionamientos: '2',
      ascensor: false, alberca: true, jardin: true, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: true,
      descripcion_larga: 'Villa boutique de estilo boho-chic con alberca privada, palapa y jardín tropical. Tres recámaras con baño completo cada una. Perfecta para grupos y familias en Tulum. Publicada en Airbnb y Booking con calendarios sincronizados, ocupación promedio del 78% en temporada alta.',
      tags_seo: 'villa,tulum,renta_vacacional,airbnb,booking,alberca_privada,jungle',
    },
  },
  {
    nombre: 'Departamento en Roma Norte, Ciudad de México',
    descripcion: 'Departamento art déco restaurado, cerca de restaurantes y galerías.',
    precioBase: 1650,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'alquiler_temporada', tipo_inmueble: 'Departamento', estado: 'disponible',
      direccion: 'Calle Colima 158, Int. 4',
      zona: 'Roma Norte, Ciudad de México', latitud: '19.4167', longitud: '-99.1617',
      superficie_total: '78', habitaciones: '2', banos: '2', huespedes_max: '4', estacionamientos: '0',
      ascensor: true, alberca: false, jardin: false, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: true,
      descripcion_larga: 'Departamento en edificio art déco de los años 40, restaurado con acabados de autor. En el corazón de la Roma Norte: cafeterías, bares y restaurantes a pie de calle. Ideal para viajes de placer o trabajo. Favorito de Airbnb para estancias medias (5-10 noches).',
      tags_seo: 'departamento,roma_norte,cdmx,renta_vacacional,airbnb,art_deco',
    },
  },
  {
    nombre: 'Bungalow frente al mar en Holbox',
    descripcion: 'Bungalow de madera en la isla, despierta con el sonido del mar.',
    precioBase: 2400,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'alquiler_temporada', tipo_inmueble: 'Bungalow', estado: 'disponible',
      direccion: 'Calle Tiburón Ballena s/n, Zona Hotelera',
      zona: 'Isla Holbox, Quintana Roo', latitud: '21.5246', longitud: '-87.3694',
      superficie_total: '60', habitaciones: '1', banos: '1', huespedes_max: '2', estacionamientos: '0',
      ascensor: false, alberca: false, jardin: true, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: false,
      descripcion_larga: 'Bungalow artesanal de madera con palapa y hamacas, a 80 metros de la playa. Energía solar, agua purificada y mosquiteros en todas las ventanas. Experiencia eco-friendly muy buscada en Holbox. Temporada alta (dic-ago) vendida con 3 meses de anticipación.',
      tags_seo: 'bungalow,holbox,renta_vacacional,booking,frente_al_mar,eco',
    },
  },
  {
    nombre: 'Casa colonial en el centro de Mérida',
    descripcion: 'Casa restaurada con patio central y alberca, a 3 cuadras del Paseo de Montejo.',
    precioBase: 1900,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'alquiler_temporada', tipo_inmueble: 'Casa', estado: 'disponible',
      direccion: 'Calle 62 #435 entre 51 y 53',
      zona: 'Centro Histórico, Mérida, Yucatán', latitud: '20.9674', longitud: '-89.6217',
      superficie_total: '180', habitaciones: '3', banos: '2', huespedes_max: '6', estacionamientos: '1',
      ascensor: false, alberca: true, jardin: true, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: false,
      descripcion_larga: 'Casa colonial yucateca restaurada respetando pasta italiana,techos altos y pasta original. Patio central con alberca de inmersión y comedor exterior. Ubicación inmejorable para turismo cultural en Mérida. Calificación 4.8 en Booking con etiqueta "Excelente ubicación".',
      tags_seo: 'casa_colonial,merida,renta_vacacional,airbnb,booking,centro_historico',
    },
  },
  {
    nombre: 'Ático con terraza en la Condesa',
    descripcion: 'Ático de lujo con terraza de 40m² y vistas al parque México.',
    precioBase: 2800,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'alquiler_temporada', tipo_inmueble: 'Ático', estado: 'reservada',
      direccion: 'Av. Tamaulipas 210, Piso 7',
      zona: 'Condesa, Ciudad de México', latitud: '19.4119', longitud: '-99.1725',
      superficie_total: '110', habitaciones: '2', banos: '2', huespedes_max: '4', estacionamientos: '1',
      ascensor: true, alberca: false, jardin: false, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: true,
      descripcion_larga: 'Ático de diseño con terraza panorámica y asador, en el corazón de la Condesa. Acabados premium, cocina abierta con isla de mármol y bodega vinícola. Alta demanda para eventos corporativos y estancias ejecutivas.',
      tags_seo: 'atico,condesa,cdmx,renta_vacacional,airbnb,terraza,lujo',
    },
  },

  // ── Venta (para el pipeline comercial) ─────────────────────────────────────
  {
    nombre: 'Casa moderna con vista al golf en Playacar',
    descripcion: 'Residencia en campo de golf, a 5 minutos de la playa.',
    precioBase: 7500000,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'venta', tipo_inmueble: 'Casa', estado: 'disponible',
      direccion: 'Av. Xaman-Ha s/n, Fracc. Playacar Fase II',
      zona: 'Playacar, Playa del Carmen', latitud: '20.5902', longitud: '-87.0847',
      superficie_total: '350', habitaciones: '4', banos: '4', huespedes_max: '8', estacionamientos: '2',
      ascensor: false, alberca: true, jardin: true, wifi: true, aire_acondicionado: true, amueblado: false,
      destacada: true,
      descripcion_larga: 'Residencia de 4 recámaras dentro del campo de golf de Playacar, con alberca, terraza y área de servicio completa. Acceso controlado 24/7 y club de playa exclusivo. Gran oportunidad de inversión: se puede incorporar a renta vacacional con ROI proyectado del 9% anual.',
      tags_seo: 'casa,playacar,venta,inversion,golf,playa_del_carmen',
    },
  },
  {
    nombre: 'Villa en venta en Puerto Escondido',
    descripcion: 'Villa con vista panorámica al Pacífico, lista para estrenar.',
    precioBase: 5600000,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'venta', tipo_inmueble: 'Villa', estado: 'disponible',
      direccion: 'Camino a Zicatela s/n, Col. Brisas de Zicatela',
      zona: 'Puerto Escondido, Oaxaca', latitud: '15.8555', longitud: '-97.0572',
      superficie_total: '280', habitaciones: '3', banos: '3', huespedes_max: '6', estacionamientos: '2',
      ascensor: false, alberca: true, jardin: true, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: false,
      descripcion_larga: 'Villa de autor sobre el acantilado de Zicatela con vista completa al mar. Arquitectura contemporánea oaxaqueña con madera de cocobolo y palapa. Ideal como casa de descanso o segunda casa con renta vacacional los meses que no se usa.',
      tags_seo: 'villa,puerto_escondido,venta,oaxaca,pacifico,inversion',
    },
  },
  {
    nombre: 'Penthouse en venta zona hotelera Cancún',
    descripcion: 'Penthouse de 3 recámaras con lock-off para rentar en dos unidades.',
    precioBase: 9200000,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'venta', tipo_inmueble: 'Departamento', estado: 'disponible',
      direccion: 'Blvd. Kukulcán Km 12.5, Torre Coral',
      zona: 'Zona Hotelera, Cancún, Quintana Roo', latitud: '21.1009', longitud: '-86.8283',
      superficie_total: '240', habitaciones: '3', banos: '3', huespedes_max: '8', estacionamientos: '2',
      ascensor: true, alberca: true, jardin: false, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: false,
      descripcion_larga: 'Penthouse con lock-off (dos unidades independientes que se unen en una). Diseñado para maximizar ingresos de renta vacacional en la Zona Hotelera de Cancún. Amenidades: alberca infinity, gimnasio, beach club y coworking.',
      tags_seo: 'penthouse,cancun,venta,lockoff,renta_vacacional,airbnb,booking',
    },
  },
  {
    nombre: 'Casa de campo con huerto en Valle de Guadalupe',
    descripcion: 'Casa contenedora entre viñedos, perfecta para turismo enológico.',
    precioBase: 4100000,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'venta', tipo_inmueble: 'Casa', estado: 'disponible',
      direccion: 'Rancho La Lomita, Camino Viejo a San Antonio de las Minas',
      zona: 'Valle de Guadalupe, Baja California', latitud: '32.5264', longitud: '-116.5919',
      superficie_total: '500', habitaciones: '2', banos: '2', huespedes_max: '4', estacionamientos: '3',
      ascensor: false, alberca: false, jardin: true, wifi: true, aire_acondicionado: true, amueblado: true,
      destacada: false,
      descripcion_larga: 'Casa contenedora sustentable con paneles solares, huerto y Fogata exterior. Rodeada de viñedos a 15 minutos de la ruta del vino. Negocio redondo: renta vacacional de fin de semana con ocupación del 95% en temporada de vendimia.',
      tags_seo: 'casa_campo,valle_guadalupe,venta,vinedos,turismo_enologico',
    },
  },
  {
    nombre: 'Departamento en venta en Polanco',
    descripcion: 'Departamento de 2 recámaras en torre con amenidades completas.',
    precioBase: 11800000,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'venta', tipo_inmueble: 'Departamento', estado: 'disponible',
      direccion: 'Calle Julio Verne 92, Piso 9',
      zona: 'Polanco, Ciudad de México', latitud: '19.4326', longitud: '-99.1953',
      superficie_total: '165', habitaciones: '2', banos: '2', huespedes_max: '4', estacionamientos: '2',
      ascensor: true, alberca: true, jardin: false, wifi: true, aire_acondicionado: true, amueblado: false,
      destacada: false,
      descripcion_larga: 'Departamento en torre premium de Polanco con gimnasio, alberca climatizada, salón de eventos y 24/7 security. Vista al parque Lincoln. Zona con la plusvalía más alta de la CDMX, ideal para inversión patrimonial.',
      tags_seo: 'departamento,polanco,venta,cdmx,inversion,plusvalia',
    },
  },
  {
    nombre: 'Terreno con proyecto hotelero en Bacalar',
    descripcion: 'Lote de 1,200 m² con licencia de construcción para 8 cabañas.',
    precioBase: 3200000,
    moneda: 'MXN',
    customFieldValues: {
      tipo_operacion: 'venta', tipo_inmueble: 'Terreno', estado: 'disponible',
      direccion: 'Camino Costera s/n, Km 3.5',
      zona: 'Bacalar, Quintana Roo', latitud: '18.6764', longitud: '-88.3906',
      superficie_total: '1200', habitaciones: '0', banos: '0', huespedes_max: '0', estacionamientos: '0',
      ascensor: false, alberca: false, jardin: false, wifi: false, aire_acondicionado: false, amueblado: false,
      destacada: false,
      descripcion_larga: 'Terreno en la costera de Bacalar con licencia aprobada para construir 8 cabañas + recepción + restaurante. A 200 metros de la Laguna de los Siete Colores. Proyecto rentable con plan de negocio incluido (demanda turística creciendo 25% anual).',
      tags_seo: 'terreno,bacalar,venta,proyecto_hotelero,inversion,laguna',
    },
  },
];

// ─── Imágenes por ciudad ─────────────────────────────────────────────────────

const CITY_IMAGES: Record<string, string[]> = {
  'Playa del Carmen': [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
  ],
  'Tulum': [
    'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=800',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
    'https://images.unsplash.com/photo-1615880484746-a134be9a6ecf?w=800',
  ],
  'Ciudad de México': [
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800',
    'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800',
  ],
  'Isla Holbox': [
    'https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=800',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800',
  ],
  'Mérida': [
    'https://images.unsplash.com/photo-1560184897-ae75f418493e?w=800',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
  ],
  'Baja California': [
    'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=800',
    'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800',
  ],
  'Oaxaca': [
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
  ],
  'Quintana Roo': [
    'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  ],
};

function imagesForProperty(custom: Record<string, any>): string[] {
  const zona: string = custom.zona || '';
  for (const key of Object.keys(CITY_IMAGES)) {
    if (zona.includes(key)) return CITY_IMAGES[key];
  }
  return [
    'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=800',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
  ];
}

// ─── Seed principal ──────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Iniciando creación de Demo Real Estate (renta vacacional Airbnb/Booking)...');

  // 1. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {
      nombre: 'Demo Real Estate',
      subdomain: TENANT_SLUG,
      plan: 'profesional',
      estado: 'activo',
      moneda: 'MXN',
      enabledModules: ['crm', 'real-estate', 'leads', 'calendario'],
      brandingConfig: {
        primaryColor: '#b45309', // ámbar inmobiliario cálido
        logoUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=100&fit=crop',
        showPoweredBy: true,
      },
    },
    create: {
      nombre: 'Demo Real Estate',
      slug: TENANT_SLUG,
      subdomain: TENANT_SLUG,
      plan: 'profesional',
      estado: 'activo',
      moneda: 'MXN',
      enabledModules: ['crm', 'real-estate', 'leads', 'calendario'],
      brandingConfig: {
        primaryColor: '#b45309',
        logoUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=100&fit=crop',
        showPoweredBy: true,
      },
    },
  });
  console.log(`✅ Tenant: ${tenant.nombre} (${tenant.id})`);

  // 1b. Feature de Marca Blanca — sin esto, la API de whitelabel rechaza el
  // guardado con 403 "Módulo de Marca Blanca no activo para este plan".
  await prisma.tenantFeature.upsert({
    where: { tenantId_feature: { tenantId: tenant.id, feature: 'white_label' } },
    update: { habilitado: true },
    create: {
      tenantId: tenant.id,
      feature: 'white_label',
      habilitado: true,
      razon: 'Demo Real Estate — marca blanca habilitada para la demo',
      habilitadoPor: 'seed-demo-real-estate',
    },
  });
  console.log('✅ Feature white_label habilitada (guardado de whitelabel permitido)');

  // 2. Roles
  const ROLE_PERMISSIONS: Record<string, any> = {
    Superadmin: {
      leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true },
      citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
      pipeline: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
      contactos: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
      empresas: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
      estudiantes: { ver: true, crear: true, editar: true, eliminar: true, inscribir: true, exportar: true },
      cursos: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
      automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true, gestionar: true },
      campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true, gestionar: true },
      mensajes: { ver: true, enviar: true, responder: true, gestionar: true },
      analytics: { ver: true, exportar: true, gestionar: true },
      configuracion: { ver: true, editar: true, gestionar: true },
      equipo: { ver: true, crear: true, editar: true, eliminar: true, invitar: true, gestionar: true },
      integraciones: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
      pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
    },
    // `leads.ver_todos` es el alcance del pipeline: el administrador ve la
    // cuenta entera; «Sales Agent» no la lleva y solo ve sus leads asignados.
    Admin: {
      leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true, ver_todos: true },
      citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
      pipeline: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
      contactos: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
      empresas: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
      estudiantes: { ver: false, crear: false, editar: false, eliminar: false, inscribir: false, exportar: false },
      cursos: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
      automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true, gestionar: true },
      campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true, gestionar: true },
      mensajes: { ver: true, enviar: true, responder: true, gestionar: true },
      analytics: { ver: true, exportar: true, gestionar: true },
      configuracion: { ver: true, editar: true, gestionar: true },
      equipo: { ver: true, crear: true, editar: true, eliminar: true, invitar: true, gestionar: true },
      integraciones: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
      pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
    },
    'Sales Agent': {
      leads: { ver: true, crear: true, editar: true, eliminar: false, asignar: false, exportar: false },
      citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
      pipeline: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
      contactos: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
      empresas: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
      estudiantes: { ver: false, crear: false, editar: false, eliminar: false, inscribir: false, exportar: false },
      cursos: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
      automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false, gestionar: false },
      campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false, gestionar: false },
      mensajes: { ver: true, enviar: true, responder: true, gestionar: false },
      analytics: { ver: true, exportar: false, gestionar: false },
      configuracion: { ver: false, editar: false, gestionar: false },
      equipo: { ver: false, crear: false, editar: false, eliminar: false, invitar: false, gestionar: false },
      integraciones: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false },
      pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
    },
  };

  const roles: Record<string, { id: string }> = {};
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const existing = await prisma.role.findFirst({ where: { tenantId: tenant.id, nombre: roleName } });
    if (existing) {
      await prisma.role.update({ where: { id: existing.id }, data: { permisos: permissions } });
      roles[roleName] = existing;
    } else {
      roles[roleName] = await prisma.role.create({
        data: {
          tenantId: tenant.id,
          nombre: roleName,
          descripcion: `Rol ${roleName} para la demo de renta vacacional`,
          permisos: permissions,
          esPersonalizado: false,
        },
      });
    }
    console.log(`   ✓ Rol ${roleName} asegurado.`);
  }

  // 3. Usuarios demo
  if (!DEMO_PASSWORD) {
    console.error('❌ Define DEMO_RE_PASSWORD en el entorno antes de ejecutar el seed.');
    process.exit(1);
  }
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 12);

  // La Directora se siembra con rol Superadmin para que la cuenta admin@… pueda
  // operar el backoffice de la plataforma (ver detalles de tenants, módulos,
  // features, plan) además del CRM de su propio tenant.
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: 'Mariana Robles (Directora)',
      tenantId: tenant.id,
      roleId: roles['Superadmin'].id,
      estado: 'activo',
    },
    create: {
      name: 'Mariana Robles (Directora)',
      email: ADMIN_EMAIL,
      password: hashedPassword,
      tenantId: tenant.id,
      roleId: roles['Superadmin'].id,
      estado: 'activo',
    },
  });

  await prisma.employee.upsert({
    where: { userId: adminUser.id },
    update: {
      fullName: 'Mariana Robles',
      tenantId: tenant.id,
      jobTitle: 'Directora General',
      department: 'Operaciones',
    },
    create: {
      fullName: 'Mariana Robles',
      email: ADMIN_EMAIL,
      tenantId: tenant.id,
      jobTitle: 'Directora General',
      department: 'Operaciones',
      isActive: true,
      userId: adminUser.id,
    },
  });

  const agentUser = await prisma.user.upsert({
    where: { email: AGENT_EMAIL },
    update: {
      name: 'Diego Fuentes (Agente)',
      tenantId: tenant.id,
      roleId: roles['Sales Agent'].id,
      estado: 'activo',
    },
    create: {
      name: 'Diego Fuentes (Agente)',
      email: AGENT_EMAIL,
      password: hashedPassword,
      tenantId: tenant.id,
      roleId: roles['Sales Agent'].id,
      estado: 'activo',
    },
  });

  await prisma.employee.upsert({
    where: { userId: agentUser.id },
    update: {
      fullName: 'Diego Fuentes',
      tenantId: tenant.id,
      jobTitle: 'Ejecutivo de Renta Vacacional',
      department: 'Ventas',
    },
    create: {
      fullName: 'Diego Fuentes',
      email: AGENT_EMAIL,
      tenantId: tenant.id,
      jobTitle: 'Ejecutivo de Renta Vacacional',
      department: 'Ventas',
      isActive: true,
      userId: agentUser.id,
    },
  });

  console.log(`   ✓ Usuarios: ${ADMIN_EMAIL} y ${AGENT_EMAIL} (contraseña: la de DEMO_RE_PASSWORD)`);

  // 4. Catálogo inmobiliario (fields + propiedades)
  console.log('🏠 Sembrando catálogo inmobiliario...');
  for (const def of FIELD_DEFINITIONS) {
    await prisma.catalogoFieldDefinition.upsert({
      where: { tenantId_fieldKey: { tenantId: tenant.id, fieldKey: def.fieldKey } },
      update: {
        label: def.label,
        type: def.type,
        options: (def as any).options || null,
        required: (def as any).required || false,
        orden: (def as any).orden || 0,
        categoria: (def as any).categoria || null,
        placeholder: (def as any).placeholder || null,
        unidad: (def as any).unidad || null,
        valorDefecto: (def as any).valorDefecto || null,
        activo: true,
      },
      create: {
        tenantId: tenant.id,
        fieldKey: def.fieldKey,
        label: def.label,
        type: def.type,
        options: (def as any).options || null,
        required: (def as any).required || false,
        orden: (def as any).orden || 0,
        categoria: (def as any).categoria || null,
        placeholder: (def as any).placeholder || null,
        unidad: (def as any).unidad || null,
        valorDefecto: (def as any).valorDefecto || null,
        activo: true,
      },
    });
  }
  console.log(`   ✓ ${FIELD_DEFINITIONS.length} definiciones de campos creadas.`);

  let propIndex = 0;
  for (const prop of PROPERTIES) {
    const slug = prop.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
    const propertyId = `inm-${tenant.id}-${slug}`;
    const isAlquiler = prop.customFieldValues.tipo_operacion === 'alquiler_temporada' || prop.customFieldValues.tipo_operacion === 'alquiler';

    await prisma.catalogoItem.upsert({
      where: { id: propertyId },
      update: {
        nombre: prop.nombre,
        descripcion: prop.descripcion,
        precioBase: prop.precioBase,
        moneda: prop.moneda,
        activo: true,
        destacado: prop.customFieldValues.destacada === true,
        customFieldValues: prop.customFieldValues,
        media: imagesForProperty(prop.customFieldValues).map((url, i) => ({ url, tipo: 'imagen', orden: i, alt: prop.nombre })),
        pricing: isAlquiler ? { rent: { nightly: prop.precioBase } } : { sale: { price: prop.precioBase } },
        categorias: ['inmueble', prop.customFieldValues.tipo_operacion, String(prop.customFieldValues.tipo_inmueble).toLowerCase()],
        etiquetas: String(prop.customFieldValues.tags_seo || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      },
      create: {
        id: propertyId,
        tenantId: tenant.id,
        nombre: prop.nombre,
        descripcion: prop.descripcion,
        sku: `INM-${String(propIndex + 1).padStart(3, '0')}`,
        tipo: 'inmueble',
        precioBase: prop.precioBase,
        moneda: prop.moneda,
        activo: true,
        destacado: prop.customFieldValues.destacada === true,
        customFieldValues: prop.customFieldValues,
        media: imagesForProperty(prop.customFieldValues).map((url, i) => ({ url, tipo: 'imagen', orden: i, alt: prop.nombre })),
        pricing: isAlquiler ? { rent: { nightly: prop.precioBase } } : { sale: { price: prop.precioBase } },
        categorias: ['inmueble', prop.customFieldValues.tipo_operacion, String(prop.customFieldValues.tipo_inmueble).toLowerCase()],
        etiquetas: String(prop.customFieldValues.tags_seo || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      },
    });
    propIndex++;
  }
  console.log(`   ✓ ${propIndex} propiedades creadas (6 de renta vacacional, 6 de venta).`);

  // 5. Pipelines
  console.log('📈 Configurando pipelines...');

  const pipelineRenta = await prisma.pipeline.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Renta Vacacional (Airbnb/Booking)' } },
    update: { activo: true },
    create: {
      tenantId: tenant.id,
      nombre: 'Renta Vacacional (Airbnb/Booking)',
      categoria: 'alquiler',
      descripcion: 'Pipeline de reservas de renta vacacional: de la consulta del huésped a la reserva confirmada',
      color: '#0d9488',
      icono: '🌴',
    },
  });

  const stagesRenta = [
    { nombre: 'Consulta Recibida', orden: 1, probabilidad: 10 },
    { nombre: 'Disponibilidad Enviada', orden: 2, probabilidad: 25 },
    { nombre: 'Pre-reserva', orden: 3, probabilidad: 50 },
    { nombre: 'Identidad Verificada', orden: 4, probabilidad: 75 },
    { nombre: 'Reserva Confirmada (Ganado)', orden: 5, probabilidad: 100, esEtapaFinal: true, tipoEtapaFinal: 'WON' },
    { nombre: 'Cancelada (Perdido)', orden: 6, probabilidad: 0, esEtapaFinal: true, tipoEtapaFinal: 'LOST' },
  ];
  // Idempotencia: limpiar etapas previas de este pipeline antes de recrearlas
  await prisma.pipelineStage.deleteMany({ where: { tenantId: tenant.id, pipelineId: pipelineRenta.id } });

  const stageRentaMap: Record<string, string> = {};
  for (const st of stagesRenta) {
    const stage = await prisma.pipelineStage.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipelineRenta.id,
        nombre: st.nombre,
        orden: st.orden,
        probabilidad: st.probabilidad,
        esEtapaFinal: st.esEtapaFinal || false,
        tipoEtapaFinal: st.tipoEtapaFinal || null,
        categoria: 'alquiler',
      },
    });
    stageRentaMap[st.nombre] = stage.id;
  }

  const pipelineVenta = await prisma.pipeline.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Venta de Propiedades' } },
    update: { activo: true },
    create: {
      tenantId: tenant.id,
      nombre: 'Venta de Propiedades',
      categoria: 'ventas',
      descripcion: 'Pipeline comercial para compradores de propiedades e inversionistas',
      color: '#b45309',
      icono: '🏡',
    },
  });

  const stagesVenta = [
    { nombre: 'Nuevo Prospecto', orden: 1, probabilidad: 10 },
    { nombre: 'Contacto Inicial', orden: 2, probabilidad: 20 },
    { nombre: 'Visita Programada', orden: 3, probabilidad: 40 },
    { nombre: 'Propuesta / Oferta', orden: 4, probabilidad: 60 },
    { nombre: 'Contrato y Cierre', orden: 5, probabilidad: 80 },
    { nombre: 'Vendido (Ganado)', orden: 6, probabilidad: 100, esEtapaFinal: true, tipoEtapaFinal: 'WON' },
    { nombre: 'Desestimado (Perdido)', orden: 7, probabilidad: 0, esEtapaFinal: true, tipoEtapaFinal: 'LOST' },
  ];
  await prisma.pipelineStage.deleteMany({ where: { tenantId: tenant.id, pipelineId: pipelineVenta.id } });

  const stageVentaMap: Record<string, string> = {};
  for (const st of stagesVenta) {
    const stage = await prisma.pipelineStage.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipelineVenta.id,
        nombre: st.nombre,
        orden: st.orden,
        probabilidad: st.probabilidad,
        esEtapaFinal: st.esEtapaFinal || false,
        tipoEtapaFinal: st.tipoEtapaFinal || null,
        categoria: 'ventas',
      },
    });
    stageVentaMap[st.nombre] = stage.id;
  }
  console.log('   ✓ Pipelines "Renta Vacacional (Airbnb/Booking)" y "Venta de Propiedades" con sus etapas.');

  // 6. Leads + Contactos
  console.log('👤 Creando leads y contactos...');

  const leadData = [
    {
      id: 'lead-dre-1',
      nombre: 'Karla Ortega',
      email: 'karla.ortega@demo-huesped.com',
      telefono: '+52 984 123 4567',
      notas: 'Consulta desde Airbnb: quiere el Loft en Playa del Carmen para 2 personas, del 14 al 20 del mes próximo. Pregunta por late check-out.',
      estado: 'contactado',
      fuente: 'airbnb',
    },
    {
      id: 'lead-dre-2',
      nombre: 'James Whitmore',
      email: 'james.whitmore@demo-huesped.com',
      telefono: '+1 512 555 0184',
      notas: 'Consulta desde Booking: familia de 6, interesados en la Villa de Tulum por 7 noches en temporada alta. Solicita cotización con traslados.',
      estado: 'nuevo',
      fuente: 'booking',
    },
    {
      id: 'lead-dre-3',
      nombre: 'Renata Salgado',
      email: 'renata.salgado@demo-huesped.com',
      telefono: '+52 55 3841 9920',
      notas: 'Interesada en el Ático de la Condesa para sesión de fotos y estancia de 3 noches. Ya revisó disponibilidad y acepta tarifa.',
      estado: 'contactado',
      fuente: 'instagram',
    },
    {
      id: 'lead-dre-4',
      nombre: 'Eduardo Cázares',
      email: 'eduardo.cazares@demo-inversionista.com',
      telefono: '+52 81 2244 7788',
      notas: 'Inversionista buscando propiedades con ROI en renta vacacional. Le interesa el Penthouse lock-off de Cancún y el terreno de Bacalar.',
      estado: 'nuevo',
      fuente: 'referido',
    },
    {
      id: 'lead-dre-5',
      nombre: 'Sophie Laurent',
      email: 'sophie.laurent@demo-huesped.com',
      telefono: '+33 6 12 55 90 44',
      notas: 'Pareja francesa buscando casa colonial en Mérida por 10 noches. Prefiere comunicación por WhatsApp en inglés.',
      estado: 'nuevo',
      fuente: 'google',
    },
  ];

  for (const ld of leadData) {
    await prisma.lead.upsert({
      where: { id: ld.id },
      update: {
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        notas: ld.notas,
        estado: ld.estado,
        fuente: ld.fuente,
        asignadoA: agentUser.id,
      },
      create: {
        id: ld.id,
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        notas: ld.notas,
        estado: ld.estado,
        fuente: ld.fuente,
        asignadoA: agentUser.id,
      },
    });

    await prisma.contact.upsert({
      where: { id: `contact-${ld.id}` },
      update: {
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        tipo: 'CLIENTE',
        notas: ld.notas,
      },
      create: {
        id: `contact-${ld.id}`,
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        tipo: 'CLIENTE',
        notas: ld.notas,
      },
    });
  }
  console.log('   ✓ 5 leads + 5 contactos vinculados.');

  // 7. Deals
  console.log('💼 Creando oportunidades...');

  const loft = await prisma.catalogoItem.findFirst({ where: { tenantId: tenant.id, nombre: { contains: 'Loft con vistas al mar' } } });
  const villaTulum = await prisma.catalogoItem.findFirst({ where: { tenantId: tenant.id, nombre: { contains: 'Villa privada con alberca en Tulum' } } });
  const aticoCondesa = await prisma.catalogoItem.findFirst({ where: { tenantId: tenant.id, nombre: { contains: 'Ático con terraza en la Condesa' } } });
  const penthouseCancun = await prisma.catalogoItem.findFirst({ where: { tenantId: tenant.id, nombre: { contains: 'Penthouse en venta zona hotelera' } } });
  const casaMerida = await prisma.catalogoItem.findFirst({ where: { tenantId: tenant.id, nombre: { contains: 'Casa colonial en el centro de Mérida' } } });
  const terrenoBacalar = await prisma.catalogoItem.findFirst({ where: { tenantId: tenant.id, nombre: { contains: 'Terreno con proyecto hotelero' } } });

  if (!loft || !villaTulum || !aticoCondesa || !penthouseCancun || !casaMerida || !terrenoBacalar) {
    console.warn('⚠️ Advertencia: no se encontraron todas las propiedades para vincular deals.');
  }

  // Deal existentes se limpian para no duplicar en re-ejecución
  await prisma.deal.deleteMany({ where: { tenantId: tenant.id, leadId: { in: leadData.map((l) => l.id) } } });

  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-1',
      contactId: 'contact-lead-dre-1',
      titulo: 'Karla Ortega — Loft Playa del Carmen (5 noches)',
      descripcion: 'Consulta Airbnb confirmada. Enviar disponibilidad y late check-out. Valor estimado de la estancia (5 noches).',
      valor: 9250,
      moneda: 'MXN',
      etapa: stageRentaMap['Disponibilidad Enviada'],
      pipelineId: pipelineRenta.id,
      probabilidad: 25,
      estado: 'activo',
      usuarioAsignadoId: agentUser.id,
      catalogoItemId: loft?.id || null,
      prioridad: 'alta',
      origen: 'airbnb',
    },
  });

  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-2',
      contactId: 'contact-lead-dre-2',
      titulo: 'James Whitmore — Villa Tulum familiar (7 noches)',
      descripcion: 'Familia de 6 personas, 7 noches en temporada alta. Falta cotización con traslados y depósito de pre-reserva.',
      valor: 29400,
      moneda: 'MXN',
      etapa: stageRentaMap['Consulta Recibida'],
      pipelineId: pipelineRenta.id,
      probabilidad: 10,
      estado: 'activo',
      usuarioAsignadoId: agentUser.id,
      catalogoItemId: villaTulum?.id || null,
      prioridad: 'alta',
      origen: 'booking',
    },
  });

  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-3',
      contactId: 'contact-lead-dre-3',
      titulo: 'Renata Salgado — Ático Condesa (3 noches)',
      descripcion: 'Acepta tarifa para sesión de fotos + estancia. Pendiente identificación verificada y pago del 50%.',
      valor: 8400,
      moneda: 'MXN',
      etapa: stageRentaMap['Pre-reserva'],
      pipelineId: pipelineRenta.id,
      probabilidad: 50,
      estado: 'activo',
      usuarioAsignadoId: agentUser.id,
      catalogoItemId: aticoCondesa?.id || null,
      prioridad: 'media',
      origen: 'instagram',
    },
  });

  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-4',
      contactId: 'contact-lead-dre-4',
      titulo: 'Eduardo Cázares — Penthouse Cancún (inversión)',
      descripcion: 'Inversionista interesado en el penthouse con lock-off. Se envió análisis de ROI de renta vacacional. Visita al lugar pendiente.',
      valor: 9200000,
      moneda: 'MXN',
      etapa: stageVentaMap['Contacto Inicial'],
      pipelineId: pipelineVenta.id,
      probabilidad: 20,
      estado: 'activo',
      usuarioAsignadoId: adminUser.id,
      catalogoItemId: penthouseCancun?.id || null,
      prioridad: 'muy_alta',
      origen: 'referido',
    },
  });

  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-5',
      contactId: 'contact-lead-dre-5',
      titulo: 'Sophie Laurent — Casa Colonial Mérida (10 noches)',
      descripcion: 'Consulta por WhatsApp en inglés. Se envió enlace de disponibilidad y fotos. Espera respuesta.',
      valor: 19000,
      moneda: 'MXN',
      etapa: stageRentaMap['Consulta Recibida'],
      pipelineId: pipelineRenta.id,
      probabilidad: 10,
      estado: 'activo',
      usuarioAsignadoId: agentUser.id,
      catalogoItemId: casaMerida?.id || null,
      prioridad: 'media',
      origen: 'google',
    },
  });

  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-4',
      contactId: 'contact-lead-dre-4',
      titulo: 'Eduardo Cázares — Terreno Bacalar (proyecto hotelero)',
      descripcion: 'Segunda oportunidad del inversionista: terreno con licencia para 8 cabañas. Revisión de plan de negocio.',
      valor: 3200000,
      moneda: 'MXN',
      etapa: stageVentaMap['Nuevo Prospecto'],
      pipelineId: pipelineVenta.id,
      probabilidad: 10,
      estado: 'activo',
      usuarioAsignadoId: adminUser.id,
      catalogoItemId: terrenoBacalar?.id || null,
      prioridad: 'media',
      origen: 'referido',
    },
  });

  console.log('   ✓ 6 deals creados (4 de renta vacacional, 2 de venta).');

  // 8. Citas
  console.log('📅 Programando citas...');
  // Idempotencia: no duplicar citas si el seed ya se ejecutó
  const citasExistentes = await prisma.cita.count({ where: { tenantId: tenant.id } });
  const ahora = new Date();
  const manana11am = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  manana11am.setHours(11, 0, 0, 0);
  const pasado16h = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);
  pasado16h.setHours(16, 30, 0, 0);
  const en4dias = new Date(ahora.getTime() + 4 * 24 * 60 * 60 * 1000);
  en4dias.setHours(10, 0, 0, 0);

  if (citasExistentes === 0) await prisma.cita.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-4',
      contactId: 'contact-lead-dre-4',
      tipo: 'visita',
      titulo: 'Visita a Penthouse Cancún con inversionista',
      descripcion: 'Recorrido por la torre Coral, mostrar lock-off, amenities y datos de ocupación de la zona.',
      ubicacion: 'Blvd. Kukulcán Km 12.5, Zona Hotelera, Cancún',
      fechaHora: manana11am,
      duracion: 90,
      estado: 'confirmada',
      catalogoItemId: penthouseCancun?.id || null,
    },
  });

  if (citasExistentes === 0) await prisma.cita.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-1',
      contactId: 'contact-lead-dre-1',
      tipo: 'llamada',
      titulo: 'Llamada de bienvenida Karla Ortega',
      descripcion: 'Confirmar fechas 14-20, explicar late check-out y política de depósito de daños.',
      fechaHora: pasado16h,
      duracion: 20,
      estado: 'pendiente',
    },
  });

  if (citasExistentes === 0) await prisma.cita.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-dre-2',
      contactId: 'contact-lead-dre-2',
      tipo: 'reunion',
      titulo: 'Videollamada familia Whitmore',
      descripcion: 'Presentar villa de Tulum en videollamada: habitaciones, alberca, seguridad y traslados.',
      fechaHora: en4dias,
      duracion: 45,
      estado: 'pendiente',
    },
  });
  console.log('   ✓ 3 citas creadas en la agenda.');

  // 9. Tareas (con try/catch: la BD en producción puede estar detrás del schema.prisma)
  console.log('✅ Creando tareas de seguimiento...');
  const vencManana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const vencEn3 = new Date(ahora.getTime() + 3 * 24 * 60 * 60 * 1000);
  const vencEn5 = new Date(ahora.getTime() + 5 * 24 * 60 * 60 * 1000);

  const crearTarea = async (data: any) => {
    try {
      await prisma.task.create({ data });
    } catch (e: any) {
      // Fallback: la BD puede no tener columnas recientes del schema (drift).
      // Insertamos por SQL crudo solo con columnas base y id fijo (idempotente).
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Task" (id, "tenantId", "leadId", tipo, titulo, descripcion, "fechaVencimiento", "asignadoA")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          data.taskId || `task-dre-${Math.random().toString(36).slice(2, 10)}`,
          data.tenantId,
          data.leadId,
          data.tipo,
          data.titulo,
          data.descripcion,
          data.fechaVencimiento,
          data.asignadoA,
        );
      } catch (e2: any) {
        console.warn(`   ⚠️ Tarea omitida (${e2?.message?.slice(0, 120) || 'error desconocido'})`);
      }
    }
  };

  await crearTarea({
    taskId: 'task-dre-1',
    tenantId: tenant.id,
    leadId: 'lead-dre-2',
    tipo: 'seguimiento',
    titulo: 'Enviar cotización con traslados a los Whitmore',
    descripcion: 'Incluir opción de van privado Cancún→Tulum y cuna para el menor.',
    fechaVencimiento: vencManana,
    asignadoA: agentUser.id,
  });

  await crearTarea({
    taskId: 'task-dre-2',
    tenantId: tenant.id,
    leadId: 'lead-dre-3',
    tipo: 'documento',
    titulo: 'Solicitar identificación de Renata Salgado',
    descripcion: 'Verificación de identidad para confirmar la pre-reserva del ático de la Condesa.',
    fechaVencimiento: vencEn3,
    asignadoA: agentUser.id,
  });

  await crearTarea({
    taskId: 'task-dre-3',
    tenantId: tenant.id,
    leadId: 'lead-dre-5',
    tipo: 'seguimiento',
    titulo: 'Follow-up en inglés a Sophie Laurent',
    descripcion: 'Recordar disponibilidad de la casa colonial y ofrecer 10% de descuento por 10 noches.',
    fechaVencimiento: vencEn5,
    asignadoA: agentUser.id,
  });
  console.log('   ✓ Tareas de seguimiento procesadas.');

  // 10. Notas / historial (los modelos Note e Interaction no llevan tenantId)
  // Idempotencia: limpiar historial previo de estos leads y recrearlo
  console.log('📝 Creando historial de notas e interacciones...');
  await prisma.note.deleteMany({ where: { leadId: { startsWith: 'lead-dre-' } } });
  await prisma.interaction.deleteMany({ where: { leadId: { startsWith: 'lead-dre-' } } });

  await prisma.note.create({
    data: {
      leadId: 'lead-dre-1',
      contactId: 'contact-lead-dre-1',
      contenido: 'Consulta original recibida por mensaje de Airbnb a las 21:40. Respondida en menos de 10 minutos (SLA cumplido).',
      creadoPor: agentUser.id,
    },
  });

  await prisma.note.create({
    data: {
      leadId: 'lead-dre-2',
      contactId: 'contact-lead-dre-2',
      contenido: 'Familia Whitmore: prioridad cuna para el menor y traslado aeropuerto. Sensible al precio: mencionar paquete familiar.',
      creadoPor: agentUser.id,
    },
  });

  await prisma.note.create({
    data: {
      leadId: 'lead-dre-4',
      contactId: 'contact-lead-dre-4',
      contenido: 'Eduardo gestiona dos propiedades en paralelo. Perfil: ROI objetivo mínimo 8% anual. Decisor único, cierre rápido si los números cuadran.',
      creadoPor: adminUser.id,
    },
  });

  await prisma.interaction.create({
    data: {
      leadId: 'lead-dre-1',
      contactId: 'contact-lead-dre-1',
      tipo: 'mensaje',
      contenido: 'Enviada disponibilidad del Loft Playa del Carmen del 14 al 20 con tarifa de $1,850 MXN por noche.',
      resultado: 'Interesada, pidió late check-out',
      creadoPor: agentUser.id,
      metadatos: { canal: 'airbnb', mensajeAutomatico: false },
    },
  });

  await prisma.interaction.create({
    data: {
      leadId: 'lead-dre-3',
      contactId: 'contact-lead-dre-3',
      tipo: 'llamada',
      contenido: 'Llamada de 8 minutos: confirmó tarifas del Ático Condesa para sesión de fotos (3 noches).',
      resultado: 'Acepta tarifa, envía identificación mañana',
      creadoPor: agentUser.id,
      metadatos: { canal: 'telefono' },
    },
  });
  console.log('   ✓ Notas e interacciones de historial creadas.');

  console.log('\n✨ INYECCIÓN DE DATOS DE DEMO REAL ESTATE COMPLETADA');
  console.log('──────────────────────────────────────────────────────');
  console.log(`Empresa:      ${tenant.nombre}`);
  console.log(`Tenant Slug:  ${tenant.slug}`);
  console.log(`Tenant ID:    ${tenant.id}`);
  console.log(`Admin:        ${ADMIN_EMAIL} / (DEMO_RE_PASSWORD)`);
  console.log(`Agente:       ${AGENT_EMAIL} / (DEMO_RE_PASSWORD)`);
  console.log('──────────────────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Error inyectando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
