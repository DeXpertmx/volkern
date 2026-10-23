/**
 * Consultas de códigos promocionales — módulo PURO.
 *
 * Una reserva dice que un código funcionó; no dice cuánta gente lo probó y se
 * fue. Sin el intento no hay conversión que medir, solo ventas ya cerradas.
 * Este módulo resume las consultas que registra la web pública para que el
 * informe de rendimiento pueda responder «de cada 10 personas que aplicaron
 * este código, ¿cuántas reservaron?».
 *
 * Reglas que este módulo hace cumplir, y por qué:
 * - **Una sesión, una consulta por código.** El asistente manda un `sesionId`
 *   estable mientras dura la visita; probar el mismo código tres veces no puede
 *   inflar el denominador de la conversión. La base lo garantiza con una
 *   unicidad (tenant, sesión, código) y aquí se normaliza el identificador.
 * - **Sin sesión no se atribuye conversión.** Una consulta sin `sesionId` (una
 *   integración, un cliente antiguo) se cuenta como intento, pero no puede
 *   marcarse como convertida: atribuirla a la siguiente reserva del código sería
 *   inventar el dato. La conversión que se publica es la que se puede demostrar,
 *   y el informe declara ese hueco.
 * - **«Aplicada» es el único resultado que entra en el denominador.** Un código
 *   rechazado (inactivo, fuera de fechas, estancia corta…) no fue una consulta
 *   que el huésped pudiera convertir: se cuenta aparte como intento rechazado,
 *   que es justo el dato que enseña por qué una campaña no arranca.
 * - **Los códigos que no existen se agrupan.** Un intento con un código que el
 *   hotel nunca creó es una errata o una campaña sin dar de alta; aparece como
 *   sugerencia, no como una fila más del catálogo.
 */

import { normalizarCodigo } from './booking-promos';

/** Resultado de una consulta que sí podía aplicarse. */
export const CONSULTA_APLICADA = 'aplicada';

const LARGO_SESION_MIN = 8;
const LARGO_SESION_MAX = 80;

/**
 * Identificador de sesión válido, o `null`. Solo se aceptan letras, números,
 * guion y guion bajo: el valor viaja desde el navegador y acaba como clave de
 * una unicidad, así que no puede ser texto libre.
 */
export function normalizarSesion(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const sesion = valor.trim();
  if (sesion.length < LARGO_SESION_MIN || sesion.length > LARGO_SESION_MAX) return null;
  return /^[A-Za-z0-9_-]+$/.test(sesion) ? sesion : null;
}

/**
 * Sesión para el asistente de reserva. `randomUUID` existe en el navegador y en
 * el servidor; el respaldo solo cubre entornos sin Web Crypto (navegadores muy
 * viejos), donde un identificador con la misma forma sigue sirviendo.
 */
export function generarSesionPromo(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ses-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Consulta tal como se guardó en la base. */
export interface ConsultaPromocion {
  codigo: string;
  /** «aplicada» o el motivo del rechazo (`inactiva`, `no_existe`…). */
  resultado: string;
  /** Reserva que nació de esta misma sesión y código, si la hubo. */
  reservationId?: string | null;
  sesionId?: string | null;
}

export interface ResumenConsultasPorCodigo {
  /** Consultas con el código aplicable (denominador de la conversión). */
  aplicadas: number;
  /** De esas, las que constan convertidas en una reserva. */
  convertidas: number;
  /** Consultas rechazadas por las condiciones del código. */
  rechazadas: number;
}

export interface ResumenConsultas {
  porCodigo: Map<string, ResumenConsultasPorCodigo>;
  aplicadas: number;
  convertidas: number;
  rechazadas: number;
  /**
   * Intentos con códigos que no están en el catálogo, ordenados por frecuencia.
   * Son erratas o campañas sin crear: no se mezclan con el rendimiento de los
   * códigos reales.
   */
  deCodigosDesconocidos: Array<{ codigo: string; intentos: number }>;
}

/**
 * Agrupa las consultas por código.
 *
 * `codigosDelCatalogo` decide qué es «conocido». Las consultas con un código
 * desconocido cuentan en `deCodigosDesconocidos`; una consulta aplicada con un
 * código ya borrado no entra ahí (se aplicó de verdad), pero tampoco se pierde:
 * `porCodigo` la conserva para que el informe pueda decidir si la enseña.
 */
export function resumirConsultas(
  consultas: ConsultaPromocion[],
  codigosDelCatalogo: Iterable<string> = []
): ResumenConsultas {
  const conocidos = new Set(
    Array.from(codigosDelCatalogo)
      .map((codigo) => normalizarCodigo(codigo))
      .filter(Boolean)
  );
  const porCodigo = new Map<string, ResumenConsultasPorCodigo>();
  const desconocidos = new Map<string, number>();
  let aplicadas = 0;
  let convertidas = 0;
  let rechazadas = 0;

  for (const consulta of consultas) {
    const codigo = normalizarCodigo(consulta.codigo);
    // Sin código legible no se puede atribuir a nadie: no se reparte.
    if (!codigo) continue;

    const aplicada = consulta.resultado === CONSULTA_APLICADA;
    if (!aplicada && !conocidos.has(codigo)) {
      desconocidos.set(codigo, (desconocidos.get(codigo) || 0) + 1);
      continue;
    }

    const fila = porCodigo.get(codigo) || { aplicadas: 0, convertidas: 0, rechazadas: 0 };
    porCodigo.set(codigo, fila);

    if (aplicada) {
      fila.aplicadas += 1;
      aplicadas += 1;
      if (consulta.reservationId) {
        fila.convertidas += 1;
        convertidas += 1;
      }
    } else {
      fila.rechazadas += 1;
      rechazadas += 1;
    }
  }

  return {
    porCodigo,
    aplicadas,
    convertidas,
    rechazadas,
    deCodigosDesconocidos: Array.from(desconocidos.entries())
      .map(([codigo, intentos]) => ({ codigo, intentos }))
      .sort((a, b) => b.intentos - a.intentos || a.codigo.localeCompare(b.codigo))
      .slice(0, 20),
  };
}

/** Porcentaje de conversión, con 0 cuando no hubo consultas (nunca NaN). */
export function porcentajeConversion(convertidas: number, aplicadas: number): number {
  if (!(aplicadas > 0)) return 0;
  return Math.round(((convertidas / aplicadas) * 100 + Number.EPSILON) * 100) / 100;
}
