/**
 * Volkern Real Estate — MLS Internacional JSON Exporter
 *
 * Genera feeds JSON compatibles con MLS Internacional y portales inmobiliarios
 * que aceptan formato JSON (XML alternativo).
 *
 * Soporta:
 * - Feed completo: listado de propiedades con metadatos
 * - Imágenes con orden y titular
 * - Campos extendidos (certificación energética, orientación, etc.)
 * - Propietario / vendedor
 * - URLs a fichas detalladas
 *
 * @see https://www.mlsinternacional.com/
 */

import type { InmuebleParsed } from '../property-helpers';
import { estadoCertificadoEnergetico, letraEnergeticaParaFeed } from '../energia';
import { monedaEfectiva } from '@/lib/moneda';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MLSFeedOptions {
  tenantName: string;
  tenantEmail: string;
  tenantPhone?: string;
  tenantWeb?: string;
  portalUrl?: string;        // URL base del portal público (para enlaces a fichas)
  generatedAt?: Date;
  feedVersion?: string;
}

export interface MLSImage {
  url: string;
  order: number;
  main: boolean;
  caption?: string;
}

export interface MLSProperty {
  // Identificación
  reference: string;
  externalId?: string;

  // Título y descripción
  title: string;
  description: string;
  longDescription?: string;

  // Operación
  operation: 'venta' | 'alquiler' | 'traspaso' | 'alquiler_con_opcion_a_compra';
  status: 'disponible' | 'reservada' | 'vendida' | 'alquilada' | 'obra_nueva';

  // Precios
  price: number;
  currency: string;
  pricePerM2?: number;
  rentalPriceMonth?: number;
  communityFees?: number;
  propertyTax?: number;

  // Tipo
  propertyType: string;
  subtype?: string;

  // Superficies
  areaM2?: number;
  builtM2?: number;
  usableM2?: number;
  plotM2?: number;

  // Habitaciones
  bedrooms?: number;
  bathrooms?: number;
  toilets?: number;
  parkingSpots?: number;

  // Características
  features: string[];
  condition?: 'new' | 'excellent' | 'good' | 'renovated' | 'needs_renovation';
  orientation?: string;
  floor?: string;
  furnished: boolean;
  hasElevator: boolean;
  hasParking: boolean;
  hasPool: boolean;
  hasGarden: boolean;
  hasStorageRoom: boolean;
  hasTerrace: boolean;
  hasBalcony: boolean;
  hasAirConditioning: boolean;
  hasHeating: boolean;
  petsAllowed?: boolean;
  adaptedForDisabled?: boolean;

  // Eficiencia energética
  energyCertStatus?: 'certificate' | 'inProcess';
  energyCert?: string;
  energyCertEmission?: string;
  energyCertConsumption?: string;

  // Antigüedad
  yearBuilt?: number;
  renovationYear?: number;
  constructionYear?: number;

  // Ubicación
  address?: string;
  city?: string;
  province?: string;
  zipCode?: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;

  // Multimedia
  images: MLSImage[];
  videos?: string[];
  virtualTourUrl?: string;

  // Propietario / Vendedor
  owner?: {
    name?: string;
    phone?: string;
    email?: string;
    contactId?: string;
  };

  // SEO
  tags?: string[];
  featured: boolean;

  // Metadatos
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  expirationDate?: string;

  // Enlaces
  detailUrl?: string;
  brochureUrl?: string;

  // Campos extendidos (custom)
  customFields?: Record<string, any>;
}

export interface MLSFeed {
  // Metadatos del feed
  feed: {
    version: string;
    generatedAt: string;
    company: string;
    email: string;
    phone?: string;
    web?: string;
    portalUrl?: string;
    totalProperties: number;
    format: 'mls_json';
    spec: 'MLS Internacional JSON Feed 1.0';
  };

