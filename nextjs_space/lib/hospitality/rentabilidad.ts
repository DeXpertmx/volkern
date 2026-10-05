/**
 * Rentabilidad operativa de la cartera de Hospitality.
 *
 * El informe del propietario con TRES niveles de dinero, cada uno con su nombre
 * exacto (la nomenclatura es parte del contrato del informe, no un detalle de
 * estilo — hay una guardia de tests que la protege):
 *
 *   1. **Ingresos brutos** — lo que generan las reservas (líneas de la reserva).
 *   2. **Ingresos netos** — después de comisiones y deducciones de la reserva
 *      (comisión OTA, comisión de pasarela, gastos imputados). Es el `neto` de
 *      `finance.ts`, sin una segunda fórmula que pueda divergir de la reserva.
 *   3. **Rentabilidad operativa real** — después de TODOS los costes de operar
 *      la propiedad: los gastos del ERP imputados a sus reservas, agregados por
 *      categoría de coste (comisiones de canales, limpieza, mantenimiento,
 *      consumibles, gestión y otros, suministros).
 *
 * Por qué NO se llama «ingreso real» al tercer nivel: descontar hipoteca,
 * impuestos sobre la renta o amortización ya es rentabilidad ECONÓMICA del
 * propietario, no operación del alojamiento. Este informe mide la operación,
 * y lo dice con su nombre. Es una ventaja de producto, no una pérdida.
 *
 * Módulo PURO: recibe reservas y gastos ya leídos (el cargador es
 * `cargarDatosFinancieros` + la lectura de gastos del ERP). No toca base de
 * datos. El dinero de cada propiedad se escribe en la divisa del informe; las
 * reservas en otras divisas quedan fuera de sus totales, igual que en
 * Reportes (ver `multimoneda.ts` para la decisión y el porqué de no convertir).
 */

import { redondear } from './finance';
import {
  esReservaConVenta,
  rentabilidadDeReserva,
  type ReservaFinanciera,
} from './finance-summary';
import {
  agruparPorMoneda,
  describirMultimoneda,
  estaEnMonedaDelInforme,
  monedaDelInforme,
  type Multimoneda,
} from './multimoneda';

// ─── Categorías de coste operativo ──────────────────────────────────────────
//
// El ERP guarda la categoría en texto libre (catálogo `lib/finance/expense-categories.ts`,
// p. ej. `mantenimiento`, `suministros`, `profesional`). El informe las lleva a
// SU vocabulario —el que el propietario entiende— sin inventar datos: lo que no
// encaja en una categoría operativa no desaparece, entra en «Gestión y otros».

export type CategoriaCoste =
  | 'comisiones'
  | 'limpieza'
  | 'mantenimiento'
  | 'consumibles'
  | 'gestion'
  | 'suministros';

export const CATEGORIAS_COSTE: Array<{ clave: CategoriaCoste; etiqueta: string; descripcion: string }> = [
  { clave: 'comisiones', etiqueta: 'Comisiones de canales', descripcion: 'Comisión de OTAs y pasarela de pago' },
  { clave: 'limpieza', etiqueta: 'Limpieza', descripcion: 'Limpieza entre estancias y lavandería' },
  { clave: 'mantenimiento', etiqueta: 'Mantenimiento', descripcion: 'Reparaciones y conservación de la propiedad' },
  { clave: 'consumibles', etiqueta: 'Consumibles', descripcion: 'Amenities, productos de bienvenida y reposición' },
  { clave: 'gestion', etiqueta: 'Gestión y otros', descripcion: 'Gestión, servicios profesionales y gastos sin categoría operativa' },
  { clave: 'suministros', etiqueta: 'Suministros', descripcion: 'Luz, agua, gas, internet y telecomunicaciones' },
];

/** Etiqueta visible de una categoría de coste. */
export function etiquetaCategoriaCoste(clave: CategoriaCoste): string {
  return CATEGORIAS_COSTE.find((c) => c.clave === clave)?.etiqueta || clave;
}

/**
 * Categoría de coste de un gasto del ERP, por su categoría contable.
 * Sin acentos en los patrones: el dato llega en texto libre y legacy.
 */
