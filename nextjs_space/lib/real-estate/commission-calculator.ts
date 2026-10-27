/**
 * Volkern Real Estate — Commission Calculator
 *
 * Cálculo de comisiones inmobiliarias para el modelo de franquicias.
 * Soporta comisiones basadas en porcentaje, monto fijo, y splits
 * entre agentes/inmobiliaria/franquicia.
 */

import { prisma, globalPrisma } from '@/lib/db';
import type { Comision, Deal, User } from '@prisma/client';
import { formatearImporte, monedaEscritura } from '@/lib/moneda';
import {
  oficinasDeFranquicia,
  enCadaConexion,
  sumarPorMoneda,
  type TotalPorMoneda,
} from './franquicia';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommissionRule {
  tipo: 'porcentaje_venta' | 'porcentaje_comision' | 'monto_fijo' | 'escalonada' | 'suscripcion_mensual';
  porcentaje?: number;
  montoFijo?: number;
  cuotaMensual?: number;   // Para tipo suscripcion_mensual
  escalones?: CommissionTier[];
  splitAgente?: number;   // % que va al agente
  splitAgencia?: number;  // % que va a la agencia/franquicia
}

export interface CommissionTier {
  desde: number;       // precio mínimo del tramo
  hasta: number;       // precio máximo del tramo
  porcentaje: number;  // % de comisión en este tramo
}

export interface CommissionInput {
  dealId: string;
  tenantId: string;
  userId: string;
  valorOperacion: number;
  moneda: string;
  rule: CommissionRule;
}

export interface CommissionResult {
  montoCalculado: number;
  splitAgente: number;
  splitAgencia: number;
  desglose: string[];
}

