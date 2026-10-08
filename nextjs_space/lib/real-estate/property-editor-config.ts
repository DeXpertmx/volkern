/**
 * Volkern Real Estate — Configuración del editor de propiedades por secciones.
 *
 * Reorganiza la ficha del inmueble al estilo de un editor guiado: una barra
 * lateral con secciones agrupadas y el estado de completado de cada una, y un
 * panel principal por sección. Todo lo que vive aquí es puro y no toca Prisma,
 * para que lo use el navegador y los tests sin arrastrar la base de datos.
 *
 * Los datos nuevos (habitaciones, camas, servicios) se guardan en
 * `customFieldValues` como JSONB, igual que el resto de campos inmobiliarios:
 * `habitaciones_detalle`, `camas_detalle` y `servicios`.
 */

// ─── Tipos base ───────────────────────────────────────────────────────────────

export type GrupoEditor = 'detalles' | 'reserva' | 'canales';

/** Secciones del editor con estado de completado (todas menos las de canales). */
export type SeccionConEstado =
  | 'descripcion'
  | 'fotos'
  | 'ubicacion'
  | 'contacto'
  | 'habitaciones'
  | 'equipamiento'
  | 'precios'
  | 'disponibilidad'
  | 'cumplimiento';

export type SeccionId = SeccionConEstado | 'sincronizacion';

export interface GrupoInfo {
  id: GrupoEditor;
  label: string;
}

/** Orden y rótulos de los grupos de la barra lateral. */
export const GRUPOS_EDITOR: readonly GrupoInfo[] = [
  { id: 'detalles', label: 'Detalles del alojamiento' },
  { id: 'reserva', label: 'Configuración de reserva' },
  { id: 'canales', label: 'Canales' },
];

export interface SeccionInfo {
  id: SeccionId;
  grupo: GrupoEditor;
  label: string;
}

/** Secciones del editor, en el orden en que se muestran. */
export const SECCIONES_EDITOR: readonly SeccionInfo[] = [
  { id: 'descripcion', grupo: 'detalles', label: 'Descripción general' },
  { id: 'fotos', grupo: 'detalles', label: 'Fotos' },
  { id: 'ubicacion', grupo: 'detalles', label: 'Ubicación' },
  { id: 'contacto', grupo: 'detalles', label: 'Contacto' },
  { id: 'habitaciones', grupo: 'detalles', label: 'Habitaciones y camas' },
  { id: 'equipamiento', grupo: 'detalles', label: 'Servicios y equipamiento' },
  { id: 'precios', grupo: 'reserva', label: 'Precios' },
  { id: 'disponibilidad', grupo: 'reserva', label: 'Disponibilidad' },
  { id: 'cumplimiento', grupo: 'reserva', label: 'Cumplimiento' },
  { id: 'sincronizacion', grupo: 'canales', label: 'Sincronizar ajustes' },
];

/** Ficha de una sección por id, o `undefined` si no existe. */
export function infoSeccion(id: string): SeccionInfo | undefined {
  return SECCIONES_EDITOR.find((s) => s.id === id);
}

/** Primera sección del editor: punto de entrada por defecto. */
export const PRIMERA_SECCION: SeccionId = 'descripcion';

// ─── Entrada mínima que consume el estado de completado ──────────────────────

/** Campos del inmueble que necesitan las reglas de completado. */
export interface InmuebleParaEstado {
  nombre?: string | null;
  descripcion?: string | null;
  longDescription?: string | null;
  media?: unknown;
  address?: string | null;
  city?: string | null;
  owner?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  bedrooms?: number | null;
  roomsDetail?: Record<string, number> | null;
  bedsDetail?: Record<string, number> | null;
  servicios?: string[] | null;
  precioBase?: number | null;
  status?: string | null;
  energyCert?: string | null;

  // Booleanos clásicos: cuentan como equipamiento aunque la lista de
  // servicios venga vacía (fichas creadas antes del editor).
  hasElevator?: boolean;
  hasParking?: boolean;
  hasPool?: boolean;
  hasGarden?: boolean;
  hasStorageRoom?: boolean;
  hasTerrace?: boolean;
  hasBalcony?: boolean;
  hasAirConditioning?: boolean;
  hasHeating?: boolean;
  furnished?: boolean;
}

// ─── Catálogo de habitaciones ────────────────────────────────────────────────

export interface HabitacionCatalogo {
  id: string;
  label: string;
}

export interface GrupoHabitaciones {
  titulo: string;
  items: readonly HabitacionCatalogo[];
}

/**
 * Habitaciones que puede declarar la propiedad, agrupadas en privadas y
 * compartidas. Los ids son las claves de `habitaciones_detalle`.
 */
