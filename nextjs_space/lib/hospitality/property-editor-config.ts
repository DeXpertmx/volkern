/**
 * Volkern Hospitality — Configuración del editor de propiedades por secciones.
 *
 * Porta al vertical de hospedaje el editor guiado que ya existe en Real
 * Estate: barra lateral con secciones agrupadas y estado de completado, y un
 * panel principal por sección. Todo lo que vive aquí es puro y no toca Prisma,
 * para que lo use el navegador y los tests sin arrastrar la base de datos.
 *
 * Diferencia con real-estate: aquí la ficha es la PROPERTY (el establecimiento)
 * con sus políticas de operación; las fotos ya viven en el Json `fotos`, el
 * registro SES.HOSPEDAJES en `sesHospedajes` y el detalle declarado en el Json
 * `detalleAlojamiento` — que desde el reencuadre propiedades ↔ unidades
 * (migración 20261006120000) contiene SOLO los `servicios`: las áreas comunes
 * e instalaciones del complejo (piscina, oficina de visitantes,
 * estacionamiento…) compartidas por todos los huéspedes. La distribución de
 * habitaciones y camas es de cada UNIDAD (HospitalityUnit.detalleAlojamiento,
 * módulo `unit-detalle.ts`): aquí llega como AGREGADO de solo lectura para
 * mostrarlo en la ficha. El borrador usa la forma de la API tal cual
 * ({ property, units }), porque el editor edita la propiedad y las unidades
 * se listan/enlazan (su edición granular ya existe en el módulo).
 */

import {
  agregarDetallesUnidades,
  normalizarDetalleUnidad,
  type DetalleUnidad,
} from './unit-detalle';
// La divisa del editor NO se escribe aquí: el literal vive en el módulo único de
// moneda (`lib/moneda.ts`), que es el que decide el valor por defecto y qué
// códigos existen. `lib/hospitality` es zona limpia de deuda de moneda: ni un
// literal suelto.
import { MONEDA_PLATAFORMA, MONEDAS_SELECCIONABLES } from '@/lib/moneda';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SeccionHospedaje =
  | 'global'
  | 'descripcion'
  | 'fotos'
  | 'ubicacion'
  | 'unidades'
  | 'operacion'
  | 'cumplimiento';

export interface SeccionHospedajeInfo {
  id: SeccionHospedaje;
  grupo: string;
  label: string;
}

/** Secciones del editor de hospedaje, en orden de presentación. */
export const SECCIONES_HOSPEDAJE: readonly SeccionHospedajeInfo[] = [
  { id: 'global', grupo: 'Vista global', label: 'Vista global' },
  { id: 'descripcion', grupo: 'Detalles del establecimiento', label: 'Descripción general' },
  { id: 'fotos', grupo: 'Detalles del establecimiento', label: 'Fotos' },
  { id: 'ubicacion', grupo: 'Detalles del establecimiento', label: 'Ubicación' },
  { id: 'unidades', grupo: 'Configuración de reserva', label: 'Unidades' },
  { id: 'operacion', grupo: 'Configuración de reserva', label: 'Operación' },
  { id: 'cumplimiento', grupo: 'Cumplimiento', label: 'SES.HOSPEDAJES' },
];

/** Primera sección del editor: la Vista global. */
export const PRIMERA_SECCION_HOSPEDAJE: SeccionHospedaje = 'global';

/** Ficha de una sección por id, o `undefined`. */
export function infoSeccionHospedaje(id: string): SeccionHospedajeInfo | undefined {
  return SECCIONES_HOSPEDAJE.find((s) => s.id === id);
}

// ─── Forma de los datos en el hilo cliente ↔ API ─────────────────────────────

/** Foto de la propiedad: URL más título opcional y marca de portada. */
export interface FotoHospedaje {
  url: string;
  titulo?: string;
  portada?: boolean;
}

/** Unidad tal como la devuelve `GET /api/hospitality/properties/[id]`. */
export interface UnidadWire {
  id: string;
  nombre: string;
  codigo?: string | null;
  tipo?: string | null;
  capacidad?: number | null;
  tarifaBase?: number | null;
  moneda?: string | null;
  estado?: string | null;
  /** Detalle declarado de la unidad (habitaciones/camas); base del agregado. */
  detalleAlojamiento?: unknown;
}

/**
 * Detalle del COMPLEJO editable en la ficha: solo los `servicios` (áreas
 * comunes e instalaciones compartidas). Habitaciones y camas ya no se editan
 * aquí: son de cada unidad y llegan como agregado (`agregadoUnidades`).
 */
export interface DetalleAlojamiento {
  servicios: string[];
}

export const DETALLE_VACIO: DetalleAlojamiento = {
  servicios: [],
};

/** Normaliza el Json `detalleAlojamiento` de la propiedad a solo servicios. */
export function detalleAlojamientoDe(raw: unknown): DetalleAlojamiento {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DETALLE_VACIO };
  const o = raw as Record<string, unknown>;
  return {
    servicios: Array.isArray(o.servicios)
      ? o.servicios.filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [],
  };
}

/** Propiedad tal como la devuelve la API (fechas en string ISO por JSON). */
export interface PropertyWire {
  id: string;
  nombre: string;
  descripcion?: string | null;
  codigo?: string | null;
  zona?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  estadoProvincia?: string | null;
  pais?: string | null;
  cp?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  fotos?: unknown;
  sesHospedajes?: unknown;
  detalleAlojamiento?: unknown;
  distancias?: unknown;
  indicaciones?: unknown;
  mapaPersonalizadoUrl?: string | null;
  timezone?: string | null;
  estado?: string | null;
  politicaNoShow?: string | null;
  politicaSalidaAnticipada?: string | null;
  holdHoras?: number | null;
  units?: UnidadWire[];
}

/** Borrador editable del editor de hospedaje (inputs como strings). */
export interface DraftHospedaje {
  nombre: string;
  descripcion: string;
  codigo: string;

  direccion: string;
  ciudad: string;
  estadoProvincia: string;
  pais: string;
  cp: string;
  zona: string;
  lat: string;
  lng: string;

  fotos: FotoHospedaje[];

