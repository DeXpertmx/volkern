/**
 * Resumen financiero del tenant: la forma que consumen el cockpit de Finanzas y
 * Reportes, y las reglas de cuándo hay algo que contar.
 *
 * Por qué existe. Las dos pantallas leían a mano campos de
 * `/api/erp/finance/consolidation` —y los leían mal: pedían `pnl.totalRevenue`,
 * `pnl.netProfit` y `pnl.totalExpenses`, que la skill nunca ha devuelto—, así
 * que un endpoint caído y un tenant sin movimientos se veían igual: ceros.
 * Aquí se traduce el payload una sola vez, se decide si hay datos de verdad y
 * se distingue "cero" de "no hay nada que mostrar", que no es lo mismo.
 *
 * Sin divisas ni formatos: los importes salen en crudo y quien pinta decide la
 * moneda con el módulo de dinero.
 */

/** Números del periodo. `null` = el dato no viene en la respuesta. */
export interface CifrasConsolidacion {
  /** Facturas cobradas del periodo. */
  ingresos: number | null;
  /** Gastos pagados + nómina + costos de fabricación y merma. */
  gastos: number | null;
  /** Ingresos − gastos. */
  beneficio: number | null;
  /** Margen sobre ingresos, en porcentaje. `null` si no hay ingresos sobre los que calcularlo. */
  margen: number | null;
}

export interface ProyeccionConsolidacion {
  /** Pipeline activo ponderado por la probabilidad de cada etapa. */
  pipelinePonderado: number | null;
  /** Gasto mensual medio de los últimos tres meses. */
  gastoMensual: number | null;
  /** Días que cubre el pipeline al ritmo de gasto actual. */
  diasDeCaja: number | null;
}

export interface ResumenFinanciero {
  /** `false` cuando no hay ni un ingreso ni un gasto: la pantalla debe decirlo, no pintar ceros. */
  hayDatos: boolean;
  cifras: CifrasConsolidacion;
  proyeccion: ProyeccionConsolidacion;
  /** Frase que redacta la propia skill. */
  resumen: string | null;
  /** `true` cuando la respuesta llegó, aunque venga vacía. */
  hayRespuesta: boolean;
}

const SIN_DATOS: ResumenFinanciero = {
  hayDatos: false,
  cifras: { ingresos: null, gastos: null, beneficio: null, margen: null },
  proyeccion: { pipelinePonderado: null, gastoMensual: null, diasDeCaja: null },
  resumen: null,
  hayRespuesta: false,
};

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Traduce la respuesta de la consolidación a la vista del cockpit.
 *
 * No estima nada: lo que no viene queda en `null` y la pantalla lo enseña como
 * "—". Un `margen` de la skill sobre ingresos cero se descarta, porque un
 * porcentaje sin base no es un dato.
 */
export function resumirConsolidacion(payload: unknown): ResumenFinanciero {
  if (!payload || typeof payload !== 'object') return SIN_DATOS;
  const raiz = payload as Record<string, any>;
  const pnl = (raiz.pnl || {}) as Record<string, unknown>;
  const cashFlow = (raiz.cashFlow || {}) as Record<string, unknown>;

  if (Object.keys(pnl).length === 0 && Object.keys(cashFlow).length === 0) return SIN_DATOS;

  const ingresos = numero(pnl.revenue);
  const gastos = numero(pnl.expenses);
  const beneficio = numero(pnl.profit);

  const margenDeclarado = numero(pnl.margin);
  const margen =
    ingresos !== null && ingresos > 0
      ? margenDeclarado ?? (beneficio !== null ? (beneficio / ingresos) * 100 : null)
      : null;

  return {
    hayDatos: (ingresos ?? 0) > 0 || (gastos ?? 0) > 0,
    cifras: { ingresos, gastos, beneficio, margen },
    proyeccion: {
      pipelinePonderado: numero(cashFlow.expectedIn),
      gastoMensual: numero(cashFlow.committedOut),
      diasDeCaja: numero(cashFlow.runwayDays),
    },
    resumen: typeof pnl.resumen === 'string' ? pnl.resumen : null,
    hayRespuesta: true,
  };
}