export function categoriaDeGasto(categoria: string | null | undefined): CategoriaCoste {
  const valor = (categoria || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/limpieza|lavander/.test(valor)) return 'limpieza';
  if (/mantenimiento|reparacion|conservacion|averia/.test(valor)) return 'mantenimiento';
  if (/consumible|amenit|bienvenida|reposicion|supermercado|alimentac/.test(valor)) return 'consumibles';
  if (/comision|canal|pasarela|stripe|ota/.test(valor)) return 'comisiones';
  if (/suministro|luz|electricidad|agua|gas|telecomunicac|internet|wifi/.test(valor)) return 'suministros';
  // Gestion y otros: gestión, profesional, oficina, marketing… y lo desconocido.
  // Nada se queda fuera del coste por no tener categoría reconocida.
  return 'gestion';
}

/** Un gasto del ERP ya leído, atribuido a una reserva (enlace FASE 3.B). */
export interface GastoOperativoAtribuido {
  concepto: string;
  importe: number;
  /** Categoría contable del ERP en texto libre (ver `expense-categories.ts`). */
  categoria?: string | null;
}

/** Reserva de entrada: la financiera del cargador más sus gastos atribuidos. */
export type ReservaParaRentabilidad = ReservaFinanciera & {
  gastos?: GastoOperativoAtribuido[];
};

/** Coste agregado de una categoría, con su peso sobre los ingresos brutos. */
export interface CostePorCategoria {
  categoria: CategoriaCoste;
  etiqueta: string;
  importe: number;
  /** importe / bruto del grupo, en porcentaje (base de comparación entre propiedades). */
  pctIngresos: number;
  /** Conceptos del ERP que forman la cifra (trazabilidad del total). */
  partidas: Array<{ concepto: string; importe: number }>;
}

// ─── Rentabilidad operativa de una reserva ──────────────────────────────────

/** Etapas de dinero de una reserva, con el tercer nivel ya descontado. */
export interface RentabilidadOperativaReserva {
  moneda: string;
  /** Nivel 1: ingreso bruto de alojamiento y servicios. */
  bruto: number;
  /** Cargo por no-show: viaja aparte, no es ingreso de alojamiento (ver finance.ts). */
  penalizacion: number;
  comisionOta: number;
  comisionPasarela: number;
  /** Otras deducciones de la reserva sin categoría operativa. */
  otrosGastos: number;
  /** Nivel 2: ingreso neto (bruto + penalización − comisiones − deducciones). */
  neto: number;
  /** Costes operativos del ERP atribuidos a esta reserva. */
  costesOperativos: number;
  /** Nivel 3: neto − costes operativos de la operación. */
  rentabilidadOperativaReal: number;
  margenPct: number;
  categorias: CostePorCategoria[];
}

/**
 * Los tres niveles de dinero de una reserva.
 *
 * Los niveles 1 y 2 salen del módulo de la reserva (`finance.ts`) para que no
 * exista una segunda fórmula de bruto/neto en el proyecto. El nivel 3 resta los
 * gastos operativos atribuidos, que el informe por reserva no descuenta.
 */
export function rentabilidadOperativaDeReserva(reserva: ReservaParaRentabilidad): RentabilidadOperativaReserva {
  const rent = rentabilidadDeReserva(reserva);
  const aCobrar = redondear(rent.bruto + rent.penalizacion);

  const categorias = agruparCostes(reserva.gastos || [], rent.bruto);
  const costesOperativos = redondear(categorias.reduce((t, c) => t + c.importe, 0));
  const rentabilidadOperativaReal = redondear(rent.neto - costesOperativos);

  return {
    moneda: rent.moneda,
    bruto: rent.bruto,
    penalizacion: rent.penalizacion,
    comisionOta: rent.comisionOta,
    comisionPasarela: rent.comisionPasarela,
    otrosGastos: rent.otrosGastos,
    neto: rent.neto,
    costesOperativos,
    rentabilidadOperativaReal,
    // Margen del nivel 3: sobre lo que la reserva genera (bruto + penalización).
    // Sin ingresos no hay margen que leer y no se inventa uno.
    margenPct: aCobrar > 0 ? redondear((rentabilidadOperativaReal / aCobrar) * 100) : 0,
    categorias,
  };
}

