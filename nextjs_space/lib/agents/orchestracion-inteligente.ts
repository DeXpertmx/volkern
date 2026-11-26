/**
 * Etapa D — Orquestación inteligente de procesos complejos coordinados.
 *
 * Un proceso (ej: «tengo cinco propiedades nuevas, busca compradores
 * compatibles, identifica los tres mejores para cada una y prepara los
 * seguimientos») no es una sola llamada al CRM: es una secuencia de pasos que
 * consulta catálogo, compradores, calcula compatibilidad, selecciona
 * candidatos, prepara mensajes, solicita aprobación y registra resultados.
 *
 * Este módulo no es un LLM: el plan y la decisión de herramientas son
 * deterministas y derivan de los módulos existentes (registro de herramientas,
 * clasificación de riesgo, gates de aprobación, idempotencia). Cada paso
 * ejecuta herramientas a través de `ejecutarHerramientaDelAgente`, así que
 * se respeta el permiso del turno, la clase de riesgo y la trazabilidad.
 *
 * Métricas que expone:
 * - tasa de ejecución correcta (pasos ejecutados sin error)
 * - errores de selección de herramientas (pasos cuya herramienta no existe)
 * - operaciones que necesitan intervención humana (clase C/D sin aprobación)
 */

import {
  ejecutarHerramientaDelAgente,
  AprobacionRequeridaError,
  PermisoDenegadoError,
  definicionDe,
  RestriccionesMcp,
} from '@/lib/agents/tool-registry';
import type { RolDeUsuario } from '@/lib/agents/crm-tool-permissions';
import { guardarProcesoPendiente, type PasoPendiente } from './proceso-pendiente';

/** Resultados ya ejecutados, indexados por nombre de paso. */
export type ResultadosPrevios = Record<string, ResultadoPaso>;

/** Un paso del proceso: nombre, herramienta a invocar y sus argumentos. */
export interface PasoProceso {
  nombre: string;
  herramienta: string;
  args: Record<string, any>;
  /**
   * Completa los argumentos con lo que devolvieron pasos anteriores (la
   * propiedad y el comprador reales, no un placeholder). Si devuelve null, el
   * paso no aplica a los datos encontrados y se omite.
   */
  derivar?: (previos: ResultadosPrevios) => Record<string, any> | null;
  /** Si es falso, el orquestador detiene el proceso en este paso. */
  esencial?: boolean;
}

/** Resultado de ejecutar un paso. */
export interface ResultadoPaso {
  nombre: string;
  herramienta: string;
  estado: 'ok' | 'denegado' | 'aprobacion' | 'error' | 'omitido';
  resultado?: any;
  error?: string;
  /** ¿Necesita intervención humana? (clase C/D sin aprobación concedida). */
  necesitaIntervencionHumana: boolean;
}

/** Resultado completo del proceso orquestado. */
export interface ResultadoProceso {
  nombreProceso: string;
  pasos: ResultadoPaso[];
  /** Porcentaje de pasos esenciales ejecutados que terminaron en ok. */
  tasaEjecucionCorrecta: number;
  /** Pasos cuya herramienta no existe en el registro. */
  erroresSeleccionHerramienta: number;
  /** Pasos que quedaron a la espera de aprobación humana. */
  operacionesIntervencionHumana: number;
  /** Resultado final estructurado del proceso (para el chat). */
  resumen: string;
}

/** Filtros del plan inmobiliario, sin la identidad del tenant. */
export interface FiltrosProceso {
  zona?: string;
  tipoOperacion?: string;
  tipoInmueble?: string;
  habitaciones?: number;
  precioMax?: number;
  limitePropiedades?: number;
  topCompradores?: number;
}

/**
 * Contexto de ejecución del proceso: identidad de la sesión y hilo de chat.
 */
export interface ContextoProceso {
  tenantId: string;
  userId: string;
  conversacionId?: string;
  usuario: RolDeUsuario;
  restricciones?: RestriccionesMcp;
}

/** Inmuebles devueltos por `search_properties_by_filters`. */
function propiedadesDe(resultado?: ResultadoPaso): any[] {
  const propiedades = resultado?.resultado?.properties;
  return Array.isArray(propiedades) ? propiedades : [];
}

