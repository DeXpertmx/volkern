/**
 * Plantillas visuales y personalización de la página pública de reserva
 * (Booking Engine), más el dominio propio del tenant.
 *
 * Puro: nada de Prisma ni Next. El servidor trata un valor desconocido como
 * la plantilla clásica y una personalización malformada como defaults — la
 * página pública no puede romperse por datos de configuración.
 */

// ─── Plantillas ────────────────────────────────────────────────────────────

export const PLANTILLA_CLASICA = 'clasica';
export const PLANTILLA_MODERNA = 'moderna';
export const PLANTILLA_COMPACTA = 'compacta';
export const PLANTILLA_MINIMAL = 'minimal';

const PLANTILLAS_VALIDAS = [
  PLANTILLA_CLASICA,
  PLANTILLA_MODERNA,
  PLANTILLA_COMPACTA,
  PLANTILLA_MINIMAL,
] as const;

export type PlantillaBooking = (typeof PLANTILLAS_VALIDAS)[number];

/** La plantilla válida más cercana al valor guardado: desconocido/nulo = clásica. */
export function plantillaDeValor(valor: unknown): PlantillaBooking {
  return PLANTILLAS_VALIDAS.includes(valor as PlantillaBooking)
    ? (valor as PlantillaBooking)
    : PLANTILLA_CLASICA;
}

export function esPlantillaValida(valor: unknown): boolean {
  return PLANTILLAS_VALIDAS.includes(valor as PlantillaBooking);
}

export const PLANTILLAS_CATALOGO: { valor: PlantillaBooking; nombre: string; descripcion: string }[] = [
  {
    valor: PLANTILLA_CLASICA,
    nombre: 'Clásica',
    descripcion: 'El asistente completo en la página, como siempre. Galería de la propiedad arriba.',
  },
  {
    valor: PLANTILLA_MODERNA,
    nombre: 'Moderna',
    descripcion: 'Ficha estilo Airbnb: galería grande, tarjetas por unidad y registro en modal.',
  },
  {
    valor: PLANTILLA_COMPACTA,
    nombre: 'Compacta',
    descripcion: 'Fechas arriba y lista de unidades apretada, pensada para convertir rápido.',
  },
  {
    valor: PLANTILLA_MINIMAL,
    nombre: 'Minimal',
    descripcion: 'Sin imágenes: texto, fechas y botón. La más rápida de cargar.',
  },
];

// ─── Personalización visual (colores, radios) ─────────────────────────────

export interface PersonalizacionBooking {
  colorPrimario: string;
  colorFondo: string;
  colorTexto: string;
  radioTarjeta: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const DEFAULTS: PersonalizacionBooking = {
  colorPrimario: '#0f766e',
  colorFondo: '#ffffff',
  colorTexto: '#0f172a',
  radioTarjeta: '0.75rem',
};

function hexODefecto(valor: unknown, defecto: string): string {
  return typeof valor === 'string' && HEX_RE.test(valor.trim()) ? valor.trim().toLowerCase() : defecto;
}

/** radioTarjeta se guarda como texto (rem/px/hex cualquiera); sin dato, default. */
function radioODefecto(valor: unknown, defecto: string): string {
  return typeof valor === 'string' && /^(#[0-9a-fA-F]{6}|[\d.]+(rem|px))$/.test(valor.trim())
    ? valor.trim()
    : defecto;
}

/** Normaliza el JSON guardado: lo inválido cae al default, nunca rompe la página. */
export function personalizacionDeValor(valor: unknown): PersonalizacionBooking {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...DEFAULTS };
  const v = valor as Record<string, unknown>;
  return {
    colorPrimario: hexODefecto(v.colorPrimario, DEFAULTS.colorPrimario),
    colorFondo: hexODefecto(v.colorFondo, DEFAULTS.colorFondo),
    colorTexto: hexODefecto(v.colorTexto, DEFAULTS.colorTexto),
    radioTarjeta: radioODefecto(v.radioTarjeta, DEFAULTS.radioTarjeta),
  };
}

/** Serializa para guardar: solo las claves conocidas y en formato válido. */
export function normalizarPersonalizacion(valor: unknown): Record<string, string> {
  return { ...personalizacionDeValor(valor) } as unknown as Record<string, string>;
}

/** CSS custom properties para inyectar en la página pública. */
export function cssDePersonalizacion(p: PersonalizacionBooking): Record<string, string> {
  return {
    '--booking-primario': p.colorPrimario,
    '--booking-fondo': p.colorFondo,
    '--booking-texto': p.colorTexto,
    '--booking-radio': p.radioTarjeta,
  };
}

// ─── Logo de la cabecera ─────────────────────────────────────────────────────

/**
 * La URL del logo que enseña la cabecera de la página pública, o null si lo
 * guardado no sirve como imagen: vacío, no-texto o una "URL" sin http(s) ni
 * ruta relativa. La página pública no puede quedarse con una imagen rota
 * delante del huésped — sin logo válido, la cabecera cae al título.
 */
export function logoDeValor(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v || v.length > 2048) return null;
  // URL absoluta http(s) o ruta relativa de la propia app (/logo.png). Lo que
  // no tenga ninguna de las dos formas no es una dirección de imagen.
  return /^https?:\/\//i.test(v) || v.startsWith('/') ? v : null;
}

// ─── Dominio propio del tenant ─────────────────────────────────────────────

export interface ResultadoDominio {
  ok: boolean;
  dominio?: string;
  error?: string;
}

/**
 * Normaliza el dominio que escribe el hotel: minúsculas, sin www, sin puerto,
 * sin ruta y sin protocolo. Acepta que lo peguen con `https://` delante.
 */
export function normalizarDominio(valor: unknown): ResultadoDominio {
  // Ausente (null/undefined) = quitar el dominio. Un tipo que no sea texto
  // (número, objeto…) es basura del cliente: error, no "quitar" en silencio.
  if (valor === null || valor === undefined) {
    return { ok: true, dominio: undefined };
  }
  if (typeof valor !== 'string') {
    return { ok: false, error: 'El dominio debe ser un texto (ej: reservas.mihotel.com).' };
  }
  if (valor.trim() === '') {
    return { ok: true, dominio: undefined }; // vacío = quitar el dominio
  }
  let d = valor.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/\/.*$/, '');
  d = d.replace(/:\d+$/, '');
  d = d.replace(/^www\./, '');

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) ||
      /(^|\.)-|-\.|-(-|$)/.test(d)) {
    return { ok: false, error: 'No parece un dominio válido (ej: reservas.mihotel.com).' };
  }
  if (d.endsWith('volkern.app')) {
    return { ok: false, error: 'Usa el slug de booking para direcciones en volkern.app: el dominio propio es para TU dominio.' };
  }
  if (d.length > 253) {
    return { ok: false, error: 'El dominio es demasiado largo.' };
  }
  return { ok: true, dominio: d };
}

/**
 * El token TXT que el hotel debe crear en su DNS para demostrar que el dominio
 * es suyo: `_volkern-booking.<dominio>  TXT  volkern-booking=<tenantSlug>`.
 */
export function tokenVerificacionDominio(slug: string): string {
  return `volkern-booking=${slug}`;
}

export function hostVerificacionDominio(dominio: string): string {
  return `_volkern-booking.${dominio}`;
}
