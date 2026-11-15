import { globalPrisma } from '@/lib/db';
import { PLANTILLAS_PORTAL, normalizarPlantilla, type PlantillaPortal } from './portal-templates';

/**
 * Analítica del portal público.
 *
 * Lo que se mide es lo que permite defender la cuota de una franquicia y
 * decidir con datos qué plantilla funciona: visitas, clics en «Solicitar
 * información», leads del portal y operaciones cerradas, por cuenta y por
 * plantilla. No se guarda ningún dato personal del visitante.
 */


export interface ContadoresPlantilla {
  visitasPortada: number;
  visitasFichas: number;
  clicsContacto: number;
}

export interface MetricasPortal extends ContadoresPlantilla {
  leads: number;
  operaciones: number;
  porPlantilla: Record<PlantillaPortal, ContadoresPlantilla>;
}

function contadoresVacios(): ContadoresPlantilla {
  return { visitasPortada: 0, visitasFichas: 0, clicsContacto: 0 };
}

export function metricasVacias(): MetricasPortal {
  return {
    ...contadoresVacios(),
    leads: 0,
    operaciones: 0,
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

/** Suma métricas de varias cuentas, manteniendo el desglose por plantilla. */
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

  const [eventos, leads, operaciones] = await Promise.all([
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
    globalPrisma.deal.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: ids },
        estado: 'ganado',
        OR: [
          { fechaCierre: { gte: desde } },
          { fechaCierre: null, fechaActualizacion: { gte: desde } },
        ],
      },
      _count: { _all: true },
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

  for (const operacion of operaciones) {
    const metricas = destino.get(operacion.tenantId) ?? metricasVacias();
    metricas.operaciones = operacion._count._all;
    destino.set(operacion.tenantId, metricas);
  }

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
      resultado.set(fila.tenantId, normalizarPlantilla(fila.valor));
    }
  } catch {
    // Sin configuración se asume la plantilla por defecto.
  }
  return resultado;
}
