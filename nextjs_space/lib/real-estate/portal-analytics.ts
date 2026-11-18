import { globalPrisma } from '@/lib/db';
import { PLANTILLAS_PORTAL, normalizarPlantilla, type PlantillaPortal } from './portal-templates';
import {
  ORIGENES_CIERRE,
  normalizarOrigen,
  type OrigenCierre,
} from './portal-seo';

/**
 * Analítica del portal público.
 *
 * Lo que se mide es lo que permite defender la cuota de una franquicia y
 * decidir con datos qué plantilla funciona: visitas, clics en «Solicitar
 * información», leads del portal y cierres ganados cuyo lead vino del portal, por
 * cuenta y por plantilla. No se guarda ningún dato personal del visitante.
 *
 * La atribución de cierres cruza `Deal.leadId` con el lead del portal: sólo
 * cuenta una operación si su lead existe y llegó por el portal inmobiliario. El
 * porqué de cada cierre sale del canal con el que se captó (WhatsApp, QR, cartel),
 * que es el dato que el editor de marca deja declarar en cada enlace.
 */

export interface ContadoresPlantilla {
  visitasPortada: number;
  visitasFichas: number;
  clicsContacto: number;
}

/** Cierres y valor de una divisa concreta. */
export interface CifraCierre {
  operaciones: number;
  valorCerrado: number;
}

export interface ContadoresCierre {
  /** Cierres del origen, en cualquier divisa. */
  operaciones: number;
  /** Suma **sólo** de los cierres en la divisa de la fila. */
  valorCerrado: number;
  /** Cierres en otra divisa (o sin divisa), fuera de `valorCerrado`. */
  operacionesOtrasDivisas: number;
}

export interface MetricasPortal extends ContadoresPlantilla {
  leads: number;
  /** Cierres ganados cuyo lead vino del portal, en cualquier divisa. */
  operaciones: number;
  /** Suma de los cierres (`valorReal` si se capturó, si no `valor`). */
  valorCerrado: number;
  /** Cierres que `valorCerrado` deja fuera por estar en otra divisa. */
  operacionesOtrasDivisas: number;
  /** Divisa de la fila: la de sus cierres y la única que suma `valorCerrado`. */
  monedaPrincipal: string | null;
  /** Cierres y valor por divisa, sin mezclar: la suma honesta de la cuenta. */
  porMoneda: Record<string, CifraCierre>;
  porOrigen: Record<OrigenCierre, ContadoresCierre>;
  porPlantilla: Record<PlantillaPortal, ContadoresPlantilla>;
}

/** Divisa normalizada de un cierre; `null` si no viene declarada. */
function monedaDeCierre(valor: unknown): string | null {
  const moneda = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  return moneda || null;
}

function contadoresVacios(): ContadoresPlantilla {
  return { visitasPortada: 0, visitasFichas: 0, clicsContacto: 0 };
}

function cifraCierreVacia(): CifraCierre {
  return { operaciones: 0, valorCerrado: 0 };
}

function contadoresCierreVacios(): ContadoresCierre {
  return { ...cifraCierreVacia(), operacionesOtrasDivisas: 0 };
}

/**
 * Divisa con más cierres; desempata por valor y luego por código, para que el
 * resultado no dependa del orden en que llegaron las filas.
 */
export function divisaPredominante(porMoneda: Record<string, CifraCierre>): string | null {
  const [primera] = Object.entries(porMoneda).sort(
    (a, b) =>
      b[1].operaciones - a[1].operaciones ||
      b[1].valorCerrado - a[1].valorCerrado ||
      a[0].localeCompare(b[0])
  );
  return primera?.[0] ?? null;
}

function cierresVacios(): Record<OrigenCierre, ContadoresCierre> {
  return Object.fromEntries(
    ORIGENES_CIERRE.map((origen) => [origen, contadoresCierreVacios()])
  ) as Record<OrigenCierre, ContadoresCierre>;
}

export function metricasVacias(): MetricasPortal {
  return {
    ...contadoresVacios(),
    leads: 0,
    operaciones: 0,
    valorCerrado: 0,
    operacionesOtrasDivisas: 0,
    monedaPrincipal: null,
    porMoneda: {},
    porOrigen: cierresVacios(),
    porPlantilla: {
      foto: contadoresVacios(),
      marca: contadoresVacios(),
    },
  };
}

export interface FilaEvento {
  tenantId: string;
  tipo: string;
  plantilla: string;
  total: number;
}

/**
 * Suma eventos agrupados en el mapa de métricas. Función pura: es la parte que
 * conviene poder probar sin base de datos.
 */