/** Agrupa gastos por categoría de coste con su peso sobre el bruto. */
function agruparCostes(gastos: GastoOperativoAtribuido[], bruto: number): CostePorCategoria[] {
  const mapa = new Map<CategoriaCoste, CostePorCategoria>();
  for (const gasto of gastos) {
    const importe = redondear(Math.abs(gasto.importe || 0));
    if (importe <= 0) continue;
    const categoria = categoriaDeGasto(gasto.categoria);
    const entrada = mapa.get(categoria) || {
      categoria,
      etiqueta: etiquetaCategoriaCoste(categoria),
      importe: 0,
      pctIngresos: 0,
      partidas: [],
    };
    entrada.importe = redondear(entrada.importe + importe);
    entrada.partidas.push({ concepto: gasto.concepto || 'Gasto operativo', importe });
    mapa.set(categoria, entrada);
  }
  return Array.from(mapa.values())
    .map((c) => ({ ...c, pctIngresos: bruto > 0 ? redondear((c.importe / bruto) * 100) : 0 }))
    .sort((a, b) => b.importe - a.importe);
}

// ─── La cartera: MI CARTERA ─────────────────────────────────────────────────

/**
 * Fila de MI CARTERA — una propiedad con sus tres niveles de dinero.
 * El neto del nivel 2 se conserva para que el propietario vea cuánto se lleva
 * el paso de neto a rentabilidad operativa (los costes de operar).
 */
export interface FilaCartera {
  propertyId: string;
  nombre: string;
  moneda: string;
  /** Reservas que son venta (las canceladas y no-show no suman dinero). */
  reservas: number;
  /** Nivel 1: ingresos brutos. */
  ingresos: number;
  /** Nivel 2: ingresos netos (tras comisiones y deducciones de reserva). */
  ingresosNetos: number;
  /** Costes operativos totales de la propiedad (ERP + comisiones ya en neto). */
  gastos: number;
  /** Nivel 3: rentabilidad operativa real. */
  rentabilidadOperativaReal: number;
  /** rentabilidadOperativaReal / ingresos, en porcentaje. */
  margenPct: number;
  /** Solo los costes operativos añadidos por el nivel 3 (los del ERP). */
  costesOperativos: number;
  /**
   * Desglose «¿Dónde se está yendo el dinero?» de la propiedad. Incluye
   * «Comisiones de canales» (el paso bruto → neto: comisión OTA y pasarela) y
   * las categorías del ERP (el paso neto → rentabilidad operativa).
   */
  categorias: CostePorCategoria[];
  /** Divisas presentes en la propiedad que NO son la del informe (informativo). */
  otrasMonedas: string[];
}

export interface TotalCartera {
  propiedades: number;
  reservas: number;
  ingresos: number;
  ingresosNetos: number;
  /** Suma de los dos pasos de gasto: deducciones de reserva + costes operativos. */
  gastos: number;
  rentabilidadOperativaReal: number;
  margenPct: number;
  costesOperativos: number;
  /** Coste operativo medio por reserva con venta (lectura rápida de eficiencia). */
  costeMedioReserva: number | null;
}

export interface EntradaDesgloseGlobal {
  categoria: CategoriaCoste;
  etiqueta: string;
  importe: number;
  pctGastos: number;
  /** Propiedades con coste en esta categoría (para saber si es general o puntual). */
  propiedades: number;
}

export interface CarteraRentabilidad {
  /** Divisa en la que están escritos los importes del informe. */
  moneda: string;
  /** Aviso de mezcla: cuántas reservas quedan fuera de los totales y por qué. */
  multimoneda: Multimoneda;
  /** MI CARTERA, ordenada por rentabilidad operativa real descendente. */
  propiedades: FilaCartera[];
  total: TotalCartera;
  /** ¿Dónde se está yendo el dinero? — desglose global de la cartera. */
  desgloseCostes: EntradaDesgloseGlobal[];
  /** La nomenclatura del informe, para que la UI nunca la improvisa. */
  notaTerminologica: string;
}

const NOTA_TERMINOLOGICA =
  'Ingresos brutos: lo que generan las reservas. Ingresos netos: tras comisiones y deducciones. ' +
  'Rentabilidad operativa real: tras todos los costes de operar la propiedad (hipoteca, impuestos ' +
  'sobre la renta y amortización son rentabilidad económica del propietario, no de la operación).';

