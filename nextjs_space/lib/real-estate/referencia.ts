/**
 * Referencia pública de una propiedad.
 *
 * Es el código corto con el que un asesor identifica el inmueble. Lo usan los
 * dos caminos por los que entra un interesado —el formulario de la ficha y el
 * botón de WhatsApp— para que el lead quede asociado al inmueble exacto que
 * estaba viendo.
 *
 * Orden: el SKU del catálogo (si el tenant lo usa), el campo `referencia` de
 * customFieldValues/metadata y, si no hay ninguno, un código estable derivado
 * del id (`REF-` + últimos 6 caracteres). La misma propiedad devuelve siempre
 * la misma referencia, así que sirve como identificador para el asesor.
 */
export interface PropiedadReferenciable {
  id: string;
  sku?: string | null;
  metadata?: unknown;
  customFieldValues?: unknown;
}

const PREFIJO = 'REF-';

function leerCampo(origen: unknown, clave: string): string {
  if (!origen || typeof origen !== 'object') return '';
  const valor = (origen as Record<string, unknown>)[clave];
  if (typeof valor === 'number') return String(valor);
  return typeof valor === 'string' ? valor.trim() : '';
}

export function referenciaPropiedad(propiedad: PropiedadReferenciable): string {
  const declarada =
    (propiedad.sku || '').trim() ||
    leerCampo(propiedad.customFieldValues, 'referencia') ||
    leerCampo(propiedad.metadata, 'referencia');

  if (declarada) return declarada;

  const id = (propiedad.id || '').trim();
  if (!id) return '';
  return PREFIJO + id.slice(-6).toUpperCase();
}

/**
 * Texto precargado del botón de WhatsApp de la ficha.
 *
 * La referencia viaja dentro del mensaje porque es lo único que el CRM recibe
 * cuando el visitante escribe: el webhook la lee y la guarda en el lead.
 */
export function textoWhatsappPropiedad(nombre: string, referencia: string): string {
  const base = `Hola, me interesa ${nombre || 'esta propiedad'}`;
  return referencia
    ? `${base} (Ref: ${referencia}). ¿Sigue disponible?`
    : `${base}. ¿Sigue disponible?`;
}

const PATRON_REFERENCIA = /\bref(?:erencia)?\b\s*[:#=]?\s*([A-Za-z0-9][A-Za-z0-9_-]{1,39})/i;
// El widget siempre escribe «(Ref: …)», pero el visitante puede dejar el código
// suelto al editar el mensaje: se reconoce también el prefijo propio.
const PATRON_REFERENCIA_DERIVADA = /\b(REF-[A-Za-z0-9]{4,})\b/i;

/** Referencia que dejó el widget en el mensaje de WhatsApp, si la hay. */
export function extraerReferenciaDeTexto(texto: string): string | null {
  const conEtiqueta = PATRON_REFERENCIA.exec(texto || '');
  if (conEtiqueta) return conEtiqueta[1];

  const derivada = PATRON_REFERENCIA_DERIVADA.exec(texto || '');
  return derivada ? derivada[1].toUpperCase() : null;
}

/**
 * Cola del id que corresponde a una referencia derivada (`REF-ABC123`).
 * Devuelve null para las referencias declaradas (SKU), que se buscan por su
 * propio valor.
 */
export function colaIdDesdeReferencia(referencia: string): string | null {
  const limpio = (referencia || '').trim();
  if (!limpio.toUpperCase().startsWith(PREFIJO)) return null;
  const cola = limpio.slice(PREFIJO.length).trim();
  return cola.length >= 4 ? cola : null;
}
