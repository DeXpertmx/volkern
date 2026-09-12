// @vitest-environment node

/**
 * Guardia de la ruta determinista del clasificador.
 *
 * Por qué existe: los tests que clasifican estas frases pasaban en local
 * porque había claves de LLM en el entorno, así que era el modelo —y no las
 * reglas— quien acertaba. En CI no hay claves, `classify()` degrada a
 * `consulta_general` y 9 tests fallaron de golpe.
 *
 * Esta guardia llama AL DETECTOR DETERMINISTA (no a `classify`), de modo que no
 * puede pasar "por suerte" gracias al LLM: si alguien toca una regex y una de
 * estas frases deja de reconocerse, aquí falla.
 *
 * Cubre además la trampa que causó el fallo: en JavaScript `\b` NO casa entre
 * vocal acentuada y espacio ("gané", "gasté"), así que esas alternativas
 * dentro de un grupo anclado con `\b` final nunca se cumplían.
 */

import { describe, it, expect } from 'vitest';
import { IntentClassifierAgent } from '@/lib/agents/intent-classifier';

// Frases que FALLARON en CI (todas caían a consulta_general) y su intent real.
const CASOS: Array<{ mensaje: string; intent: string }> = [
  { mensaje: 'envía un email a maria@empresa.com para agradecer la reunión', intent: 'enviar_mensaje' },
  { mensaje: 'cuánto gané este mes', intent: 'cuenta_resultados' },
  { mensaje: 'predice el riesgo de fallo del activo prensa S1', intent: 'predecir_fallo_activo' },
  { mensaje: 'simula un escenario de producción', intent: 'simular_escenario_produccion' },
  { mensaje: 'qué órdenes no están listas para producir', intent: 'readiness_produccion' },
  { mensaje: 'mueve el portátil de María a Juan', intent: 'transferir_activo' },
  { mensaje: 'reagenda la cita de Juan al viernes a las 4pm', intent: 'reagendar_cita' },
  { mensaje: 'elimina el horario de anuncios de las 9', intent: 'eliminar_horario' },
  { mensaje: 'saca 10 unidades de stock del jabón de baño', intent: 'ajustar_stock' },
  // Variantes del mismo verbo que se atienden igual sin depender del modelo.
  { mensaje: 'borra el horario de la campaña de Meta', intent: 'eliminar_horario' },
  { mensaje: 'mándale un whatsapp a Juan', intent: 'enviar_mensaje' },
];

// No colisiones: ampliar verbos y anclas no debe robarle el turno a otros intents.
const NO_COLISIONA: Array<{ mensaje: string; intentoProhibido: string }> = [
  { mensaje: 'mueve la tarea de enviar documento para mañana', intentoProhibido: 'transferir_activo' },
  { mensaje: 'agrega pendiente: enviar documento a Carlos, vence el viernes', intentoProhibido: 'enviar_mensaje' },
  { mensaje: 'envía un briefing de ventas', intentoProhibido: 'resumen_rrhh' },
  { mensaje: 'elimina la cita de Alejandra', intentoProhibido: 'reagendar_cita' },
];

describe('ruta determinista del clasificador (sin LLM)', () => {
  const classifier = new IntentClassifierAgent() as any;

  it.each(CASOS)('"$mensaje" → $intent', ({ mensaje, intent }) => {
    const det = classifier.detectIntentDeterministically(mensaje);
    expect(det, `"${mensaje}" no se reconoce sin LLM`).toBeTruthy();
    expect(det.intent).toBe(intent);
  });

  it('sigue siendo cancelar_cita cuando se pide cancelar', () => {
    const det = classifier.detectIntentDeterministically('cancela la cita de Alejandra Velázquez');
    expect(det?.intent).toBe('cancelar_cita');
  });

  it.each(NO_COLISIONA)('"$mensaje" no es $intentoProhibido', ({ mensaje, intentoProhibido }) => {
    const det = classifier.detectIntentDeterministically(mensaje);
    expect(det?.intent).not.toBe(intentoProhibido);
  });
});
