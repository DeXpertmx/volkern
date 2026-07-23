/**
 * Volkern Real Estate Module — Property Helpers
 *
 * Helpers tipados para gestionar inmuebles como extensión de CatalogoItem.
 * Los inmuebles se almacenan con CatalogoItem.tipo = 'inmueble'
 * y sus campos específicos en customFieldValues (JSONB).
 */

import { prisma } from '@/lib/db';
import type { CatalogoItem } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InmuebleParsed {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion: string | null;
  precioBase: number;
  moneda: string;
  activo: boolean;
  destacado: boolean;
  media: any;
  createdAt: Date;
  updatedAt: Date;

  // Campos inmobiliarios (extraídos de customFieldValues)
  operationType: string | null;       // tipo_operacion: 'venta' | 'alquiler' | 'traspaso'
  propertyType: string | null;        // tipo_inmueble: 'casa' | 'departamento' | ...
  areaM2: number | null;              // superficie_total
  builtM2: number | null;             // superficie_construida
  bedrooms: number | null;            // habitaciones
  bathrooms: number | null;           // banos
  parking: number | null;             // estacionamientos
  address: string | null;             // direccion
  city: string | null;                // zona
  lat: number | null;                 // latitud
  lng: number | null;                 // longitud
  yearBuilt: number | null;           // antiguedad
  hasElevator: boolean;               // ascensor
  hasParking: boolean;                // estacionamiento
  hasPool: boolean;                   // alberca
  hasGarden: boolean;                 // jardin
  hasStorageRoom: boolean;            // trastero
  hasTerrace: boolean;                // terraza
  hasBalcony: boolean;                // balcon
  hasAirConditioning: boolean;        // aire_acondicionado
  hasHeating: boolean;                // calefaccion
  furnished: boolean;                 // amueblado
  orientation: string | null;         // orientacion
  energyCert: string | null;          // certificacion_energetica (letra A-G)
  energyCertConsumption: number | null;  // consumo_energetico (kWh/m²/año)
  energyCertEmission: number | null;     // emisiones_co2 (kg CO₂/m²/año)
  energyCertBody: string | null;         // organismo_certificador
  energyCertDate: string | null;         // fecha_certificado
  energyCertExpiry: string | null;       // caducidad_certificado
  energyCertUrl: string | null;          // documento_certificado (URL PDF)
  status: string;                     // estado: 'disponible' | 'reservada' | 'vendida' | 'alquilada'
  featured: boolean;                  // destacada
  longDescription: string | null;     // descripcion_larga
  seoTags: string | null;             // tags_seo

  // 👤 Propietario / Vendedor
  owner: {
    name: string | null;
    phone: string | null;
    email: string | null;
    contactId: string | null;
  };
}

