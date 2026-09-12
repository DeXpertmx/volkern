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
 *
 * Los casos NO viven aquí: se leen de `scripts/smoke-clasificador.casos.json`,
 * que es el mismo archivo que usa el smoke test post-despliegue
 * (scripts/smoke-clasificador.sh). Una frase renombrada se cambia una vez y
 * ambas comprobaciones la ven.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntentClassifierAgent } from '@/lib/agents/intent-classifier';

type Caso = { mensaje: string; intent: string };
type CasoSinColision = { mensaje: string; intentoProhibido: string };

function cargarCasos(): { deterministas: Caso[]; sinColision: CasoSinColision[] } {
  // El cwd de vitest es nextjs_space, pero se contempla el caso de correr
  // desde la raíz del monorepo (misma convención que las guardias de deploy).
  for (const base of [process.cwd(), join(process.cwd(), 'nextjs_space')]) {
    const ruta = join(base, 'scripts', 'smoke-clasificador.casos.json');
    try {
      return JSON.parse(readFileSync(ruta, 'utf8'));
    } catch {
      /* siguiente base */
    }
  }
  throw new Error('No se encontró scripts/smoke-clasificador.casos.json');
}

const { deterministas: CASOS, sinColision: NO_COLISIONA } = cargarCasos();

describe('ruta determinista del clasificador (sin LLM)', () => {
  const classifier = new IntentClassifierAgent() as any;

  it('el archivo de casos compartido tiene contenido', () => {
    // Sin esto, un JSON vacío dejaría las comprobaciones siguientes sin casos
    // y la suite pasaría sin comprobar nada.
    expect(CASOS.length).toBeGreaterThan(5);
    expect(NO_COLISIONA.length).toBeGreaterThan(2);
  });

  it.each(CASOS)('"$mensaje" → $intent', ({ mensaje, intent }) => {
    const det = classifier.detectIntentDeterministically(mensaje);
    expect(det, `"${mensaje}" no se reconoce sin LLM`).toBeTruthy();
    expect(det.intent).toBe(intent);
  });

  it.each(NO_COLISIONA)('"$mensaje" no es $intentoProhibido', ({ mensaje, intentoProhibido }) => {
    const det = classifier.detectIntentDeterministically(mensaje);
    expect(det?.intent).not.toBe(intentoProhibido);
  });
});