  timezone: string;
  estado: string;
  politicaNoShow: string;
  politicaSalidaAnticipada: string;
  holdHoras: string;

  sesCodigo: string;
  sesMunicipio: string;

  /** Detalle del COMPLEJO: solo servicios (áreas comunes e instalaciones). */
  detalle: DetalleAlojamiento;

  /**
   * Habitaciones y camas AGREGADAS de las unidades (solo lectura): suma de los
   * detalles declarados en cada unidad. `null` si ninguna declara nada.
   */
  agregadoUnidades: DetalleUnidad | null;

  /** Ubicación enriquecida (distancias, indicaciones, mapa propio). */
  distancias: DistanciasHospedaje;
  indicaciones: IndicacionesHospedaje;
  mapaPersonalizadoUrl: string;

  units: UnidadWire[];
}

/** Normaliza el Json `fotos` a fotos `{ url, titulo?, portada? }`. */
export function fotosHospedaje(raw: unknown): FotoHospedaje[] {
  if (!Array.isArray(raw)) return [];
  const salida: FotoHospedaje[] = [];
  for (const f of raw) {
    if (typeof f === 'string' && f.length > 0) {
      salida.push({ url: f });
    } else if (f && typeof f === 'object' && typeof (f as any).url === 'string') {
      const titulo = (f as any).titulo;
      salida.push({
        url: (f as any).url,
        ...(typeof titulo === 'string' && titulo.length > 0 ? { titulo } : {}),
        ...(typeof (f as any).portada === 'boolean' ? { portada: (f as any).portada } : {}),
      });
    }
  }
  return salida;
}

/** Código SES.HOSPEDAJES y municipio INE desde el Json `sesHospedajes`. */
export function sesDeProperty(raw: unknown): { codigo: string; municipio: string } {
  if (!raw || typeof raw !== 'object') return { codigo: '', municipio: '' };
  const o = raw as Record<string, unknown>;
  return {
    codigo: typeof o.codigoEstablecimiento === 'string' ? o.codigoEstablecimiento : '',
    municipio: typeof o.municipioIne === 'string' ? o.municipioIne : '',
  };
}

/** Convierte la propiedad de la API en borrador editable. */
export function borradorDesdeProperty(p: PropertyWire): DraftHospedaje {
  const ses = sesDeProperty(p.sesHospedajes);
  const detalle = detalleAlojamientoDe(p.detalleAlojamiento);
  const agregadoUnidades = agregarDetallesUnidades(p.units ?? []);
  return {
    nombre: p.nombre || '',
    descripcion: p.descripcion || '',
    codigo: p.codigo || '',

    direccion: p.direccion || '',
    ciudad: p.ciudad || '',
    estadoProvincia: p.estadoProvincia || '',
    pais: p.pais || '',
    cp: p.cp || '',
    zona: p.zona || '',
    lat: p.latitud != null ? String(p.latitud) : '',
    lng: p.longitud != null ? String(p.longitud) : '',

    fotos: fotosHospedaje(p.fotos),

    timezone: p.timezone || 'America/Mexico_City',
    estado: p.estado || 'activa',
    politicaNoShow: p.politicaNoShow || 'primera_noche',
    politicaSalidaAnticipada: p.politicaSalidaAnticipada || 'salida_real',
    holdHoras: p.holdHoras != null ? String(p.holdHoras) : '24',

    sesCodigo: ses.codigo,
    sesMunicipio: ses.municipio,

    detalle,
    agregadoUnidades,

    distancias: distanciasDe(p.distancias),
    indicaciones: indicacionesDe(p.indicaciones),
    mapaPersonalizadoUrl: p.mapaPersonalizadoUrl || '',

    units: p.units || [],
  };
}

/** Número desde texto: `undefined` si vacío o inválido. */
function numero(valor: string): number | undefined {
  if (valor.trim() === '') return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** Entero ≥ 0 desde texto: `undefined` si no procede. */
function enteroNoNegativo(valor: string): number | undefined {
  const n = numero(valor);
  return n !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Distancias a transporte de la propiedad, tal como viven en el Json
 * `distancias` y en el borrador del editor. `unidad` decide cómo se muestran
 * ('km' | 'millas'); los valores son kilómetros en decimal (0,2 = 200 m).
 */
export interface DistanciasHospedaje {
  aeropuertoKm: string;
  autobusKm: string;
  metroKm: string;
  trenKm: string;
  autopistaKm: string;
  puertoKm: string;
  unidad: string;
}

export const DISTANCIAS_VACIAS: DistanciasHospedaje = {
  aeropuertoKm: '',
  autobusKm: '',
  metroKm: '',
  trenKm: '',
  autopistaKm: '',
  puertoKm: '',
  unidad: 'km',
};

/** Claves de distancia y su etiqueta (con icono aparte en el editor). */
export const DISTANCIAS_CATALOGO: readonly { key: keyof Omit<DistanciasHospedaje, 'unidad'>; label: string }[] = [
  { key: 'aeropuertoKm', label: 'Aeropuerto' },
  { key: 'autobusKm', label: 'Autobús' },
  { key: 'metroKm', label: 'Metro' },
  { key: 'trenKm', label: 'Tren' },
  { key: 'autopistaKm', label: 'Autopista' },
  { key: 'puertoKm', label: 'Puerto' },
];

/** Normaliza el Json `distancias` al borrador editable. */
export function distanciasDe(raw: unknown): DistanciasHospedaje {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DISTANCIAS_VACIAS };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): string => {
    const n = Number(v);
    return typeof v !== 'undefined' && v !== null && v !== '' && Number.isFinite(n) && n >= 0 ? String(n) : '';
  };
  return {
    aeropuertoKm: num(o.aeropuertoKm),
    autobusKm: num(o.autobusKm),
    metroKm: num(o.metroKm),
    trenKm: num(o.trenKm),
    autopistaKm: num(o.autopistaKm),
    puertoKm: num(o.puertoKm),
    unidad: o.unidad === 'millas' ? 'millas' : 'km',
  };
}

/** Indicaciones de llegada multi-idioma: Record<idioma, texto>. */
export type IndicacionesHospedaje = Record<string, string>;