export interface FranchiseCommissionSummary {
  tenantId: string;
  tenantNombre: string;
  totalComisiones: number;
  pendientes: number;
  pagadas: number;
  moneda: string;
  desglose: Array<{
    dealId: string;
    dealTitulo: string;
    agente: string;
    monto: number;
    estado: string;
    fecha: Date;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula la comisión según la regla especificada
 */
export function calculateCommission(input: CommissionInput): CommissionResult {
  const { valorOperacion, rule, moneda } = input;
  const desglose: string[] = [];
  let montoComision = 0;

  switch (rule.tipo) {
    case 'porcentaje_venta': {
      // % sobre el precio de venta total
      const pct = rule.porcentaje || 3; // default 3%
      montoComision = valorOperacion * (pct / 100);
      desglose.push(`${pct}% sobre ${formatearImporte(valorOperacion, moneda)} = ${formatearImporte(montoComision, moneda)}`);
      break;
    }

    case 'porcentaje_comision': {
      // % sobre la comisión total (útil para splits internos)
      const pct = rule.porcentaje || 100;
      montoComision = valorOperacion * (pct / 100);
      desglose.push(`${pct}% del valor de operación = ${formatearImporte(montoComision, moneda)}`);
      break;
    }

    case 'monto_fijo': {
      montoComision = rule.montoFijo || 0;
      desglose.push(`Tarifa fija: ${formatearImporte(montoComision, moneda)}`);
      break;
    }

    case 'escalonada': {
      if (!rule.escalones || rule.escalones.length === 0) {
        desglose.push('Sin escalones definidos, se usa 0');
        break;
      }

      // Ordenar escalones por precio ascendente
      const tiers = [...rule.escalones].sort((a, b) => a.desde - b.desde);
      montoComision = 0;

      for (const tier of tiers) {
        if (valorOperacion >= tier.desde && valorOperacion <= tier.hasta) {
          montoComision = valorOperacion * (tier.porcentaje / 100);
          desglose.push(
            `Tramo ${formatearImporte(tier.desde, moneda, 0)}–${formatearImporte(tier.hasta, moneda, 0)}: ${tier.porcentaje}% = ${formatearImporte(montoComision, moneda)}`
          );
          break;
        }
      }

      // Si no cayó en ningún escalón, usar el porcentaje del último
      if (montoComision === 0 && tiers.length > 0) {
        const lastTier = tiers[tiers.length - 1];
        if (valorOperacion > lastTier.hasta) {
          montoComision = valorOperacion * (lastTier.porcentaje / 100);
          desglose.push(
            `Excede último tramo: ${lastTier.porcentaje}% = ${formatearImporte(montoComision, moneda)}`
          );
        }
      }
      break;
    }

    case 'suscripcion_mensual': {
      montoComision = rule.cuotaMensual || 0;
      desglose.push(`Suscripción mensual: ${formatearImporte(montoComision, moneda)}/mes`);
      // La suscripción no tiene split — el monto completo va a la franquicia
      return {
        montoCalculado: montoComision,
        splitAgente: 0,
        splitAgencia: montoComision,
        desglose,
      };
    }
  }

  // Aplicar splits si están definidos
  const splitAgente = rule.splitAgente !== undefined
    ? montoComision * (rule.splitAgente / 100)
    : montoComision;

  const splitAgencia = rule.splitAgencia !== undefined
    ? montoComision * (rule.splitAgencia / 100)
    : 0;

  if (rule.splitAgente !== undefined || rule.splitAgencia !== undefined) {
    desglose.push(
      `Split: ${formatearImporte(splitAgente, moneda)} agente (${rule.splitAgente || 0}%) + ` +
      `${formatearImporte(splitAgencia, moneda)} agencia (${rule.splitAgencia || 0}%)`
    );
  }

  return {
    montoCalculado: montoComision,
    splitAgente: Math.round(splitAgente * 100) / 100,
    splitAgencia: Math.round(splitAgencia * 100) / 100,
    desglose,
  };
}

// ─── Crear Comisión ───────────────────────────────────────────────────────────

/**
 * Crea un registro de comisión a partir de una operación cerrada
 */
export async function createCommissionFromDeal(
  deal: Deal,
  userId: string,
  rule: CommissionRule,
  userMoneda?: string
): Promise<Comision> {
  // Divisa de la comisión: la que pida quien la crea, si no la del negocio del
  // que sale. Antes caía a 'EUR' —el valor por defecto de la columna—, así que
  // una comisión de una operación en pesos se guardaba en euros.
  const moneda = monedaEscritura(userMoneda, deal.moneda);

  const calcResult = calculateCommission({
    dealId: deal.id,
    tenantId: deal.tenantId,
    userId,
    valorOperacion: deal.valorReal || deal.valor,
    moneda,
    rule,
  });

  return prisma.comision.create({
    data: {
      tenantId: deal.tenantId,
      dealId: deal.id,
      userId,
      tipo: rule.tipo,
      porcentaje: rule.porcentaje || null,
      montoFijo: rule.montoFijo || null,
      montoCalculado: calcResult.montoCalculado,
      moneda,
      estado: 'pendiente',
      metodoCalculo: JSON.stringify(rule),
    },
  });
}

// ─── Consultas Agregadas ──────────────────────────────────────────────────────

/**
 * Obtiene resumen de comisiones para un tenant (agencia/franquicia)
 * Incluye las comisiones de todos los sub-tenants si aplica
 *
 * Cada oficina se consulta en su propia conexión: una matriz con base de datos
 * dedicada no ve las filas de sus oficinas, que viven en la base compartida.
 */
export async function getFranchiseCommissionSummary(
  tenantId: string,
  includeChildren: boolean = false
): Promise<FranchiseCommissionSummary[]> {
  const matriz = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, nombre: true, moneda: true },
  });

  const oficinas = includeChildren ? await oficinasDeFranquicia(tenantId) : [];

  const objetivos = [
    {
      id: tenantId,
      nombre: matriz?.nombre ?? '—',
      moneda: monedaEscritura(matriz?.moneda),
    },
    ...oficinas,
  ];

  const resumenesPorConexion = await enCadaConexion(
    objetivos.map(o => o.id),
    async (idsDeLaConexion) => {
      const comisiones = await prisma.comision.findMany({
        where: { tenantId: { in: idsDeLaConexion } },
        include: {
          deal: { select: { titulo: true } },
          usuario: { select: { name: true, email: true } },
        },
        orderBy: { fechaCreacion: 'desc' },
      });

      return idsDeLaConexion
        .map((tid): FranchiseCommissionSummary | null => {
          const info = objetivos.find(o => o.id === tid);
          if (!info) return null;

          const propias = comisiones.filter(c => c.tenantId === tid);

          return {
            tenantId: tid,
            tenantNombre: info.nombre,
            totalComisiones: propias.reduce((s, c) => s + c.montoCalculado, 0),
            pendientes: propias
              .filter(c => c.estado === 'pendiente')
              .reduce((s, c) => s + c.montoCalculado, 0),
            pagadas: propias
              .filter(c => c.estado === 'pagada')
              .reduce((s, c) => s + c.montoCalculado, 0),
            moneda: info.moneda,
            desglose: propias.map(c => ({
              dealId: c.dealId,
              dealTitulo: c.deal?.titulo || '—',
              agente: c.usuario?.name || c.usuario?.email || '—',
              monto: c.montoCalculado,
              estado: c.estado,
              fecha: c.fechaCreacion,
            })),
          };
        })
        .filter((r): r is FranchiseCommissionSummary => r !== null);
    },
  );

  // Orden estable por nombre de oficina, para que el panel no salte entre cargas.
  return resumenesPorConexion.flat().sort((a, b) => a.tenantNombre.localeCompare(b.tenantNombre));
}

/**
 * Obtiene estadísticas globales para el dashboard de franquicia
 *
 * Cada conexión implicada se consulta por separado y después se suman los
 * recuentos. Las comisiones NO se suman en una sola cifra: se agrupan por divisa,
 * porque una red puede tener oficinas en divisas distintas.
 */
