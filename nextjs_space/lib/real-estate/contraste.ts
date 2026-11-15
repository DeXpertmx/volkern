/**
 * Contraste de la marca en el portal público.
 *
 * Cada cuenta elige su color primario sin restricciones: un amarillo o un
 * celeste muy claro con texto blanco encima es ilegible, y vetar colores en el
 * panel es peor negocio que usarlos bien. Aquí se calcula con qué texto se lee
 * cada fondo y se oscurece (o aclara) el color lo justo para llegar al mínimo
 * AA de 4.5:1.
 *
 * El color de marca no se toca en la base de datos: estas funciones devuelven
 * variantes derivadas solo para pintar.
 */

export type ColorTexto = '#ffffff' | '#111827';

const BLANCO = '#ffffff';
const NEGRO = '#111827';
const MINIMO_AA = 4.5;
const COLOR_POR_DEFECTO = '#3b82f6';

const NOMBRES: Record<string, string> = {
  white: '#ffffff',
  black: '#111827',
};

function aRgb(color: string): [number, number, number] | null {
  const limpio = String(color || '').trim().toLowerCase();
  let hex = (NOMBRES[limpio] ?? limpio).replace('#', '');
  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function aHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function normalizar(color: string): string {
  const rgb = aRgb(color);
  return rgb ? aHex(rgb) : COLOR_POR_DEFECTO;
}

/** Luminancia relativa según WCAG 2.1. */
function luminanciaRelativa(color: string): number {
  const rgb = aRgb(color) ?? aRgb(COLOR_POR_DEFECTO)!;
  const [r, g, b] = rgb.map((valor) => {
    const c = valor / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste entre dos colores (1 = idénticos, 21 = blanco/negro). */
export function ratioContraste(a: string, b: string): number {
  const l1 = luminanciaRelativa(a);
  const l2 = luminanciaRelativa(b);
  const claro = Math.max(l1, l2);
  const oscuro = Math.min(l1, l2);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Mezcla `color` con blanco (`haciaBlanco`) o negro en la proporción dada. */
function mezclar(color: string, hacia: ColorTexto, cantidad: number): string {
  const rgb = aRgb(color) ?? aRgb(COLOR_POR_DEFECTO)!;
  const objetivo = aRgb(hacia)!;
  const t = Math.min(1, Math.max(0, cantidad));
  return aHex([
    rgb[0] + (objetivo[0] - rgb[0]) * t,
    rgb[1] + (objetivo[1] - rgb[1]) * t,
    rgb[2] + (objetivo[2] - rgb[2]) * t,
  ]);
}

export function aclarar(color: string, cantidad: number): string {
  return mezclar(color, BLANCO, cantidad);
}

export function oscurecer(color: string, cantidad: number): string {
  return mezclar(color, NEGRO, cantidad);
}

/**
 * Devuelve blanco o casi negro, el que mejor se lea sobre `fondo`.
 * Es la decisión que usa el hero de marca y las insignias sobre color.
 */
export function colorTextoSobre(fondo: string): ColorTexto {
  return ratioContraste(fondo, BLANCO) >= ratioContraste(fondo, NEGRO) ? BLANCO : NEGRO;
}

/**
 * Ajusta `color` (sin cambiarlo si ya cumple) hasta que `texto` llegue al
 * contraste mínimo sobre él. Se mueve en la dirección que aumenta el contraste:
 * hacia negro para texto blanco y hacia blanco para texto oscuro.
 */
function conContrasteMinimo(
  color: string,
  texto: ColorTexto,
  minimo: number = MINIMO_AA
): string {
  const base = normalizar(color);
  if (ratioContraste(base, texto) >= minimo) return base;

  const hacia: ColorTexto = texto === BLANCO ? NEGRO : BLANCO;
  for (let paso = 1; paso <= 20; paso++) {
    const candidato = mezclar(base, hacia, paso * 0.07);
    if (ratioContraste(candidato, texto) >= minimo) return candidato;
  }
  return mezclar(base, hacia, 1);
}

/**
 * Fondo para botones con etiqueta blanca (CTA, Filtrar, Enviar consulta…).
 * Con marcas oscuras devuelve el mismo color; con marcas claras lo oscurece.
 */
export function fondoConTextoBlanco(color: string, minimo: number = MINIMO_AA): string {
  return conContrasteMinimo(color, BLANCO, minimo);
}

/**
 * Color de marca para usar como texto o borde sobre blanco (enlaces «Ver
 * todas», «Calcular hipoteca»…). Con marcas claras devuelve una versión más
 * oscura que sigue pareciendo la misma marca pero se lee: aquí el contraste se
 * mide contra el blanco del fondo, no contra el texto.
 */
export function colorTextoEnClaro(color: string, minimo: number = MINIMO_AA): string {
  const base = normalizar(color);
  if (ratioContraste(base, BLANCO) >= minimo) return base;

  for (let paso = 1; paso <= 20; paso++) {
    const candidato = mezclar(base, NEGRO, paso * 0.07);
    if (ratioContraste(candidato, BLANCO) >= minimo) return candidato;
  }
  return mezclar(base, NEGRO, 1);
}

/**
 * Degradado del hero de marca y el color de texto que lo acompaña.
 *
 * El degradado siempre se mueve *hacia donde el texto gana contraste*: si el
 * texto es blanco, oscurece; si es oscuro, aclara. Así el peor punto del
 * degradado es el color base, que ya viene ajustado.
 */
export function fondoHeroMarca(color: string): {
  base: string;
  fin: string;
  texto: ColorTexto;
} {
  const texto = colorTextoSobre(color);
  const base = conContrasteMinimo(color, texto);
  const fin = texto === BLANCO ? oscurecer(base, 0.45) : aclarar(base, 0.5);
  return { base, fin, texto };
}
