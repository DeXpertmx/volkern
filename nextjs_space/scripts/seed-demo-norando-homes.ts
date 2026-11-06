/**
 * Norando Homes — Seed de la cuenta de demostración
 *
 * Crea el tenant `norando-homes` con su marca (logotipo real y negro de marca),
 * el catálogo de campos inmobiliario, el inventario real de la agencia en la
 * provincia de Málaga y dos accesos al panel.
 *
 * Los inmuebles salen del inventario que compartió la agencia: tipo, zona,
 * precio publicado, superficies, distribución y características. Lo que no
 * publicaron —precio, certificado energético, fotos— se deja tal cual: precios a
 * 0 (el portal los anuncia como «Precio a consultar»), sin certificado y con
 * fotografías de relleno, para no inventar datos de un inmueble real.
 *
 * Uso:
 *   npx tsx --require ./scripts/cargar-entorno.cjs scripts/seed-demo-norando-homes.ts
 *
 * Idempotente: se puede re-ejecutar sin duplicar nada.
 *
 * ⚠️ La contraseña de los usuarios demo se lee de NORANDO_DEMO_PASSWORD. Si no
 * está definida, el script siembra todo lo demás y se salta los usuarios: nunca
 * se escribe una contraseña en el código.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TENANT_SLUG = 'norando-homes';
const TENANT_NOMBRE = 'Norando Homes';
const LOGO_URL = 'https://norandohomes.com/wp-content/uploads/2025/04/NORANDO-HOMES-LOGO1-04.svg';
const MARCA_NEGRA = '#111111';
const ADMIN_EMAIL = 'admin@norandohomes.com';
const AGENTE_EMAIL = 'agente@norandohomes.com';
const PASSWORD = process.env.NORANDO_DEMO_PASSWORD;

/**
 * Módulos que esta demo NO enseña.
 *
 * El plan `profesional` trae el catálogo completo (`PLAN_MODULES`) y
 * `enabledModules` solo AÑADE: la única forma de apagar un módulo es la fila de
 * `TenantFeature` con `habilitado: false`, que `resolverModulosTenant` aplica al
 * final y gana sobre el plan (ver lib/tenant-modules.ts). Con eso el menú deja
 * de ofrecerlos y `lib/module-guard.ts` manda al panel si alguien escribe la
 * URL a mano.
 *
 * Una agencia inmobiliaria no compra la academia, la cartera de seguros, el
 * motor de reservas turísticas ni la planta industrial. Enseñarlos en la demo
 * la convierte en un ERP genérico y resta credibilidad al vertical.
 */
const MODULOS_APAGADOS = [
  'cursos', 'estudiantes', // Academia
  'insurance', // Seguros
  'hospitality', // Hospitality
  'calidad', 'produccion', // Planta
  'inventario', 'compras', // Almacén y aprovisionamiento
  'proyectos', 'taskforce', // Obra y soporte
  'logistica', // Flota
] as const;

// ─── Catálogo de campos ──────────────────────────────────────────────────────

interface FieldDefinition {
  fieldKey: string;
  label: string;
  type: string;
  options?: { values: string[] };
  required?: boolean;
  placeholder?: string;
  unidad?: string;
  valorDefecto?: string;
  categoria: string;
  orden: number;
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { fieldKey: 'tipo_operacion', label: 'Tipo de operación', type: 'select', options: { values: ['venta', 'alquiler', 'traspaso'] }, required: true, valorDefecto: 'venta', categoria: 'Información General', orden: 1 },
  { fieldKey: 'tipo_inmueble', label: 'Tipo de inmueble', type: 'select', options: { values: ['Piso', 'Estudio', 'Ático', 'Casa', 'Casa de campo', 'Finca rústica', 'Terreno', 'Local Comercial', 'Oficina'] }, required: true, categoria: 'Información General', orden: 2 },
  { fieldKey: 'estado', label: 'Estado', type: 'select', options: { values: ['disponible', 'reservada', 'vendida', 'alquilada'] }, valorDefecto: 'disponible', categoria: 'Información General', orden: 3 },

  { fieldKey: 'direccion', label: 'Dirección', type: 'text', placeholder: 'Calle y número', categoria: 'Ubicación', orden: 4 },
  { fieldKey: 'zona', label: 'Zona / Barrio', type: 'text', placeholder: 'Ej: La Unión — Cruz de Humilladero', categoria: 'Ubicación', orden: 5 },
  { fieldKey: 'ciudad', label: 'Ciudad', type: 'text', placeholder: 'Ej: Málaga', categoria: 'Ubicación', orden: 6 },
  { fieldKey: 'provincia', label: 'Provincia', type: 'text', valorDefecto: 'Málaga', categoria: 'Ubicación', orden: 7 },
  { fieldKey: 'codigo_postal', label: 'Código postal', type: 'text', categoria: 'Ubicación', orden: 8 },
  { fieldKey: 'latitud', label: 'Latitud', type: 'number', categoria: 'Ubicación', orden: 9 },
  { fieldKey: 'longitud', label: 'Longitud', type: 'number', categoria: 'Ubicación', orden: 10 },

