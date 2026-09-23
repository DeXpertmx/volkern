import { prisma } from '@/lib/db';
import { createHash } from 'crypto';
import type { RoleplayMessage } from '@/lib/skills/training-skills';

/**
 * Cosecha de mejores prácticas → Playbook (C4) — módulo PROPIO.
 *
 * Cuando una sesión de roleplay alcanza el mínimo de excelencia (>= 90),
 * la lección entra al manual de ventas del tenant: objeción, respuesta que
 * funcionó, técnica y puntuación, visible en la Academia (Living Playbook).
 *
 * LA REGLA (inviolable): el tema se CLASIFICA POR CONTENIDO — una función
 * pura, determinista y auditable sobre el texto de la sesión. Antes se
 * elegía con `Math.random()` entre cuatro cadenas: la misma lección podía
 * entrar un día como «Objeción de Precio» y otro como «Explicación Técnica»,
 * así que el manual no se podía consultar ni medir por tema.
 *
 * Módulo puro: `clasificarTema` y `huellaLeccion` no tocan BD ni IA; la única
 * vía de escritura es `cosecharMejorPractica`, que DEDUPLICA: la huella de la
 * lección (tema + objeción normalizada) es única por tenant y una segunda
 * sesión muy parecida devuelve la entrada existente, no crea otra. Los
 * umbrales de clasificación viven aquí — una sola definición para cosecha,
 * guardia y cualquier futura página.
 */

/** Umbral de excelencia: solo entra al Playbook una sesión >= UMBRAL_COSECHA. */
export const UMBRAL_COSECHA = 90;

/** El tema nunca queda vacío: si nada encaja, hay categoría de respaldo. */
export const TEMA_SIN_CLASIFICAR = 'Argumento general de ventas';

/** El texto examinado por tema: los últimos TURNOS_CLASIFICACION del diálogo. */
const TURNOS_CLASIFICACION = 6;

/** Longitud máxima de la objeción guardada (el resto se trunca con «...»). */
const MAX_OBJECION = 500;

const TRUNCADO = '...';

/**
 * Normaliza la objeción para la huella: minúsculas, sin tildes (caro/caro,
 * inversión/inversion), sin signos y espacios colapsados — «El PRECIO me
 * parece caro» y «el precio me parece caro» son LA MISMA lección. NO la
 * variable para guardar en pantalla: la fila lleva la objeción real del
 * cliente; esto solo alimenta la huella.
 */
export function normalizarObjecion(objecion: string): string {
  return objecion
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Huella de la lección cosechada (tema + objeción normalizada, sha256).
 * Dos sesiones muy parecidas producen la MISMA huella; una distinta, otra.
 * La misma objeción bajo DOS TEMAS distintos NO es la misma lección — el
 * tema forma parte de la identidad.
 */
export function huellaLeccion(tema: string, objecion: string): string {
  return createHash('sha256').update(`${tema}\n${normalizarObjecion(objecion)}`).digest('hex');
}

/**
 * Clasifica la sesión en un tema del Playbook POR CONTENIDO, con prioridad
 * de arriba abajo (la primera categoría cuyo enjambre encaje gana): precio,
 * ROI/valor, cierre, confianza, objeción técnica. Determinista: mismas
 * entradas, mismo tema — por eso es auditable y consultable.
 */
export function clasificarTema(history: RoleplayMessage[], postMortem: { tecnica_detectada?: string | null }): string {
  const texto = [
    ...history.slice(-TURNOS_CLASIFICACION).map((m) => m.content),
    postMortem.tecnica_detectada ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (/(precio|coste|costo|caro|presupuesto|descuento|rebaja|tarifa)/.test(texto)) {
    return 'Manejo de objeción de precio';
  }
  if (/(roi|retorno|ahorro|inversi[oó]n|rentab|beneficio|amortiz)/.test(texto)) {
    return 'Justificación de ROI';
  }
  if (/(cerrar|cierre|firmar|contrato|compromiso|pr[oó]xima semana|darle una vuelta)/.test(texto)) {
    return 'Cierre bajo presión';
  }
  if (/(confianza|referencia|reputaci[oó]n|opini[oó]n|seguridad|seguro)/.test(texto)) {
    return 'Construcción de confianza';
  }
  if (/(integraci[oó]n|api|t[eé]cnic|datos|migraci[oó]n|compatib|seguridad de los datos|gdpr)/.test(texto)) {
    return 'Explicación técnica';
  }
  return TEMA_SIN_CLASIFICAR;
}

interface EntradaCosecha {
  tenantId: string;
  agentId: string;
  history: RoleplayMessage[];
  postMortem: {
    puntuacion_cierre: number;
    argumento_mas_fuerte: string;
    punto_de_mejora: string;
    tecnica_detectada: string;
  };
  /** Última barrera antes de la BD: la política del umbral vive aquí también. */
  score: number;
}

/**
 * Guarda la lección en el Playbook, DEDUPLICADA. El umbral (>= UMBRAL_COSECHA)
 * se aplica AQUÍ además de en el llamador: la función es una sola fuente de
 * verdad de la política — si mañana cambia, se cambia en un sitio.
 *
 * Dos sesiones muy parecidas NO crean dos entradas casi iguales: la huella
 * (tema + objeción normalizada) es única por tenant. Si ya existe, devuelve
 * `{ entrada, duplicado: true }` SIN crear fila; el resultado de una primera
 * vez es `{ entrada, duplicado: false }`. El constraint de la BD respalda la
 * decisión: si dos post-mortems compiten, el perdedor no rompe el flujo —
 * entra por el catch de «la cosecha nunca rompe el post-mortem».
 */
export async function cosecharMejorPractica(entrada: EntradaCosecha) {
  const { tenantId, agentId, history, postMortem, score } = entrada;

  if (score < UMBRAL_COSECHA) return null;

  const tema = clasificarTema(history, postMortem);
  const ultimaObjecion = [...history].reverse().find((m) => m.role === 'customer')?.content ?? '';
  const objecion =
    ultimaObjecion.length > MAX_OBJECION
      ? ultimaObjecion.slice(0, MAX_OBJECION) + TRUNCADO
      : ultimaObjecion || 'Resistencia del cliente en la sesión';
  const huella = huellaLeccion(tema, objecion);

  let existente: Awaited<ReturnType<typeof prisma.salesPlaybookEntry.findFirst>> = null;
  try {
    existente = await prisma.salesPlaybookEntry.findFirst({
      where: { tenantId, huellaLeccion: huella },
    });
  } catch {
    // La sonda es una optimización, no la ley: si falla, se intenta crear
    // igual y el constraint único de la BD arbitra (duplicado concurrente →
    // el create falla y entra por el catch de abajo).
    existente = null;
  }
  if (existente) return { entrada: existente, duplicado: true };

  try {

    const entradaNueva = await prisma.salesPlaybookEntry.create({
      data: {
        tenantId,
        agentId,
        topic: tema,
        objection: objecion,
        bestResponse: postMortem.argumento_mas_fuerte,
        technique: postMortem.tecnica_detectada,
        score,
        huellaLeccion: huella,
        status: 'approved',
      },
    });
    return { entrada: entradaNueva, duplicado: false };
  } catch (err) {
    // La cosecha nunca rompe el flujo del post-mortem: la sesión ya está
    // persistida y puntuada; perder la lección (o perder una carrera contra
    // otra cosecha de la misma lección) es registrable, no fatal.
    console.error('[Cosecha] Fallo al guardar la lección en el Playbook:', err);
    return null;
  }
}
