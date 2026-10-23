/**
 * Alertas de códigos promocionales que no convierten — módulo PURO.
 *
 * La tabla de Descuentos ya dice cuántas consultas y cuántas reservas lleva cada
 * código. El problema es que hay que entrar a mirarla: un código que se prueba
 * mucho y no cierra nada sigue publicado, sigue apareciendo en la web y sigue
 * gastando la atención del huésped (y, si alguna vez convierte, el descuento)
 * hasta que alguien se da cuenta. Este módulo decide **cuándo hay que avisar**.
 *
 * Reglas que este módulo hace cumplir, y por qué:
 * - **Muestra suficiente antes de juzgar.** Un código recién creado con 3
 *   consultas no ha fracasado: no hay datos. Con menos de
 *   `MINIMO_CONSULTAS_ALERTA` no se avisa, ni siquiera con 0 conversiones.
 * - **«No convierte» es un porcentaje, no una corazonada.** Por debajo de
 *   `CONVERSION_MINIMA_PCT` se considera que el código no está vendiendo. El
 *   umbral es bajo a propósito: el aviso tiene que señalar lo que claramente no
 *   funciona, no cada promoción que rinde un poco menos que la mejor.
 * - **Solo códigos activos.** Apagar uno que ya está apagado no es una acción;
 *   avisar de él sería ruido. Los inactivos se ignoran aunque tengan consultas
 *   viejas.
 * - **La ventana es de REGISTRO, no de estancia.** Aquí se juzga la actividad
 *   reciente del código (`fecha` de la consulta), no las fechas de la estancia:
 *   una consulta para dentro de seis meses es un intento de hoy, y con la
 *   ventana de check-in del informe quedaría fuera.
 * - **El aviso no se repite cada día.** El mismo código solo vuelve a avisar
 *   pasado un intervalo, o antes si aparece un código nuevo en la lista: lo
 *   nuevo merece un aviso, lo que ya se sabía no.
 * - **Sin consultas no hay alerta.** Un código sin usar no es un código que no
 *   convierte: no hay nada que medir. La tabla lo enseña con ceros y este módulo
 *   se calla.
 */

import { normalizarCodigo } from './booking-promos';
import { porcentajeConversion } from './promos-consultas';

/** Consultas mínimas para que la conversión signifique algo. */
export const MINIMO_CONSULTAS_ALERTA = 20;

/** Por debajo de este porcentaje, con muestra suficiente, el código no vende. */
export const CONVERSION_MINIMA_PCT = 5;

/** Días de consultas que se miran: la actividad reciente del código. */
export const DIAS_VENTANA_ALERTA = 90;

/** Intervalo mínimo entre avisos del MISMO código si no aparece uno nuevo. */
export const INTERVALO_ALERTA_MS = 7 * 24 * 60 * 60 * 1000;

/** Códigos que se detallan en un aviso (el resto se cuenta). */
export const MAX_CODIGOS_EN_AVISO = 5;

const DIA_MS = 86_400_000;

/** Inicio de la ventana de alertas: hace `DIAS_VENTANA_ALERTA` días. */
export function desdeVentanaAlertas(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - DIAS_VENTANA_ALERTA * DIA_MS);
}

/** Código del catálogo, con su cuenta y si está publicado. */
export interface CodigoPromocional {
  tenantId: string;
  codigo: string;
  activo: boolean;
}

/** Consulta aplicada, reducida a lo que decide la alerta. */
export interface ConsultaConCodigo {
  tenantId: string;
  codigo: string;
  /** Reserva de la misma sesión: es la conversión demostrable. */
  reservationId?: string | null;
}

export interface CodigoConConsultas {
  tenantId: string;
  codigo: string;
  activo: boolean;
  consultas: number;
  consultasConvertidas: number;
}