  { fieldKey: 'superficie_total', label: 'Superficie total', type: 'number', unidad: 'm²', categoria: 'Superficies', orden: 11 },
  { fieldKey: 'superficie_construida', label: 'Superficie construida', type: 'number', unidad: 'm²', categoria: 'Superficies', orden: 12 },
  { fieldKey: 'habitaciones', label: 'Habitaciones', type: 'number', categoria: 'Distribución', orden: 13 },
  { fieldKey: 'banos', label: 'Baños', type: 'number', categoria: 'Distribución', orden: 14 },
  { fieldKey: 'estacionamientos', label: 'Estacionamientos', type: 'number', categoria: 'Distribución', orden: 15 },
  { fieldKey: 'antiguedad', label: 'Antigüedad', type: 'number', unidad: 'años', categoria: 'Distribución', orden: 16 },

  { fieldKey: 'ascensor', label: 'Ascensor', type: 'boolean', categoria: 'Extras', orden: 17 },
  { fieldKey: 'estacionamiento', label: 'Plaza de garaje / parking', type: 'boolean', categoria: 'Extras', orden: 18 },
  { fieldKey: 'trastero', label: 'Trastero', type: 'boolean', categoria: 'Extras', orden: 19 },
  { fieldKey: 'terraza', label: 'Terraza', type: 'boolean', categoria: 'Extras', orden: 20 },
  { fieldKey: 'balcon', label: 'Balcón', type: 'boolean', categoria: 'Extras', orden: 21 },
  { fieldKey: 'alberca', label: 'Piscina', type: 'boolean', categoria: 'Extras', orden: 22 },
  { fieldKey: 'jardin', label: 'Jardín', type: 'boolean', categoria: 'Extras', orden: 23 },
  { fieldKey: 'calefaccion', label: 'Calefacción', type: 'boolean', categoria: 'Extras', orden: 24 },
  { fieldKey: 'aire_acondicionado', label: 'Aire acondicionado', type: 'boolean', categoria: 'Extras', orden: 25 },
  { fieldKey: 'amueblado', label: 'Amueblado', type: 'boolean', categoria: 'Extras', orden: 26 },
  { fieldKey: 'orientacion', label: 'Orientación', type: 'select', options: { values: ['Norte', 'Sur', 'Este', 'Oeste', 'Noreste', 'Noroeste', 'Sureste', 'Suroeste'] }, categoria: 'Extras', orden: 27 },

  { fieldKey: 'certificacion_energetica', label: 'Certificación energética', type: 'select', options: { values: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'En trámite'] }, categoria: 'Certificación Energética', orden: 28 },
  { fieldKey: 'consumo_energetico', label: 'Consumo energético', type: 'number', unidad: 'kWh/m²/año', categoria: 'Certificación Energética', orden: 29 },
  { fieldKey: 'emisiones_co2', label: 'Emisiones CO₂', type: 'number', unidad: 'kg CO₂/m²/año', categoria: 'Certificación Energética', orden: 30 },
  { fieldKey: 'organismo_certificador', label: 'Organismo certificador', type: 'text', categoria: 'Certificación Energética', orden: 31 },
  { fieldKey: 'fecha_certificado', label: 'Fecha del certificado', type: 'date', categoria: 'Certificación Energética', orden: 32 },
  { fieldKey: 'caducidad_certificado', label: 'Caducidad del certificado', type: 'date', categoria: 'Certificación Energética', orden: 33 },
  { fieldKey: 'documento_certificado', label: 'Documento del certificado', type: 'text', placeholder: 'URL del PDF', categoria: 'Certificación Energética', orden: 34 },

  { fieldKey: 'destacada', label: 'Propiedad destacada', type: 'boolean', categoria: 'Marketing', orden: 35 },
  { fieldKey: 'descripcion_larga', label: 'Descripción larga', type: 'textarea', categoria: 'Marketing', orden: 36 },
  { fieldKey: 'tags_seo', label: 'Tags SEO', type: 'text', placeholder: 'separados por comas', categoria: 'Marketing', orden: 37 },
  { fieldKey: 'amenidades', label: 'Amenidades', type: 'textarea', categoria: 'Marketing', orden: 38 },

  { fieldKey: 'propietario_nombre', label: 'Nombre del propietario', type: 'text', categoria: 'Propietario', orden: 39 },
  { fieldKey: 'propietario_telefono', label: 'Teléfono del propietario', type: 'text', categoria: 'Propietario', orden: 40 },
  { fieldKey: 'propietario_email', label: 'Email del propietario', type: 'text', categoria: 'Propietario', orden: 41 },
];

// ─── Inventario real de la agencia ───────────────────────────────────────────

const foto = (id: string) => `https://images.unsplash.com/photo-${id}?w=800`;

const FOTOS = {
  pisoCentro: [foto('1560448204-e02f11c3d0e2'), foto('1522708323590-d24dbb6b0267'), foto('1493809842364-78817add7ffb')],
  pisoLuminoso: [foto('1560185007-cde436f6a4d0'), foto('1580587771525-78b9dba3b914'), foto('1522708323590-d24dbb6b0267')],
  costa: [foto('1502672260266-1c1ef2d93688'), foto('1512918728675-ed5a9ecdebfd'), foto('1582719478250-c89cae4dc85b')],
  casa: [foto('1600585154340-be6161a56a0c'), foto('1600596542815-ffad4c1539a9'), foto('1560184897-ae75f418493e')],
  campo: [foto('1523217582562-09d0def993a6'), foto('1416331108676-a22ccb276e35'), foto('1600585152220-90363fe7e115')],
  terreno: [foto('1560185127-6ed189bf02f4'), foto('1600607687939-ce8a6c25118c'), foto('1600566753190-17f0baa2a6c3')],
};