/**
 * ¿La reserva puede aportar dinero al informe? El filtro de divisa se decide
 * aquí; si aporta dinero (venta, o cargo por no-show pendiente de cobrar) lo
 * decide el bucle de la fila con la misma regla que Finanzas.
 */
function entraEnTotales(reserva: ReservaParaRentabilidad, moneda: string): boolean {
  return estaEnMonedaDelInforme(reserva, moneda);
}

/**
 * MI CARTERA: una fila por propiedad con sus tres niveles de dinero y el
 * desglose de dónde se va. Responde «¿cuál me está dejando más dinero y por
 * qué?» — ordenada por rentabilidad operativa real, no por ventas.
 */
export function construirCartera(params: {
  reservas: ReservaParaRentabilidad[];
  propiedades: Array<{ id: string; nombre: string }>;
  monedaTenant?: string | null;
}): CarteraRentabilidad {
  const moneda = monedaDelInforme(
    params.reservas.map((r) => r.moneda),
    params.monedaTenant
  );
  const grupos = agruparPorMoneda(params.reservas, moneda);

  // Toda propiedad del tenant entra, aunque no tenga reservas: una fila
  // ausente se leería como «esta propiedad no existe» y la pregunta del
  // propietario es sobre TODA su cartera. Con ceros, la lectura es honesta.
  const filas: FilaCartera[] = params.propiedades.map((propiedad) => {
    const reservasPropiedad = params.reservas.filter((r) => r.propertyId === propiedad.id);
    const delInforme = reservasPropiedad.filter((r) => entraEnTotales(r, moneda));

    let ingresos = 0;
    let ingresosNetos = 0;
    let costesOperativos = 0;
    let comisionesReserva = 0;
    let reservasConVenta = 0;
    const categorias = new Map<CategoriaCoste, CostePorCategoria>();

    for (const reserva of delInforme) {
      const rent = rentabilidadOperativaDeReserva(reserva);
      // Una reserva cancelada o no-show no es venta: no aporta bruto ni neto.
      // Sí entra si tiene penalización emitida: es un cargo pendiente de cobrar
      // (mismo trato que Finanzas), y su dinero viaja en `penalizacion`.
      if (!esReservaConVenta(reserva.estado) && rent.penalizacion <= 0) continue;
      if (esReservaConVenta(reserva.estado)) reservasConVenta += 1;
      ingresos = redondear(ingresos + rent.bruto + rent.penalizacion);
      ingresosNetos = redondear(ingresosNetos + rent.neto);
      costesOperativos = redondear(costesOperativos + rent.costesOperativos);
      // La comisión de canales es la primera línea del «¿dónde se va el
      // dinero?» (el paso bruto → neto): se agrega aquí, no como gasto ERP.
      comisionesReserva = redondear(comisionesReserva + rent.comisionOta + rent.comisionPasarela);
      for (const cat of rent.categorias) {
        const acumulada = categorias.get(cat.categoria) || {
          categoria: cat.categoria,
          etiqueta: cat.etiqueta,
          importe: 0,
          pctIngresos: 0,
          partidas: [],
        };
        acumulada.importe = redondear(acumulada.importe + cat.importe);
        acumulada.partidas.push(...cat.partidas);
        categorias.set(cat.categoria, acumulada);
      }
    }

    // El gasto de la fila junta los dos pasos: de bruto a neto (comisiones y
    // deducciones) y de neto a rentabilidad operativa (costes del ERP).
    const deduccionesReserva = redondear(ingresos - ingresosNetos);
    const rentabilidadOperativaReal = redondear(ingresosNetos - costesOperativos);

    // Con el cargador compartido la única deducción del paso bruto → neto es la
    // comisión (`otrosGastos` llega a 0), así que la fila cuadra exacto:
    // Σ categorias === gastos. Si algún día el cargador trajera otras
    // deducciones, quedarían visibles en el propio hueco entre netos y
    // categorías en lugar de inventarles una etiqueta.
    if (comisionesReserva > 0) {
      const entrada = categorias.get('comisiones') || {
        categoria: 'comisiones' as const,
        etiqueta: etiquetaCategoriaCoste('comisiones'),
        importe: 0,
        pctIngresos: 0,
        partidas: [],
      };
      entrada.importe = redondear(entrada.importe + comisionesReserva);
      categorias.set('comisiones', entrada);
    }

    const categoriasLista = Array.from(categorias.values())
      .map((c) => ({ ...c, pctIngresos: ingresos > 0 ? redondear((c.importe / ingresos) * 100) : 0 }))
      .sort((a, b) => b.importe - a.importe);

    const otrasMonedas = Array.from(
      new Set(
        reservasPropiedad
          .filter((r) => !estaEnMonedaDelInforme(r, moneda))
          .map((r) => (r.moneda || '').toUpperCase())
          .filter(Boolean)
      )
    );

    return {
      propertyId: propiedad.id,
      nombre: propiedad.nombre,
      moneda,
      reservas: reservasConVenta,
      ingresos,
      ingresosNetos,
      gastos: redondear(deduccionesReserva + costesOperativos),
      rentabilidadOperativaReal,
      // margen = rentabilidad operativa / ingresos brutos: el 71% de la historia.
      margenPct: ingresos > 0 ? redondear((rentabilidadOperativaReal / ingresos) * 100) : 0,
      costesOperativos,
      categorias: categoriasLista,
      otrasMonedas,
    };
  });

  // Ordenada por la pregunta del propietario: cuál le deja más dinero.
  const propiedades = filas.slice().sort(
    (a, b) => b.rentabilidadOperativaReal - a.rentabilidadOperativaReal || a.nombre.localeCompare(b.nombre)
  );

  const total = totalDeCartera(propiedades);

  // ¿Dónde se está yendo el dinero? — sobre el gasto total de la cartera.
  const desgloseCostes: EntradaDesgloseGlobal[] = CATEGORIAS_COSTE.map(({ clave, etiqueta }) => {
    const importe = redondear(
      propiedades.reduce((t, f) => t + (f.categorias.find((c) => c.categoria === clave)?.importe || 0), 0)
    );
    return {
      categoria: clave,
      etiqueta,
      importe,
      pctGastos: total.gastos > 0 ? redondear((importe / total.gastos) * 100) : 0,
      propiedades: propiedades.filter((f) => (f.categorias.find((c) => c.categoria === clave)?.importe || 0) > 0).length,
    };
  }).sort((a, b) => b.importe - a.importe);

  return {
    moneda,
    multimoneda: describirMultimoneda({ monedaInforme: moneda, grupos, totalFilas: params.reservas.length }),
    propiedades,
    total,
    desgloseCostes,
    notaTerminologica: NOTA_TERMINOLOGICA,
  };
}