/** Normaliza el Json `indicaciones` al borrador: solo textos no vacíos. */
export function indicacionesDe(raw: unknown): IndicacionesHospedaje {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const salida: IndicacionesHospedaje = {};
  for (const [idioma, texto] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof idioma === 'string' && idioma.trim() && typeof texto === 'string' && texto.trim()) {
      salida[idioma.trim().slice(0, 8)] = texto;
    }
  }
  return salida;
}

/** ¿Hay alguna distancia declarada? (para no escribir JSON vacío). */
export function hayDistancias(d: DistanciasHospedaje): boolean {
  return DISTANCIAS_CATALOGO.some(({ key }) => d[key].trim() !== '');
}

/**
 * Payload del PATCH: solo los campos que la API ya acepta. `fotos` sale
 * siempre (el editor es su dueño) con la portada marcada en la foto elegida.
 */
export function payloadDesdeBorradorHospedaje(d: DraftHospedaje): Record<string, unknown> {
  return {
    nombre: d.nombre,
    descripcion: d.descripcion || null,
    codigo: d.codigo || null,

    direccion: d.direccion || null,
    ciudad: d.ciudad || null,
    estadoProvincia: d.estadoProvincia || null,
    pais: d.pais || null,
    cp: d.cp || null,
    zona: d.zona || null,
    latitud: numero(d.lat) ?? null,
    longitud: numero(d.lng) ?? null,

    fotos: d.fotos.map((f) => ({
      url: f.url,
      ...(f.titulo && f.titulo.length > 0 ? { titulo: f.titulo } : {}),
      ...(f.portada ? { portada: true } : {}),
    })),

    timezone: d.timezone,
    estado: d.estado,
    politicaNoShow: d.politicaNoShow,
    politicaSalidaAnticipada: d.politicaSalidaAnticipada,
    holdHoras: enteroNoNegativo(d.holdHoras) ?? 24,

    ...(d.sesCodigo || d.sesMunicipio
      ? {
          sesHospedajes: {
            ...(d.sesCodigo ? { codigoEstablecimiento: d.sesCodigo } : {}),
            ...(d.sesMunicipio ? { municipioIne: d.sesMunicipio } : {}),
          },
        }
      : {}),

    ...(d.detalle.servicios.length > 0
      ? { detalleAlojamiento: { servicios: d.detalle.servicios } }
      : { detalleAlojamiento: null }),

    ...(hayDistancias(d.distancias)
      ? {
          distancias: {
            ...Object.fromEntries(
              DISTANCIAS_CATALOGO.filter(({ key }) => d.distancias[key].trim() !== '').map(({ key }) => [
                key,
                Number(d.distancias[key]),
              ])
            ),
            unidad: d.distancias.unidad,
          },
        }
      : { distancias: null }),

    ...(Object.keys(d.indicaciones).length > 0
      ? { indicaciones: d.indicaciones }
      : { indicaciones: null }),

    mapaPersonalizadoUrl: d.mapaPersonalizadoUrl || null,
  };
}

/** ¿Hay algo declarado en el detalle del complejo? (para no escribir JSON vacío). */
export function hayDetalle(d: DetalleAlojamiento): boolean {
  return d.servicios.length > 0;
}

// ─── Fotos de la tarjeta de la Vista global ─────────────────────────────

/** Miniatura segura para la tarjeta de fotos: URL válida, sin portada. */
export interface MiniaturaHospedaje {
  url: string;
  titulo?: string;
}

/** Fotos con URL válida, normalizadas desde strings u objetos ricos. */
interface FotoNormalizadaHospedaje {
  url: string;
  titulo?: string;
  portada?: boolean;
}

function fotosValidasHospedaje(fotos: unknown): FotoNormalizadaHospedaje[] {
  const salida: FotoNormalizadaHospedaje[] = [];
  if (!Array.isArray(fotos)) return salida;
  for (const f of fotos) {
    if (typeof f === 'string') {
      if (f.length > 0) salida.push({ url: f });
    } else if (f !== null && typeof f === 'object' && 'url' in f) {
      const url = (f as { url?: unknown }).url;
      if (typeof url !== 'string' || url.length === 0) continue;
      const titulo = (f as { titulo?: unknown }).titulo;
      const portada = (f as { portada?: unknown }).portada;
      salida.push({
        url,
        ...(typeof titulo === 'string' && titulo.length > 0 ? { titulo } : {}),
        ...(portada === true ? { portada: true } : {}),
      });
    }
  }
  return salida;
}

/**
 * Miniaturas de la tarjeta de fotos de la Vista global: primeras fotos válidas
 * (la portada —la primera— incluida), limitadas a `max`.
 */
export function miniaturasHospedaje(fotos: unknown, max = 4): MiniaturaHospedaje[] {
  return fotosValidasHospedaje(fotos)
    .slice(0, max)
    .map(({ url, titulo }) => (titulo ? { url, titulo } : { url }));
}

/**
 * Portada para el fondo de la tarjeta de fotos: la foto marcada como portada
 * o, si no hay marca, la primera válida. `null` si no hay fotos.
 */
export function portadaHospedaje(fotos: unknown): MiniaturaHospedaje | null {
  const validas = fotosValidasHospedaje(fotos);
  if (validas.length === 0) return null;
  const elegida = validas.find((f) => f.portada === true) ?? validas[0];
  return elegida.titulo ? { url: elegida.url, titulo: elegida.titulo } : { url: elegida.url };
}

/**
 * URLs de las fotos, con la portada DELANTE.
 *
 * Es el lector de `fotos` de las superficies públicas (Booking Engine y su
 * embed): el Json guarda la forma rica del editor —`{ url, titulo?, portada? }`,
 * que es la que escribe `payloadDesdeBorradorHospedaje`— y las URLs sueltas de
 * los clientes antiguos. Un lector que solo entienda strings deja la galería
 * vacía con las fotos del editor dentro, que es exactamente cómo se quedó sin
 * portada la página de reservas.
 *
 * Devuelve solo URLs (el título no viaja: la web pública no lo enseña) y en el
 * orden en que se ven: primero la marcada como portada y, si no hay marca, la
 * primera, el mismo criterio que `portadaHospedaje` usa en el panel. Así el
 * `fotos[0]` que leen la galería y las tarjetas de unidad es de verdad la
 * portada del hotel.
 *
 * Lo que no es una URL con contenido se cae —y se le quitan los espacios de los
 * bordes, como en el alta de unidades—: un `null`, un objeto sin `url` o una URL
 * en blanco no pueden llegar a un `src` y dejar la imagen rota delante del
 * huésped.
 */