type Extra =
  | 'ascensor'
  | 'estacionamiento'
  | 'trastero'
  | 'terraza'
  | 'balcon'
  | 'alberca'
  | 'jardin'
  | 'calefaccion'
  | 'aire_acondicionado'
  | 'amueblado';

interface PropiedadSeed {
  nombre: string;
  tipo: string;
  zona: string;
  ciudad: string;
  direccion: string;
  precio: number;
  superficie: number | null;
  habitaciones: number | null;
  banos: number | null;
  extras?: Extra[];
  destacada?: boolean;
  descripcion: string;
  descripcionLarga: string;
  tags: string;
  imagenes: string[];
}

const ZONA_MALAGA = 'Málaga';

const PROPIEDADES: PropiedadSeed[] = [
  {
    nombre: 'Piso de 3 habitaciones en La Unión — Cruz de Humilladero',
    tipo: 'Piso',
    zona: 'La Unión — Cruz de Humilladero — Los Tilos',
    ciudad: ZONA_MALAGA,
    direccion: 'La Unión — Cruz de Humilladero — Los Tilos',
    precio: 360000,
    superficie: 100,
    habitaciones: 3,
    banos: 1,
    extras: ['ascensor', 'calefaccion', 'aire_acondicionado'],
    destacada: true,
    descripcion: 'Piso de 100 m² con tres habitaciones en una de las zonas mejor conectadas de Málaga. Séptima planta con ascensor, calefacción y aire acondicionado.',
    descripcionLarga: 'Piso de 100 m² en séptima planta con ascensor, en el entorno de La Unión, Cruz de Humilladero y Los Tilos. Tres habitaciones y un baño, con calefacción y aire acondicionado instalados. Zona consolidada, con comercio, transporte público y acceso rápido al centro y a la ronda de Málaga. Precio rebajado por la agencia.',
    tags: 'piso,malaga,la_union,cruz_de_humilladero,venta,ascensor',
    imagenes: FOTOS.pisoCentro,
  },
  {
    nombre: 'Piso de 2 habitaciones junto al Parque Victoria Eugenia',
    tipo: 'Piso',
    zona: 'Parque Victoria Eugenia',
    ciudad: ZONA_MALAGA,
    direccion: 'Parque Victoria Eugenia',
    precio: 280000,
    superficie: 59,
    habitaciones: 2,
    banos: 1,
    extras: ['ascensor', 'estacionamiento', 'trastero'],
    destacada: true,
    descripcion: 'Piso de 59 m² con dos habitaciones frente al Parque Victoria Eugenia, con plaza de parking y trastero incluidos.',
    descripcionLarga: 'Piso de 59 m² en segunda planta con ascensor, junto al Parque Victoria Eugenia. Dos habitaciones y un baño, con plaza de parking y trastero incluidos en el precio. Una ubicación tranquila y verde, a poca distancia del centro de Málaga y de la estación María Zambrano.',
    tags: 'piso,malaga,victoria_eugenia,venta,parking,trastero',
    imagenes: FOTOS.pisoLuminoso,
  },
  {
    nombre: 'Piso de 2 habitaciones en Huelín',
    tipo: 'Piso',
    zona: 'Parque Ayala — Jardín de la Abadía — Huelín',
    ciudad: ZONA_MALAGA,
    direccion: 'Parque Ayala — Jardín de la Abadía — Huelín',
    precio: 329900,
    superficie: 75,
    habitaciones: 2,
    banos: 1,
    extras: ['ascensor', 'calefaccion', 'aire_acondicionado'],
    descripcion: 'Piso de 75 m² en Huelín, cuarta planta con ascensor, calefacción y aire acondicionado. Precio rebajado 20.000 €.',
    descripcionLarga: 'Piso de 75 m² en cuarta planta con ascensor, en la zona de Parque Ayala, Jardín de la Abadía y Huelín. Dos habitaciones y un baño, con calefacción y aire acondicionado. A un paso de la playa de la Misericordia y del paseo marítimo, con todos los servicios del barrio a mano. Precio rebajado en 20.000 €.',
    tags: 'piso,malaga,huelin,venta,playa,ascensor',
    imagenes: FOTOS.pisoCentro,
  },
  {
    nombre: 'Piso de 109 m² con terraza y piscina en El Cónsul',
    tipo: 'Piso',
    zona: 'El Cónsul — Ciudad Universitaria — El Romeral',
    ciudad: ZONA_MALAGA,
    direccion: 'El Cónsul — Ciudad Universitaria — El Romeral',
    precio: 469000,
    superficie: 109,
    habitaciones: 2,
    banos: 2,
    extras: ['ascensor', 'terraza', 'alberca', 'calefaccion'],
    destacada: true,
    descripcion: 'Piso de 109 m² con dos baños, terraza y piscina comunitaria en El Cónsul, junto a la Ciudad Universitaria. Precio rebajado 71.000 €.',
    descripcionLarga: 'Piso de 109 m² en sexta planta con ascensor, en El Cónsul, Ciudad Universitaria y El Romeral. Dos habitaciones y dos baños, terraza y piscina comunitaria, con calefacción instalada. Zona universitaria con servicios completos y buena conexión con el centro y el aeropuerto. Precio rebajado en 71.000 €.',
    tags: 'piso,malaga,el_consul,teatinos,venta,terraza,piscina',
    imagenes: FOTOS.pisoLuminoso,
  },
  {
    nombre: 'Piso reformado de 3 habitaciones en Torre del Mar',
    tipo: 'Piso',
    zona: 'Calle Infantes, Torre del Mar',
    ciudad: 'Torre del Mar',
    direccion: 'Calle Infantes, Torre del Mar',
    precio: 369000,
    superficie: 100,
    habitaciones: 3,
    banos: 2,
    extras: ['ascensor'],
    descripcion: 'Piso reformado de 100 m² en Torre del Mar, con tres habitaciones y dos baños, en segunda planta con ascensor.',
    descripcionLarga: 'Piso de 100 m² (3.690 €/m²) en segunda planta con ascensor, en la calle Infantes de Torre del Mar. Tres habitaciones y dos baños, completamente reformado. A pocos minutos de la playa y del paseo marítimo de Torre del Mar, en una zona con todos los servicios durante todo el año.',
    tags: 'piso,torre_del_mar,venta,reformado,costa',
    imagenes: FOTOS.costa,
  },
  {
    nombre: 'Estudio con terraza de 30 m² en el Centro de Málaga',
    tipo: 'Estudio',
    zona: 'Centro de Málaga',
    ciudad: ZONA_MALAGA,
    direccion: 'Centro de Málaga',
    precio: 240000,
    superficie: null,
    habitaciones: 1,
    banos: 1,
    extras: ['terraza', 'amueblado'],
    descripcion: 'Estudio con dormitorio amplio y terraza de 30 m² en pleno centro de Málaga, con cocina amueblada.',
    descripcionLarga: 'Estudio en el centro de Málaga con un dormitorio amplio, un baño y cocina amueblada. Dispone de una terraza de 30 m², poco habitual en la zona. A pocos minutos de la calle Larios, el mercado de Atarazanas y la Alcazaba, con toda la oferta cultural y de restauración del centro a pie.',
    tags: 'estudio,malaga,centro,venta,terraza',
    imagenes: FOTOS.pisoCentro,
  },
  {
    nombre: 'Estudio reformado junto al Parque de la Paloma',
    tipo: 'Estudio',
    zona: 'Parque de la Paloma',
    ciudad: 'Benalmádena',
    direccion: 'Parque de la Paloma, Benalmádena',
    precio: 180000,
    superficie: null,
    habitaciones: 1,
    banos: 1,
    extras: ['alberca', 'amueblado'],
    descripcion: 'Estudio reformado en Benalmádena, a 3 minutos de la playa y con vistas al mar, dentro de un recinto con piscinas.',
    descripcionLarga: 'Estudio reformado en el entorno del Parque de la Paloma, en Benalmádena. A tres minutos de la playa y con vistas al mar, dentro de un recinto con piscinas comunitarias. Una opción muy demandada tanto para uso propio como para alquiler de temporada en la Costa del Sol.',
    tags: 'estudio,benalmadena,venta,vistas_mar,piscina,playa',
    imagenes: FOTOS.costa,
  },
  {
    nombre: 'Estudio en Torremolinos a 10 minutos de la playa',
    tipo: 'Estudio',
    zona: 'Torremolinos',
    ciudad: 'Torremolinos',
    direccion: 'Torremolinos',
    precio: 136000,
    superficie: 36,
    habitaciones: 1,
    banos: 1,
    extras: [],
    descripcion: 'Estudio de 36 m² en Torremolinos (3.778 €/m²), a 10 minutos andando de la playa.',
    descripcionLarga: 'Estudio de 36 m² (3.778 €/m²) en Torremolinos, a diez minutos andando de la playa. Una entrada asequible a la Costa del Sol en una zona con servicios durante todo el año, bien conectada con Málaga y el aeropuerto por cercanías.',
    tags: 'estudio,torremolinos,venta,playa,costa_del_sol',
    imagenes: FOTOS.costa,
  },
  {
    nombre: 'Piso de 3 habitaciones en Pasaje San Manuel',
    tipo: 'Piso',
    zona: 'Pasaje San Manuel',
    ciudad: ZONA_MALAGA,
    direccion: 'Pasaje San Manuel, Málaga',
    precio: 0,
    superficie: null,
    habitaciones: 3,
    banos: 1,
    extras: [],
    descripcion: 'Piso de tres dormitorios con vistas parciales al mar en Pasaje San Manuel, con salón-comedor luminoso y cocina independiente.',
    descripcionLarga: 'Piso de tres dormitorios y un baño completo reformado en Pasaje San Manuel, Málaga. Salón-comedor luminoso, cocina independiente y vistas parciales al mar. Una distribución clásica y funcional en una zona residencial consolidada. Precio a consultar con la agencia.',
    tags: 'piso,malaga,pasaje_san_manuel,venta,vistas_mar',
    imagenes: FOTOS.pisoLuminoso,
  },
  {
    nombre: 'Piso de 3 habitaciones y 2 baños en Los Tilos',
    tipo: 'Piso',
    zona: 'La Unión — Cruz del Humilladero — Los Tilos',
    ciudad: ZONA_MALAGA,
    direccion: 'La Unión — Cruz del Humilladero — Los Tilos',
    precio: 0,
    superficie: null,
    habitaciones: 3,
    banos: 2,
    extras: [],
    descripcion: 'Piso de tres habitaciones y dos baños en La Unión, Cruz del Humilladero y Los Tilos.',
    descripcionLarga: 'Piso de tres habitaciones y dos baños en el entorno de La Unión, Cruz del Humilladero y Los Tilos. Una distribución pensada para familias, en una zona con colegios, comercio y transporte público. Precio a consultar con la agencia.',
    tags: 'piso,malaga,los_tilos,venta,familiar',
    imagenes: FOTOS.pisoCentro,
  },
  {
    nombre: 'Piso reformado con garaje y trastero en La Florida',
    tipo: 'Piso',
    zona: 'La Florida — Parque Norte',
    ciudad: ZONA_MALAGA,
    direccion: 'La Florida — Parque Norte',
    precio: 0,
    superficie: null,
    habitaciones: 3,
    banos: 1,
    extras: ['ascensor', 'estacionamiento', 'trastero'],
    descripcion: 'Piso reformado de tres dormitorios en quinta planta con ascensor, plaza de garaje y trastero incluidos.',
    descripcionLarga: 'Piso reformado de tres dormitorios y un baño en La Florida, Parque Norte. Quinta planta con ascensor, plaza de garaje y trastero incluidos. Zona residencial tranquila, con parques y servicios, bien comunicada con el centro de Málaga. Precio a consultar con la agencia.',
    tags: 'piso,malaga,la_florida,venta,reformado,garaje',
    imagenes: FOTOS.pisoLuminoso,
  },
  {
    nombre: 'Piso en Puerto Marina con licencia turística',
    tipo: 'Piso',
    zona: 'Puerto Marina',
    ciudad: 'Benalmádena',
    direccion: 'Puerto Marina, Benalmádena',
    precio: 0,
    superficie: 65,
    habitaciones: 1,
    banos: 1,
    extras: [],
    descripcion: 'Piso de 65 m² (4.923 €/m²) a pie de playa en Puerto Marina, con vistas al mar y licencia turística.',
    descripcionLarga: 'Piso de 65 m² (4.923 €/m²) junto a Puerto Marina, en Benalmádena. Una habitación y un baño, con vistas al mar y a pie de playa. Cuenta con licencia turística, lo que lo hace apto tanto para uso propio como para explotación vacacional. Precio a consultar con la agencia.',
    tags: 'piso,benalmadena,puerto_marina,venta,licencia_turistica,vistas_mar',
    imagenes: FOTOS.costa,
  },
  {
    nombre: 'Piso con terraza en Benalmádena Costa',
    tipo: 'Piso',
    zona: 'Avenida Antonio Machado, Benalmádena Costa',
    ciudad: 'Benalmádena',
    direccion: 'Avenida Antonio Machado, Benalmádena Costa',
    precio: 0,
    superficie: null,
    habitaciones: 2,
    banos: 1,
    extras: ['terraza', 'estacionamiento', 'alberca'],
    descripcion: 'Piso de dos dormitorios en Benalmádena Costa con terraza, plaza de parking y dos piscinas comunitarias.',
    descripcionLarga: 'Piso de dos dormitorios y un baño en la avenida Antonio Machado, en Benalmádena Costa. Terraza, plaza de parking y dos piscinas comunitarias. Primera línea de la costa de Benalmádena, con la playa, el paseo marítimo y el puerto deportivo a pocos metros. Precio a consultar con la agencia.',
    tags: 'piso,benalmadena_costa,venta,terraza,piscina,parking',
    imagenes: FOTOS.costa,
  },
  {
    nombre: 'Piso de 131 m² en Hacienda Torrequebrada',
    tipo: 'Piso',
    zona: 'Hacienda Torrequebrada',
    ciudad: 'Benalmádena',
    direccion: 'Hacienda Torrequebrada, Benalmádena',
    precio: 0,
    superficie: 131,
    habitaciones: 2,
    banos: 1,
    extras: ['alberca'],
    descripcion: 'Piso de 131 m² con dos cuartos en Hacienda Torrequebrada, a 950 metros de la playa.',
    descripcionLarga: 'Piso de 131 m² con dos cuartos y un baño en la urbanización Hacienda Torrequebrada, Benalmádena. A 950 metros de la playa, en un entorno residencial con zonas verdes y piscina comunitaria. Una superficie amplia poco habitual en la zona. Precio a consultar con la agencia.',
    tags: 'piso,benalmadena,torrequebrada,venta,playa',
    imagenes: FOTOS.pisoLuminoso,
  },
  {
    nombre: 'Casa reformada en Teatinos con posibilidad de ampliar',
    tipo: 'Casa',
    zona: 'El Cónsul — Ciudad Universitaria — El Romeral (Teatinos)',
    ciudad: ZONA_MALAGA,
    direccion: 'El Cónsul — Ciudad Universitaria — El Romeral (Teatinos)',
    precio: 0,
    superficie: 75,
    habitaciones: 2,
    banos: 1,
    extras: ['aire_acondicionado'],
    descripcion: 'Casa de 75 m² reformada íntegramente en Teatinos, con dos habitaciones y posibilidad de dos más.',
    descripcionLarga: 'Casa de 75 m² reformada íntegramente en El Cónsul, Ciudad Universitaria y El Romeral, en Teatinos. Dos habitaciones y un baño, con aire acondicionado. La distribución permite incorporar dos habitaciones adicionales. Zona universitaria con todos los servicios y buena conexión con el centro. Precio a consultar con la agencia.',
    tags: 'casa,malaga,teatinos,venta,reformado',
    imagenes: FOTOS.casa,
  },
  {
    nombre: 'Casa de campo reformada con vistas al mar en Moclinejo',
    tipo: 'Casa de campo',
    zona: 'Moclinejo',
    ciudad: 'Moclinejo',
    direccion: 'Moclinejo',
    precio: 0,
    superficie: 91,
    habitaciones: 3,
    banos: null,
    extras: ['terraza', 'jardin'],
    descripcion: 'Casa de campo reformada de 91 m² en Moclinejo, con tres dormitorios, terraza y vistas al mar.',
    descripcionLarga: 'Casa de campo reformada de 91 m² en Moclinejo, en la Axarquía malagueña. Tres dormitorios, terraza y vistas al mar. Un entorno de viñedos y montaña a menos de media hora de la costa y del centro de Málaga. Precio a consultar con la agencia.',
    tags: 'casa_de_campo,moclinejo,venta,vistas_mar,axarquia',
    imagenes: FOTOS.campo,
  },
  {
    nombre: 'Casa de campo con entorno natural cerca de Coín',
    tipo: 'Casa de campo',
    zona: 'Coín (cerca de Alozaina)',
    ciudad: 'Coín',
    direccion: 'Coín, cerca de Alozaina',
    precio: 279000,
    superficie: null,
    habitaciones: 2,
    banos: null,
    extras: ['jardin'],
    descripcion: 'Casa de campo de dos dormitorios a menos de 15 minutos de Coín y Alozaina, con vistas y entorno natural.',
    descripcionLarga: 'Casa de campo de dos dormitorios a menos de quince minutos de Coín y de Alozaina, en el Valle del Guadalhorce. Vistas despejadas y entorno natural, con acceso rodado. Una opción para quien busca tranquilidad sin alejarse de los servicios y de Málaga. Precio publicado por la agencia.',
    tags: 'casa_de_campo,coin,alozaina,venta,entorno_natural',
    imagenes: FOTOS.campo,
  },
  {
    nombre: 'Finca con 200 olivos en Alozaina',
    tipo: 'Casa de campo',
    zona: 'Alozaina',
    ciudad: 'Alozaina',
    direccion: 'Alozaina',
    precio: 0,
    superficie: 10000,
    habitaciones: null,
    banos: null,
    extras: ['jardin'],
    descripcion: 'Parcela vallada de 10.000 m² con 200 olivos de aceituna manzanilla aloreña en Alozaina.',
    descripcionLarga: 'Parcela vallada de 10.000 m² con 200 olivos de aceituna manzanilla aloreña en Alozaina, en el Valle del Guadalhorce. Una finca con aprovechamiento agrícola en producción, en un entorno de sierra a menos de una hora de Málaga. Precio a consultar con la agencia.',
    tags: 'finca,alozaina,venta,olivos,agricola',
    imagenes: FOTOS.campo,
  },
  {
    nombre: 'Casa de campo entre Álora y Pizarra',
    tipo: 'Casa de campo',
    zona: 'Entre Álora y Pizarra',
    ciudad: 'Álora',
    direccion: 'Entre Álora y Pizarra',
    precio: 0,
    superficie: null,
    habitaciones: 3,
    banos: null,
    extras: ['jardin'],
    descripcion: 'Casa de campo de tres habitaciones entre Álora y Pizarra, en un entorno tranquilo y bien conectado con Málaga.',
    descripcionLarga: 'Casa de campo de tres habitaciones situada entre Álora y Pizarra, en el Valle del Guadalhorce. Entorno tranquilo y buena conexión por carretera con Málaga y el aeropuerto. La agencia comercializa fincas en esta zona desde 2.900 € hasta 2.900.000 €, según superficie y estado. Precio a consultar.',
    tags: 'casa_de_campo,alora,pizarra,venta,valle_del_guadalhorce',
    imagenes: FOTOS.campo,
  },
  {
    nombre: 'Finca rústica a 5 minutos de Monda',
    tipo: 'Finca rústica',
    zona: 'Monda',
    ciudad: 'Monda',
    direccion: 'Monda',
    precio: 445000,
    superficie: 1800,
    habitaciones: null,
    banos: null,
    extras: [],
    destacada: true,
    descripcion: 'Finca rústica de 0,18 ha en Monda, a 5 minutos andando del pueblo y 15 en coche de Marbella.',
    descripcionLarga: 'Finca rústica de 0,18 hectáreas (1.800 m²) en Monda, a cinco minutos andando del pueblo y a quince minutos en coche de Marbella. Terreno con acceso y entorno de sierra, en una de las zonas con más demanda de la provincia por su cercanía a la Costa del Sol.',
    tags: 'finca_rustica,monda,venta,marbella,sierra',
    imagenes: FOTOS.terreno,
  },
  {
    nombre: 'Terreno vallado de 14.600 m² en Coín',
    tipo: 'Terreno',
    zona: 'Coín',
    ciudad: 'Coín',
    direccion: 'Coín',
    precio: 160000,
    superficie: 14600,
    habitaciones: null,
    banos: null,
    extras: [],
    descripcion: 'Terreno no urbanizable vallado de 14.600 m² en Coín, con agua y luz. Precio rebajado 25.000 €.',
    descripcionLarga: 'Terreno no urbanizable de 14.600 m² en Coín, vallado y con acometidas de agua y luz. Por su superficie y orientación admite usos agrícolas o de recreo. A pocos minutos del casco urbano de Coín y con buena conexión con Málaga y Marbella. Precio rebajado en 25.000 €.',
    tags: 'terreno,coin,venta,rustico,agua,luz',
    imagenes: FOTOS.terreno,
  },
  {
    nombre: 'Ático con terraza de 70 m² en Ciudad Jardín',
    tipo: 'Ático',
    zona: 'Barrio de Ciudad Jardín',
    ciudad: ZONA_MALAGA,
    direccion: 'Barrio de Ciudad Jardín, Málaga',
    precio: 0,
    superficie: null,
    habitaciones: 3,
    banos: 2,
    extras: ['ascensor', 'terraza', 'estacionamiento'],
    descripcion: 'Ático de tres habitaciones (una suite) y dos baños en Ciudad Jardín, con terraza de 70 m², garaje y ascensor.',
    descripcionLarga: 'Ático de tres habitaciones —una de ellas suite— y dos baños en el barrio de Ciudad Jardín, Málaga. Terraza de 70 m², plaza de garaje y ascensor. Una de las zonas residenciales más consolidadas de la ciudad, junto al río Guadalmedina y a pocos minutos del centro. Precio a consultar con la agencia.',
    tags: 'atico,malaga,ciudad_jardin,venta,terraza,garaje',
    imagenes: FOTOS.pisoLuminoso,
  },
];

