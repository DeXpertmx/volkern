/**
 * Preguntas personalizadas del check-in online (por tenant).
 *
 * Cada hotel define qué más quiere saber del huésped (hora estimada de
 * llegada, matrícula del coche, mascotas…). El formulario de
 * `/checkin/<token>` las muestra tras las fichas de viajeros y las respuestas
 * se guardan en la reserva (`respuestasCheckin`) para el hotel.
 *
 * LA REGLA (inviolable): las preguntas y sus respuestas son asunto del hotel.
 * El parte de viajeros es un XML contra el XSD del Servicio de Hospedajes,
 * que es CERRADO — un elemento que el esquema no conoce rechazaría la
 * comunicación entera. Por eso este módulo vive al otro lado de la frontera:
 * lo que entra aquí jamás se pasa a la construcción del mensaje MIR
 * (`lib/hospitality/registro-viajeros.ts` no importa nada de este fichero),
 * y una guardia de tests lo fija.
 */

import { idiomaDeValor } from '@/lib/hospitality/booking-i18n';

/** Tipos de pregunta soportados por el formulario público. */
export const TIPOS_PREGUNTA = ['texto', 'opcion', 'numero', 'fecha'] as const;
export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number];

export interface PreguntaCheckin {
  id: string;
  tipo: TipoPregunta;
  es: string;
  en: string;
  /** Solo para `opcion`: las alternativas, en cada idioma. */
  opciones?: { es: string[]; en: string[] } | null;
  requerida: boolean;
  orden: number;
}

/** Una pregunta tal y como llega de BD (`HospitalityCheckinPregunta`). */
export interface PreguntaCruda {
  id: string;
  tipo: string;
  es: unknown;
  en: unknown;
  opciones?: unknown;
  requerida: boolean;
  activa: boolean;
  orden: number;
}

const MAX_ETIQUETA = 250;
const MAX_OPCIONES = 12;
const MAX_RESPUESTA = 500;
const MAX_PREGUNTAS_ACTIVAS = 20;

/** Texto de una etiqueta/option en un idioma: recortado o null. */
function etiqueta(crudo: unknown): string | null {
  if (typeof crudo !== 'string') return null;
  const limpio = crudo.trim();
  if (!limpio) return null;
  return limpio.slice(0, MAX_ETIQUETA);
}

/** Lista de opciones de un idioma: textos limpios y únicos. */
function listaOpciones(crudo: unknown): string[] | null {
  if (!Array.isArray(crudo)) return null;
  const vistos = new Set<string>();
  for (const item of crudo) {
    const texto = etiqueta(item);
    if (texto) vistos.add(texto);
  }
  if (vistos.size === 0) return null;
  return [...vistos].slice(0, MAX_OPCIONES);
}

/**
 * Normaliza la configuración del tenant: descarta preguntas sin pregunta en
 * ambos idiomas (no se puede enseñar una ficha sin texto), opciones incompletas
 * y tipos desconocidos. También respeta el orden pedido.
 */
export function normalizarPreguntas(crudas: PreguntaCruda[]): PreguntaCheckin[] {
  const activas = crudas.filter((p) => p && p.activa && typeof p.id === 'string');
  const validas = activas
    .map((p) => {
      const tipo = (TIPOS_PREGUNTA as readonly string[]).includes(p.tipo)
        ? (p.tipo as TipoPregunta)
        : 'texto';
      const es = etiqueta(p.es);
      const en = etiqueta(p.en);
      if (!es && !en) return null;
      const salida: PreguntaCheckin = {
        id: p.id,
        tipo,
        es: es ?? en!,
        en: en ?? es!,
        requerida: p.requerida === true,
        orden: Number.isFinite(p.orden) ? p.orden : 0,
      };
      if (tipo === 'opcion') {
        const opcionesEs = listaOpciones(p.opciones && (p.opciones as Record<string, unknown>).es);
        const opcionesEn = listaOpciones(p.opciones && (p.opciones as Record<string, unknown>).en);
        if (!opcionesEs && !opcionesEn) return null;
        salida.opciones = {
          es: opcionesEs ?? opcionesEn!,
          en: opcionesEn ?? opcionesEs!,
        };
      }
      return salida;
    })
    .filter((p): p is PreguntaCheckin => p !== null)
    .sort((a, b) => a.orden - b.orden || a.es.localeCompare(b.es));

  return validas.slice(0, MAX_PREGUNTAS_ACTIVAS);
}

