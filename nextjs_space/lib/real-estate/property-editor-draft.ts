/**
 * Volkern Real Estate — Borrador del editor de propiedades.
 *
 * El editor trabaja sobre un borrador plano (inputs controlados con strings)
 * y lo convierte al payload tipado que espera `PATCH
 * /api/real-estate/properties/[id]`. Vive fuera del componente para que las
 * conversiones sean testeables y el componente solo pinte.
 *
 * Autosave: cada cambio del borrador dispara un PATCH completo con debounce;
 * el payload es idempotente (merge de `customFieldValues`), así que guardar
 * dos veces lo mismo no corrompe nada.
 */

import type { InmuebleParsed } from './property-helpers';
import type { InmuebleParaEstado } from './property-editor-config';

/** Foto de la galería: URL más título opcional (máx. 100 en el editor). */
export interface FotoItem {
  url: string;
  titulo?: string;
}

export const MAX_TITULO_FOTO = 100;

/** Borrador editable: todos los campos de entrada como strings. */
export interface DraftInmueble {
  nombre: string;
  descripcion: string;
  longDescription: string;
  seoTags: string;

  precioBase: string;
  moneda: string;

  operationType: string;
  propertyType: string;
  status: string;
  destacado: boolean;
  activo: boolean;
  /** Interruptor de portales: decide si la ficha entra en los feeds. */
  publicableEnPortales: boolean;

  address: string;
  city: string;
  lat: string;
  lng: string;
  orientation: string;

  areaM2: string;
  bedrooms: string;
  bathrooms: string;
  yearBuilt: string;

  roomsDetail: Record<string, number>;
  bedsDetail: Record<string, number>;
  servicios: string[];

  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;

  energyCert: string;
  energyCertConsumption: string;
  energyCertEmission: string;
  energyCertBody: string;
  energyCertDate: string;
  energyCertExpiry: string;
  energyCertUrl: string;

  media: FotoItem[];
}

/**
 * Normaliza `media` a fotos `{ url, titulo? }`.
 *
 * El campo ha convivido con URLs sueltas y objetos `{ url }`; el editor escribe
 * siempre la forma con objeto para poder guardar el título por foto.
 */
export function mediaAFotos(media: unknown): FotoItem[] {
  if (!Array.isArray(media)) return [];
  const fotos: FotoItem[] = [];
  for (const m of media) {
    if (typeof m === 'string' && m.length > 0) {
      fotos.push({ url: m });
    } else if (m && typeof m === 'object' && typeof (m as any).url === 'string') {
      const titulo = (m as any).titulo;
      fotos.push({
        url: (m as any).url,
        ...(typeof titulo === 'string' && titulo.length > 0 ? { titulo } : {}),
      });
    }
  }
  return fotos;
}