function totalDeCartera(propiedades: FilaCartera[]): TotalCartera {
  const ingresos = redondear(propiedades.reduce((t, f) => t + f.ingresos, 0));
  const ingresosNetos = redondear(propiedades.reduce((t, f) => t + f.ingresosNetos, 0));
  const costesOperativos = redondear(propiedades.reduce((t, f) => t + f.costesOperativos, 0));
  const gastos = redondear(propiedades.reduce((t, f) => t + f.gastos, 0));
  const rentabilidadOperativaReal = redondear(propiedades.reduce((t, f) => t + f.rentabilidadOperativaReal, 0));
  const reservas = propiedades.reduce((t, f) => t + f.reservas, 0);

  return {
    propiedades: propiedades.length,
    reservas,
    ingresos,
    ingresosNetos,
    gastos,
    rentabilidadOperativaReal,
    margenPct: ingresos > 0 ? redondear((rentabilidadOperativaReal / ingresos) * 100) : 0,
    costesOperativos,
    costeMedioReserva: reservas > 0 ? redondear(costesOperativos / reservas) : null,
  };
}

// ─── Exportación CSV ────────────────────────────────────────────────────────

/** Filas de la cartera listas para `construirCsv` (números con punto decimal). */
export function filasCsvCartera(cartera: CarteraRentabilidad): Array<Record<string, unknown>> {
  return cartera.propiedades.map((f) => ({
    propiedad: f.nombre,
    moneda: f.moneda,
    reservas: f.reservas,
    ingresos_brutos: f.ingresos,
    ingresos_netos: f.ingresosNetos,
    gastos: f.gastos,
    rentabilidad_operativa_real: f.rentabilidadOperativaReal,
    margen_pct: f.margenPct,
    costes_operativos: f.costesOperativos,
  }));
}
