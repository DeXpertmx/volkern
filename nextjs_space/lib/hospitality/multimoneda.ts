/**
 * Multimoneda de los informes de Hospitality (decisión de producto H11/H22).
 *
 * La decisión, cerrada el 23 sep 2026: **los agregados NO convierten**. Cada
 * divisa se informa por separado; el informe se escribe en UNA divisa (la del
 * tenant) y las reservas que están en otra no entran en sus totales: se cuentan
 * aparte y se muestran con su propia divisa.
 *
 * Por qué no se convierte: convertir exige un tipo de cambio, y hoy no hay
 * ninguno autoritativo en el sistema. Inventarlo —un número fijo o el del día
 * equivocado— produciría un «ingreso del mes» que no corresponde a ningún
 * dinero real, y eso es peor que un total que dice en qué divisa está. Cuando
 * una cuenta lo necesite, el tipo de cambio entra por aquí, explícito y
 * auditado, no como constante escondida.
 *
 * Es la MISMA regla que ya aplican Finanzas (`resumen.porMoneda` en
 * `app/api/hospitality/finanzas/route.ts`) y Seguros
 * (`lib/insurance/currency.ts`). Reportes era el único sitio que sumaba divisas
 * distintas bajo una sola etiqueta.
 *
 * Módulo PURO: no toca base de datos ni consulta tipos de cambio. Las divisas
 * se piden a `lib/moneda`, que es el único módulo que conoce códigos de divisa.
 */

import { monedaEfectiva } from '@/lib/moneda';

/** Cualquier fila que declare en qué divisa está su dinero. */
export interface ConMoneda {
  moneda?: string | null;
}

/** Divisa de una fila, normalizada. Cadena vacía = el dato no la trae. */
export function monedaNormalizada(valor?: string | null): string {
  return (valor || '').trim().toUpperCase();
}

/**
 * Divisa con la que se escribe el informe: la de sus datos (si hay varias, la
 * predominante) y, si no hay ninguna, la moneda de reporte del tenant.
 *
 * Delega en `monedaEfectiva` a propósito: la plataforma ya tenía una definición
 * de «divisa del informe» y no se duplica aquí.
 */
export function monedaDelInforme(
  valores: Array<string | null | undefined>,
  monedaTenant?: string | null
): string {
  return monedaEfectiva(valores, monedaTenant);
}

/**
 * ¿El dinero de esta fila se escribe en la divisa del informe?
 *
 * Una fila sin divisa hereda la del informe (no se inventa una nueva y no se
 * cuela en un grupo ajeno): es la misma caída que aplica `monedaEfectiva`.
 */
export function estaEnMonedaDelInforme(fila: ConMoneda, monedaInforme: string): boolean {
  return (monedaNormalizada(fila.moneda) || monedaInforme) === monedaInforme;
}

export interface GrupoMoneda<T> {
  moneda: string;
  items: T[];
}

/**
 * Parte las filas por divisa, de mayor a menor volumen, y con la divisa del
 * informe siempre presente (aunque no tenga filas, para no dejar el informe sin
 * divisa cuando todavía no hay datos).
 */
export function agruparPorMoneda<T>(
  filas: T[],
  monedaInforme: string,
  /**
   * De qué campo sale la divisa. Por defecto `moneda`; el dashboard llama a
   * sus reservas `currency`, y ese nombre distinto no puede ser la razón de
   * que dos divisas acaben en el mismo grupo.
   */
  monedaDe: (fila: T) => string | null | undefined = (fila) => (fila as ConMoneda)?.moneda
): GrupoMoneda<T>[] {
  const mapa = new Map<string, T[]>();
  if (monedaInforme) mapa.set(monedaInforme, []);

  for (const fila of filas) {
    const moneda = monedaNormalizada(monedaDe(fila)) || monedaInforme;
    const lista = mapa.get(moneda);
    if (lista) lista.push(fila);
    else mapa.set(moneda, [fila]);
  }

  return [...mapa.entries()]
    .map(([moneda, items]) => ({ moneda, items }))
    .sort((a, b) => b.items.length - a.items.length || a.moneda.localeCompare(b.moneda));
}

export interface Multimoneda {
  /** Hay más de una divisa en los datos: los totales son de una sola. */
  mixto: boolean;
  /** Divisa en la que están escritos los totales del informe. */
  moneda: string;
  /** Todas las divisas presentes, con la del informe primero. */
  monedas: string[];
  /** Reservas que NO están en la divisa del informe (fuera de los totales). */
  reservasFuera: number;
  /** Frase para la pantalla. `null` cuando no hay nada que avisar. */
  nota: string | null;
}

/**
 * Estado multimoneda de un informe: si hay mezcla, cuántas reservas quedan
 * fuera de los totales y qué se le dice al usuario en la pantalla.
 */
export function describirMultimoneda(params: {
  monedaInforme: string;
  grupos: Array<GrupoMoneda<unknown>>;
  totalFilas: number;
}): Multimoneda {
  const { monedaInforme, grupos, totalFilas } = params;
  const monedas = [
    ...(monedaInforme ? [monedaInforme] : []),
    ...grupos.map((g) => g.moneda).filter((m) => m && m !== monedaInforme),
  ];
  const reservasFuera = grupos
    .filter((g) => g.moneda !== monedaInforme)
    .reduce((total, g) => total + g.items.length, 0);
  const mixto = monedas.length > 1;

  return {
    mixto,
    moneda: monedaInforme,
    monedas,
    reservasFuera,
    nota: mixto ? notaMultimoneda(monedaInforme, monedas, reservasFuera, totalFilas) : null,
  };
}

function notaMultimoneda(
  monedaInforme: string,
  monedas: string[],
  reservasFuera: number,
  totalFilas: number
): string {
  const otras = monedas.filter((m) => m !== monedaInforme);
  const plural = reservasFuera === 1 ? 'reserva' : 'reservas';
  return (
    `Los importes de este informe están en ${monedaInforme} y no se convierten entre divisas. ` +
    `${reservasFuera} de ${totalFilas} ${plural} del período están en ${otras.join(', ')}: ` +
    `quedan fuera de los totales y se muestran aparte, con su propia divisa.`
  );
}