/** Número desde input de texto: `undefined` si está vacío o no parsea. */
function numero(valor: string): number | undefined {
  if (valor.trim() === '') return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** Entero desde input de texto: `undefined` si está vacío o no parsea. */
function entero(valor: string): number | undefined {
  const n = numero(valor);
  return n === undefined ? undefined : Math.round(n);
}

/** Convierte un inmueble parseado en borrador editable. */
export function borradorDesdeInmueble(p: InmuebleParsed): DraftInmueble {
  return {
    nombre: p.nombre || '',
    descripcion: p.descripcion || '',
    longDescription: p.longDescription || '',
    seoTags: p.seoTags || '',

    precioBase: p.precioBase != null ? String(p.precioBase) : '',
    moneda: p.moneda || '',

    operationType: p.operationType || '',
    propertyType: p.propertyType || '',
    status: p.status || 'disponible',
    destacado: Boolean(p.destacado),
    activo: Boolean(p.activo),
    publicableEnPortales: Boolean(p.publicableEnPortales),

    address: p.address || '',
    city: p.city || '',
    lat: p.lat != null ? String(p.lat) : '',
    lng: p.lng != null ? String(p.lng) : '',
    orientation: p.orientation || '',

    areaM2: p.areaM2 != null ? String(p.areaM2) : '',
    bedrooms: p.bedrooms != null ? String(p.bedrooms) : '',
    bathrooms: p.bathrooms != null ? String(p.bathrooms) : '',
    yearBuilt: p.yearBuilt != null ? String(p.yearBuilt) : '',

    roomsDetail: p.roomsDetail ? { ...p.roomsDetail } : {},
    bedsDetail: p.bedsDetail ? { ...p.bedsDetail } : {},
    servicios: p.servicios ? [...p.servicios] : [],

    ownerName: p.owner?.name || '',
    ownerPhone: p.owner?.phone || '',
    ownerEmail: p.owner?.email || '',

    energyCert: p.energyCert || '',
    energyCertConsumption: p.energyCertConsumption != null ? String(p.energyCertConsumption) : '',
    energyCertEmission: p.energyCertEmission != null ? String(p.energyCertEmission) : '',
    energyCertBody: p.energyCertBody || '',
    energyCertDate: p.energyCertDate || '',
    energyCertExpiry: p.energyCertExpiry || '',
    energyCertUrl: p.energyCertUrl || '',

    media: mediaAFotos(p.media),
  };
}

/**
 * Dormitorios efectivos: el contador del modal manda si existe, y el campo
 * clásico queda como respaldo. Así el listado (que filtra por `bedrooms`) y
 * el editor (que usa `habitaciones_detalle`) cuentan lo mismo.
 */
export function dormitoriosEfectivos(d: DraftInmueble): number | undefined {
  const delModal = d.roomsDetail['dormitorio'];
  if (typeof delModal === 'number') return delModal;
  return entero(d.bedrooms);
}

/** Baños efectivos: misma regla que los dormitorios con el contador `bano`. */
export function banosEfectivos(d: DraftInmueble): number | undefined {
  const delModal = d.roomsDetail['bano'];
  if (typeof delModal === 'number') return delModal;
  return entero(d.bathrooms);
}

/**
 * Payload de guardado para el PATCH. Los campos vacíos se omiten (no se
 * pueden borrar valores desde el editor todavía) y los números inválidos no
 * se envían para no escribir basura en `customFieldValues`.
 */
export function payloadDesdeBorrador(d: DraftInmueble): Record<string, unknown> {
  return {
    nombre: d.nombre,
    descripcion: d.descripcion || null,
    longDescription: d.longDescription || null,
    seoTags: d.seoTags || null,

    precioBase: numero(d.precioBase) ?? 0,
    moneda: d.moneda,

    operationType: d.operationType || null,
    propertyType: d.propertyType || null,
    status: d.status,
    destacado: d.destacado,
    featured: d.destacado,
    activo: d.activo,
    publicableEnPortales: d.publicableEnPortales,

    address: d.address || null,
    city: d.city || null,
    lat: numero(d.lat),
    lng: numero(d.lng),
    orientation: d.orientation || null,

    areaM2: entero(d.areaM2),
    bedrooms: dormitoriosEfectivos(d),
    bathrooms: banosEfectivos(d),
    yearBuilt: entero(d.yearBuilt),

    roomsDetail: d.roomsDetail,
    bedsDetail: d.bedsDetail,
    servicios: d.servicios,

    ownerName: d.ownerName || null,
    ownerPhone: d.ownerPhone || null,
    ownerEmail: d.ownerEmail || null,

    energyCert: d.energyCert || null,
    energyCertConsumption: numero(d.energyCertConsumption),
    energyCertEmission: numero(d.energyCertEmission),
    energyCertBody: d.energyCertBody || null,
    energyCertDate: d.energyCertDate || null,
    energyCertExpiry: d.energyCertExpiry || null,
    energyCertUrl: d.energyCertUrl || null,

    media: d.media.map((f) => ({
      url: f.url,
      ...(f.titulo && f.titulo.length > 0 ? { titulo: f.titulo } : {}),
    })),
  };
}

/**
 * Proyección del borrador al formato que consumen las reglas de completado
 * (`estadoSecciones`/`progresoGlobal`), que esperan números ya parseados.
 */
export function estadoDesdeBorrador(d: DraftInmueble): InmuebleParaEstado {
  return {
    nombre: d.nombre,
    descripcion: d.descripcion,
    longDescription: d.longDescription,
    media: d.media,
    address: d.address,
    city: d.city,
    owner: { name: d.ownerName, phone: d.ownerPhone, email: d.ownerEmail },
    bedrooms: entero(d.bedrooms) ?? null,
    roomsDetail: d.roomsDetail,
    bedsDetail: d.bedsDetail,
    servicios: d.servicios,
    precioBase: numero(d.precioBase) ?? 0,
    status: d.status,
    energyCert: d.energyCert,
  };
}

/** La portada es la primera foto; el resto de la galería la sigue. */
export function hacerPortada(media: FotoItem[], indice: number): FotoItem[] {
  if (indice <= 0 || indice >= media.length) return media;
  const copia = [...media];
  const [foto] = copia.splice(indice, 1);
  return [foto, ...copia];
}
