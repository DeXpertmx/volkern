/**
 * Redacción inteligente de respuestas.
 *
 * El clasificador determinista sigue siendo el router (rápido y barato), y las
 * skills siguen siendo la fuente de la verdad de los datos. Lo que faltaba para
 * que el chat no fuera «plantillas con instrucciones» es este paso: cuando el
 * resultado de una skill es un análisis o un insight, el LLM (DeepSeek primero)
 * redacta la respuesta final a partir de los datos REALES, respondiendo a lo que
 * preguntó el usuario en su lenguaje y priorizando lo importante.
 *
 * Lo simple no paga este coste: listados, confirmaciones y textos ya generados
 * por IA siguen con su plantilla determinista. Si la IA falla o no hay datos, la
 * plantilla queda como red de seguridad: nunca se pierde una respuesta.
 */

import { callAssistantWithFallback, type OpenRouterMessage } from '@/lib/assistant/openrouter-client';
import type { MensajeDeHistorial } from '@/lib/agents/conversation-history';
import { bloqueDeEntidades, type EntidadesActivas } from '@/lib/agents/context-manager';

/**
 * Intents cuya respuesta requiere inteligencia: análisis, proyecciones,
 * auditorías e insights donde una plantilla fija no responde de verdad (o que
 * ni siquiera tienen plantilla y hoy caen al «✅ ¡Hecho!» genérico).
 * Las consultas simples (listados, confirmaciones) NO están aquí: siguen con
 * plantilla, que es más rápida y precisa para eso.
 */
export const INTENTS_QUE_REQUIEREN_IA = new Set<string>([
  'detectar_ghosting',
  'generar_ruta_exito',
  'analizar_gastos',
  'proyeccion_financiera',
  'proyeccion_impuestos',
  'auditar_integridad_gastos',
  'salud_inventario',
  'watchdog_inventario',
  'analizar_sentimiento',
  'sugerir_campania',
  'sugerir_automatizacion',
  'evaluar_test_ab',
  'resumen_rrhh',
  'riesgo_rotacion',
  'rentabilidad_proyecto',
  'desviaciones_proyecto',
  'auditar_integridad',
  'actividad_campo',
  'auditar_fugas_materiales',
  'analizar_rentabilidad_global',
  'calcular_costo_produccion',
  'detectar_anomalias_calidad',
  'verificar_mermas',
  'sugerir_precio_inmueble',
]);

export interface RedaccionInteligenteInput {
  intent: string;
  /** Mensaje del usuario en este turno (la pregunta que hay que responder). */
  message: string;
  /** Resultado de la skill, tal como lo devuelve el orquestador. */
  data: any;
  /** Turnos anteriores del hilo, para resolver referencias y no repetir. */
  historial?: MensajeDeHistorial[];
  /** Contexto de trabajo del Context Manager (resumen y entidades activas). */
  contexto?: { resumen?: string | null; entidadesActivas?: EntidadesActivas };
  /** Presupuesto de la llamada (camino caliente: acotado al webhook). */
  timeoutMs?: number;
}

/**
 * Redacta la respuesta final con IA a partir del resultado de la skill.
 *
 * Devuelve `null` cuando no hay datos (el mensaje de «no hay resultados» de la
 * plantilla es mejor que cualquier improvisación) o cuando todos los modelos
 * fallan, para que el orquestador caiga a la plantilla sin perder el turno.
 */
export async function redactarRespuestaInteligente(input: RedaccionInteligenteInput): Promise<string | null> {
  const { intent, message, data, historial, contexto, timeoutMs = 9000 } = input;

  if (esResultadoVacio(data)) return null;

  // Los datos se serializan acotados: lo que el modelo necesita para responder,
  // sin reventar el prompt ni dejar que se invente el resto.
  const datos = JSON.stringify(data).slice(0, 6000);

  const system = `Eres Gemma, la asistente de CRM de Volkern. El sistema acaba de resolver la consulta del usuario con la herramienta "${intent}" y obtuvo unos datos. Tu trabajo es convertir esos datos en una respuesta natural, directa y útil en español.

Reglas:
- Responde a la pregunta del usuario usando SOLO los datos que se te dan. No inventes cifras, nombres, fechas ni conclusiones que no estén en los datos.
- Empieza con la conclusión o el dato más importante en una o dos frases; después detalla sólo lo que aporte valor (máx. 8 viñetas con "• ").
- Si los datos indican que no hay nada que reportar, dilo con calma y en positivo (sin inventar nada).
- No menciones "la herramienta", "los datos" ni el nombre técnico del intent; habla de resultados de negocio.
- Si la pregunta se refiere a algo ya dicho en la conversación, resuélvelo con el historial y no repitas lo que ya se dijo.
- Usa un tono comercial cercano, sin tecnicismos innecesarios ni párrafos largos.`;

  const bloqueContexto = [
    contexto?.resumen ? `Resumen anterior: ${contexto.resumen}` : '',
    bloqueDeEntidades(contexto?.entidadesActivas ?? {}),
  ]
    .filter(Boolean)
    .join('\n\n');

  const user = [
    bloqueContexto ? `${bloqueContexto}\n\n` : '',
    `Pregunta del usuario: ${message}`,
    '',
    `Datos obtenidos (JSON):`,
    datos,
  ].join('\n');

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: system },
    ...(historial ?? []),
    { role: 'user', content: user },
  ];

  try {
    const respuesta = await callAssistantWithFallback(messages, timeoutMs);
    const texto = respuesta?.choices?.[0]?.message?.content?.trim();
    if (!texto) return null;
    // Acotar la respuesta para que el chat siga siendo legible.
    return texto.length > 1600 ? `${texto.slice(0, 1597)}…` : texto;
  } catch (error: any) {
    console.warn('[RedaccionIA] La IA no pudo redactar; se usa la plantilla:', error?.message || error);
    return null;
  }
}

/**
 * ¿El resultado de la skill no tiene contenido para redactar? Un array vacío,
 * un objeto vacío o un objeto cuyas claves son todas vacías (p. ej.
 * `{ leads: [] }`) se tratan como «sin resultados»: el mensaje determinista de
 * la plantilla es más fiable que pedirle al modelo que improvise.
 */
export function esResultadoVacio(data: any): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data !== 'object') return false;
  const keys = Object.keys(data);
  if (keys.length === 0) return true;
  return keys.every((k) => esResultadoVacio(data[k]));
}
