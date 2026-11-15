/**
 * Marca del portal por cuenta.
 *
 * Los valores llegan de un formulario y acaban pintados en HTML público: se
 * sanean aquí, en un sitio, para que un color inválido no rompa el contraste ni
 * un teléfono con letras acabe en un enlace de WhatsApp roto.
 */

export const COLOR_MARCA_POR_DEFECTO = '#3b82f6';
const CLAIM_MAX = 140;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizarColor(valor: unknown): string {
  if (typeof valor !== 'string') return COLOR_MARCA_POR_DEFECTO;
  const limpio = valor.trim();
  if (!HEX.test(limpio)) return COLOR_MARCA_POR_DEFECTO;
  // `#abc` → `#aabbcc`, para guardar siempre la forma larga.
  if (limpio.length === 4) {
    return `#${limpio[1]}${limpio[1]}${limpio[2]}${limpio[2]}${limpio[3]}${limpio[3]}`.toLowerCase();
  }
  return limpio.toLowerCase();
}

export function normalizarClaim(valor: unknown, max = CLAIM_MAX): string {
  if (typeof valor !== 'string') return '';
  const limpio = valor.replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).trimEnd()}…`;
}

/** Sólo dígitos: `+34 612 345 678` y `0034612345678` deben acabar en el mismo sitio. */
export function normalizarTelefono(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  let digitos = valor.replace(/[^\d]/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  return digitos.length >= 7 && digitos.length <= 15 ? digitos : '';
}

export function urlWhatsapp(telefono: unknown, mensaje?: string | null): string | null {
  const numero = normalizarTelefono(telefono);
  if (!numero) return null;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : '';
  return `https://wa.me/${numero}${texto}`;
}

export function normalizarLogo(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const limpio = valor.trim();
  if (!limpio || limpio.length > 500) return '';

  if (limpio.startsWith('/')) {
    // Ruta local (por ejemplo `/uploads/...`): se acepta tal cual.
    return limpio.startsWith('//') ? '' : limpio;
  }

  try {
    const url = new URL(limpio);
    return url.protocol === 'https:' || url.protocol === 'http:' ? limpio : '';
  } catch {
    return '';
  }
}

/** Mensaje con el que el visitante abre el WhatsApp de la oficina. */
export function mensajeWhatsappPropiedad(nombre: string, url: string): string {
  return `Hola, me interesa ${nombre}\n${url}`;
}
