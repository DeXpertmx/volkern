/**
 * Geocoding de direcciones para la sección Ubicación del editor de hospedaje.
 *
 * Usa Nominatim (OpenStreetMap) desde el SERVIDOR (la ruta
 * `/api/hospitality/geocode` es quien lo llama): la política de uso exige un
 * User-Agent identificable y un uso discreto (búsquedas puntuales del
 * operador, no autocompletado por tecla). Lo que llega al navegador son solo
 * los resultados normalizados — nunca la llamada externa.
 *
 * Todo lo que vive aquí es puro salvo `buscarDireccion` (fetch), para que los
 * tests no necesiten red para la normalización.
 */

export interface ResultadoGeocode {
  /** Texto completo del resultado, para mostrar en la lista. */
  etiqueta: string;
  latitud: number;
  longitud: number;
  /** Vía y número («Calle General Castaños 40»), si el geocoder la aporta. */
  direccion: string | null;
  ciudad: string | null;
  estadoProvincia: string | null;
  pais: string | null;
  cp: string | null;
}

export const GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
/** Nominatim exige un User-Agent identificable de la app. */
export const GEOCODER_USER_AGENT = 'Volkern-ERP/1.0 (https://volkern.app)';

interface CrudoNominatim {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  address?: Record<string, unknown>;
}

const MAX_RESULTADOS = 5;

/**
 * Normaliza la respuesta cruda de Nominatim a `ResultadoGeocode`: descarta en
 * silencio filas sin coordenadas válidas o fuera de rango, y compone la
 * dirección a partir de `addressdetails` (vía + número; ciudad con fallback a
 * town/village/municipality porque Nominatim no la llama igual en todos los
 * países). Máximo 5 resultados.
 */
export function normalizarNominatim(brutos: unknown): ResultadoGeocode[] {
  if (!Array.isArray(brutos)) return [];
  const salida: ResultadoGeocode[] = [];
  for (const bruto of brutos) {
    if (!bruto || typeof bruto !== 'object') continue;
    const o = bruto as CrudoNominatim;
    const latitud = Number(o.lat);
    const longitud = Number(o.lon);
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) continue;
    if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) continue;
    const dir = o.address ?? {};
    const texto = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v.trim() : null;
    const via = texto(dir.road);
    const numero = texto(dir.house_number);
    salida.push({
      etiqueta: texto(o.display_name) ?? `${latitud}, ${longitud}`,
      latitud,
      longitud,
      direccion: via && numero ? `${via} ${numero}` : via,
      ciudad: texto(dir.city) ?? texto(dir.town) ?? texto(dir.village) ?? texto(dir.municipality),
      estadoProvincia: texto(dir.state) ?? texto(dir.province),
      pais: texto(dir.country),
      cp: texto(dir.postcode),
    });
    if (salida.length >= MAX_RESULTADOS) break;
  }
  return salida;
}

/**
 * Consulta Nominatim con la dirección libre del operador y devuelve los
 * resultados normalizados. Lanza con mensaje claro si el servicio no responde
 * 200 (la ruta lo traduce en 502).
 */
export async function buscarDireccion(consulta: string): Promise<ResultadoGeocode[]> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set('q', consulta);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(MAX_RESULTADOS));

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': GEOCODER_USER_AGENT, 'Accept-Language': 'es' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`El geocoder respondió ${res.status}`);
  }
  const brutos: unknown = await res.json().catch(() => null);
  return normalizarNominatim(brutos);
}