/** Compradores con ficha de lead devueltos por `volkern_list_deals`. */
function compradoresDe(resultado?: ResultadoPaso): Array<{ nombre: string; email?: string }> {
  const deals = resultado?.resultado?.deals;
  if (!Array.isArray(deals)) return [];
  return deals
    .map((deal: any) => ({
      nombre: String(deal?.lead?.nombre || '').trim(),
      email: deal?.lead?.email || undefined,
    }))
    .filter((comprador) => comprador.nombre);
}

/** Valores reales del inventario encontrado, para calcular compatibilidad. */
function referenciaDeInventario(propiedades: any[]) {
  const precios = propiedades
    .map((p) => Number(p?.precioBase))
    .filter((n) => Number.isFinite(n) && n > 0);
  const habitaciones = propiedades
    .map((p) => Number(p?.bedrooms))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    tipoOperacion: propiedades.find((p) => p?.operationType)?.operationType,
    tipoInmueble: propiedades.find((p) => p?.propertyType)?.propertyType,
    ciudad: propiedades.find((p) => p?.city)?.city,
    precioMax: precios.length ? Math.max(...precios) : undefined,
    habitaciones: habitaciones.length ? Math.min(...habitaciones) : undefined,
  };
}

/**
 * Resuelve un tramo del plan con lo ya ejecutado, para guardarlo y poder
 * reanudarlo sin funciones: los pasos sin datos quedan marcados como omitidos.
 */
function resolverPasos(pasos: PasoProceso[], previos: ResultadosPrevios): PasoPendiente[] {
  return pasos.map((paso) => {
    const derivados = paso.derivar ? paso.derivar(previos) : {};
    if (derivados === null) {
      return {
        nombre: paso.nombre,
        herramienta: paso.herramienta,
        args: {},
        esencial: paso.esencial,
        omitido: true,
      };
    }
    return {
      nombre: paso.nombre,
      herramienta: paso.herramienta,
      args: { ...paso.args, ...derivados },
      esencial: paso.esencial,
    };
  });
}

/**
 * OrquestadorInteligente: descompone un proceso en pasos y ejecuta cada uno
 * con la herramienta adecuada, respetando permisos, riesgo e idempotencia.
 */
export class OrquestadorInteligente {
  /**
   * Ejecuta un proceso paso a paso. Si un paso de clase C/D exige aprobación,
   * el proceso se pausa: los pasos que quedaban se guardan y se reanudan al
   * resolverse la solicitud, con el mismo hilo y la misma identidad.
   */
  async ejecutarProceso(
    nombreProceso: string,
    pasos: PasoProceso[],
    ctx: ContextoProceso
  ): Promise<ResultadoProceso> {
    const resultados: ResultadoPaso[] = [];
    const previos: ResultadosPrevios = {};
    let esencialesEjecutados = 0;
    let esencialesCorrectos = 0;
    let erroresSeleccionHerramienta = 0;

    for (const [indice, paso] of pasos.entries()) {
      if (!definicionDe(paso.herramienta)) {
        erroresSeleccionHerramienta++;
        resultados.push({
          nombre: paso.nombre,
          herramienta: paso.herramienta,
          estado: 'error',
          error: `herramienta desconocida: ${paso.herramienta}`,
          necesitaIntervencionHumana: false,
        });
        if (paso.esencial !== false) break;
        continue;
      }

      // Los argumentos se completan con lo que han devuelto los pasos previos:
      // la propiedad y el comprador reales sustituyen a los filtros del plan.
      const derivados = paso.derivar ? paso.derivar(previos) : {};
      if (derivados === null) {
        const omitido: ResultadoPaso = {
          nombre: paso.nombre,
          herramienta: paso.herramienta,
          estado: 'omitido',
          necesitaIntervencionHumana: false,
        };
        resultados.push(omitido);
        previos[paso.nombre] = omitido;
        continue;
      }
      const args = { ...paso.args, ...derivados };

      let estado: ResultadoPaso['estado'] = 'ok';
      let resultado: any;
      let error: string | undefined;
      let necesitaIntervencionHumana = false;
      let approvalId: string | undefined;

      try {
        resultado = await ejecutarHerramientaDelAgente(
          paso.herramienta,
          args,
          {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            conversacionId: ctx.conversacionId,
            autorizacion: { usuario: ctx.usuario, restricciones: ctx.restricciones },
          }
        );
      } catch (err: any) {
        if (err instanceof AprobacionRequeridaError) {
          estado = 'aprobacion';
          necesitaIntervencionHumana = true;
          error = err.message;
          approvalId = err.approvalId;
        } else if (err instanceof PermisoDenegadoError) {
          estado = 'denegado';
          error = err.motivo;
        } else {
          estado = 'error';
          error = err?.message || String(err);
        }
      }

      const ejecutado: ResultadoPaso = {
        nombre: paso.nombre,
        herramienta: paso.herramienta,
        estado,
        resultado,
        error,
        necesitaIntervencionHumana,
      };
      resultados.push(ejecutado);
      previos[paso.nombre] = ejecutado;

      const esEsencial = paso.esencial !== false;
      if (esEsencial) {
        esencialesEjecutados++;
        if (estado === 'ok') esencialesCorrectos++;
      }

      // Aprobación pendiente: el proceso se pausa con los pasos que quedaban
      // guardados, y se reanuda cuando el responsable resuelva la solicitud.
      if (estado === 'aprobacion') {
        const pendientes = pasos.slice(indice + 1);
        if (approvalId && pendientes.length) {
          await guardarProcesoPendiente({
            approvalId,
            nombreProceso,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            conversacionId: ctx.conversacionId,
            pasos: resolverPasos(pendientes, previos),
          });
        }
        break;
      }

      // Paso esencial fallido: el proceso se detiene.
      if (estado !== 'ok' && esEsencial) break;
    }

    const tasaEjecucionCorrecta =
      esencialesEjecutados === 0
        ? 100
        : (esencialesCorrectos / esencialesEjecutados) * 100;
    const operacionesIntervencionHumana = resultados.filter(
      (r) => r.necesitaIntervencionHumana
    ).length;

    const resumen = this.construirResumen(nombreProceso, resultados);

    return {
      nombreProceso,
      pasos: resultados,
      tasaEjecucionCorrecta,
      erroresSeleccionHerramienta,
      operacionesIntervencionHumana,
      resumen,
    };
  }