export function urlsFotosHospedaje(fotos: unknown): string[] {
  const validas = fotosValidasHospedaje(fotos)
    .map((f) => ({ ...f, url: f.url.trim() }))
    .filter((f) => f.url.length > 0);
  if (validas.length === 0) return [];
  const portada = validas.find((f) => f.portada === true);
  if (!portada) return validas.map((f) => f.url);
  return [portada.url, ...validas.filter((f) => f !== portada).map((f) => f.url)];
}

/**
 * Reordena fotos moviendo la de `desde` a `hasta` (índices sobre el array
 * completo, incluida la portada). Índices inválidos o iguales: copia intacta.
 */
export function reordenarFotosHospedaje<T>(
  fotos: readonly T[],
  desde: number,
  hasta: number
): T[] {
  if (!Array.isArray(fotos)) return [];
  const n = fotos.length;
  if (
    !Number.isInteger(desde) ||
    !Number.isInteger(hasta) ||
    desde < 0 ||
    hasta < 0 ||
    desde >= n ||
    hasta >= n ||
    desde === hasta
  ) {
    return [...fotos];
  }
  const copia = [...fotos];
  const [movida] = copia.splice(desde, 1);
  copia.splice(hasta, 0, movida);
  return copia;
}

/** Resumen textual de la tarjeta de fotos: «3 fotos · portada asignada». */
export function resumenFotosHospedaje(fotos: unknown): string {
  const total = contarFotosHospedaje(fotos);
  if (total === 0) return 'Sin fotos';
  const portada =
    Array.isArray(fotos) &&
    fotos.some(
      (f) => f && typeof f === 'object' && 'portada' in f && (f as { portada?: unknown }).portada === true
    );
  return `${total} ${total === 1 ? 'foto' : 'fotos'}${portada ? ' · portada asignada' : ''}`;
}

/** Proyección del borrador para las reglas de completado. */
export interface EstadoHospedajeIn {
  nombre?: string | null;
  descripcion?: string | null;
  fotos?: unknown;
  direccion?: string | null;
  ciudad?: string | null;
  pais?: string | null;
  units?: UnidadWire[] | null;
  timezone?: string | null;
  politicaNoShow?: string | null;
  politicaSalidaAnticipada?: string | null;
  holdHoras?: number | string | null;
  sesCodigo?: string | null;
  servicios?: string[] | null;
}

// ─── Estado de completado ────────────────────────────────────────────────────

/** Número de fotos válidas de `fotos` (URLs sueltas u objetos `{ url }`). */
export function contarFotosHospedaje(fotos: unknown): number {
  if (!Array.isArray(fotos)) return 0;
  return fotos.filter((f) => {
    if (typeof f === 'string') return f.length > 0;
    if (f && typeof f === 'object' && 'url' in f) {
      const url = (f as { url?: unknown }).url;
      return typeof url === 'string' && url.length > 0;
    }
    return false;
  }).length;
}

/**
 * ¿Está completa cada sección? El criterio es «publicable», no exhaustivo:
 * una propiedad con ciudad pero sin coordenadas cuenta como ubicada.
 */
export function estadoSeccionesHospedaje(
  p: EstadoHospedajeIn
): Record<SeccionHospedaje, boolean> {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
  return {
    global: Boolean(
      texto(p.nombre) &&
        texto(p.descripcion) &&
        (p.units?.length ?? 0) > 0
    ),
    descripcion: Boolean(texto(p.nombre) && texto(p.descripcion)),
    fotos: contarFotosHospedaje(p.fotos) > 0,
    ubicacion: Boolean(texto(p.ciudad) || texto(p.direccion)),
    unidades: (p.units?.length ?? 0) > 0,
    operacion:
      Boolean(texto(p.timezone)) &&
      Boolean(texto(p.politicaNoShow)) &&
      Boolean(texto(p.politicaSalidaAnticipada)) &&
      numero(String(p.holdHoras ?? '')) !== undefined,
    cumplimiento: Boolean(texto(p.sesCodigo)),
  };
}

/**
 * Suma de los contadores de un mapa de habitaciones/camas (proyección de
 * tarjeta o agregado). Útil para la tarjeta de la Vista global («3 camas»). */
export function sumarContadores(detalle: Record<string, number> | null | undefined): number {
  if (!detalle || typeof detalle !== 'object') return 0;
  return Object.values(detalle).reduce((acc, n) => acc + (Number(n) || 0), 0);
}

/** Progreso global en porcentaje entero 0–100. */
export function progresoHospedaje(p: EstadoHospedajeIn): number {
  const estado = estadoSeccionesHospedaje(p);
  const claves = Object.keys(estado) as SeccionHospedaje[];
  const completas = claves.filter((k) => estado[k]).length;
  return Math.round((completas / claves.length) * 100);
}

/** Portada = mover la foto elegida al frente. */
export function hacerPortadaHospedaje(
  fotos: FotoHospedaje[],
  indice: number
): FotoHospedaje[] {
  if (indice <= 0 || indice >= fotos.length) return fotos;
  const copia = [...fotos];
  const [foto] = copia.splice(indice, 1);
  return [foto, ...copia];
}

// ─── Catálogos de la sección Operación ───────────────────────────────────────

export const POLITICAS_NO_SHOW: readonly { value: string; label: string }[] = [
  { value: 'ninguna', label: 'Ninguna' },
  { value: 'primera_noche', label: 'Primera noche' },
  { value: 'estancia_completa', label: 'Estancia completa' },
];

export const POLITICAS_SALIDA: readonly { value: string; label: string }[] = [
  { value: 'cerrar_estancia', label: 'Cerrar estancia (libera noches no usadas)' },
  { value: 'salida_real', label: 'Salida real (conserva noches vendidas)' },
];