export function agregarEventos(
  destino: Map<string, MetricasPortal>,
  filas: FilaEvento[]
): void {
  for (const fila of filas) {
    const metricas = destino.get(fila.tenantId) ?? metricasVacias();
    const contador = metricas.porPlantilla[normalizarPlantilla(fila.plantilla)];
    const total = Number(fila.total) || 0;

    if (fila.tipo === 'visita_portada') {
      metricas.visitasPortada += total;
      contador.visitasPortada += total;
    } else if (fila.tipo === 'visita_ficha') {
      metricas.visitasFichas += total;
      contador.visitasFichas += total;
    } else if (fila.tipo === 'clic_contacto') {
      metricas.clicsContacto += total;
      contador.clicsContacto += total;
    }

    destino.set(fila.tenantId, metricas);
  }
}

/** Canal con el que se captó el cierre; sin canal conocido, cuenta como portal. */
export function origenDeCierre(canal: unknown): OrigenCierre {
  return normalizarOrigen(canal) ?? 'portal';
}

export interface FilaCierre {
  tenantId: string;
  canal: string | null;
  /** Importe ya resuelto por quien consulta: `valorReal` si existe, si no `valor`. */
  valor: number;
  moneda?: string | null;
}

/**
 * Atribuye cierres a su cuenta y a su origen. Función pura, igual que
 * `agregarEventos`: el importe y el canal llegan resueltos desde la consulta.
 *
 * No suma divisas distintas: la cuenta tiene una divisa (la de la mayoría de sus
 * cierres) y `valorCerrado` sólo acumula esa. Los cierres de otra divisa se
 * cuentan aparte (`operacionesOtrasDivisas`) y quedan visibles en `porMoneda`,
 * para no etiquetar euros con un símbolo de pesos.
 */
export function agregarCierres(
  destino: Map<string, MetricasPortal>,
  filas: FilaCierre[]
): void {
  // 1. Cada cuenta acumula sus divisas por separado; de ahí sale la suya.
  for (const fila of filas) {
    const metricas = destino.get(fila.tenantId) ?? metricasVacias();
    const moneda = monedaDeCierre(fila.moneda);
    if (moneda) {
      const cifra = metricas.porMoneda[moneda] ?? cifraCierreVacia();
      cifra.operaciones += 1;
      cifra.valorCerrado += Number(fila.valor) || 0;
      metricas.porMoneda[moneda] = cifra;
    }
    destino.set(fila.tenantId, metricas);
  }
  for (const metricas of destino.values()) {
    metricas.monedaPrincipal = divisaPredominante(metricas.porMoneda);
  }

  // 2. Totales y reparto por origen, ya con la divisa de cada cuenta decidida.
  for (const fila of filas) {
    const metricas = destino.get(fila.tenantId)!;
    const origen = origenDeCierre(fila.canal);
    const importe = Number(fila.valor) || 0;
    const moneda = monedaDeCierre(fila.moneda);
    const enLaDivisa = Boolean(moneda && moneda === metricas.monedaPrincipal);

    metricas.operaciones += 1;
    metricas.porOrigen[origen].operaciones += 1;

    if (enLaDivisa) {
      metricas.valorCerrado += importe;
      metricas.porOrigen[origen].valorCerrado += importe;
    } else {
      metricas.operacionesOtrasDivisas += 1;
      metricas.porOrigen[origen].operacionesOtrasDivisas += 1;
    }
  }
}

/**
 * Suma métricas de varias cuentas sin mezclar dinero de divisas distintas.
 *
 * La red también tiene una divisa (`monedaPrincipal`, la de más cierres) y el
 * total de valor sólo incluye esa; el resto queda contado en
 * `operacionesOtrasDivisas` y desglosado en `porMoneda`.
 */