/**
 * Cruza el catálogo con las consultas y devuelve una fila por (cuenta, código).
 *
 * Las consultas de un código que **ya no está en el catálogo** no se alertan:
 * no hay nada que apagar ni mensaje que reescribir. Tampoco se inventan filas
 * para códigos sin consultas: un cero no es una alerta.
 */
export function contarConsultas(
  codigos: CodigoPromocional[],
  consultas: ConsultaConCodigo[]
): CodigoConConsultas[] {
  const porClave = new Map<string, CodigoConConsultas>();

  for (const definicion of codigos) {
    const codigo = normalizarCodigo(definicion.codigo);
    if (!codigo) continue;
    const clave = `${definicion.tenantId}|${codigo}`;
    if (porClave.has(clave)) continue;
    porClave.set(clave, {
      tenantId: definicion.tenantId,
      codigo,
      activo: definicion.activo !== false,
      consultas: 0,
      consultasConvertidas: 0,
    });
  }

  for (const consulta of consultas) {
    const codigo = normalizarCodigo(consulta.codigo);
    if (!codigo) continue;
    const fila = porClave.get(`${consulta.tenantId}|${codigo}`);
    if (!fila) continue;
    fila.consultas += 1;
    if (consulta.reservationId) fila.consultasConvertidas += 1;
  }

  return Array.from(porClave.values());
}

export type MotivoAlerta = 'sin_conversion' | 'conversion_baja';

export interface AlertaPromocion {
  tenantId: string;
  codigo: string;
  consultas: number;
  consultasConvertidas: number;
  /** Consultas aplicadas que no acabaron en reserva. */
  consultasSinReserva: number;
  conversionPct: number;
  motivo: MotivoAlerta;
  /** Frase lista para el panel y el aviso. */
  mensaje: string;
}

export interface OpcionesAlerta {
  minimoConsultas?: number;
  conversionMinimaPct?: number;
}

/**
 * Códigos que están gastando intentos sin vender.
 *
 * Se juzga con el porcentaje redondeado que ve el hotel en la tabla (mismo
 * `porcentajeConversion`), para que el aviso y el panel nunca den cifras
 * distintas del mismo código.
 */
export function evaluarAlertasPromocion(
  entradas: CodigoConConsultas[],
  opciones: OpcionesAlerta = {}
): AlertaPromocion[] {
  const minimo = opciones.minimoConsultas ?? MINIMO_CONSULTAS_ALERTA;
  const umbral = opciones.conversionMinimaPct ?? CONVERSION_MINIMA_PCT;

  return entradas
    .filter((entrada) => entrada.activo && entrada.consultas >= minimo)
    .map((entrada) => {
      const conversionPct = porcentajeConversion(
        entrada.consultasConvertidas,
        entrada.consultas
      );
      if (conversionPct >= umbral) return null;

      const sinReserva = Math.max(0, entrada.consultas - entrada.consultasConvertidas);
      const motivo: MotivoAlerta =
        entrada.consultasConvertidas === 0 ? 'sin_conversion' : 'conversion_baja';
      const mensaje =
        motivo === 'sin_conversion'
          ? `Nadie reservó tras aplicarlo en ${entrada.consultas} consultas.`
          : `Solo ${entrada.consultasConvertidas} de ${entrada.consultas} consultas acabaron en reserva (${conversionPct} %).`;

      return {
        tenantId: entrada.tenantId,
        codigo: entrada.codigo,
        consultas: entrada.consultas,
        consultasConvertidas: entrada.consultasConvertidas,
        consultasSinReserva: sinReserva,
        conversionPct,
        motivo,
        mensaje,
      } satisfies AlertaPromocion;
    })
    .filter((alerta): alerta is AlertaPromocion => alerta !== null)
    .sort((a, b) => b.consultas - a.consultas || a.codigo.localeCompare(b.codigo));
}

