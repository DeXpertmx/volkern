/**
 * Escala de certificación energética del inmueble.
 *
 * Una sola fuente de verdad para el orden, los colores y el texto que se pinta
 * en la ficha pública y en los listados (portal y panel).
 */
export const ESCALA_ENERGETICA: ReadonlyArray<{ letra: string; color: string; textoOscuro?: boolean }> = [
  { letra: 'A', color: '#0f9d58' },
  { letra: 'B', color: '#7cb342' },
  { letra: 'C', color: '#f2d43d', textoOscuro: true },
  { letra: 'D', color: '#f0b037', textoOscuro: true },
  { letra: 'E', color: '#e67e22' },
  { letra: 'F', color: '#e74c3c' },
  { letra: 'G', color: '#a93226' },
];

/** Valor que guarda el editor cuando el certificado aún no está emitido */
const ESTADO_EN_TRAMITE = '#f59e0b';

function normalizar(clase: string | null | undefined): string {
  return (clase || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function esClaseEnTramite(clase: string | null | undefined): boolean {
  return normalizar(clase) === 'EN TRAMITE';
}

/**
 * Devuelve el color y el texto con los que pintar la clase energética.
 * `null` cuando el inmueble no tiene certificación (o el valor no es válido).
 */
export function etiquetaClaseEnergetica(
  clase: string | null | undefined
): { texto: string; color: string; textoOscuro: boolean; enTramite: boolean } | null {
  const valor = (clase || '').trim();
  if (!valor) return null;

  if (esClaseEnTramite(valor)) {
    return { texto: 'En trámite', color: ESTADO_EN_TRAMITE, textoOscuro: true, enTramite: true };
  }

  const letra = normalizar(valor);
  const tramo = ESCALA_ENERGETICA.find((c) => c.letra === letra);
  if (!tramo) return null;

  return { texto: tramo.letra, color: tramo.color, textoOscuro: Boolean(tramo.textoOscuro), enTramite: false };
}
