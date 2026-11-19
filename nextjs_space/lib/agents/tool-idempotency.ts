/**
 * Idempotencia de las herramientas del agente.
 *
 * Un doble clic, un reintento del modelo o una petición repetida no deben crear
 * dos tareas, dos notas ni dos interacciones. La clave es
 * `(usuario, conversación, herramienta, hash de argumentos)`: la misma persona,
 * en el mismo hilo, pidiendo lo mismo, es la misma operación.
 *
 * Se apoya en la capa de idempotencia que ya usa el resto del sistema
 * (`lib/skills/idempotency`): registro en BD con respaldo en memoria y TTL.
 * Aquí sólo se define la clave y se traduce el duplicado a un resultado que el
 * modelo pueda explicar, en vez de un error.
 */
import { createHash } from 'node:crypto';
import idempotencyService from '@/lib/skills/idempotency';

/** Cuánto vive la clave: cubre el doble clic y el reintento de la misma sesión. */
const TTL_SEGUNDOS = 15 * 60;

/** Clave cuando la ejecución no viene de un hilo (trabajos y pruebas). */
export const SIN_CONVERSACION = 'sin-conversacion';

/** JSON canónico: el orden de las claves no cambia la huella. */
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === 'object') {
    return Object.keys(valor as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, clave) => {
        acc[clave] = canonico((valor as Record<string, unknown>)[clave]);
        return acc;
      }, {});
  }
  return valor;
}

/** Clave de idempotencia de una ejecución del agente. */
export function claveIdempotencia(params: {
  userId: string;
  conversacionId: string;
  herramienta: string;
  argumentos: Record<string, unknown>;
}): string {
  const huella = createHash('sha256')
    .update(JSON.stringify(canonico(params.argumentos ?? {})))
    .digest('hex')
    .slice(0, 32);

  return `agente:${params.userId}:${params.conversacionId}:${params.herramienta}:${huella}`;
}

/**
 * Ejecuta `fn` una sola vez por clave.
 *
 * - Si ya se completó, devuelve el resultado guardado y `repetida: true`.
 * - Si otra ejecución con la misma clave está en curso, no lanza una segunda:
 *   devuelve un aviso idempotente para que el modelo no la repita.
 * - Si la anterior falló, libera la clave y reintenta: un fallo no es un
 *   duplicado y bloquearlo dejaría la acción imposible hasta caducar.
 */
export async function ejecutarUnaVez<T>(
  clave: string,
  fn: () => Promise<T>
): Promise<{ resultado: T; repetida: boolean }> {
  for (let intento = 0; intento < 2; intento++) {
    const iniciada = await idempotencyService.start(clave, {
      ttlSeconds: TTL_SEGUNDOS,
      scope: 'agente',
    });

    if (iniciada) {
      try {
        const resultado = await fn();
        await idempotencyService.complete(clave, resultado);
        return { resultado, repetida: false };
      } catch (error) {
        await idempotencyService.fail(clave, error);
        throw error;
      }
    }

    const previo = await idempotencyService.check(clave);
    if (previo?.status === 'completed') {
      return { resultado: previo.result as T, repetida: true };
    }

    if (previo?.status === 'failed' && intento === 0) {
      await idempotencyService.clear(clave);
      continue;
    }

    return {
      resultado: {
        ok: true,
        idempotente: true,
        mensaje: 'La operación ya se estaba guardando; no se ha duplicado.',
      } as T,
      repetida: true,
    };
  }

  // El bucle sólo puede salir por un `continue` del primer intento; si no,
  // habría vuelto con un resultado.
  throw new Error(`No se pudo ejecutar la operación idempotente ${clave}`);
}