// ─── Permisos de los roles de la demo ────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Id estable por inmueble: re-ejecutar el seed actualiza, no duplica. */
function idInmueble(nombre: string): string {
  const slug = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 70);
  return `inm-norando-${slug}`;
}

function valoresInmueble(p: PropiedadSeed): Record<string, unknown> {
  const valores: Record<string, unknown> = {
    tipo_operacion: 'venta',
    tipo_inmueble: p.tipo,
    estado: 'disponible',
    direccion: p.direccion,
    zona: p.zona,
    ciudad: p.ciudad,
    provincia: 'Málaga',
    destacada: Boolean(p.destacada),
    descripcion_larga: p.descripcionLarga,
    tags_seo: p.tags,
  };

  if (p.superficie !== null) valores.superficie_total = p.superficie;
  if (p.habitaciones !== null) valores.habitaciones = p.habitaciones;
  if (p.banos !== null) valores.banos = p.banos;

  for (const extra of p.extras || []) valores[extra] = true;

  return valores;
}

// ─── Seed principal ─────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Preparando la demo de Norando Homes...');

  const brandingConfig = {
    primaryColor: MARCA_NEGRA,
    logoUrl: LOGO_URL,
    companyName: TENANT_NOMBRE,
    showPoweredBy: true,
  };

  const datosTenant = {
    nombre: TENANT_NOMBRE,
    subdomain: TENANT_SLUG,
    plan: 'profesional',
    estado: 'activo',
    moneda: 'EUR',
    enabledModules: ['crm', 'real-estate', 'leads', 'calendario'],
    brandingConfig,
  };

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: datosTenant,
    create: { ...datosTenant, slug: TENANT_SLUG },
  });
  console.log(`✅ Cuenta: ${tenant.nombre} (${tenant.slug} · moneda ${tenant.moneda})`);

  // Marca blanca: sin el feature, la API de whitelabel rechaza el guardado.
  await prisma.tenantFeature.upsert({
    where: { tenantId_feature: { tenantId: tenant.id, feature: 'white_label' } },
    update: { habilitado: true },
    create: {
      tenantId: tenant.id,
      feature: 'white_label',
      habilitado: true,
      razon: 'Norando Homes — marca blanca habilitada para la demo',
      habilitadoPor: 'seed-demo-norando-homes',
    },
  });

  // Apagado del catálogo que no es de una inmobiliaria (ver MODULOS_APAGADOS).
  for (const modulo of MODULOS_APAGADOS) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_feature: { tenantId: tenant.id, feature: modulo } },
      update: {
        habilitado: false,
        razon: 'Fuera del alcance de la demo inmobiliaria',
        habilitadoPor: 'seed-demo-norando-homes',
      },
      create: {
        tenantId: tenant.id,
        feature: modulo,
        habilitado: false,
        razon: 'Fuera del alcance de la demo inmobiliaria',
        habilitadoPor: 'seed-demo-norando-homes',
      },
    });
  }
  console.log(`✅ ${MODULOS_APAGADOS.length} módulos ajenos al vertical apagados.`);

  // Identidad visual del panel: misma marca que el portal público.
  for (const [clave, valor] of [
    ['business_name', TENANT_NOMBRE],
    ['logo_corporativo', LOGO_URL],
  ] as const) {
    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId: tenant.id, clave } },
      update: { valor: JSON.stringify(valor) },
      create: { tenantId: tenant.id, clave, valor: JSON.stringify(valor) },
    });
  }
  console.log('✅ Marca: logotipo de Norando Homes y negro corporativo.');

  // Roles
  const roles: Record<string, string> = {};
  for (const [nombre, permisos] of [
    ['Admin', PERMISOS_ADMIN],
    ['Sales Agent', PERMISOS_AGENTE],
  ] as const) {
    const existente = await prisma.role.findFirst({ where: { tenantId: tenant.id, nombre } });
    const rol = existente
      ? await prisma.role.update({ where: { id: existente.id }, data: { permisos } })
      : await prisma.role.create({
          data: {
            tenantId: tenant.id,
            nombre,
            descripcion: `Rol ${nombre} de la cuenta de demostración`,
            permisos,
            esPersonalizado: false,
          },
        });
    roles[nombre] = rol.id;
  }
  console.log('✅ Roles Admin y Sales Agent.');

  // Usuarios de acceso (solo si hay contraseña en el entorno)
  if (!PASSWORD) {
    console.warn('⚠️  NORANDO_DEMO_PASSWORD no está definida: se omiten los usuarios del panel.');
  } else {
    const hashedPassword = await bcrypt.hash(PASSWORD, 12);
    for (const usuario of [
      {
        email: ADMIN_EMAIL,
        name: 'Equipo Norando Homes (Dirección)',
        roleId: roles.Admin,
        fullName: 'Equipo Norando Homes',
        jobTitle: 'Dirección',
      },
      {
        email: AGENTE_EMAIL,
        name: 'Asesoría Norando Homes (Agente)',
        roleId: roles['Sales Agent'],
        fullName: 'Asesoría Norando Homes',
        jobTitle: 'Agente inmobiliario',
      },
    ]) {
      const user = await prisma.user.upsert({
        where: { email: usuario.email },
        update: { name: usuario.name, tenantId: tenant.id, roleId: usuario.roleId, estado: 'activo' },
        create: {
          name: usuario.name,
          email: usuario.email,
          password: hashedPassword,
          tenantId: tenant.id,
          roleId: usuario.roleId,
          estado: 'activo',
        },
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
  for (const def of FIELD_DEFINITIONS) {
    const data = {
      label: def.label,
      type: def.type,
      options: def.options || null,
      required: def.required || false,
      orden: def.orden,
      categoria: def.categoria,
      placeholder: def.placeholder || null,
      unidad: def.unidad || null,
      valorDefecto: def.valorDefecto || null,
      activo: true,
    };
    await prisma.catalogoFieldDefinition.upsert({
      where: { tenantId_fieldKey: { tenantId: tenant.id, fieldKey: def.fieldKey } },
      update: data,
      create: { tenantId: tenant.id, fieldKey: def.fieldKey, ...data },
    });
  }
  console.log(`✅ ${FIELD_DEFINITIONS.length} campos del catálogo inmobiliario.`);

  // Inmuebles
  let creados = 0;
  let conPrecio = 0;
  for (const [indice, propiedad] of PROPIEDADES.entries()) {
    const customFieldValues = valoresInmueble(propiedad);
    const id = idInmueble(propiedad.nombre);
    const media = propiedad.imagenes.map((url, orden) => ({
      url,
      tipo: 'imagen',
      orden,
      alt: propiedad.nombre,
    }));
    const pricing = propiedad.precio > 0 ? { sale: { price: propiedad.precio } } : undefined;
    if (propiedad.precio > 0) conPrecio += 1;

    const base = {
      nombre: propiedad.nombre,
      descripcion: propiedad.descripcion,
      precioBase: propiedad.precio,
      moneda: 'EUR',
      activo: true,
      destacado: Boolean(propiedad.destacada),
      customFieldValues,
      media,
      categorias: ['inmueble', 'venta', propiedad.tipo.toLowerCase()],
      etiquetas: propiedad.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };

    await prisma.catalogoItem.upsert({
      where: { id },
      update: { ...base, ...(pricing ? { pricing } : {}) },
      create: {
        id,
        tenantId: tenant.id,
        sku: `NOR-${String(indice + 1).padStart(3, '0')}`,
        tipo: 'inmueble',
        ...base,
        ...(pricing ? { pricing } : {}),
      },
    });
    creados += 1;
  }
  console.log(`✅ ${creados} inmuebles reales (${conPrecio} con precio publicado, ${creados - conPrecio} a consultar).`);

  console.log(`\nPortal público: /p/${TENANT_SLUG}/propiedades`);
  console.log('Listo. Re-ejecutar este script no duplica nada.');
}

main()
  .catch((error) => {
    console.error('❌', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