export const ESTADOS_PROPERTY: readonly { value: string; label: string }[] = [
  { value: 'activa', label: 'Activa' },
  { value: 'inactiva', label: 'Inactiva' },
];

// ─── Unidades desde la Vista global ─────────────────────────────────────────

/** Estados operativos de una unidad, tal como los lista la portada. */
export const ESTADOS_UNIDAD_HOSPEDAJE: readonly { value: string; label: string }[] = [
  { value: 'available', label: 'Disponible' },
  { value: 'occupied', label: 'Ocupada' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'dirty', label: 'Sucia' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'out_of_service', label: 'Fuera de servicio' },
];

/** Tipos de unidad del alta rápida y de la portada. */
export const TIPOS_UNIDAD_HOSPEDAJE: readonly string[] = [
  'apartamento',
  'habitacion',
  'casa',
  'villa',
  'estudio',
  'loft',
  'bungalow',
  'otro',
];

/** Ficha de unidad para la lista del modal de la Vista global. */
export interface FormUnidadWire {
  id: string;
  nombre: string;
  codigo?: string;
  tipo?: string;
  capacidad?: number;
  estado?: string;
}

/** Borrador del formulario de unidad del modal de la Vista global. */
export interface FormUnidadHospedaje {
  nombre: string;
  codigo: string;
  tipo: string;
  capacidad: string;
  estado: string;
}

export const FORM_UNIDAD_VACIO: FormUnidadHospedaje = {
  nombre: '',
  codigo: '',
  tipo: 'apartamento',
  capacidad: '2',
  estado: 'available',
};

/**
 * Ficha de una unidad de la lista desde la fila de la API: los campos que el
 * modal de la Vista global muestra y edita. `null` = unidad inválida.
 */
export function fichaUnidadDeWire(u: unknown): FormUnidadWire | null {
  if (!u || typeof u !== 'object') return null;
  const o = u as Record<string, unknown>;
  const id = o.id;
  const nombre = o.nombre;
  if (typeof id !== 'string' || typeof nombre !== 'string' || !nombre.trim()) return null;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  const capacidad = num(o.capacidad);
  const estado = texto(o.estado);
  return {
    id,
    nombre: nombre.trim(),
    ...(typeof o.codigo === 'string' && o.codigo.trim() ? { codigo: o.codigo.trim() } : {}),
    ...(typeof o.tipo === 'string' && o.tipo ? { tipo: o.tipo } : {}),
    ...(capacidad != null ? { capacidad } : {}),
    ...(estado ? { estado } : {}),
  };
}

/** Payload del POST/PATCH de una unidad desde el formulario del modal. */
export function payloadUnidadHospedaje(
  f: FormUnidadHospedaje,
  propertyId: string
): Record<string, unknown> | null {
  const nombre = f.nombre.trim();
  if (!nombre) return null;
  const capacidad = parseInt(f.capacidad, 10);
  return {
    propertyId,
    nombre,
    codigo: f.codigo.trim() || undefined,
    tipo: f.tipo,
    capacidad: Number.isFinite(capacidad) && capacidad > 0 ? capacidad : 2,
    estado: f.estado,
  };
}

// ─── Catálogos de la Vista global (modales de detalle) ───────────────────────

/**
 * Proyección por tipo de los pares `[id, n]` de un agregado/detalle de
 * unidades, en el orden del catálogo. Los sufijos `-Hospedaje` se mantienen
 * por compatibilidad con quienes ya los consumían; ahora la entrada es el
 * AGREGADO de unidades (o el detalle de una unidad), no la distribución de la
 * propiedad.
 */
export function detalleHabitacionesHospedaje(
  detalle: DetalleUnidad | null | undefined
): Array<readonly [string, number]> | null {
  return paresPorTipo(detalle?.habitaciones, HABITACIONES_GRUPOS_HOSPEDAJE.flatMap((g) => g.items));
}

export function detalleCamasHospedaje(
  detalle: DetalleUnidad | null | undefined
): Array<readonly [string, number]> | null {
  return paresPorTipo(detalle?.camas, CAMAS_CATALOGO_HOSPEDAJE);
}

function paresPorTipo(
  contadores: Record<string, number> | undefined,
  catalogo: readonly { id: string; label: string }[]
): Array<readonly [string, number]> | null {
  if (!contadores) return null;
  const pares = catalogo
    .map((c) => [c.id, contadores[c.id] ?? 0] as const)
    .filter((p): p is readonly [string, number] => p[1] > 0);
  return pares.length > 0 ? pares : null;
}

export interface HabitacionHospedajeCatalogo {
  id: string;
  label: string;
}

export interface GrupoHabitacionesHospedaje {
  titulo: string;
  items: readonly HabitacionHospedajeCatalogo[];
}

/**
 * Habitaciones que puede declarar el establecimiento, agrupadas en privadas y
 * compartidas. Mismo catálogo que Real Estate: los ids son las claves del
 * mapa `habitaciones` del Json `detalleAlojamiento`.
 */
export const HABITACIONES_GRUPOS_HOSPEDAJE: readonly GrupoHabitacionesHospedaje[] = [
  {
    titulo: 'Privada',
    items: [
      { id: 'balcon', label: 'Balcón' },
      { id: 'bano', label: 'Baño' },
      { id: 'dormitorio', label: 'Dormitorio' },
      { id: 'comedor', label: 'Comedor' },
      { id: 'cocina', label: 'Cocina' },
      { id: 'salon', label: 'Salón' },
      { id: 'sala_juegos', label: 'Sala de Juegos' },
      { id: 'terraza', label: 'Terraza' },
      { id: 'wc', label: 'WC' },
      { id: 'despacho', label: 'Despacho' },
    ],
  },
  {
    titulo: 'Compartida',
    items: [
      { id: 'bano_compartido', label: 'Baño compartido' },
      { id: 'cocina_compartida', label: 'Cocina compartida' },
      { id: 'salon_compartido', label: 'Salón compartido' },
      { id: 'terraza_compartida', label: 'Terraza compartida' },
      { id: 'lavadero_compartido', label: 'Lavadero compartido' },
    ],
  },
];