  /**
   * Plan canónico del ejemplo de la Etapa D:
   * «tengo cinco propiedades nuevas, busca compradores compatibles, identifica
   * los tres mejores para cada una y prepara los seguimientos»
   *
   * Pasos:
   * 1. Identificar las propiedades (buscar_propiedades / search_properties_by_filters)
   * 2. Consultar características de cada propiedad (catalog-skills / leer catálogo)
   * 3. Buscar demandas de compradores (list_deals / buscar_persona)
   * 4. Calcular compatibilidad sobre el inventario encontrado
   * 5. Marcar como propuesta el negocio del comprador encontrado
   * 6. Preparar el seguimiento de ese comprador (crear_tarea)
   * 7. Solicitar aprobación del envío (clase C: send_message)
   * 8. Registrar el resultado en la ficha del comprador (crear_nota)
   *
   * Los pasos 4-8 derivan sus argumentos de los resultados anteriores: si la
   * búsqueda no devuelve inmuebles o no hay compradores con ficha, el paso se
   * omite en vez de ejecutarse con datos inventados.
   */
  planificarProcesoInmobiliario(
    args: FiltrosProceso & { tenantId: string }
  ): PasoProceso[] {
    const {
      zona,
      tipoOperacion = 'venta',
      tipoInmueble,
      habitaciones,
      precioMax,
      limitePropiedades = 5,
      topCompradores = 3,
    } = args;

    const pasos: PasoProceso[] = [
      {
        nombre: 'identificar_propiedades',
        herramienta: 'search_properties_by_filters',
        args: {
          tenantId: args.tenantId,
          query: '',
          tipo_operacion: tipoOperacion,
          tipo_inmueble: tipoInmueble,
          zona,
          habitaciones,
          precio_max: precioMax,
          limit: limitePropiedades,
        },
        esencial: true,
      },
      {
        nombre: 'consultar_caracteristicas_propiedades',
        herramienta: 'volkern_list_catalogo',
        args: { tenantId: args.tenantId, tipo: 'inmueble', activo: true },
        esencial: false,
      },
      {
        nombre: 'buscar_compradores',
        herramienta: 'volkern_list_deals',
        args: { tenantId: args.tenantId, etapa: 'calificacion' },
        esencial: false,
      },
      {
        nombre: 'calcular_compatibilidad',
        herramienta: 'recommend_properties',
        args: { tenantId: args.tenantId, limit: topCompradores },
        // La compatibilidad se mide contra el inventario real; sin inmuebles
        // encontrados no hay nada que comparar.
        derivar: (previos) => {
          const propiedades = propiedadesDe(previos.identificar_propiedades);
          return propiedades.length ? referenciaDeInventario(propiedades) : null;
        },
        esencial: false,
      },
      {
        nombre: 'seleccionar_top_compradores',
        herramienta: 'update_deal',
        args: {
          tenantId: args.tenantId,
          etapa: 'propuesta',
          prioridad: 'alta',
        },
        derivar: (previos) => {
          const [comprador] = compradoresDe(previos.buscar_compradores);
          return comprador ? { nombre: comprador.nombre, email: comprador.email } : null;
        },
        esencial: false,
      },
      {
        nombre: 'preparar_seguimientos',
        herramienta: 'crear_tarea',
        args: {
          tenantId: args.tenantId,
          titulo: 'Seguimiento de compatibilidad',
          tipo: 'seguimiento',
          fechaVencimiento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
        },
        derivar: (previos) => {
          const [comprador] = compradoresDe(previos.buscar_compradores);
          if (!comprador) return null;
          const [propiedad] = propiedadesDe(previos.identificar_propiedades);
          return {
            nombre: comprador.nombre,
            descripcion: propiedad
              ? `Preparar seguimiento de ${comprador.nombre} por «${propiedad.nombre}»`
              : `Preparar seguimiento de ${comprador.nombre}`,
          };
        },
        esencial: true,
      },
      {
        nombre: 'solicitar_aprobacion_seguimiento',
        herramienta: 'send_message',
        args: { tenantId: args.tenantId, canal: 'email' },
        derivar: (previos) => {
          const [comprador] = compradoresDe(previos.buscar_compradores);
          if (!comprador) return null;
          const [propiedad] = propiedadesDe(previos.identificar_propiedades);
          return {
            nombre: comprador.nombre,
            email: comprador.email,
            mensaje: propiedad
              ? `Hola ${comprador.nombre}, tengo una propiedad que encaja contigo: «${propiedad.nombre}».`
              : `Hola ${comprador.nombre}, tengo propiedades que encajan contigo.`,
          };
        },
        esencial: false,
      },
      {
        nombre: 'registrar_resultados',
        herramienta: 'crear_nota',
        args: { tenantId: args.tenantId },
        derivar: (previos) => {
          const [comprador] = compradoresDe(previos.buscar_compradores);
          if (!comprador) return null;
          const [propiedad] = propiedadesDe(previos.identificar_propiedades);
          return {
            nombre: comprador.nombre,
            contenido: propiedad
              ? `Propuesta de «${propiedad.nombre}» a ${comprador.nombre}`
              : `Propuesta de propiedades a ${comprador.nombre}`,
          };
        },
        esencial: true,
      },
    ];

    return pasos;
  }