export const HABITACIONES_GRUPOS: readonly GrupoHabitaciones[] = [
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

// ─── Catálogo de camas ───────────────────────────────────────────────────────

/** Tipos de cama para la distribución (`camas_detalle`). */
export const CAMAS_CATALOGO: readonly HabitacionCatalogo[] = [
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

// ─── Catálogo de servicios y equipamiento ────────────────────────────────────

/**
 * Claves booleanas del inmueble a las que puede mapear un servicio. Son las
 * mismas que ya escribía la ficha clásica (ascensor, alberca…), así el
 * equipamiento nuevo y las pantallas antiguas leen los mismos datos.
 */
export type BoolKeyInmueble =
  | 'hasElevator'
  | 'hasParking'
  | 'hasPool'
  | 'hasGarden'
  | 'hasStorageRoom'
  | 'hasTerrace'
  | 'hasBalcony'
  | 'hasAirConditioning'
  | 'hasHeating'
  | 'furnished';

export interface ServicioCatalogo {
  id: string;
  label: string;
  /** Campo booleano del inmueble que se mantiene sincronizado con el check. */
  boolKey?: BoolKeyInmueble;
}

export interface GrupoServicios {
  id: string;
  titulo: string;
  items: readonly ServicioCatalogo[];
}

/**
 * Servicios y equipamiento por categorías. «Popular» va primero porque es lo
 * que casi toda ficha declara; el buscador del modal filtra en todas.
 */
export const SERVICIOS_GRUPOS: readonly GrupoServicios[] = [
  {
    id: 'popular',
    titulo: 'Popular',
    items: [
      { id: 'esenciales', label: 'Esenciales' },
      { id: 'lavadora', label: 'Lavadora' },
      { id: 'aire_acondicionado', label: 'Aire acondicionado', boolKey: 'hasAirConditioning' },
      { id: 'calefaccion', label: 'Calefacción general', boolKey: 'hasHeating' },
      { id: 'wifi', label: 'Internet WiFi' },
      { id: 'horno_placa', label: 'Horno y placa' },
      { id: 'aparcamiento', label: 'Plaza de aparcamiento', boolKey: 'hasParking' },
      { id: 'mascotas', label: 'Se permiten mascotas' },
      { id: 'amueblado', label: 'Amueblado', boolKey: 'furnished' },
    ],
  },
  {
    id: 'bano_lavanderia',
    titulo: 'Baño y lavandería',
    items: [
      { id: 'secadora', label: 'Secadora' },
      { id: 'plancha', label: 'Plancha' },
      { id: 'toallas', label: 'Toallas' },
      { id: 'jabon_manos', label: 'Jabón de manos' },
      { id: 'secador_pelo', label: 'Secador de pelo' },
    ],
  },
  {
    id: 'entretenimiento',
    titulo: 'Entretenimiento',
    items: [
      { id: 'tv', label: 'TV' },
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
      { id: 'chimenea', label: 'Chimenea' },
    ],
  },
  {
    id: 'seguridad',
    titulo: 'Seguridad del hogar',
    items: [
      { id: 'detector_humo', label: 'Detector de humo' },
      { id: 'botiquin', label: 'Botiquín' },
      { id: 'extintor', label: 'Extintor' },
    ],
  },
  {
    id: 'oficina',
    titulo: 'Oficina con Internet',
    items: [
      { id: 'zona_trabajo', label: 'Zona de trabajo' },
      { id: 'monitor', label: 'Monitor' },
      { id: 'escritorio', label: 'Escritorio' },
    ],
  },
  {
    id: 'cocina',
    titulo: 'Cocina y comedor',
    items: [
      { id: 'cocina_equipada', label: 'Cocina' },
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
      { id: 'vista_mar', label: 'Vista al mar' },
      { id: 'vista_montana', label: 'Vista a la montaña' },
      { id: 'primera_linea', label: 'Primera línea' },
    ],
  },
  {
    id: 'instalaciones',
    titulo: 'Aparcamiento e instalaciones',
    items: [
      { id: 'aparcamiento_gratuito', label: 'Aparcamiento gratuito' },
      { id: 'garaje', label: 'Garaje' },
      { id: 'ascensor', label: 'Ascensor', boolKey: 'hasElevator' },
      { id: 'trastero', label: 'Trastero', boolKey: 'hasStorageRoom' },
      { id: 'piscina', label: 'Piscina', boolKey: 'hasPool' },
      { id: 'jardin', label: 'Jardín', boolKey: 'hasGarden' },
      { id: 'terraza_prop', label: 'Terraza', boolKey: 'hasTerrace' },
      { id: 'balcon_prop', label: 'Balcón', boolKey: 'hasBalcony' },
    ],
  },
  {
    id: 'politicas',
    titulo: 'Políticas',
    items: [
      { id: 'no_fumadores', label: 'No fumadores' },
      { id: 'eventos', label: 'Apto para eventos' },
      { id: 'ninos', label: 'Admite niños' },
    ],
  },
  {
    id: 'piscina_spa',
    titulo: 'Piscina y spa',
    items: [
      { id: 'jacuzzi', label: 'Jacuzzi' },
      { id: 'sauna', label: 'Sauna' },
      { id: 'gimnasio', label: 'Gimnasio' },
    ],
  },
  {
    id: 'servicios_extra',
    titulo: 'Servicios',
    items: [
      { id: 'limpieza', label: 'Limpieza incluida' },
      { id: 'conserje', label: 'Conserje' },
      { id: 'checkin_autonomo', label: 'Check-in autónomo' },
      { id: 'desayuno', label: 'Desayuno' },
    ],
  },
];

/** Todos los servicios en una lista plana (para buscadores y validaciones). */
export const SERVICIOS_TODOS: readonly ServicioCatalogo[] = SERVICIOS_GRUPOS.flatMap(
  (g) => g.items
);

/** Ficha de un servicio por id, o `undefined` si no existe. */
export function infoServicio(id: string): ServicioCatalogo | undefined {
  return SERVICIOS_TODOS.find((s) => s.id === id);
}

/** Ficha de una habitación por id en su grupo, o `undefined`. */
export function infoHabitacion(id: string): HabitacionCatalogo | undefined {
  return HABITACIONES_GRUPOS.flatMap((g) => g.items).find((h) => h.id === id);
}

/** Ficha de una cama por id, o `undefined`. */
export function infoCama(id: string): HabitacionCatalogo | undefined {
  return CAMAS_CATALOGO.find((c) => c.id === id);
}

// ─── Estado de completado ────────────────────────────────────────────────────

/** Normaliza un texto: recorta y devuelve `null` si queda vacío. */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

/** Número de fotos de `media`, tolerando URLs sueltas y objetos `{ url }`. */
export function contarFotos(media: unknown): number {
  if (!Array.isArray(media)) return 0;
  return media.filter((m) => {
    if (typeof m === 'string') return m.length > 0;
    if (m && typeof m === 'object' && 'url' in m) {
      const url = (m as { url?: unknown }).url;
      return typeof url === 'string' && url.length > 0;
    }
    return false;
  }).length;
}

/** Suma de contadores de un detalle (`habitaciones_detalle`/`camas_detalle`). */
export function sumarDetalle(detalle: Record<string, number> | null | undefined): number {
  if (!detalle || typeof detalle !== 'object') return 0;
  return Object.values(detalle).reduce((acc, n) => acc + (Number(n) || 0), 0);
}

/**
 * ¿Está completa cada sección del editor?
 *
 * «Completa» significa que la ficha tiene lo razonable para publicarse, no
 * todos los campos: una propiedad con ciudad pero sin coordenadas cuenta como
 * ubicada, igual que en el listado ya se mostraba con lo que tuviera.
 */
export function estadoSecciones(
  inmueble: InmuebleParaEstado
): Record<SeccionConEstado, boolean> {
  const servicios = Array.isArray(inmueble.servicios) ? inmueble.servicios : [];
  const tieneBooleanos = SERVICIOS_TODOS.some(
    (s) =>
      s.boolKey &&
      (inmueble as Record<string, unknown>)[s.boolKey as string] === true
  );

  return {
    descripcion: Boolean(
      texto(inmueble.nombre) && (texto(inmueble.descripcion) || texto(inmueble.longDescription))
    ),
    fotos: contarFotos(inmueble.media) > 0,
    ubicacion: Boolean(texto(inmueble.city) || texto(inmueble.address)),
    contacto: Boolean(
      texto(inmueble.owner?.name) ||
        texto(inmueble.owner?.phone) ||
        texto(inmueble.owner?.email)
    ),
    habitaciones:
      (inmueble.bedrooms ?? 0) > 0 ||
      sumarDetalle(inmueble.roomsDetail) > 0 ||
      sumarDetalle(inmueble.bedsDetail) > 0,
    equipamiento: servicios.length > 0 || tieneBooleanos,
    precios: (inmueble.precioBase ?? 0) > 0,
    disponibilidad: Boolean(texto(inmueble.status)),
    cumplimiento: Boolean(texto(inmueble.energyCert)),
  };
}

/**
 * Progreso global de la ficha, en porcentaje entero 0–100.
 *
 * Es la media de las secciones con estado; la barra del selector de propiedad
 * y el badge «Completado» se apoyan en él.
 */
export function progresoGlobal(inmueble: InmuebleParaEstado): number {
  const estado = estadoSecciones(inmueble);
  const claves = Object.keys(estado) as SeccionConEstado[];
  const completas = claves.filter((k) => estado[k]).length;
  return Math.round((completas / claves.length) * 100);
}

/** Rótulo del badge de sección: «Completado» o «Pendiente». */
export function etiquetaEstadoSeccion(completa: boolean): string {
  return completa ? 'Completado' : 'Pendiente';
}