export interface PropertyFilters {
  operationType?: string;
  propertyType?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minArea?: number;
  status?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

export interface PropertyStats {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  rented: number;
  featured: number;
  avgPrice: number;
  avgPricePerM2: number;
}



// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Extrae campos tipados de customFieldValues (JSONB)
 */
function extractFields(item: CatalogoItem): Record<string, any> {
  return (item.customFieldValues as Record<string, any>) || {};
}

/**
 * Convierte un CatalogoItem en un objeto InmuebleParsed tipado
 */
export function parseInmueble(item: CatalogoItem): InmuebleParsed {
  const f = extractFields(item);

  return {
    id: item.id,
    tenantId: item.tenantId,
    nombre: item.nombre,
    descripcion: item.descripcion,
    precioBase: item.precioBase,
    moneda: item.moneda || 'EUR',
    activo: item.activo,
    destacado: item.destacado,
    media: item.media,
    createdAt: item.fechaCreacion,
    updatedAt: item.fechaActualizacion,

    // Campos inmobiliarios
    operationType: f.tipo_operacion || null,
    propertyType: f.tipo_inmueble || null,
    areaM2: f.superficie_total ? Number(f.superficie_total) : null,
    builtM2: f.superficie_construida ? Number(f.superficie_construida) : null,
    bedrooms: f.habitaciones ? Number(f.habitaciones) : null,
    bathrooms: f.banos ? Number(f.banos) : null,
    parking: f.estacionamientos ? Number(f.estacionamientos) : null,
    address: f.direccion || null,
    city: f.zona || null,
    lat: f.latitud ? Number(f.latitud) : null,
    lng: f.longitud ? Number(f.longitud) : null,
    yearBuilt: f.antiguedad ? Number(f.antiguedad) : null,
    hasElevator: Boolean(f.ascensor),
    hasParking: Boolean(f.estacionamiento),
    hasPool: Boolean(f.alberca),
    hasGarden: Boolean(f.jardin),
    hasStorageRoom: Boolean(f.trastero),
    hasTerrace: Boolean(f.terraza),
    hasBalcony: Boolean(f.balcon),
    hasAirConditioning: Boolean(f.aire_acondicionado),
    hasHeating: Boolean(f.calefaccion),
    furnished: Boolean(f.amueblado),
    orientation: f.orientacion || null,
    energyCert: f.certificacion_energetica || null,
    energyCertConsumption: f.consumo_energetico ? Number(f.consumo_energetico) : null,
    energyCertEmission: f.emisiones_co2 ? Number(f.emisiones_co2) : null,
    energyCertBody: f.organismo_certificador || null,
    energyCertDate: f.fecha_certificado || null,
    energyCertExpiry: f.caducidad_certificado || null,
    energyCertUrl: f.documento_certificado || null,
    status: f.estado || 'disponible',
    featured: Boolean(f.destacada),
    longDescription: f.descripcion_larga || null,
    seoTags: f.tags_seo || null,

    // 👤 Propietario
    owner: {
      name: f.propietario_nombre || null,
      phone: f.propietario_telefono || null,
      email: f.propietario_email || null,
      contactId: f.propietario_contact_id || null,
    },
  };
}

/**
 * Convierte un array de CatalogoItem en InmuebleParsed[]
 */
export function parseInmuebles(items: CatalogoItem[]): InmuebleParsed[] {
  return items.map(parseInmueble);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Obtiene propiedades con filtros usando Prisma estándar + filtrado en memoria
 */
export async function getProperties(
  tenantId: string,
  filters: PropertyFilters = {}
): Promise<{ properties: InmuebleParsed[]; total: number }> {
  const {
    operationType,
    propertyType,
    city,
    minPrice = 0,
    maxPrice = 999999999,
    minBedrooms = 0,
    minArea = 0,
    status = 'disponible',
    featured,
    limit = 20,
    offset = 0,
  } = filters;

  // Fetch all matching properties
  const items = await prisma.catalogoItem.findMany({
    where: {
      tenantId,
      tipo: 'inmueble',
      activo: true,
    },
    orderBy: [
      { destacado: 'desc' },
      { fechaCreacion: 'desc' },
    ],
  });

  // Apply in-memory filters
  const filtered = items.filter((item) => {
    const f = (item.customFieldValues as Record<string, any>) || {};

    // Status
    const itemStatus = f.estado || 'disponible';
    if (status && itemStatus !== status) return false;

    // Operation type
    if (operationType && f.tipo_operacion !== operationType) return false;

    // Property type
    if (propertyType && f.tipo_inmueble !== propertyType) return false;

    // City (ILIKE)
    if (city) {
      const itemCity = f.zona || '';
      if (!itemCity.toLowerCase().includes(city.toLowerCase())) return false;
    }

    // Price range
    if (item.precioBase < minPrice || item.precioBase > maxPrice) return false;

    // Bedrooms
    if (minBedrooms > 0) {
      const bedrooms = f.habitaciones ? Number(f.habitaciones) : 0;
      if (bedrooms < minBedrooms) return false;
    }

    // Min area
    if (minArea > 0) {
      const area = f.superficie_total ? Number(f.superficie_total) : 0;
      if (area < minArea) return false;
    }

    // Featured
    if (featured !== undefined) {
      const itemFeatured = f.destacada === true || f.destacada === 'true';
      if (itemFeatured !== featured) return false;
    }

    return true;
  });

  const total = filtered.length;

  // Apply pagination
  const paginated = filtered.slice(offset, offset + limit);

  return {
    properties: parseInmuebles(paginated),
    total,
  };
}

/**
 * Obtiene una propiedad por ID
 */
export async function getPropertyById(
  tenantId: string,
  propertyId: string
): Promise<InmuebleParsed | null> {
  const item = await prisma.catalogoItem.findFirst({
    where: {
      id: propertyId,
      tenantId,
      tipo: 'inmueble',
    },
  });

  return item ? parseInmueble(item) : null;
}

/**
 * Obtiene propiedades destacadas
 */
export async function getFeaturedProperties(
  tenantId: string,
  limit = 6
): Promise<InmuebleParsed[]> {
  const items = await prisma.catalogoItem.findMany({
    where: {
      tenantId,
      tipo: 'inmueble',
      activo: true,
      destacado: true,
    },
    orderBy: { fechaCreacion: 'desc' },
    take: limit,
  });

  return parseInmuebles(items);
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Obtiene estadísticas de propiedades para un tenant
 */
export async function getPropertyStats(tenantId: string): Promise<PropertyStats> {
  const items = await prisma.catalogoItem.findMany({
    where: {
      tenantId,
      tipo: 'inmueble',
      activo: true,
    },
    select: {
      precioBase: true,
      destacado: true,
      customFieldValues: true,
    },
  });

  let total = 0, available = 0, reserved = 0, sold = 0, rented = 0, featured = 0;
  let priceSum = 0, priceCount = 0, m2Sum = 0, m2Count = 0;

  for (const item of items) {
    total++;
    if (item.destacado) featured++;

    const f = (item.customFieldValues as Record<string, any>) || {};
    const estado = f.estado;

    if (!estado || estado === 'disponible') available++;
    else if (estado === 'reservada') reserved++;
    else if (estado === 'vendida') sold++;
    else if (estado === 'alquilada') rented++;

    // Price averages
    if (item.precioBase > 0) {
      priceSum += item.precioBase;
      priceCount++;

      const superficie = f.superficie_total ? Number(f.superficie_total) : 0;
      if (superficie > 0) {
        m2Sum += item.precioBase / superficie;
        m2Count++;
      }
    }
  }

  return {
    total,
    available,
    reserved,
    sold,
    rented,
    featured,
    avgPrice: priceCount > 0 ? priceSum / priceCount : 0,
    avgPricePerM2: m2Count > 0 ? m2Sum / m2Count : 0,
  };
}

// ─── Builder ───────────────────────────────────────────────────────────────────

/**
 * Construye el payload de customFieldValues a partir de campos parciales
 */
export function buildCustomFieldValues(
  data: Partial<InmuebleParsed>
): Record<string, any> {
  const result: Record<string, any> = {};

  if (data.operationType) result.tipo_operacion = data.operationType;
  if (data.propertyType) result.tipo_inmueble = data.propertyType;
  if (data.areaM2) result.superficie_total = data.areaM2;
  if (data.builtM2) result.superficie_construida = data.builtM2;
  if (data.bedrooms) result.habitaciones = data.bedrooms;
  if (data.bathrooms) result.banos = data.bathrooms;
  if (data.parking) result.estacionamientos = data.parking;
  if (data.address) result.direccion = data.address;
  if (data.city) result.zona = data.city;
  if (data.lat) result.latitud = data.lat;
  if (data.lng) result.longitud = data.lng;
  if (data.yearBuilt) result.antiguedad = data.yearBuilt;
  if (data.hasElevator) result.ascensor = true;
  if (data.hasParking) result.estacionamiento = true;
  if (data.hasPool) result.alberca = true;
  if (data.hasGarden) result.jardin = true;
  if (data.hasStorageRoom) result.trastero = true;
  if (data.hasTerrace) result.terraza = true;
  if (data.hasBalcony) result.balcon = true;
  if (data.hasAirConditioning) result.aire_acondicionado = true;
  if (data.hasHeating) result.calefaccion = true;
  if (data.furnished) result.amueblado = true;
  if (data.orientation) result.orientacion = data.orientation;
  if (data.energyCert) result.certificacion_energetica = data.energyCert;
  if (data.energyCertConsumption) result.consumo_energetico = data.energyCertConsumption;
  if (data.energyCertEmission) result.emisiones_co2 = data.energyCertEmission;
  if (data.energyCertBody) result.organismo_certificador = data.energyCertBody;
  if (data.energyCertDate) result.fecha_certificado = data.energyCertDate;
  if (data.energyCertExpiry) result.caducidad_certificado = data.energyCertExpiry;
  if (data.energyCertUrl) result.documento_certificado = data.energyCertUrl;
  if (data.status) result.estado = data.status;
  if (data.featured) result.destacada = true;
  if (data.longDescription) result.descripcion_larga = data.longDescription;
  if (data.seoTags) result.tags_seo = data.seoTags;

  // 👤 Propietario / Vendedor
  if (data.owner?.name) result.propietario_nombre = data.owner.name;
  if (data.owner?.phone) result.propietario_telefono = data.owner.phone;
  if (data.owner?.email) result.propietario_email = data.owner.email;
  if (data.owner?.contactId) result.propietario_contact_id = data.owner.contactId;

  return result;
}

/**
 * Actualiza campos personalizados de una propiedad (customFieldValues)
 * Hace merge con los valores existentes.
 */
export async function updatePropertyCustomFields(
  propertyId: string,
  fields: Record<string, any>
): Promise<void> {
  const existing = await prisma.catalogoItem.findUnique({
    where: { id: propertyId },
    select: { customFieldValues: true },
  });

  const current = (existing?.customFieldValues as Record<string, any>) || {};
  const merged = { ...current, ...fields };

  await prisma.catalogoItem.update({
    where: { id: propertyId },
    data: { customFieldValues: merged },
  });
}

/**
 * Obtiene una propiedad con sus campos personalizados completos
 */
export async function getPropertyWithFields(
  propertyId: string,
  tenantId: string
): Promise<any> {
  const item = await prisma.catalogoItem.findFirst({
    where: { id: propertyId, tenantId, tipo: 'inmueble' },
  });
  if (!item) throw new Error(`Propiedad ${propertyId} no encontrada`);
  return item;
}

// ─── Owner ↔ Contact Sync ─────────────────────────────────────────────────────

/**
 * Sincroniza los datos del propietario (nombre, teléfono, email) desde una
 * propiedad inmobiliaria hacia el registro Contact vinculado en el CRM.
 *
 * @param tenantId    — Tenant al que pertenecen propiedad y contacto
 * @param contactId   — ID del Contact en CRM (propietario_contact_id)
 * @param ownerData   — Datos del propietario { name, phone, email }
 *
 * @returns Objeto con el resultado de la sincronización
 *
 * - Si contactId es null/vacío → { synced: false, reason: 'no_contact_id' }
 * - Si el Contact no existe    → { synced: false, reason: 'contact_not_found' }
 * - Si no hay datos que sync   → { synced: false, reason: 'no_owner_data' }
 * - Si se actualiza            → { synced: true, updatedFields: [...] }
 */
export async function syncPropertyOwnerToContact(
  tenantId: string,
  contactId: string | null | undefined,
  ownerData: { name: string | null; phone: string | null; email: string | null }
): Promise<{
  synced: boolean;
  reason?: string;
  updatedFields?: string[];
  contact?: { id: string; nombre: string; email: string; telefono: string | null } | null;
}> {
  // ── Guard: sin contactId ──
  if (!contactId) {
    return { synced: false, reason: 'no_contact_id' };
  }

  // ── Guard: sin datos de propietario ──
  const hasData = ownerData.name || ownerData.phone || ownerData.email;
  if (!hasData) {
    return { synced: false, reason: 'no_owner_data' };
  }

  try {
    // Buscar el Contact en CRM
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true, nombre: true, email: true, telefono: true },
    });

    if (!contact) {
      return { synced: false, reason: 'contact_not_found' };
    }

    // Construir update solo con campos no nulos
    const updateData: { nombre?: string; email?: string; telefono?: string } = {};
    const updatedFields: string[] = [];

    if (ownerData.name) {
      updateData.nombre = ownerData.name;
      updatedFields.push('nombre');
    }
    if (ownerData.email) {
      updateData.email = ownerData.email;
      updatedFields.push('email');
    }
    if (ownerData.phone) {
      updateData.telefono = ownerData.phone;
      updatedFields.push('telefono');
    }

    if (updatedFields.length === 0) {
      return { synced: false, reason: 'no_owner_data' };
    }

    // Actualizar el Contact
    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
      select: { id: true, nombre: true, email: true, telefono: true },
    });

    return {
      synced: true,
      updatedFields,
      contact: updated,
    };
  } catch (error) {
    console.error('[OwnerSync] Error syncing owner to contact:', error);
    return { synced: false, reason: 'error' };
  }
}
