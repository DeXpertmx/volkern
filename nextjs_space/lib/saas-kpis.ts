import { globalPrisma } from './db';
import { SaaSMetricsService, calcularVentanaChurn } from './saas-metrics';

// La definición de churn vive en `saas-metrics` (única para toda la plataforma).
export { calcularTasaChurn, calcularVentanaChurn } from './saas-metrics';

/**
 * KPIs de negocio de la plataforma (MRR, ARR, ARPA, churn, LTV, CAC y
 * conversión).
 *
 * Regla de divisa: los importes (MRR, ARR, ARPA, LTV, CAC) se informan en una
 * sola divisa —la de mayor MRR— y el resto se publica aparte en `porMoneda`.
 * Sumar pesos y euros en una cifra única daría un número que no significa
 * nada. Churn y conversión son porcentajes y no dependen de la divisa.
 */
export interface MonedaMrr {
  moneda: string;
  mrr: number;
  cuentas: number;
  cuentasPago: number;
}

export interface KpisPlataforma {
  periodoDias: number;
  moneda: string;
  multiDivisa: boolean;
  porMoneda: MonedaMrr[];
  mrr: number;
  arr: number;
  arpa: number;
  /** null cuando no hay suscripciones que puedan cancelarse: 0 % sería engañoso. */
  churnRate: number | null;
  ltv: number | null;
  /** null cuando no hay inversión de marketing registrada o no hubo clientes nuevos. */
  cac: number | null;
  /** null cuando no arrancó ninguna prueba en el periodo. */
  conversionRate: number | null;
  ltvCac: number | null;
  detalle: {
    cuentasActivas: number;
    cuentasPago: number;
    nuevosClientes: number;
    cancelados: number;
    baseChurn: number;
    oportunidades: number;
    convertidas: number;
    gastoMarketing: number | null;
    motivoSinCac: string | null;
  };
  calculadoEn: string;
}

/** Agrupa el MRR por divisa: cada cuenta aporta a la suya. */
export function agruparMrrPorMoneda(
  cuentas: Array<{ mrr: number | null; moneda?: string | null }>,
): MonedaMrr[] {
  const grupos = new Map<string, MonedaMrr>();

  for (const cuenta of cuentas) {
    const moneda = (cuenta.moneda || 'EUR').toUpperCase();
    const mrr = Number(cuenta.mrr) || 0;
    const grupo = grupos.get(moneda) || { moneda, mrr: 0, cuentas: 0, cuentasPago: 0 };
    grupo.mrr += mrr;
    grupo.cuentas += 1;
    if (mrr > 0) grupo.cuentasPago += 1;
    grupos.set(moneda, grupo);
  }

  return Array.from(grupos.values()).sort((a, b) => b.mrr - a.mrr);
}

/** La divisa que informa los importes: la de mayor MRR. */
export function elegirMonedaPrincipal(grupos: MonedaMrr[]): MonedaMrr | null {
  return grupos.length > 0 ? grupos[0] : null;
}

export function calcularArpa(mrr: number, cuentasPago: number): number {
  if (cuentasPago <= 0) return 0;
  return mrr / cuentasPago;
}

/**
 * CAC = inversión de marketing del periodo / clientes nuevos del periodo.
 * Se devuelve null (en vez de 0) cuando falta el dato: un CAC de 0 diría que
 * adquirir un cliente es gratis.
 */
export function calcularCac(gasto: number | null, nuevosClientes: number): number | null {
  if (gasto === null || gasto <= 0) return null;
  if (nuevosClientes <= 0) return null;
  return gasto / nuevosClientes;
}

/** LTV:CAC; null cuando alguno de los dos no está disponible. */
export function calcularRatioLtvCac(ltv: number, cac: number | null): number | null {
  if (cac === null || cac <= 0) return null;
  if (ltv <= 0) return null;
  return ltv / cac;
}

/** Conversión = oportunidades convertidas / oportunidades del periodo. */
export function calcularTasaConversion(convertidas: number, totales: number): number {
  if (totales <= 0) return 0;
  return (convertidas / totales) * 100;
}