/** Tipos de cama para la distribución (`camas` del detalle). */
export const CAMAS_CATALOGO_HOSPEDAJE: readonly HabitacionHospedajeCatalogo[] = [
  { id: 'cuna', label: 'Cuna' },
  { id: 'cama_nino', label: 'Cama para niño' },
  { id: 'cama_doble', label: 'Cama doble' },
  { id: 'cama_plegable', label: 'Cama plegable' },
  { id: 'cama_extragrande', label: 'Cama de matrimonio extragrande' },
  { id: 'cama_altillo', label: 'Cama en altillo' },
  { id: 'cama_grande', label: 'Cama matrimonial grande' },
  { id: 'sofa_cama', label: 'Sofá cama' },
  { id: 'cama_individual', label: 'Cama individual' },
];

/** Servicio del catálogo con badge opcional de portal. */
export interface ServicioHospedajeCatalogo {
  id: string;
  label: string;
  /** Portal(es) que lo piden: badge en el selector. */
  airbnb?: boolean;
  booking?: boolean;
}

export interface GrupoServiciosHospedaje {
  id: string;
  titulo: string;
  items: readonly ServicioHospedajeCatalogo[];
}

/**
 * Servicios y equipamiento del alojamiento, con el badge de portales del
 * diseño de referencia (⌂ Airbnb / ⚡ Booking). «Popular» va primero.
 */
export const SERVICIOS_GRUPOS_HOSPEDAJE: readonly GrupoServiciosHospedaje[] = [
  {
    id: 'popular',
    titulo: 'Popular',
    items: [
      { id: 'wifi', label: 'Internet WiFi', airbnb: true, booking: true },
      { id: 'tv', label: 'TV', airbnb: true },
      { id: 'aire_acondicionado', label: 'Aire acondicionado', airbnb: true, booking: true },
      { id: 'calefaccion', label: 'Calefacción', booking: true },
      { id: 'cocina_equipada', label: 'Cocina', airbnb: true, booking: true },
      { id: 'lavadora', label: 'Lavadora', airbnb: true },
      { id: 'aparcamiento', label: 'Plaza de aparcamiento', airbnb: true, booking: true },
      { id: 'piscina', label: 'Piscina', airbnb: true, booking: true },
      { id: 'jacuzzi', label: 'Jacuzzi', booking: true },
      { id: 'mascotas', label: 'Se permiten mascotas', airbnb: true },
    ],
  },
  {
    id: 'bano_lavanderia',
    titulo: 'Baño y lavandería',
    items: [
      { id: 'secadora', label: 'Secadora' },
      { id: 'plancha', label: 'Plancha' },
      { id: 'toallas', label: 'Toallas', airbnb: true },
      { id: 'jabon_manos', label: 'Jabón de manos' },
      { id: 'secador_pelo', label: 'Secador de pelo', airbnb: true },
    ],
  },
  {
    id: 'entretenimiento',
    titulo: 'Entretenimiento',
    items: [
      { id: 'tv_cable', label: 'TV por cable' },
      { id: 'libros', label: 'Libros' },
      { id: 'juegos_mesa', label: 'Juegos de mesa' },
      { id: 'equipo_musica', label: 'Equipo de música' },
    ],
  },
  {
    id: 'clima',
    titulo: 'Calefacción y refrigeración',
    items: [
      { id: 'ventilador', label: 'Ventilador' },
      { id: 'chimenea', label: 'Chimenea', airbnb: true },
    ],
  },
  {
    id: 'seguridad',
    titulo: 'Seguridad del hogar',
    items: [
      { id: 'detector_humo', label: 'Detector de humo', airbnb: true },
      { id: 'botiquin', label: 'Botiquín', airbnb: true },
      { id: 'extintor', label: 'Extintor', airbnb: true },
    ],
  },
  {
    id: 'oficina',
    titulo: 'Oficina con Internet',
    items: [
      { id: 'zona_trabajo', label: 'Zona de trabajo', airbnb: true },
      { id: 'monitor', label: 'Monitor' },
      { id: 'escritorio', label: 'Escritorio' },
    ],
  },
  {
    id: 'cocina',
    titulo: 'Cocina y comedor',
    items: [
      { id: 'nevera', label: 'Nevera' },
      { id: 'microondas', label: 'Microondas' },
      { id: 'lavavajillas', label: 'Lavavajillas' },
      { id: 'cafetera', label: 'Cafetera' },
      { id: 'utensilios', label: 'Utensilios de cocina' },
    ],
  },
  {
    id: 'ubicacion',
    titulo: 'Características de la ubicación',
    items: [
      { id: 'entrada_privada', label: 'Entrada privada' },
      { id: 'vista_mar', label: 'Vista al mar', booking: true },
      { id: 'vista_montana', label: 'Vista a la montaña' },
      { id: 'primera_linea', label: 'Primera línea' },
    ],
  },
  {
    id: 'instalaciones',
    titulo: 'Aparcamiento e instalaciones',
    items: [
      { id: 'aparcamiento_gratuito', label: 'Aparcamiento gratuito', booking: true },
      { id: 'garaje', label: 'Garaje' },
      { id: 'ascensor', label: 'Ascensor', booking: true },
      { id: 'jardin', label: 'Jardín', airbnb: true },
      { id: 'terraza_prop', label: 'Terraza', airbnb: true },
      { id: 'balcon_prop', label: 'Balcón' },
    ],
  },
  {
    id: 'politicas',
    titulo: 'Políticas',
    items: [
      { id: 'no_fumadores', label: 'No fumadores', airbnb: true, booking: true },
      { id: 'eventos', label: 'Apto para eventos' },
      { id: 'ninos', label: 'Admite niños' },
    ],
  },
  {
    id: 'piscina_spa',
    titulo: 'Piscina y spa',
    items: [
      { id: 'sauna', label: 'Sauna' },
      { id: 'gimnasio', label: 'Gimnasio', booking: true },
    ],
  },
  {
    id: 'servicios_extra',
    titulo: 'Servicios',
    items: [
      { id: 'limpieza', label: 'Limpieza incluida', booking: true },
      { id: 'conserje', label: 'Conserje' },
      { id: 'checkin_autonomo', label: 'Check-in autónomo', airbnb: true, booking: true },
      { id: 'desayuno', label: 'Desayuno', booking: true },
    ],
  },
];

