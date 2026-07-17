/**
 * Volkern Real Estate — Seed de Propiedades
 *
 * Crea catálogo de campos inmobiliarios y 18 propiedades de ejemplo
 * en distintas ciudades y tipologías.
 *
 * Uso: npx tsx scripts/seed-real-estate.ts
 *      npx tsx scripts/seed.ts (lo ejecuta automáticamente)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Field Definitions ──────────────────────────────────────────────────────
// Estas definiciones habilitan los campos personalizados en el UI de catálogo

const FIELD_DEFINITIONS = [
  // Información básica
  { fieldKey: 'tipo_operacion', label: 'Tipo de operación', type: 'select', categoria: 'Información General', options: { values: ['venta', 'alquiler', 'traspaso', 'alquiler_temporada'] }, placeholder: 'Selecciona tipo', required: true, orden: 1 },
  { fieldKey: 'tipo_inmueble', label: 'Tipo de inmueble', type: 'select', categoria: 'Información General', options: { values: ['Casa', 'Departamento', 'Ático', 'Local', 'Oficina', 'Terreno', 'Nave'] }, placeholder: 'Selecciona tipo', required: true, orden: 2 },
  { fieldKey: 'estado', label: 'Estado', type: 'select', categoria: 'Información General', options: { values: ['disponible', 'reservada', 'vendida', 'alquilada'] }, valorDefecto: 'disponible', orden: 3 },

  // Ubicación
  { fieldKey: 'direccion', label: 'Dirección', type: 'text', categoria: 'Ubicación', placeholder: 'Calle y número', orden: 4 },
  { fieldKey: 'zona', label: 'Zona / Ciudad', type: 'text', categoria: 'Ubicación', placeholder: 'Ej: Madrid Centro', orden: 5 },
  { fieldKey: 'latitud', label: 'Latitud', type: 'number', categoria: 'Ubicación', orden: 6 },
  { fieldKey: 'longitud', label: 'Longitud', type: 'number', categoria: 'Ubicación', orden: 7 },

  // Superficies
  { fieldKey: 'superficie_total', label: 'Superficie total (m²)', type: 'number', categoria: 'Superficies', unidad: 'm²', orden: 8 },
  { fieldKey: 'superficie_construida', label: 'Superficie construida (m²)', type: 'number', categoria: 'Superficies', unidad: 'm²', orden: 9 },

  // Distribución
  { fieldKey: 'habitaciones', label: 'Habitaciones', type: 'number', categoria: 'Distribución', orden: 10 },
  { fieldKey: 'banos', label: 'Baños', type: 'number', categoria: 'Distribución', orden: 11 },
  { fieldKey: 'estacionamientos', label: 'Estacionamientos', type: 'number', categoria: 'Distribución', orden: 12 },
  { fieldKey: 'antiguedad', label: 'Año de construcción', type: 'number', categoria: 'Distribución', placeholder: 'Ej: 2018', orden: 13 },
  { fieldKey: 'orientacion', label: 'Orientación', type: 'select', categoria: 'Distribución', options: { values: ['norte', 'sur', 'este', 'oeste', 'noreste', 'noroeste', 'sureste', 'suroeste'] }, orden: 14 },

  // Extras (booleanos)
  { fieldKey: 'ascensor', label: 'Ascensor', type: 'boolean', categoria: 'Extras', orden: 15 },
  { fieldKey: 'estacionamiento', label: 'Estacionamiento', type: 'boolean', categoria: 'Extras', orden: 16 },
  { fieldKey: 'alberca', label: 'Alberca / Piscina', type: 'boolean', categoria: 'Extras', orden: 17 },
  { fieldKey: 'jardin', label: 'Jardín', type: 'boolean', categoria: 'Extras', orden: 18 },
  { fieldKey: 'trastero', label: 'Trastero', type: 'boolean', categoria: 'Extras', orden: 19 },
  { fieldKey: 'amueblado', label: 'Amueblado', type: 'boolean', categoria: 'Extras', orden: 20 },
  { fieldKey: 'certificacion_energetica', label: 'Certificación energética', type: 'select', categoria: 'Extras', options: { values: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }, orden: 21 },

  // SEO / Marketing
  { fieldKey: 'destacada', label: 'Propiedad destacada', type: 'boolean', categoria: 'Marketing', orden: 22 },
  { fieldKey: 'descripcion_larga', label: 'Descripción larga', type: 'textarea', categoria: 'Marketing', orden: 23 },
  { fieldKey: 'tags_seo', label: 'Tags SEO', type: 'text', categoria: 'Marketing', placeholder: 'separados por comas', orden: 24 },
];

// ─── Properties Data ────────────────────────────────────────────────────────

interface PropertySeed {
  nombre: string;
  descripcion: string;
  precioBase: number;
  moneda: string;
  customFieldValues: Record<string, any>;
}

const PROPERTIES: PropertySeed[] = [
  // ── Madrid (5) ────────────────────────────────────────────────────────
  {
    nombre: 'Ático de lujo en el centro de Madrid',
    descripcion: 'Espectacular ático con terraza de 60m² y vistas panorámicas a la Gran Vía. Totalmente reformado con materiales nobles.',
    precioBase: 895000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Ático',
      estado: 'disponible',
      direccion: 'Gran Vía 42',
      zona: 'Madrid Centro',
      latitud: '40.4203',
      longitud: '-3.7058',
      superficie_total: '160',
      superficie_construida: '180',
      habitaciones: '4',
      banos: '3',
      estacionamientos: '2',
      antiguedad: '2020',
      orientacion: 'sur',
      ascensor: true,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: true,
      amueblado: true,
      certificacion_energetica: 'A',
      destacada: true,
      descripcion_larga: 'Ático de lujo en el corazón de Madrid. Disfruta de una terraza privada de 60m² con vistas 360° a la ciudad. Reforma integral en 2020 con diseño de interiorista. Cocina equipada con electrodomésticos Siemens, suelos de parquet, climatización por aerotermia y domótica completa. Incluye 2 plazas de garaje y trastero.',
      tags_seo: 'atico,lujo,terraza,vistas,centro,madrid,gran_via',
    },
  },
  {
    nombre: 'Casa unifamiliar en La Moraleja',
    descripcion: 'Impresionante villa con jardín privado y piscina en una de las mejores zonas residenciales de Madrid.',
    precioBase: 1650000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Casa',
      estado: 'disponible',
      direccion: 'Av. de la Moraleja 120',
      zona: 'La Moraleja, Alcobendas',
      latitud: '40.5189',
      longitud: '-3.6345',
      superficie_total: '500',
      superficie_construida: '380',
      habitaciones: '6',
      banos: '5',
      estacionamientos: '3',
      antiguedad: '2015',
      orientacion: 'sureste',
      ascensor: true,
      estacionamiento: true,
      alberca: true,
      jardin: true,
      trastero: true,
      amueblado: false,
      certificacion_energetica: 'B',
      destacada: true,
      descripcion_larga: 'Espectacular vivienda unifamiliar en La Moraleja, una de las urbanizaciones más exclusivas de Madrid. La propiedad cuenta con 500m² de parcela, amplios espacios interiores con techos altos, chimenea, cocina de diseño, 6 dormitorios con baño en suite y un espectacular jardín con piscina climatizada.',
      tags_seo: 'casa,villa,lujo,jardin,piscina,moraleja,madrid',
    },
  },
  {
    nombre: 'Piso céntrico en Chamberí',
    descripcion: 'Amplio piso reformado en el barrio de Chamberí, cerca de todos los servicios.',
    precioBase: 420000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Departamento',
      estado: 'disponible',
      direccion: 'Calle de Santa Engracia 85',
      zona: 'Chamberí, Madrid',
      latitud: '40.4385',
      longitud: '-3.7032',
      superficie_total: '110',
      superficie_construida: '120',
      habitaciones: '3',
      banos: '2',
      estacionamientos: '1',
      antiguedad: '1970',
      orientacion: 'este',
      ascensor: true,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: true,
      certificacion_energetica: 'C',
      destacada: false,
      descripcion_larga: 'Piso exterior en el exclusivo barrio de Chamberí. Reformado en 2023 con calidad de acabados. Consta de 3 amplios dormitorios, salón comedor de 35m², cocina independiente equipada y 2 baños completos. Ventanas de doble acristalamiento y calefacción por gas natural.',
      tags_seo: 'piso,chamberi,reformado,centro,madrid',
    },
  },
  {
    nombre: 'Local comercial en Sol',
    descripcion: 'Local comercial en la zona más transitada de Madrid, ideal para retail o hostelería.',
    precioBase: 680000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Local',
      estado: 'disponible',
      direccion: 'Calle del Arenal 12',
      zona: 'Sol, Madrid',
      latitud: '40.4185',
      longitud: '-3.7067',
      superficie_total: '90',
      superficie_construida: '85',
      banos: '1',
      antiguedad: '2005',
      orientacion: 'oeste',
      ascensor: false,
      estacionamiento: false,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: false,
      certificacion_energetica: 'D',
      destacada: false,
      descripcion_larga: 'Excelente local comercial en pleno centro de Madrid, a escasos metros de la Puerta del Sol. Con 90m² en planta baja, escaparate de 8 metros lineales y alta afluencia de público. Ideal para negocio de retail, hostelería o servicios. Licencia de actividad incluida.',
      tags_seo: 'local,comercial,sol,centro,escaparate,madrid',
    },
  },
  {
    nombre: 'Piso en alquiler — Malasaña',
    descripcion: 'Piso moderno en alquiler en el vibrante barrio de Malasaña. Amueblado y listo para entrar.',
    precioBase: 950,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'alquiler',
      tipo_inmueble: 'Departamento',
      estado: 'disponible',
      direccion: 'Calle de la Palma 48',
      zona: 'Malasaña, Madrid',
      latitud: '40.4268',
      longitud: '-3.7060',
      superficie_total: '65',
      superficie_construida: '68',
      habitaciones: '2',
      banos: '1',
      antiguedad: '2000',
      orientacion: 'norte',
      ascensor: false,
      estacionamiento: false,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: true,
      certificacion_energetica: 'E',
      destacada: false,
      descripcion_larga: 'Piso en alquiler mensual en el corazón de Malasaña. Totalmente amueblado y equipado. Cuenta con 2 dormitorios, salón con cocina americana, baño completo y balcón. Zona con gran oferta cultural, gastronómica y de ocio. Conexión excelente de metro y bus.',
      tags_seo: 'alquiler,piso,malasaña,amueblado,madrid',
    },
  },

  // ── Barcelona (4) ─────────────────────────────────────────────────────
  {
    nombre: 'Piso con vistas al mar — Barceloneta',
    descripcion: 'Impresionante piso frente al mar con vistas al Mediterráneo y al puerto deportivo.',
    precioBase: 750000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Departamento',
      estado: 'disponible',
      direccion: 'Passeig de Joan de Borbó 25',
      zona: 'Barceloneta, Barcelona',
      latitud: '41.3795',
      longitud: '2.1893',
      superficie_total: '95',
      superficie_construida: '100',
      habitaciones: '3',
      banos: '2',
      estacionamientos: '1',
      antiguedad: '2008',
      orientacion: 'sur',
      ascensor: true,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: true,
      amueblado: false,
      certificacion_energetica: 'B',
      destacada: true,
      descripcion_larga: 'Piso de lujo en primera línea de la Barceloneta. Vistas panorámicas al mar desde el salón y el dormitorio principal. Acabados de alta calidad, cocina Ofecct, suelos de parquet natural, aire acondicionado centralizado. Incluye plaza de garaje y trastero.',
      tags_seo: 'piso,vistas_mar,barceloneta,barcelona,lujo',
    },
  },
  {
    nombre: 'Ático en el Eixample',
    descripcion: 'Ático dúplex con terraza privada en el corazón del Eixample derecha.',
    precioBase: 1280000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Ático',
      estado: 'disponible',
      direccion: 'Carrer de Pau Claris 145',
      zona: 'Eixample, Barcelona',
      latitud: '41.3926',
      longitud: '2.1634',
      superficie_total: '150',
      superficie_construida: '165',
      habitaciones: '4',
      banos: '3',
      estacionamientos: '2',
      antiguedad: '2019',
      orientacion: 'sureste',
      ascensor: true,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: true,
      amueblado: false,
      certificacion_energetica: 'A',
      destacada: true,
      descripcion_larga: 'Espectacular ático dúplex en el Eixample. Planta baja con salón de 50m², cocina abierta, 2 dormitorios y 2 baños. Planta superior con 2 dormitorios más, baño y terraza de 40m² con vistas a la ciudad. Parking para 2 coches. Calidad de construcción premium.',
      tags_seo: 'atico,duplex,eixample,barcelona,terraza,lujo',
    },
  },
  {
    nombre: 'Casa adosada en Sant Cugat',
    descripcion: 'Bonita casa adosada en urbanización con piscina comunitaria en Sant Cugat del Vallès.',
    precioBase: 520000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Casa',
      estado: 'disponible',
      direccion: 'Av. de la Generalitat 34',
      zona: 'Sant Cugat del Vallès',
      latitud: '41.4687',
      longitud: '2.0835',
      superficie_total: '280',
      superficie_construida: '180',
      habitaciones: '4',
      banos: '3',
      estacionamientos: '2',
      antiguedad: '2017',
      orientacion: 'sur',
      ascensor: false,
      estacionamiento: true,
      alberca: false,
      jardin: true,
      trastero: true,
      amueblado: false,
      certificacion_energetica: 'B',
      destacada: false,
      descripcion_larga: 'Casa adosada de 4 dormitorios en Sant Cugat, a 15 minutos de Barcelona. Jardín privado de 100m², parking para 2 coches, trastero amplio. Urbanización con piscina, zonas verdes y campo de pádel. Cerca de colegios, comercios y estación de FGC.',
      tags_seo: 'casa,adosada,jardin,piscina,sant_cugat,barcelona',
    },
  },
  {
    nombre: 'Oficina en el 22@ — alquiler',
    descripcion: 'Oficina diáfana en el distrito tecnológico 22@ de Barcelona, ideal para startups o empresas tecnológicas.',
    precioBase: 2200,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'alquiler',
      tipo_inmueble: 'Oficina',
      estado: 'disponible',
      direccion: 'Carrer de Roc Boronat 117',
      zona: '22@, Barcelona',
      latitud: '41.4028',
      longitud: '2.1917',
      superficie_total: '120',
      superficie_construida: '115',
      habitaciones: '0',
      banos: '2',
      estacionamientos: '0',
      antiguedad: '2022',
      orientacion: 'este',
      ascensor: true,
      estacionamiento: false,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: true,
      certificacion_energetica: 'A',
      destacada: false,
      descripcion_larga: 'Oficina en el distrito 22@, el hub tecnológico de Barcelona. Espacio diáfano de 120m² con luz natural, suelo técnico, falsos techos con iluminación LED. Incluye kitchenette, 2 baños y sala de reuniones. Edificio sostenible con certificación LEED.',
      tags_seo: 'oficina,alquiler,22@,tecnologia,barcelona',
    },
  },

  // ── Valencia (3) ───────────────────────────────────────────────────────
  {
    nombre: 'Piso moderno en el centro de Valencia',
    descripcion: 'Piso completamente reformado en el centro histórico a pocos pasos de la Plaza del Ayuntamiento.',
    precioBase: 285000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Departamento',
      estado: 'disponible',
      direccion: 'Calle de la Paz 12',
      zona: 'Centro, Valencia',
      latitud: '39.4703',
      longitud: '-0.3768',
      superficie_total: '85',
      superficie_construida: '90',
      habitaciones: '3',
      banos: '2',
      estacionamientos: '1',
      antiguedad: '2021',
      orientacion: 'sur',
      ascensor: true,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: true,
      certificacion_energetica: 'A',
      destacada: false,
      descripcion_larga: 'Piso de obra nueva en el centro de Valencia. Reforma integral con materiales de alta calidad. Cocina equipada con electrodomésticos Balay, suelos porcelánicos, armarios empotrados, climatización por aerotermia. Incluye plaza de garaje en el mismo edificio.',
      tags_seo: 'piso,nueva,reforma,centro,valencia',
    },
  },
  {
    nombre: 'Ático en la Malvarrosa',
    descripcion: 'Ático con vistas al mar en primera línea de la playa de la Malvarrosa.',
    precioBase: 350000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Ático',
      estado: 'disponible',
      direccion: 'Passeig Marítim de Neptú 58',
      zona: 'Malvarrosa, Valencia',
      latitud: '39.4758',
      longitud: '-0.3261',
      superficie_total: '100',
      superficie_construida: '95',
      habitaciones: '3',
      banos: '2',
      estacionamientos: '1',
      antiguedad: '2010',
      orientacion: 'este',
      ascensor: true,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: false,
      certificacion_energetica: 'C',
      destacada: true,
      descripcion_larga: 'Ático con vistas al Mediterráneo en primera línea de la playa de la Malvarrosa. Amplia terraza de 30m² orientada al este para disfrutar del amanecer. 3 dormitorios con armarios empotrados, cocina independiente, climatización por conductos. Urbanización con piscina comunitaria.',
      tags_seo: 'atico,playa,malvarrosa,vistas_mar,valencia',
    },
  },
  {
    nombre: 'Local en alquiler — Ruzafa',
    descripcion: 'Local comercial en el barrio de moda de Valencia. Perfecto para hostelería o tienda de diseño.',
    precioBase: 850,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'alquiler',
      tipo_inmueble: 'Local',
      estado: 'disponible',
      direccion: 'Calle de Cuba 28',
      zona: 'Ruzafa, Valencia',
      latitud: '39.4632',
      longitud: '-0.3705',
      superficie_total: '60',
      superficie_construida: '58',
      banos: '1',
      antiguedad: '1960',
      orientacion: 'oeste',
      ascensor: false,
      estacionamiento: false,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: false,
      certificacion_energetica: 'F',
      destacada: false,
      descripcion_larga: 'Local comercial en la calle más emblemática del barrio de Ruzafa. 60m² en planta baja con escaparate de 6 metros. Licencia de actividad comercial. Alta afluencia peatonal. Ideal para negocio de moda, decoración, gastronomía o galería de arte.',
      tags_seo: 'local,alquiler,ruzafa,comercial,valencia',
    },
  },

  // ── Sevilla (2) ────────────────────────────────────────────────────────
  {
    nombre: 'Piso con encanto en Santa Cruz',
    descripcion: 'Piso típico sevillano rehabilitado en el barrio de Santa Cruz, con patio andaluz.',
    precioBase: 195000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Departamento',
      estado: 'disponible',
      direccion: 'Calle Mateos Gago 18',
      zona: 'Santa Cruz, Sevilla',
      latitud: '37.3889',
      longitud: '-5.9909',
      superficie_total: '75',
      superficie_construida: '80',
      habitaciones: '2',
      banos: '2',
      estacionamientos: '0',
      antiguedad: '2019',
      orientacion: 'norte',
      ascensor: false,
      estacionamiento: false,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: false,
      certificacion_energetica: 'C',
      destacada: false,
      descripcion_larga: 'Rehabilitación integral de un piso histórico en el barrio de Santa Cruz. 2 dormitorios, 2 baños, salón con cocina americana y precioso patio andaluz con naranjo. Techos con vigas de madera originales. Aire acondicionado, suelos de barro cocido. A dos minutos de la Catedral.',
      tags_seo: 'piso,rehabilitado,santa_cruz,patio,sevilla,encanto',
    },
  },
  {
    nombre: 'Casa en Triana',
    descripcion: 'Casa señorial rehabilitada en el barrio de Triana, junto al río Guadalquivir.',
    precioBase: 450000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Casa',
      estado: 'disponible',
      direccion: 'Calle Betis 45',
      zona: 'Triana, Sevilla',
      latitud: '37.3845',
      longitud: '-5.9985',
      superficie_total: '200',
      superficie_construida: '180',
      habitaciones: '4',
      banos: '3',
      estacionamientos: '1',
      antiguedad: '2022',
      orientacion: 'este',
      ascensor: false,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: true,
      amueblado: false,
      certificacion_energetica: 'B',
      destacada: true,
      descripcion_larga: 'Casa señorial rehabilitada en la calle Betis de Triana, con vistas al río. 4 dormitorios con armarios empotrados, 3 baños completos, salón de 40m², cocina de diseño con office. Azotea privada de 30m². Plaza de garaje opcional. Aires acondicionados y calefacción por conductos.',
      tags_seo: 'casa,triana,rio,rehabilitada,sevilla',
    },
  },

  // ── Bilbao (2) ─────────────────────────────────────────────────────────
  {
    nombre: 'Piso con vistas al Guggenheim',
    descripcion: 'Piso de lujo con vistas al Museo Guggenheim y la ría de Bilbao.',
    precioBase: 550000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Departamento',
      estado: 'disponible',
      direccion: 'Abandoibarra Etorbidea 2',
      zona: 'Abandoibarra, Bilbao',
      latitud: '43.2685',
      longitud: '-2.9378',
      superficie_total: '105',
      superficie_construida: '110',
      habitaciones: '3',
      banos: '2',
      estacionamientos: '1',
      antiguedad: '2023',
      orientacion: 'sur',
      ascensor: true,
      estacionamiento: true,
      alberca: false,
      jardin: false,
      trastero: true,
      amueblado: true,
      certificacion_energetica: 'A',
      destacada: true,
      descripcion_larga: 'Piso de obra nueva en el corazón de Abandoibarra. Vistas espectaculares al Museo Guggenheim y a la ría. Calidad de construcción premium: suelo radiante, cocina equipada con electrodomésticos Miele, domótica, ventanas de triple acristalamiento. Incluye plaza de garaje y trastero amplio.',
      tags_seo: 'piso,guggenheim,abandoibarra,lujo,bilbao,ria',
    },
  },
  {
    nombre: 'Casa rural en Getxo',
    descripcion: 'Encantadora casa rural reformada en Getxo, a 10 minutos de Bilbao.',
    precioBase: 380000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Casa',
      estado: 'disponible',
      direccion: 'Barrio de la Galea 15',
      zona: 'Getxo, Bizkaia',
      latitud: '43.3425',
      longitud: '-3.0075',
      superficie_total: '350',
      superficie_construida: '220',
      habitaciones: '5',
      banos: '3',
      estacionamientos: '2',
      antiguedad: '2021',
      orientacion: 'sur',
      ascensor: false,
      estacionamiento: true,
      alberca: false,
      jardin: true,
      trastero: true,
      amueblado: false,
      certificacion_energetica: 'B',
      destacada: false,
      descripcion_larga: 'Casa rural reformada manteniendo la esencia tradicional vasca. 5 habitaciones, 3 baños, salón con chimenea, amplia cocina-rural. Jardín privado de 250m² con barbacoa y zona de juegos. Parking para 2 coches. A 5 minutos de la playa de Ereaga y 10 minutos del centro de Bilbao.',
      tags_seo: 'casa,rural,getxo,jardin,bilbao,pais_vasco',
    },
  },

  // ── Alicante (2) ───────────────────────────────────────────────────────
  {
    nombre: 'Apartamento en la playa de San Juan',
    descripcion: 'Apartamento vacacional en primera línea de la playa de San Juan. Ideal para inversión.',
    precioBase: 180000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Departamento',
      estado: 'disponible',
      direccion: 'Av. de la Costa Blanca 75',
      zona: 'Playa de San Juan, Alicante',
      latitud: '38.3527',
      longitud: '-0.4102',
      superficie_total: '60',
      superficie_construida: '65',
      habitaciones: '2',
      banos: '1',
      estacionamientos: '1',
      antiguedad: '2018',
      orientacion: 'este',
      ascensor: true,
      estacionamiento: true,
      alberca: true,
      jardin: false,
      trastero: false,
      amueblado: true,
      certificacion_energetica: 'B',
      destacada: false,
      descripcion_larga: 'Apartamento de 2 dormitorios en primera línea de la playa de San Juan. Urbanización con piscina comunitaria, jardines y parking. Vistas frontales al mar. Ideal como vivienda vacacional o inversión con alta rentabilidad. Zona con todos los servicios: restauración, supermercados y transporte público.',
      tags_seo: 'apartamento,playa,san_juan,alicante,inversion,costa_blanca',
    },
  },
  {
    nombre: 'Terreno urbanizable en Alicante',
    descripcion: 'Parcela de terreno urbanizable con vistas al mar en zona de alta plusvalía.',
    precioBase: 120000,
    moneda: 'EUR',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Terreno',
      estado: 'disponible',
      direccion: 'Partida de Villafranqueza 200',
      zona: 'Alicante',
      latitud: '38.3775',
      longitud: '-0.4992',
      superficie_total: '800',
      banos: '0',
      antiguedad: null,
      orientacion: null,
      ascensor: false,
      estacionamiento: false,
      alberca: false,
      jardin: false,
      trastero: false,
      amueblado: false,
      certificacion_energetica: null,
      destacada: false,
      descripcion_larga: 'Parcela de 800m² de suelo urbanizable residencial con vistas al mar. Situada en zona de expansión de Alicante, cerca de la playa de San Juan y el centro comercial. Excelente potencial de revalorización. Pendiente de aprobación del plan parcial. Fácil acceso a la AP-7.',
      tags_seo: 'terreno,urbanizable,alicante,vistas,inversion',
    },
  },
];

// ─── Seed Function ───────────────────────────────────────────────────────────

export async function seedRealEstate(tenantId: string) {
  console.log('🏠 Sembrando módulo inmobiliario...');

  // ── Field definitions ─────────────────────────────────────────────────
  console.log(`  📋 Creando ${FIELD_DEFINITIONS.length} definiciones de campos...`);
  let fieldsCreated = 0;

  for (const def of FIELD_DEFINITIONS) {
    await prisma.catalogoFieldDefinition.upsert({
      where: {
        tenantId_fieldKey: {
          tenantId,
          fieldKey: def.fieldKey,
        },
      },
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
        tenantId,
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
    fieldsCreated++;
  }
  console.log(`  ✅ ${fieldsCreated} definiciones de campos creadas`);

  // ── Properties ────────────────────────────────────────────────────────
  console.log(`  🏘️  Creando ${PROPERTIES.length} propiedades...`);
  let propertiesCreated = 0;

  for (const prop of PROPERTIES) {
    // Generar URL única basada en el nombre
    const slug = prop.nombre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80);
    const propertyId = `inm-${tenantId}-${slug}`;

    // Imágenes de ejemplo según la ciudad
    const cityImages: Record<string, string[]> = {
      Madrid: [
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
      ],
      Barcelona: [
        'https://images.unsplash.com/photo-1600566753086-00f18f6f4f2c?w=800',
        'https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=800',
        'https://images.unsplash.com/photo-1600607687644-c94bfe2f0c9c?w=800',
      ],
    };

    const isMadrid = prop.nombre.includes('Madrid') || prop.customFieldValues.zona?.includes('Madrid');
    const isBarcelona = prop.nombre.includes('Barcelona') || prop.customFieldValues.zona?.includes('Barcelona');
    const images = isMadrid
      ? cityImages.Madrid
      : isBarcelona
        ? cityImages.Barcelona
        : [
            'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=800',
            'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
          ];

    const isAlquiler = prop.customFieldValues.tipo_operacion === 'alquiler';
    const precioMes = isAlquiler
      ? { tipo: 'mensual', valor: prop.precioBase }
      : undefined;

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
        media: images.map((url, i) => ({
          url,
          tipo: 'imagen',
          orden: i,
          alt: prop.nombre,
        })),
        pricing: isAlquiler
          ? { rent: { monthly: precioMes } }
          : { sale: { price: prop.precioBase } },
        categorias: ['inmueble', prop.customFieldValues.tipo_operacion, prop.customFieldValues.tipo_inmueble?.toLowerCase() || ''],
        etiquetas: (prop.customFieldValues.tags_seo || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      },
      create: {
        id: propertyId,
        tenantId,
        nombre: prop.nombre,
        descripcion: prop.descripcion,
        sku: `INM-${String(propertiesCreated + 1).padStart(3, '0')}`,
        tipo: 'inmueble',
        precioBase: prop.precioBase,
        moneda: prop.moneda,
        activo: true,
        destacado: prop.customFieldValues.destacada === true,
        customFieldValues: prop.customFieldValues,
        media: images.map((url, i) => ({
          url,
          tipo: 'imagen',
          orden: i,
          alt: prop.nombre,
        })),
        pricing: isAlquiler
          ? { rent: { monthly: precioMes } }
          : { sale: { price: prop.precioBase } },
        categorias: ['inmueble', prop.customFieldValues.tipo_operacion, prop.customFieldValues.tipo_inmueble?.toLowerCase() || ''],
        etiquetas: (prop.customFieldValues.tags_seo || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      },
    });
    propertiesCreated++;
  }

  console.log(`  ✅ ${propertiesCreated} propiedades creadas`);

  // ── Stats ─────────────────────────────────────────────────────────────
  const total = await prisma.catalogoItem.count({
    where: { tenantId, tipo: 'inmueble' },
  });
  const disponibles = await prisma.catalogoItem.count({
    where: {
      tenantId,
      tipo: 'inmueble',
      activo: true,
      customFieldValues: { path: ['estado'], equals: 'disponible' },
    },
  }).catch(() => 0); // PATCH: jsonb path puede no funcionar en todos los casos

  console.log(`  📊 Total propiedades en tenant: ${total}`);
  console.log('  ✅ Módulo inmobiliario sembrado exitosamente');
  console.log('');

  return { fields: fieldsCreated, properties: propertiesCreated };
}

// ─── Standalone execution ─────────────────────────────────────────────────────

async function main() {
  console.log('🏠 Seed de Módulo Inmobiliario');
  console.log('');

  const defaultTenant = await prisma.tenant.findFirst({
    where: { slug: 'volkern-default' },
  });

  if (!defaultTenant) {
    console.error('❌ Tenant predeterminado no encontrado. Ejecuta primero: yarn tsx scripts/migrate-multi-tenancy.ts');
    process.exit(1);
  }

  await seedRealEstate(defaultTenant.id);

  await prisma.$disconnect();
  console.log('✨ Seed completado exitosamente');
}

if (require.main === module || process.argv[1]?.includes('seed-real-estate')) {
  main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
}