  // Propiedades
  properties: MLSProperty[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrae URLs de imágenes del campo media con orden
 */
function extractImages(media: any): MLSImage[] {
  if (!media) return [];

  try {
    // Caso 1: Array de objetos con url/src y orden
    if (Array.isArray(media)) {
      return media.map((m: any, index: number) => {
        if (typeof m === 'string') {
          return { url: m, order: index, main: index === 0 };
        }
        return {
          url: m.url || m.src || '',
          order: m.order ?? index,
          main: m.main ?? (index === 0),
          caption: m.caption || m.title || undefined,
        };
      }).filter(img => img.url);
    }

    // Caso 2: Objeto con claves ordenadas
    if (typeof media === 'object') {
      return Object.entries(media)
        .map(([key, val]: [string, any]) => {
          const url = typeof val === 'string' ? val : val?.url || val?.src || '';
          return {
            url,
            order: val?.order ?? (parseInt(key) || 0),
            main: val?.main ?? false,
            caption: val?.caption || undefined,
          };
        })
        .filter(img => img.url);
    }

    // Caso 3: String único
    if (typeof media === 'string') {
      return [{ url: media, order: 0, main: true }];
    }
  } catch {
    // Silently fail
  }

  return [];
}

/**
 * Mapea los tags SEO a un array
 */
function parseTags(seoTags: string | null): string[] {
  if (!seoTags) return [];
  return seoTags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

/**
 * Traduce el tipo de operación al formato MLS
 */
function mapOperation(op: string | null): MLSProperty['operation'] {
  if (!op) return 'venta';
  const map: Record<string, MLSProperty['operation']> = {
    venta: 'venta',
    alquiler: 'alquiler',
    renta: 'alquiler',
    traspaso: 'traspaso',
    'alquiler con opción a compra': 'alquiler_con_opcion_a_compra',
  };
  return map[op.toLowerCase()] || 'venta';
}

/**
 * Traduce el estado al formato MLS
 */
function mapStatus(status: string | null): MLSProperty['status'] {
  if (!status) return 'disponible';
  const map: Record<string, MLSProperty['status']> = {
    disponible: 'disponible',
    reservada: 'reservada',
    vendida: 'vendida',
    alquilada: 'alquilada',
    'obra nueva': 'obra_nueva',
  };
  return map[status.toLowerCase()] || 'disponible';
}

/**
 * Traduce la certificación energética a la letra A–G del feed
 */
function mapEnergyCert(cert: string | null): string | undefined {
  return letraEnergeticaParaFeed(cert) || undefined;
}

/**
 * Concatena características en un array de strings
 */
function buildFeatures(p: InmuebleParsed): string[] {
  const features: string[] = [];

  if (p.hasElevator) features.push('ascensor');
  if (p.hasParking) features.push('parking');
  if (p.hasPool) features.push('piscina');
  if (p.hasGarden) features.push('jardin');
  if (p.hasStorageRoom) features.push('trastero');
  if (p.furnished) features.push('amueblado');
  if (p.orientation) features.push(`orientacion_${p.orientation.toLowerCase()}`);

  return features;
}

/**
 * Construye la URL de detalle para el portal público
 */
function buildDetailUrl(portalUrl: string | undefined, property: InmuebleParsed): string | undefined {
  if (!portalUrl) return undefined;
  const base = portalUrl.replace(/\/+$/, '');
  return `${base}/propiedades/${property.id}`;
}

// ─── JSON Feed Generation ─────────────────────────────────────────────────────

/**
 * Convierte un InmuebleParsed a formato MLSProperty
 */
export function propertyToMLS(
  property: InmuebleParsed,
  options: MLSFeedOptions
): MLSProperty {
  const images = extractImages(property.media);
  const tags = parseTags(property.seoTags);
  const features = buildFeatures(property);
  const estadoEnergia = estadoCertificadoEnergetico(property.energyCert);

  const mls: MLSProperty = {
    // Identificación
    reference: property.id,
    title: property.nombre,
    description: property.longDescription || property.descripcion || '',
    longDescription: property.longDescription || undefined,

    // Operación
    operation: mapOperation(property.operationType),
    status: mapStatus(property.status),

    // Precios
    price: property.precioBase,
    currency: monedaEfectiva([property.moneda]),
    ...(property.areaM2 && property.areaM2 > 0
      ? { pricePerM2: Math.round(property.precioBase / property.areaM2) }
      : {}),

    // Tipo
    propertyType: property.propertyType || 'desconocido',

    // Superficies
    ...(property.areaM2 ? { areaM2: property.areaM2 } : {}),
    ...(property.builtM2 ? { builtM2: property.builtM2 } : {}),

    // Habitaciones
    ...(property.bedrooms ? { bedrooms: property.bedrooms } : {}),
    ...(property.bathrooms ? { bathrooms: property.bathrooms } : {}),
    ...(property.parking ? { parkingSpots: property.parking } : {}),

    // Características
    features,
    furnished: property.furnished,
    hasElevator: property.hasElevator,
    hasParking: property.hasParking,
    hasPool: property.hasPool,
    hasGarden: property.hasGarden,
    hasStorageRoom: property.hasStorageRoom,
    hasTerrace: property.hasTerrace,
    hasBalcony: property.hasBalcony,
    hasAirConditioning: property.hasAirConditioning,
    hasHeating: property.hasHeating,

    // Eficiencia energética
    ...(estadoEnergia !== 'notAvailable' ? { energyCertStatus: estadoEnergia } : {}),
    ...(estadoEnergia === 'certificate' ? { energyCert: mapEnergyCert(property.energyCert) } : {}),
    ...(estadoEnergia === 'certificate' && property.energyCertConsumption
      ? { energyCertConsumption: `${property.energyCertConsumption} kWh/m²/year` }
      : {}),
    ...(estadoEnergia === 'certificate' && property.energyCertEmission
      ? { energyCertEmission: `${property.energyCertEmission} kg CO₂/m²/year` }
      : {}),

    // Antigüedad
    ...(property.yearBuilt ? { yearBuilt: property.yearBuilt } : {}),

    // Ubicación
    ...(property.address ? { address: property.address } : {}),
    ...(property.city ? { city: property.city } : {}),
    ...(property.lat ? { latitude: property.lat } : {}),
    ...(property.lng ? { longitude: property.lng } : {}),

    // Multimedia
    images,
    ...(tags.length > 0 ? { tags } : {}),
    featured: property.featured,

    // Metadatos
    createdAt: property.createdAt?.toISOString(),
    updatedAt: property.updatedAt?.toISOString(),

    // Enlaces
    detailUrl: buildDetailUrl(options.portalUrl, property),

    // Propietario
    owner: property.owner.name || property.owner.phone || property.owner.email
      ? {
          name: property.owner.name || undefined,
          phone: property.owner.phone || undefined,
          email: property.owner.email || undefined,
          contactId: property.owner.contactId || undefined,
        }
      : undefined,
  };

  return mls;
}

/**
 * Genera el feed JSON completo para MLS Internacional
 *
 * @param properties Lista de propiedades a incluir en el feed
 * @param options Opciones del feed (empresa, email, URL portal...)
 * @returns String JSON formateado
 */
export function generateMLSJsonFeed(
  properties: InmuebleParsed[],
  options: MLSFeedOptions
): string {
  const now = options.generatedAt || new Date();

  const feed: MLSFeed = {
    feed: {
      version: options.feedVersion || '1.0',
      generatedAt: now.toISOString(),
      company: options.tenantName,
      email: options.tenantEmail,
      ...(options.tenantPhone ? { phone: options.tenantPhone } : {}),
      ...(options.tenantWeb ? { web: options.tenantWeb } : {}),
      ...(options.portalUrl ? { portalUrl: options.portalUrl } : {}),
      totalProperties: properties.length,
      format: 'mls_json',
      spec: 'MLS Internacional JSON Feed 1.0',
    },
    properties: properties.map((p) => propertyToMLS(p, options)),
  };

  return JSON.stringify(feed, null, 2);
}

/**
 * Genera el nombre de archivo para el feed JSON
 */
export function getMLSJsonFilename(): string {
  const date = new Date().toISOString().split('T')[0];
  return `mls-feed-${date}.json`;
}

// ─── Sync-aware export (solo propiedades modificadas desde última sync) ──────

export interface SyncDelta {
  added: MLSProperty[];
  updated: MLSProperty[];
  removed: string[];  // IDs de propiedades removidas
  total: number;
  lastSyncAt: string;
}

/**
 * Genera un delta de sincronización: solo propiedades nuevas, actualizadas o eliminadas
 * desde la última sincronización reportada por MLS Internacional.
 *
 * @param properties Lista actual de propiedades activas
 * @param previousIds Lista de IDs que MLS tenía en la última sincronización
 * @param options Opciones del feed
 * @returns SyncDelta con added/updated/removed
 */
export function generateSyncDelta(
  properties: InmuebleParsed[],
  previousIds: string[],
  options: MLSFeedOptions
): SyncDelta {
  const currentIds = new Set(properties.map(p => p.id));
  const previousSet = new Set(previousIds);

  const added = properties
    .filter(p => !previousSet.has(p.id))
    .map(p => propertyToMLS(p, options));

  const updated = properties
    .filter(p => previousSet.has(p.id))
    .map(p => propertyToMLS(p, options));

  const removed = previousIds.filter(id => !currentIds.has(id));

  return {
    added,
    updated,
    removed,
    total: properties.length,
    lastSyncAt: new Date().toISOString(),
  };
}