/** Todos los servicios en una lista plana (para buscadores y validaciones). */
export const SERVICIOS_TODOS_HOSPEDAJE: readonly ServicioHospedajeCatalogo[] =
  SERVICIOS_GRUPOS_HOSPEDAJE.flatMap((g) => g.items);

/** Ficha de un servicio por id, o `undefined` si no existe en el catálogo. */
export function infoServicioHospedaje(id: string): ServicioHospedajeCatalogo | undefined {
  return SERVICIOS_TODOS_HOSPEDAJE.find((s) => s.id === id);
}

/** Ficha de una habitación por id en su grupo, o `undefined`. */
export function infoHabitacionHospedaje(id: string): HabitacionHospedajeCatalogo | undefined {
  return HABITACIONES_GRUPOS_HOSPEDAJE.flatMap((g) => g.items).find((h) => h.id === id);
}

/** Ficha de una cama por id, o `undefined`. */
export function infoCamaHospedaje(id: string): HabitacionHospedajeCatalogo | undefined {
  return CAMAS_CATALOGO_HOSPEDAJE.find((c) => c.id === id);
}

/** Etiqueta de un tipo de habitación o cama (ambos catálogos), o el id si no existe. */
export function labelDeHabitacionHospedaje(id: string): string {
  return infoHabitacionHospedaje(id)?.label ?? infoCamaHospedaje(id)?.label ?? id;
}

// ─── Editor de unidad por secciones ──────────────────────────────────────────

/**
 * El reencuadre (migración 20261006120000) puso la distribución del
 * alojamiento en cada unidad: estas piezas portan a la UNIDAD la misma
 * experiencia guiada que tiene la propiedad (secciones con estado, progreso y
 * vista global con tarjetas resumen). Puro y sin Prisma, como el resto del
 * módulo, para que lo use el navegador y los tests sin arrastrar la BD.
 */

/** Secciones del editor de unidad. */
export type SeccionUnidadHospedaje =
  | 'general'
  | 'basico'
  | 'espacio'
  | 'amenidades'
  | 'fotos'
  | 'tarifas';

export interface SeccionUnidadHospedajeInfo {
  id: SeccionUnidadHospedaje;
  grupo: string;
  label: string;
}

/** Secciones del editor de unidad, en orden de presentación. */
export const SECCIONES_UNIDAD_HOSPEDAJE: readonly SeccionUnidadHospedajeInfo[] = [
  { id: 'general', grupo: 'Vista global', label: 'Vista global' },
  { id: 'basico', grupo: 'Detalles de la unidad', label: 'Nombre y descripción' },
  { id: 'espacio', grupo: 'Detalles de la unidad', label: 'Habitaciones y camas' },
  { id: 'amenidades', grupo: 'Detalles de la unidad', label: 'Amenidades' },
  { id: 'fotos', grupo: 'Detalles de la unidad', label: 'Fotos' },
  { id: 'tarifas', grupo: 'Configuración de reserva', label: 'Tarifa y estado' },
];

/** Primera sección del editor de unidad: la Vista global. */
export const PRIMERA_SECCION_UNIDAD: SeccionUnidadHospedaje = 'general';

/** Unidad tal como la devuelven `/api/hospitality/units` y `/units/[id]`. */
export interface UnitWireFull {
  id: string;
  propertyId: string;
  nombre: string;
  codigo?: string | null;
  tipo?: string | null;
  capacidad?: number | null;
  tarifaBase?: number | null;
  moneda?: string | null;
  descripcion?: string | null;
  /** La API guarda URLs sueltas (string[]); un objeto { url } de clientes ricos aporta la URL. */
  fotos?: unknown;
  amenidades?: unknown;
  /** Detalle declarado de ESTA unidad: habitaciones y camas (módulo unit-detalle). */
  detalleAlojamiento?: unknown;
  estado?: string | null;
  property?: { id?: string; nombre?: string } | null;
}

/** URLs de fotos de una unidad, saneadas desde strings u objetos `{ url }`. */
export function fotosUnidadDe(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const salida: string[] = [];
  for (const f of raw) {
    if (typeof f === 'string') {
      if (f.length > 0) salida.push(f);
    } else if (f && typeof f === 'object' && 'url' in f) {
      const url = (f as { url?: unknown }).url;
      if (typeof url === 'string' && url.length > 0) salida.push(url);
    }
  }
  return salida;
}

/** Amenidades de una unidad saneadas: strings no vacíos, sin duplicados. */
export function amenidadesUnidadDe(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const salida: string[] = [];
  for (const a of raw) {
    if (typeof a === 'string' && a.trim().length > 0 && !salida.includes(a)) salida.push(a);
  }
  return salida;
}

/** Borrador editable de una unidad (inputs como strings, como el de propiedad). */
export interface DraftUnidadHospedaje {
  nombre: string;
  codigo: string;
  tipo: string;
  descripcion: string;
  capacidad: string;
  estado: string;
  tarifaBase: string;
  moneda: string;
  amenidades: string[];
  fotos: string[];
  /** Distribución de ESTA unidad: contadores por id de catálogo. */
  habitaciones: Record<string, number>;
  camas: Record<string, number>;
}

/** Convierte la unidad de la API en borrador editable. */
export function borradorDesdeUnidad(u: UnitWireFull): DraftUnidadHospedaje {
  const detalle = normalizarDetalleUnidad(u.detalleAlojamiento);
  return {
    nombre: u.nombre || '',
    codigo: u.codigo || '',
    tipo: u.tipo || 'apartamento',
    descripcion: u.descripcion || '',
    capacidad: u.capacidad != null ? String(u.capacidad) : '2',
    estado: u.estado || 'available',
    tarifaBase: u.tarifaBase != null ? String(u.tarifaBase) : '',
    moneda: u.moneda || MONEDA_PLATAFORMA,
    amenidades: amenidadesUnidadDe(u.amenidades),
    fotos: fotosUnidadDe(u.fotos),
    habitaciones: detalle?.habitaciones ?? {},
    camas: detalle?.camas ?? {},
  };
}