/**
 * Inversión de marketing mensual declarada por el operador. Vive en
 * `PlatformSettings.configuracion` para no añadir una tabla solo por un dato.
 */
async function leerGastoMarketing(): Promise<{ valor: number | null; hayDato: boolean }> {
  try {
    const settings = await globalPrisma.platformSettings.findFirst({
      select: { configuracion: true },
    });
    const configuracion = settings?.configuracion;

    if (!configuracion || typeof configuracion !== 'object') {
      return { valor: null, hayDato: false };
    }

    const crudo = (configuracion as Record<string, unknown>).gastoMarketingMensual;
    if (crudo === undefined || crudo === null || crudo === '') return { valor: null, hayDato: false };

    const valor = Number(crudo);
    if (!Number.isFinite(valor) || valor < 0) return { valor: null, hayDato: false };

    return { valor, hayDato: true };
  } catch (error) {
    console.warn('[SaaS KPIs] No se pudo leer la inversión de marketing:', error);
    return { valor: null, hayDato: false };
  }
}


export async function calcularKpisPlataforma(periodoDias: number = 30): Promise<KpisPlataforma> {
  const desde = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000);

  const cuentas = await globalPrisma.tenant.findMany({
    where: { estado: 'activo' },
    select: { mrr: true, moneda: true },
  });

  const porMoneda = agruparMrrPorMoneda(cuentas);
  const principal = elegirMonedaPrincipal(porMoneda);

  const mrr = principal?.mrr ?? 0;
  const cuentasPago = principal?.cuentasPago ?? 0;
  const arpa = calcularArpa(mrr, cuentasPago);
  const arr = SaaSMetricsService.calculateARR(mrr);

  // Churn: misma definición que el radar de /admin/saas/churn.
  const ventanaChurn = await calcularVentanaChurn(desde, new Date());
  const baseChurn = ventanaChurn.base;
  const cancelados = ventanaChurn.bajas;
  const churnRate = ventanaChurn.tasa;
  // Con churn 0 el LTV sería infinito: mejor no publicar una cifra inventada.
  const ltv = churnRate !== null && churnRate > 0
    ? SaaSMetricsService.calculateLTV(arpa, churnRate)
    : null;

  // Conversión de oportunidad a cliente: de las cuentas creadas en el periodo,
  // cuántas ya están activas (cliente de pago) y cuántas siguen en prueba.
  const cuentasNuevas = await globalPrisma.tenant.findMany({
    where: { fechaCreacion: { gte: desde } },
    select: { estado: true },
  });
  const oportunidades = cuentasNuevas.length;
  const convertidas = cuentasNuevas.filter((c) => c.estado === 'activo').length;
  const nuevosClientes = oportunidades;
  const conversionRate = oportunidades > 0
    ? calcularTasaConversion(convertidas, oportunidades)
    : null;

  const { valor: gastoMarketing, hayDato } = await leerGastoMarketing();
  const cac = calcularCac(gastoMarketing, nuevosClientes);

  let motivoSinCac: string | null = null;
  if (cac === null) {
    motivoSinCac = !hayDato || !gastoMarketing
      ? 'Sin inversión de marketing declarada en el periodo.'
      : 'Sin clientes nuevos en el periodo.';
  }

  return {
    periodoDias,
    moneda: principal?.moneda ?? 'EUR',
    multiDivisa: porMoneda.length > 1,
    porMoneda,
    mrr,
    arr,
    arpa,
    churnRate,
    ltv,
    cac,
    conversionRate,
    ltvCac: calcularRatioLtvCac(ltv ?? 0, cac),
    detalle: {
      cuentasActivas: cuentas.length,
      cuentasPago,
      nuevosClientes,
      cancelados,
      baseChurn,
      oportunidades,
      convertidas,
      gastoMarketing: gastoMarketing ?? null,
      motivoSinCac,
    },
    calculadoEn: new Date().toISOString(),
  };
}