/** Agrupa las alertas por cuenta: el aviso se manda por hotel, no por código. */
export function agruparAlertasPorTenant(
  alertas: AlertaPromocion[]
): Map<string, AlertaPromocion[]> {
  const porTenant = new Map<string, AlertaPromocion[]>();
  for (const alerta of alertas) {
    const lista = porTenant.get(alerta.tenantId);
    if (lista) lista.push(alerta);
    else porTenant.set(alerta.tenantId, [alerta]);
  }
  return porTenant;
}

export type MotivoDecision =
  | 'sin_alertas'
  | 'primer_aviso'
  | 'codigo_nuevo'
  | 'intervalo'
  | 'aviso_reciente';

export interface DecisionAvisoPromos {
  avisar: boolean;
  motivo: MotivoDecision;
}

/**
 * ¿Toca avisar de estas alertas? **Puro**: se prueba sin base ni fechas reales.
 *
 * El orden importa: no hay alertas (nada que decir), primera vez, código nuevo
 * (lo que no se avisó antes se cuenta ya) y, solo después, el intervalo. Así un
 * código que empieza a fallar hoy no espera una semana a que toque el resumen.
 */
export function decidirAvisoPromos(input: {
  alertas: AlertaPromocion[];
  ultimoAviso: Date | null;
  /** Códigos que ya viajaron en el aviso anterior. */
  codigosAvisados?: string[];
  ahora: Date;
  intervaloMs?: number;
}): DecisionAvisoPromos {
  if (input.alertas.length === 0) return { avisar: false, motivo: 'sin_alertas' };
  if (!input.ultimoAviso) return { avisar: true, motivo: 'primer_aviso' };

  const yaAvisados = new Set(input.codigosAvisados ?? []);
  if (input.alertas.some((alerta) => !yaAvisados.has(alerta.codigo))) {
    return { avisar: true, motivo: 'codigo_nuevo' };
  }

  const intervalo = input.intervaloMs ?? INTERVALO_ALERTA_MS;
  if (input.ahora.getTime() - input.ultimoAviso.getTime() >= intervalo) {
    return { avisar: true, motivo: 'intervalo' };
  }

  return { avisar: false, motivo: 'aviso_reciente' };
}

/**
 * Códigos que quedaron registrados en la marca del aviso anterior.
 *
 * La marca (`HospitalitySyncLog.responseBody`) es también el reloj del
 * intervalo: si no se puede leer, se trata como «no se avisó nada» y el
 * intervalo decide —nunca al revés, que silenciaría el aviso para siempre.
 */
export function codigosDeMarca(cuerpo: unknown): string[] {
  const codigos = (cuerpo as { codigos?: unknown } | null)?.codigos;
  if (!Array.isArray(codigos)) return [];
  return codigos
    .map((codigo) => normalizarCodigo(codigo))
    .filter((codigo): codigo is string => Boolean(codigo));
}

/** Cuerpo del aviso: qué códigos fallan, con qué números y qué hacer. */
export function construirAvisoPromos(
  alertas: AlertaPromocion[],
  opciones: { enlace?: string; maxDetalle?: number } = {}
): { title: string; body: string } {
  const maxDetalle = opciones.maxDetalle ?? MAX_CODIGOS_EN_AVISO;
  const total = alertas.length;
  const title = `${total} código(s) promocional(es) no convierten`;

  // El mensaje de la alerta YA lleva los números: repetirlos aquí haría un
  // cuerpo que se lee dos veces.
  const lineas = alertas
    .slice(0, maxDetalle)
    .map((alerta) => `• ${alerta.codigo}: ${alerta.mensaje}`);
  if (total > maxDetalle) lineas.push(`… y ${total - maxDetalle} más.`);

  const enlace = opciones.enlace ?? '/dashboard/hospitality/booking-engine';
  lineas.push(
    `Revísalos en ${enlace}: apágalos o reescribe su mensaje antes de que sigan sumando intentos sin venta.`
  );

  return { title, body: lineas.join('\n') };
}