/** Mapa {preguntaId: valor} tal cual llega del formulario. */
export type RespuestasCrudas = Record<string, unknown>;

export type RespuestasLimpias = Record<string, string>;

export interface ResultadoRespuestas {
  respuestas: RespuestasLimpias;
  /** Ids de preguntas requeridas sin respuesta válida. */
  faltan: string[];
  /** Ids de preguntas ignoradas (no activas, tipo/opción inexistente…). */
  descartadas: string[];
}

function valorTexto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const limpio = v.trim();
  if (!limpio) return null;
  return limpio.slice(0, MAX_RESPUESTA);
}

/**
 * Valida las respuestas contra la config normalizada. Sobra lo que no
 * corresponde a ninguna pregunta activa; una `requerida` sin respuesta no
 * bloquea el guardado de los viajeros (el parte MIR es lo que manda), pero se
 * informa en `faltan` para que la pantalla lo pida.
 */
export function validarRespuestas(
  preguntas: PreguntaCheckin[],
  crudas: RespuestasCrudas | null | undefined
): ResultadoRespuestas {
  const entrada = (crudas && typeof crudas === 'object' ? crudas : {}) as RespuestasCrudas;
  const respuestas: RespuestasLimpias = {};
  const faltan: string[] = [];
  const descartadas: string[] = [];
  const tocadas = new Set(Object.keys(entrada));

  for (const p of preguntas) {
    const crudo = entrada[p.id];
    tocadas.delete(p.id);
    const texto = valorTexto(crudo);

    if (p.tipo === 'opcion') {
      const validas = new Set([...(p.opciones?.es ?? []), ...(p.opciones?.en ?? [])]);
      if (texto && validas.has(texto)) {
        respuestas[p.id] = texto;
        continue;
      }
    } else if (p.tipo === 'numero') {
      // Se admite el número tal cual lo escribió el huésped (con decimales):
      // solo se comprueba que SEA número.
      if (texto && Number.isFinite(Number(texto.replace(',', '.')))) {
        respuestas[p.id] = texto;
        continue;
      }
    } else if (p.tipo === 'fecha') {
      // AAAA-MM-DD; el formulario usa <input type="date">.
      if (texto && /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(Date.parse(texto))) {
        respuestas[p.id] = texto;
        continue;
      }
    } else if (texto) {
      respuestas[p.id] = texto;
      continue;
    }

    // Sin respuesta válida: requerida pide aviso, el resto se queda fuera.
    if (p.requerida) faltan.push(p.id);
  }

  for (const id of tocadas) descartadas.push(id);
  return { respuestas, faltan, descartadas };
}

export interface PendienteCheckin {
  /** El texto de la pregunta, en el idioma del mensaje (en falta → es). */
  texto: string;
  /** Es requerida: entra en `preguntas_pendientes`; las demás no. */
  requerida: boolean;
  /**
   * Guardia anti-inyección: el texto de una pregunta lo define el hotel y
   * viaja dentro de un mensaje. Si algún día el saneo del mensaje se olvida
   * de algo, el delimitador de lista al menos no puede fabricarse aquí.
   */
  saneado: string;
}

/**
 * De una lista de preguntas (orden de formulario) y las respuestas ya
 * guardadas en la reserva, las REQUERIDAS que siguen sin respuesta válida —
 * en el orden en que las respondería el formulario. Es la lista que la
 * pre-llegada (y el check-in del día) recuerda en `{{preguntas_pendientes}}`.
 *
 * Una pregunta sin respuesta válida no distingue «nunca respondió» de «la
 * respuesta era inválida»: para el huésped las dos se arreglan igual,
 * volviendo al enlace. Las no requeridas no se recuerdan: un recordatorio
 * que nombra cinco cosas deja de leerse al segundo.
 */