export async function getFranchiseGlobalStats(tenantId: string) {
  const childTenants = await oficinasDeFranquicia(tenantId);
  const allTenantIds = [tenantId, ...childTenants.map(t => t.id)];

  const porConexion = await enCadaConexion(allTenantIds, async (idsDeLaConexion) => {
    const alcance = { tenantId: { in: idsDeLaConexion } };

    const [totalProperties, totalDeals, totalLeads, comisiones] = await Promise.all([
      // Propiedades (CatalogoItem tipo inmueble)
      prisma.catalogoItem.count({
        where: { ...alcance, tipo: 'inmueble', activo: true },
      }),
      // Deals activos
      prisma.deal.count({ where: { ...alcance, estado: 'activo' } }),
      // Leads del portal
      prisma.lead.count({ where: { ...alcance, fuente: 'portal_inmobiliario' } }),
      // Comisiones (con su divisa, para poder agrupar)
      prisma.comision.findMany({
        where: alcance,
        select: { moneda: true, montoCalculado: true, estado: true },
      }),
    ]);

    return [{ totalProperties, totalDeals, totalLeads, comisiones }];
  });

  const totales = porConexion.flat().reduce(
    (acc, parte) => ({
      totalProperties: acc.totalProperties + parte.totalProperties,
      totalDeals: acc.totalDeals + parte.totalDeals,
      totalLeads: acc.totalLeads + parte.totalLeads,
      comisiones: acc.comisiones.concat(parte.comisiones),
    }),
    {
      totalProperties: 0,
      totalDeals: 0,
      totalLeads: 0,
      comisiones: [] as Array<{ moneda: string; montoCalculado: number; estado: string }>,
    },
  );

  const totalesPorMoneda: TotalPorMoneda[] = sumarPorMoneda(
    totales.comisiones.map(c => ({
      moneda: c.moneda,
      monto: c.montoCalculado,
      estado: c.estado,
    })),
  );

  const unaSolaDivisa = totalesPorMoneda.length <= 1;

  return {
    totalProperties: totales.totalProperties,
    totalDeals: totales.totalDeals,
    totalLeads: totales.totalLeads,
    /**
     * Cifra única de comisiones **solo** cuando toda la red cobra en la misma
     * divisa. Con varias divisas vale `null`: sumarlas daría un número sin
     * significado. En ese caso el desglose está en `totalesPorMoneda`.
     */
    totalComisiones: unaSolaDivisa ? (totalesPorMoneda[0]?.total ?? 0) : null,
    monedaTotal: unaSolaDivisa ? (totalesPorMoneda[0]?.moneda ?? null) : null,
    multiDivisa: !unaSolaDivisa,
    totalesPorMoneda,
    totalComisionesCount: totalesPorMoneda.reduce((s, t) => s + t.cantidad, 0),
    childTenants,
  };
}

/**
 * Marca una comisión como pagada
 */
export async function markCommissionAsPaid(
  commissionId: string,
  referenciaPago?: string,
  notasPago?: string
): Promise<Comision> {
  return prisma.comision.update({
    where: { id: commissionId },
    data: {
      estado: 'pagada',
      fechaPago: new Date(),
      referenciaPago: referenciaPago || null,
      notasPago: notasPago || null,
    },
  });
}

/**
 * Aprueba una comisión
 */
export async function approveCommission(commissionId: string): Promise<Comision> {
  return prisma.comision.update({
    where: { id: commissionId },
    data: {
      estado: 'aprobada',
      fechaAprobacion: new Date(),
    },
  });
}

/**
 * Obtiene el resumen de comisiones por agente
 */
export async function getCommissionByAgent(
  tenantId: string,
  fechaDesde?: Date,
  fechaHasta?: Date
) {
  const where: any = { tenantId };

  if (fechaDesde || fechaHasta) {
    where.fechaCreacion = {};
    if (fechaDesde) where.fechaCreacion.gte = fechaDesde;
    if (fechaHasta) where.fechaCreacion.lte = fechaHasta;
  }

  const comisiones = await prisma.comision.findMany({
    where,
    include: {
      usuario: { select: { id: true, name: true, email: true } },
      deal: { select: { titulo: true, valor: true } },
    },
    orderBy: { fechaCreacion: 'desc' },
  });

  // Agrupar por agente
  const byAgent = new Map<string, {
    agenteId: string;
    agenteNombre: string;
    totalComisiones: number;
    cantidad: number;
    pendientes: number;
    pagadas: number;
    comisiones: typeof comisiones;
  }>();

  for (const c of comisiones) {
    const agentId = c.userId;
    if (!byAgent.has(agentId)) {
      byAgent.set(agentId, {
        agenteId: agentId,
        agenteNombre: c.usuario?.name || c.usuario?.email || 'Desconocido',
        totalComisiones: 0,
        cantidad: 0,
        pendientes: 0,
        pagadas: 0,
        comisiones: [],
      });
    }

    const entry = byAgent.get(agentId)!;
    entry.totalComisiones += c.montoCalculado;
    entry.cantidad++;
    if (c.estado === 'pendiente') entry.pendientes += c.montoCalculado;
    if (c.estado === 'pagada') entry.pagadas += c.montoCalculado;
    entry.comisiones.push(c);
  }

  return Array.from(byAgent.values()).sort((a, b) => b.totalComisiones - a.totalComisiones);
}
