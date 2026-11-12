import { globalPrisma } from './db';
import { SaaSMetricsService } from './saas-metrics';

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
  churnRate: number;
  ltv: number;
  /** null cuando no hay inversión de marketing registrada o no hubo clientes nuevos. */
  cac: number | null;
  conversionRate: number;
  ltvCac: number | null;
  detalle: {
    cuentasActivas: number;
    cuentasPago: number;
    nuevosClientes: number;
    cancelados: number;
    trialsIniciados: number;
    trialsConvertidos: number;
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

/**
 * Conversión de oportunidad a cliente: suscripciones que arrancaron en prueba
 * en el periodo y hoy siguen activas, sobre las pruebas iniciadas.
 */
async function contarConversionDeTrials(
  periodoDias: number,
): Promise<{ iniciados: number; convertidos: number }> {
  const desde = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000);

  const trials = await globalPrisma.subscription.findMany({
    where: { esTrial: true, fechaCreacion: { gte: desde } },
    select: { estado: true },
  });

  return {
    iniciados: trials.length,
    convertidos: trials.filter((t) => t.estado === 'activa').length,
  };
}

export async function calcularKpisPlataforma(periodoDias: number = 30): Promise<KpisPlataforma> {
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

  const churnRate = await SaaSMetricsService.calculateChurnRate(periodoDias);
  const ltv = SaaSMetricsService.calculateLTV(arpa, churnRate);

  const nuevosClientes = await SaaSMetricsService.calculateNewCustomers(periodoDias);
  const cancelados = await SaaSMetricsService.calculateChurnedCustomers(periodoDias);

  const { valor: gastoMarketing, hayDato } = await leerGastoMarketing();
  const cac = calcularCac(gastoMarketing, nuevosClientes);

  const { iniciados, convertidos } = await contarConversionDeTrials(periodoDias);
  const conversionRate = calcularTasaConversion(convertidos, iniciados);

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
    ltvCac: calcularRatioLtvCac(ltv, cac),
    detalle: {
      cuentasActivas: cuentas.length,
      cuentasPago,
      nuevosClientes,
      cancelados,
      trialsIniciados: iniciados,
      trialsConvertidos: convertidos,
      gastoMarketing: gastoMarketing ?? null,
      motivoSinCac,
    },
    calculadoEn: new Date().toISOString(),
  };
}