/** ¿Hay algo declarado en la distribución de la unidad? (vacío → JSONB null). */
export function hayEspacioUnidad(
  d: Pick<DraftUnidadHospedaje, 'habitaciones' | 'camas'>
): boolean {
  return sumarContadores(d.habitaciones) > 0 || sumarContadores(d.camas) > 0;
}

/**
 * Payload del PATCH de la unidad desde el borrador: mismas decisiones que la
 * portada (vacío limpia: descripción → null, tarifa inválida → null, detalle
 * vacío → null; la API normaliza y audita). Sin `propertyId`: no se mueve
 * la unidad de propiedad desde el editor guiado.
 */
export function payloadDesdeBorradorUnidad(d: DraftUnidadHospedaje): Record<string, unknown> {
  const capacidad = Number(d.capacidad);
  const tarifa = d.tarifaBase.trim() === '' ? NaN : Number(d.tarifaBase);
  return {
    nombre: d.nombre.trim(),
    codigo: d.codigo.trim() || null,
    tipo: d.tipo,
    descripcion: d.descripcion.trim() ? d.descripcion.trim() : null,
    capacidad: Number.isFinite(capacidad) && capacidad > 0 ? Math.floor(capacidad) : 2,
    estado: d.estado,
    tarifaBase: Number.isFinite(tarifa) && tarifa >= 0 ? tarifa : null,
    moneda: d.moneda,
    amenidades: d.amenidades,
    fotos: d.fotos,
    detalleAlojamiento: hayEspacioUnidad(d)
      ? { habitaciones: d.habitaciones, camas: d.camas }
      : null,
  };
}

/** ¿Está completa cada sección? Criterio «publicable», como en la propiedad. */
export function estadoSeccionesUnidadHospedaje(
  d: Pick<
    DraftUnidadHospedaje,
    'nombre' | 'descripcion' | 'habitaciones' | 'camas' | 'amenidades' | 'fotos' | 'tarifaBase'
  >
): Record<SeccionUnidadHospedaje, boolean> {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
  const tarifa = Number(d.tarifaBase);
  return {
    // La vista global exige lo mínimo vendible: identidad y algo de espacio.
    general: Boolean(texto(d.nombre) && texto(d.descripcion) && hayEspacioUnidad(d)),
    basico: Boolean(texto(d.nombre) && texto(d.descripcion)),
    espacio: hayEspacioUnidad(d),
    amenidades: (d.amenidades?.length ?? 0) > 0,
    fotos: (d.fotos?.length ?? 0) > 0,
    tarifas: Number.isFinite(tarifa) && tarifa > 0,
  };
}

/** Progreso de la unidad en porcentaje entero 0–100. */
export function progresoUnidadHospedaje(
  d: Parameters<typeof estadoSeccionesUnidadHospedaje>[0]
): number {
  const estado = estadoSeccionesUnidadHospedaje(d);
  const claves = Object.keys(estado) as SeccionUnidadHospedaje[];
  const completas = claves.filter((k) => estado[k]).length;
  return Math.round((completas / claves.length) * 100);
}

/** Resumen de la tarjeta de habitaciones: «Sin configurar» / «2 habitaciones». */
export function resumenHabitacionesUnidad(
  d: Pick<DraftUnidadHospedaje, 'habitaciones'>
): string {
  const n = sumarContadores(d.habitaciones);
  if (n === 0) return 'Sin configurar';
  return `${n} ${n === 1 ? 'habitación' : 'habitaciones'}`;
}

/** Resumen de la tarjeta de camas: «1 Cama doble, 2 Camas individuales». */
export function resumenCamasUnidad(d: Pick<DraftUnidadHospedaje, 'camas'>): string {
  const camas = d.camas ?? {};
  const total = sumarContadores(camas);
  if (total === 0) return 'Sin configurar';
  const partes = CAMAS_CATALOGO_HOSPEDAJE.filter((c) => (camas[c.id] ?? 0) > 0).map(
    (c) => `${camas[c.id]} ${c.label.toLowerCase()}`
  );
  return partes.length > 0 ? partes.join(', ') : `${total} cama(s)`;
}

/** Resumen de la tarjeta de amenidades: «Sin configurar» / «5 amenidades». */
export function resumenAmenidadesUnidad(
  d: Pick<DraftUnidadHospedaje, 'amenidades'>
): string {
  const n = d.amenidades?.length ?? 0;
  if (n === 0) return 'Sin configurar';
  return `${n} ${n === 1 ? 'amenidad' : 'amenidades'}`;
}

/** Resumen de la tarjeta de tarifa: «200 EUR / noche · Disponible». */
export function resumenTarifaUnidad(
  d: Pick<DraftUnidadHospedaje, 'tarifaBase' | 'moneda' | 'estado'>
): string {
  const tarifa = Number(d.tarifaBase);
  const estadoLabel =
    ESTADOS_UNIDAD_HOSPEDAJE.find((e) => e.value === d.estado)?.label ?? d.estado ?? '';
  const parteTarifa =
    d.tarifaBase.trim() !== '' && Number.isFinite(tarifa) && tarifa > 0
      ? `${tarifa} ${d.moneda} / noche`
      : 'Sin tarifa';
  return estadoLabel ? `${parteTarifa} · ${estadoLabel}` : parteTarifa;
}

/**
 * Amenidades seleccionables de una unidad (las de la portada, elevadas aquí
 * para que el editor guiado y la portada no deriven en catálogos distintos).
 */
export const AMENIDADES_UNIDAD_CATALOGO: readonly string[] = [
  'Wifi',
  'Aire acondicionado',
  'Alberca',
  'Jacuzzi',
  'Cocina completa',
  'Lavadora',
  'Estacionamiento',
  'TV cable',
  'Vista al mar',
  'Terraza',
  'Parrilla',
  'Gym',
  'Pet friendly',
  'Cuna',
  'Caja fuerte',
  'Escritorio',
];

/** Divisas del selector de tarifa de la unidad: las MISMAS que permite `lib/moneda`,
 *  tomadas de ahí en vez de repetidas (una lista paralela se desincroniza sola). */
export const MONEDAS_UNIDAD_CATALOGO: readonly string[] = MONEDAS_SELECCIONABLES;
