/**
 * Plantillas del portal público.
 *
 * Una plantilla decide cómo se abre la portada, no un diseño completo: el
 * catálogo, las tarjetas y el formulario son los mismos para todas, así que
 * añadir una plantilla es añadir un hero, no duplicar el portal.
 */

export const PLANTILLAS_PORTAL = ['foto', 'marca'] as const;

export type PlantillaPortal = (typeof PLANTILLAS_PORTAL)[number];

export const PLANTILLA_POR_DEFECTO: PlantillaPortal = 'foto';

export const PLANTILLAS_PORTAL_INFO: Record<
  PlantillaPortal,
  { nombre: string; descripcion: string }
> = {
  foto: {
    nombre: 'Hero con foto',
    descripcion: 'Carrusel con los inmuebles destacados y el buscador justo debajo.',
  },
  marca: {
    nombre: 'Hero de marca',
    descripcion: 'Bloque con el color de la cuenta y el mensaje de la oficina.',
  },
};

/**
 * Tokens visuales que la plantilla impone a las tres páginas del portal
 * (portada, catálogo y ficha). Son clases de Tailwind, no estilos sueltos: así
 * el mismo radio y la misma tipografía se aplican en cualquier página sin
 * repetir el criterio en cada fichero.
 */
export interface TokensPortal {
  /** Cómo se abre la página: foto a sangre o bloque de marca. */
  hero: 'foto' | 'marca';
  /** Radio de superficies (tarjetas, paneles, galería). */
  radio: string;
  /** Radio de controles (inputs, botones, miniaturas). */
  radioControl: string;
  /** Peso y tracking de los titulares de sección. */
  titulo: string;
  /** Escala del titular principal (h1 de la ficha). */
  tituloPrincipal: string;
}

const TOKENS: Record<PlantillaPortal, TokensPortal> = {
  foto: {
    hero: 'foto',
    radio: 'rounded-xl',
    radioControl: 'rounded-lg',
    titulo: 'font-bold',
    tituloPrincipal: 'text-3xl font-bold md:text-4xl',
  },
  marca: {
    hero: 'marca',
    radio: 'rounded-2xl',
    radioControl: 'rounded-xl',
    titulo: 'font-black tracking-tight',
    tituloPrincipal: 'text-3xl font-black tracking-tight md:text-5xl',
  },
};

export function tokensPortal(plantilla: PlantillaPortal): TokensPortal {
  return TOKENS[plantilla] ?? TOKENS[PLANTILLA_POR_DEFECTO];
}

/**
 * Normaliza lo que llega de la configuración: el valor se guarda como JSON, así
 * que puede venir `"foto"`, `foto` o cualquier cosa de una versión anterior.
 */
export function normalizarPlantilla(valor: unknown): PlantillaPortal {
  const limpio =
    typeof valor === 'string' ? valor.trim().replace(/^"(.*)"$/, '$1').trim() : '';
  return (PLANTILLAS_PORTAL as readonly string[]).includes(limpio)
    ? (limpio as PlantillaPortal)
    : PLANTILLA_POR_DEFECTO;
}
