/**
 * Volkern Real Estate — Fotocasa CSV Exporter
 *
 * Genera archivos CSV compatibles con Fotocasa para importación masiva.
 *
 * @see https://ayuda.fotocasa.es/hc/es/articles/360000997837-Formato-CSV
 */

import type { InmuebleParsed } from '../property-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CSVRow {
  Referencia: string;
  Titulo: string;
  Descripcion: string;
  Precio: number;
  Moneda: string;
  Operacion: string;
  TipoInmueble: string;
  SuperficieTotal: number | null;
  SuperficieConstruida: number | null;
  Habitaciones: number | null;
  Banos: number | null;
  Planta: string;
  Ascensor: string;
  Parking: string;
  Piscina: string;
  Jardin: string;
  Amueblado: string;
  CertificacionEnergetica: string;
  Antiguedad: number | null;
  Direccion: string;
  Ciudad: string;
  Provincia: string;
  CodigoPostal: string;
  Latitud: number | null;
  Longitud: number | null;
  Estado: string;
  Destacada: string;
  FotoURLs: string;
  Tags: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrae URLs de imágenes del campo media
 */
function extractImageUrls(media: any): string[] {
  if (!media) return [];
  if (Array.isArray(media)) {
    return media.map((m: any) => (typeof m === 'string' ? m : m.url || m.src || '')).filter(Boolean);
  }
  if (typeof media === 'object') {
    return Object.values(media).map((v: any) => (typeof v === 'string' ? v : v?.url || v?.src || '')).filter(Boolean);
  }
  return [];
}

/**
 * Escapa un valor CSV (entre comillas si contiene comas, saltos de línea o comillas)
 */
function escapeCSV(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convierte boolean a "Sí" / "No" para el CSV
 */
function boolToSiNo(val: boolean): string {
  return val ? 'Sí' : 'No';
}

// ─── CSV Generation ───────────────────────────────────────────────────────────

/**
 * Genera el contenido CSV para Fotocasa
 *
 * @param properties Lista de propiedades a exportar
 * @returns Contenido CSV como string (con BOM UTF-8 para Excel)
 */
export function generateFotocasaCSV(properties: InmuebleParsed[]): string {
  const headers: Array<keyof CSVRow> = [
    'Referencia',
    'Titulo',
    'Descripcion',
    'Precio',
    'Moneda',
    'Operacion',
    'TipoInmueble',
    'SuperficieTotal',
    'SuperficieConstruida',
    'Habitaciones',
    'Banos',
    'Planta',
    'Ascensor',
    'Parking',
    'Piscina',
    'Jardin',
    'Amueblado',
    'CertificacionEnergetica',
    'Antiguedad',
    'Direccion',
    'Ciudad',
    'Provincia',
    'CodigoPostal',
    'Latitud',
    'Longitud',
    'Estado',
    'Destacada',
    'FotoURLs',
    'Tags',
  ];

  const rows = properties.map((p) => {
    const images = extractImageUrls(p.media);
    const imageUrlString = images.join('|');
    const tags = p.seoTags || '';

    return {
      Referencia: p.id,
      Titulo: p.nombre,
      Descripcion: p.longDescription || p.descripcion || '',
      Precio: p.precioBase,
      Moneda: p.moneda,
      Operacion: p.operationType || '',
      TipoInmueble: p.propertyType || '',
      SuperficieTotal: p.areaM2,
      SuperficieConstruida: p.builtM2,
      Habitaciones: p.bedrooms,
      Banos: p.bathrooms,
      Planta: '', // TODO: mapear desde campo personalizado cuando esté disponible
      Ascensor: boolToSiNo(p.hasElevator),
      Parking: boolToSiNo(p.hasParking),
      Piscina: boolToSiNo(p.hasPool),
      Jardin: boolToSiNo(p.hasGarden),
      Amueblado: boolToSiNo(p.furnished),
      CertificacionEnergetica: p.energyCert || '',
      ConsumoEnergetico: p.energyCertConsumption ? `${p.energyCertConsumption} kWh/m²/año` : '',
      EmisionesCO2: p.energyCertEmission ? `${p.energyCertEmission} kg CO₂/m²/año` : '',
      OrganismoCertificador: p.energyCertBody || '',
      FechaCertificado: p.energyCertDate || '',
      CaducidadCertificado: p.energyCertExpiry || '',
      DocumentoCertificado: p.energyCertUrl || '',
      Antiguedad: p.yearBuilt,
      Direccion: p.address || '',
      Ciudad: p.city || '',
      Provincia: '', // TODO: mapear desde campo personalizado
      CodigoPostal: '', // TODO: mapear desde campo personalizado
      Latitud: p.lat,
      Longitud: p.lng,
      Estado: p.status,
      Destacada: boolToSiNo(p.featured),
      FotoURLs: imageUrlString,
      Tags: tags,
    } as CSVRow;
  });

  // Header row
  const headerLine = headers.map((h) => escapeCSV(h)).join(';');

  // Data rows
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCSV(row[h])).join(';')
  );

  // BOM UTF-8 para compatibilidad con Excel
  const BOM = '\uFEFF';
  return BOM + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Genera el nombre de archivo para el CSV de Fotocasa
 */
export function getFotocasaFilename(): string {
  const date = new Date().toISOString().split('T')[0];
  return `fotocasa-export-${date}.csv`;
}