  private construirResumen(
    nombreProceso: string,
    resultados: ResultadoPaso[]
  ): string {
    const ok = resultados.filter((r) => r.estado === 'ok').length;
    const total = resultados.length;
    const pendientes = resultados.filter((r) => r.necesitaIntervencionHumana);
    let texto = `Proceso "${nombreProceso}": ${ok}/${total} pasos completados.`;
    if (pendientes.length) {
      texto += ` ${pendientes.length} acción(es) pendiente(s) de aprobación humana.`;
    }
    const omitidos = resultados.filter((r) => r.estado === 'omitido').length;
    if (omitidos) {
      texto += ` ${omitidos} paso(s) omitido(s) por falta de datos.`;
    }
    return texto;
  }
}

/**
 * Ejecuta el plan canónico del ejemplo inmobiliario y devuelve el resultado
 * con sus métricas de la Etapa D.
 */
export async function ejecutarProcesoInmobiliarioEjemplo(
  ctx: ContextoProceso,
  args: FiltrosProceso = {}
): Promise<ResultadoProceso> {
  const orquestador = new OrquestadorInteligente();
  const pasos = orquestador.planificarProcesoInmobiliario({
    ...args,
    tenantId: ctx.tenantId,
  });
  return orquestador.ejecutarProceso(
    'proceso_inmobiliario_ejemplo',
    pasos,
    ctx
  );
}