export function sumarMetricas(filas: MetricasPortal[]): MetricasPortal {
  const total = metricasVacias();
  for (const fila of filas) {
    total.visitasPortada += fila.visitasPortada;
    total.visitasFichas += fila.visitasFichas;
    total.clicsContacto += fila.clicsContacto;
    total.leads += fila.leads;
    total.operaciones += fila.operaciones;

    for (const plantilla of PLANTILLAS_PORTAL) {
      const origen = fila.porPlantilla[plantilla];
      const acumulado = total.porPlantilla[plantilla];
      acumulado.visitasPortada += origen.visitasPortada;
      acumulado.visitasFichas += origen.visitasFichas;
      acumulado.clicsContacto += origen.clicsContacto;
    }

    for (const [moneda, cierre] of Object.entries(fila.porMoneda)) {
      const acumulado = total.porMoneda[moneda] ?? cifraCierreVacia();
      acumulado.operaciones += cierre.operaciones;
      acumulado.valorCerrado += cierre.valorCerrado;
      total.porMoneda[moneda] = acumulado;
    }
  }

  const monedaPrincipal = divisaPredominante(total.porMoneda);
  total.monedaPrincipal = monedaPrincipal;

  const enLaDivisa = monedaPrincipal ? total.porMoneda[monedaPrincipal] : null;
  total.valorCerrado = enLaDivisa?.valorCerrado ?? 0;
  total.operacionesOtrasDivisas = total.operaciones - (enLaDivisa?.operaciones ?? 0);

  // El origen también respeta la divisa: lo de otra moneda se cuenta, no se suma.
  for (const fila of filas) {
    for (const origen of ORIGENES_CIERRE) {
      const contador = fila.porOrigen[origen];
      if (!contador) continue;
      total.porOrigen[origen].operaciones += contador.operaciones;
      if (fila.monedaPrincipal === monedaPrincipal) {
        total.porOrigen[origen].valorCerrado += contador.valorCerrado;
        total.porOrigen[origen].operacionesOtrasDivisas += contador.operacionesOtrasDivisas;
      } else {
        // Toda la fila está en otra divisa: se cuenta entera, una sola vez.
        total.porOrigen[origen].operacionesOtrasDivisas += contador.operaciones;
      }
    }
  }

  return total;
}

/**
 * Métricas de las cuentas indicadas desde `desde`.
 *
 * Los eventos, los leads y las operaciones viven en la base global: leerlos con
 * `globalPrisma` es lo que permite consolidar la matriz y sus oficinas en una
 * sola consulta aunque la matriz tenga base propia.
 */
export async function metricasPortal(
  ids: string[],
  desde: Date
): Promise<Map<string, MetricasPortal>> {
  const destino = new Map<string, MetricasPortal>(ids.map((id) => [id, metricasVacias()]));
  if (ids.length === 0) return destino;

  const [eventos, leads, cierres] = await Promise.all([
    globalPrisma.portalEvento.groupBy({
      by: ['tenantId', 'tipo', 'plantilla'],
      where: { tenantId: { in: ids }, fecha: { gte: desde } },
      _count: { _all: true },
    }),
    globalPrisma.lead.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: ids },
        fuente: 'portal_inmobiliario',
        fechaCreacion: { gte: desde },
      },
      _count: { _all: true },
    }),
    // Atribución: el cierre tiene que venir de un lead del portal de la misma
    // cuenta (`lead` filtra que exista y que sea del portal; un lead de otra
    // oficina no suma). Se leen las filas —no un `groupBy`— porque el importe es
    // `valorReal ?? valor` y el canal vive en el lead; los cierres de una red son
    // pocos.
    globalPrisma.deal.findMany({
      where: {
        tenantId: { in: ids },
        estado: 'ganado',
        lead: { fuente: 'portal_inmobiliario', tenantId: { in: ids } },
        OR: [
          { fechaCierre: { gte: desde } },
          { fechaCierre: null, fechaActualizacion: { gte: desde } },
        ],
      },
      select: {
        tenantId: true,
        valor: true,
        valorReal: true,
        moneda: true,
        lead: { select: { canal: true } },
      },
    }),
  ]);

  agregarEventos(
    destino,
    eventos.map((evento) => ({
      tenantId: evento.tenantId,
      tipo: evento.tipo,
      plantilla: evento.plantilla,
      total: evento._count._all,
    }))
  );

  for (const lead of leads) {
    if (!lead.tenantId) continue;
    const metricas = destino.get(lead.tenantId) ?? metricasVacias();
    metricas.leads = lead._count._all;
    destino.set(lead.tenantId, metricas);
  }

  agregarCierres(
    destino,
    cierres.map((cierre) => ({
      tenantId: cierre.tenantId,
      canal: cierre.lead?.canal ?? null,
      valor: cierre.valorReal ?? cierre.valor,
      moneda: cierre.moneda,
    }))
  );

  return destino;
}

/** Plantilla con la que está publicada cada cuenta (para etiquetar la tabla). */
export async function plantillaPorCuenta(ids: string[]): Promise<Map<string, PlantillaPortal>> {
  const resultado = new Map<string, PlantillaPortal>();
  if (ids.length === 0) return resultado;

  try {
    const filas = await globalPrisma.configuracion.findMany({
      where: { tenantId: { in: ids }, clave: 'plantilla_portal' },
      select: { tenantId: true, valor: true },
    });
    for (const fila of filas) {
      // `tenantId` es opcional en la configuración global.
      if (!fila.tenantId) continue;
      resultado.set(fila.tenantId, normalizarPlantilla(fila.valor ?? ''));
    }
  } catch {
    // Sin configuración se asume la plantilla por defecto.
  }
  return resultado;
}