export function requeridasPendientes(
  preguntas: PreguntaCheckin[],
  respuestas: RespuestasLimpias | null | undefined,
  idioma: string
): PendienteCheckin[] {
  const dadas = respuestas && typeof respuestas === 'object' ? respuestas : {};
  const esEn = idiomaDeValor(idioma);
  return preguntas
    .filter((p) => p.requerida && !dadas[p.id])
    .map((p) => {
      const texto = (esEn === 'en' ? p.en || p.es : p.es || p.en) || p.id;
      return {
        texto,
        requerida: p.requerida,
        // Corta saltos y el propio delimitador de la lista de la plantilla: el
        // texto del hotel no puede fabricar líneas nuevas en el mensaje.
        saneado: texto.replace(/[\r\n]+/g, ' ').replace(/;/g, ',').trim(),
      };
    });
}

// ─── La hora estimada de llegada ────────────────────────────────────────────
//
// La hoja de housekeeping reparte el trabajo por horas: la convención de la
// vertical es llegada 15:00, pero si el hotel pregunta la hora estimada y el
// huésped respondió, el papel dice LA HORA DEL HUÉSPED — es la información
// que sirve para ordenar la limpieza. La detección vive aquí, junto al resto
// del vocabulario de las preguntas: si un hotel pregunta lo mismo con otras
// palabras, no hace falta tocar la hoja.

/** Palabras que delatan la pregunta de la hora de llegada (ES y EN). */
const HORA_LLEGADA_PATRON =
  /hora\s+estimada\s+(?:de\s+)?llegada|hora\s+de\s+llegada|estimated\s+arrival\s+time|arrival\s+time/i;

/** ¿Es esta la pregunta de la hora estimada de llegada? */
export function esPreguntaHoraLlegada(p: { es: string; en: string }): boolean {
  return HORA_LLEGADA_PATRON.test(p.es) || HORA_LLEGADA_PATRON.test(p.en);
}

/**
 * La respuesta del huésped a la pregunta de hora, normalizada a HH:MM (o null
 * si lo que escribió no es una hora legible). Acepta «15:30», «15 h», «1530»,
 * «3:30 pm» y «3pm» — lo que un huésped escribe de verdad en un móvil.
 */
export function horaDeRespuesta(crudo: string | null | undefined): string | null {
  if (typeof crudo !== 'string') return null;
  const texto = crudo.trim().toLowerCase();
  if (!texto) return null;

  // 24 h: «15:30», «15.30», «15 h», «15h».
  let m = texto.match(/^(\d{1,2})\s*(?::|\.|h)\s*(\d{2})?$/);
  if (!m) {
    // 12 h con meridiano: «3:30 pm», «3pm».
    m = texto.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  } else if (texto.includes('am') || texto.includes('pm')) {
    // El primer patrón no captura el meridiano: reintentar con el de 12 h.
    m = texto.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  }
  if (!m) return null;

  let horas = Number(m[1]);
  const minutos = Number(m[2] ?? 0);
  const meridiano = m[3];
  if (Number.isNaN(horas) || Number.isNaN(minutos)) return null;

  if (meridiano) {
    if (horas < 1 || horas > 12) return null;
    if (meridiano === 'pm' && horas !== 12) horas += 12;
    if (meridiano === 'am' && horas === 12) horas = 0;
  }
  if (horas > 23 || minutos > 59) return null;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

/**
 * La hora estimada de llegada de una reserva: la respuesta del huésped a la
 * pregunta de hora (normalizada) o null si no hay pregunta, respuesta o no es
 * legible. El orden del hotel manda: si hay varias preguntas que parecen de
 * hora, gana la primera en orden de formulario.
 */
export function horaEstimadaLlegadaDe(
  preguntas: PreguntaCheckin[],
  respuestas: RespuestasLimpias | null | undefined
): string | null {
  const dadas = respuestas && typeof respuestas === 'object' ? respuestas : {};
  const pregunta = preguntas.find((p) => esPreguntaHoraLlegada(p) && dadas[p.id]);
  if (!pregunta) return null;
  return horaDeRespuesta(dadas[pregunta.id]);
}
