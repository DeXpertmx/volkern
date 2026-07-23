/**
 * Volkern Real Estate — Idealista XML Exporter
 *
 * Genera feeds XML compatibles con el formato Idealista 1.0
 * para exportar propiedades al portal.
 *
 * @see https://www.idealista.com/ayuda/articulos/formato-de-fichero-xml/
 */

import type { InmuebleParsed } from '../property-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedOptions {
  tenantName: string;
  tenantEmail: string;
  tenantPhone?: string;
  generatedAt?: Date;
}

// ─── XML Builder ──────────────────────────────────────────────────────────────

/**
 * Escapa caracteres XML en un string
 */
function escapeXml(str: string | number | boolean | null | undefined): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Envuelve contenido en una etiqueta XML
 */
function tag(name: string, content: string | number | boolean | null | undefined, attributes?: Record<string, string>): string {
  const escaped = escapeXml(content);
  const attrs = attributes
    ? ' ' + Object.entries(attributes).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ')
    : '';
  if (escaped === '') return `<${name}${attrs}/>`;
  return `<${name}${attrs}>${escaped}</${name}>`;
}

/**
 * Extrae URLs de imágenes del campo media de la propiedad
 */
function extractImages(media: any): string[] {
  if (!media) return [];
  if (Array.isArray(media)) {
    return media.map((m: any) => (typeof m === 'string' ? m : m.url || m.src || '')).filter(Boolean);
  }
  if (typeof media === 'object') {
    const urls = Object.values(media).map((v: any) => (typeof v === 'string' ? v : v?.url || v?.src || '')).filter(Boolean);
    return urls;
  }
  return [];
}

/**
 * Genera el feed XML completo para Idealista
 */
export function generateIdealistaFeed(
  properties: InmuebleParsed[],
  options: FeedOptions
): string {
  const now = options.generatedAt || new Date();
  const dateStr = now.toISOString().split('T')[0];

  const propertyElements = properties.map((p) => {
    const images = extractImages(p.media);
    const features: string[] = [];
    if (p.hasElevator) features.push('ascensor');
    if (p.hasParking) features.push('parking');
    if (p.hasPool) features.push('piscina');
    if (p.hasGarden) features.push('jardin');
    if (p.hasStorageRoom) features.push('trastero');
    if (p.furnished) features.push('amueblado');

    return `    <property>
      ${tag('reference', p.id)}
      ${tag('title', p.nombre)}
      ${tag('description', p.longDescription || p.descripcion || '')}
      ${tag('price', p.precioBase)}
      ${tag('currency', p.moneda)}
      ${tag('operation', p.operationType || '')}
      ${tag('propertyType', p.propertyType || '')}
      ${p.areaM2 ? tag('area', p.areaM2) : ''}
      ${p.builtM2 ? tag('builtArea', p.builtM2) : ''}
      ${p.bedrooms ? tag('bedrooms', p.bedrooms) : ''}
      ${p.bathrooms ? tag('bathrooms', p.bathrooms) : ''}
      ${tag('condition', 'good')}
      ${p.energyCert ? tag('energyCertification', p.energyCert) : ''}
      ${p.energyCertConsumption ? tag('energyConsumption', `${p.energyCertConsumption} kWh/m²/year`) : ''}
      ${p.energyCertEmission ? tag('energyEmission', `${p.energyCertEmission} kg CO₂/m²/year`) : ''}
      ${p.energyCertBody ? tag('energyCertBody', p.energyCertBody) : ''}
      ${p.energyCertDate ? tag('energyCertDate', p.energyCertDate) : ''}
      ${p.energyCertExpiry ? tag('energyCertExpiry', p.energyCertExpiry) : ''}
      ${p.energyCertUrl ? tag('energyCertUrl', p.energyCertUrl) : ''}
      ${p.yearBuilt ? tag('yearBuilt', p.yearBuilt) : ''}
      <location>
        ${p.address ? tag('address', p.address) : ''}
        ${p.city ? tag('city', p.city) : ''}
        ${p.lat ? tag('latitude', p.lat) : ''}
        ${p.lng ? tag('longitude', p.lng) : ''}
      </location>
      ${features.length > 0 ? `<features>\n        ${features.map((f) => `  ${tag('feature', f)}`).join('\n        ')}\n      </features>` : ''}
      ${images.length > 0 ? `<images>\n        ${images.map((url) => `  ${tag('image', url)}`).join('\n        ')}\n      </images>` : ''}
      ${tag('status', p.status === 'vendida' ? 'sold' : p.status === 'alquilada' ? 'rented' : 'available')}
    </property>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<idealista:feed xmlns:idealista="http://idealista.com/schema/feed/1.0" version="1.0">
  <idealista:info>
    ${tag('company', options.tenantName)}
    ${tag('email', options.tenantEmail)}
    ${options.tenantPhone ? tag('phone', options.tenantPhone) : ''}
    ${tag('generated', dateStr)}
    ${tag('totalProperties', properties.length)}
  </idealista:info>
  <properties>
${propertyElements.join('\n')}
  </properties>
</idealista:feed>`;

  return xml;
}

/**
 * Genera el nombre de archivo para el feed XML
 */
export function getIdealistaFilename(): string {
  const date = new Date().toISOString().split('T')[0];
  return `idealista-feed-${date}.xml`;
}
