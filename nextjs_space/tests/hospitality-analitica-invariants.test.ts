// @vitest-environment node
//
// Guardia de la INVARIANTE de analítica de Hospitality (auditoría del 17 sep 2026)
//
// Hallada auditando: el mismo concepto estaba implementado tres y cuatro veces
// fuera de los módulos puros, cada copia con una variante distinta de la regla
// de fechas (por instantes unas, por días otras) y alguna con una regla de
// negocio distinta a la del resto (las canceladas sumaban gasto del huésped,
// la ocupación de la analítica contaba la noche del check-out).
//
// La invariante es: **el cálculo vive en el módulo puro; las rutas cargan datos
// y delegan**. Estos tests son la valla:
//   · genéricos: lo que no debe volver a aparecer en la vertical;
//   · por archivo: qué módulo puro debe consumir cada sitio.
//
// Los tests de comportamiento (analytics, guests, disponibilidad) son los que
// demuestran que la regla es correcta; estos evitan que se vuelva a duplicar.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

/** Archivos .ts/.tsx de los directorios indicados, en orden estable. */
function listarFuentes(bases: string[]): string[] {
  const out: string[] = [];
  for (const base of bases) {
    const pila = [path.join(RAIZ, base)];
    while (pila.length) {
      const actual = pila.pop()!;
      for (const entrada of fs.readdirSync(actual, { withFileTypes: true })) {
        const ruta = path.join(actual, entrada.name);
        if (entrada.isDirectory()) pila.push(ruta);
        else if (/\.(ts|tsx)$/.test(entrada.name)) out.push(path.relative(RAIZ, ruta));
      }
    }
  }
  return out.sort();
}

/** Todos los archivos de la vertical (rutas de API y páginas del dashboard). */
function archivosDeLaVertical(): string[] {
  return listarFuentes(['app/api/hospitality', 'app/dashboard/hospitality']);
}

/**
 * Todo el código donde puede copiarse una regla de estados: la lib pura, las
 * rutas de hospitality, la API pública y el panel de admin de conectividad.
 */
function archivosConEstados(): string[] {
  return listarFuentes([
    'lib/hospitality',
    'app/api/hospitality',
    'app/api/public',
    'app/api/admin/conectividad',
    'app/admin/conectividad',
    'app/dashboard/hospitality',
  ]);
}

describe('Invariante: la analítica de hospitality vive en los módulos puros', () => {
  const archivos = archivosDeLaVertical();

  it('la vertical tiene archivos que auditar (la guardia no pasa por vacío)', () => {
    expect(archivos.length).toBeGreaterThan(20);
  });

  it('ninguna ruta de API agrega con `.reduce()` (delega en los módulos)', () => {
    const culpables = archivos
      .filter((f) => f.startsWith('app/api/'))
      .filter((f) => leer(f).includes('.reduce('));
    expect(culpables, `Rutas con agregación propia: ${culpables.join(', ')}`).toEqual([]);
  });

  it('ninguna página suma importes: los totales salen del módulo', () => {
    // En las páginas, el idioma de suma es `… + r.amountAfterTax`; en las rutas,
    // `… += r.amountAfterTax`. Pasar el importe a un módulo puro (Finanzas) no es
    // sumar: eso se permite.
    const esSuma = /(\+=|\+)\s*[\w.]*amountAfterTax/;
    const culpables = archivos.filter((f) => esSuma.test(leer(f)));
    expect(culpables, `Sumando importes por su cuenta: ${culpables.join(', ')}`).toEqual([]);
  });

  it('la regla de producción (canceladas/no-show) no se copia en la vertical', () => {
    // Las consultas pueden usar `notIn` con la lista compartida; lo que no debe
    // volver es la comparación literal del estado.
    const culpables = archivos.filter((f) => {
      const fuente = leer(f);
      return /estado\s*!==\s*'cancelled'\s*&&\s*\w+\.estado\s*!==\s*'no_show'/.test(fuente)
        || /estado\s*===\s*'cancelled'\s*\|\|\s*\w+\.estado\s*===\s*'no_show'/.test(fuente);
    });
    expect(culpables, `Regla copiada en: ${culpables.join(', ')}`).toEqual([]);
  });

  it('nadie compara la hora de una reserva contra un día (la trampa del día de desfase)', () => {
    const culpables = archivos.filter((f) => {
      const fuente = leer(f);
      // `algo.checkIn.getTime() < algo` / `checkOut.getTime() >= …`
      return /\w+\.check(In|Out)\.getTime\(\)\s*[<>]=?/.test(fuente);
    });
    expect(culpables, `Comparaciones por instantes en: ${culpables.join(', ')}`).toEqual([]);
  });
});

describe('Invariante: cada sitio consume su módulo puro', () => {
  it('el dashboard (hoy y próximos 7 días) usa ocupación y llegadas/salidas del módulo', () => {
    const fuente = leer('app/api/hospitality/dashboard/route.ts');
    expect(fuente).toContain("from '@/lib/hospitality/analytics'");
    expect(fuente).toContain('ocupacionPorDia(');
    expect(fuente).toContain('llegadasDelDia(');
    expect(fuente).toContain('salidasDelDia(');
    expect(fuente).toContain('perPropertyOccupancy(');
    expect(fuente).toContain('kpisVentana(');
    // Nada de aritmética de días ni de repartos por unidad en la ruta.
    expect(fuente).not.toContain('86_400_000');
    expect(fuente).not.toContain('/ totalUnidades');
  });

  it('el panel de operaciones usa el motor de disponibilidad para el estado por unidad', () => {
    const fuente = leer('app/api/hospitality/operations/route.ts');
    expect(fuente).toContain('unitOccupiedOnDay(');
    expect(fuente).toContain('llegadasDelDia(');
    expect(fuente).toContain('salidasDelDia(');
    // La ocupación de hoy necesita las reservas que OCUPAN hoy, no solo las que
    // llegan o salen (un huésped a mitad de estancia se quedaba fuera).
    expect(fuente).toMatch(/checkIn: \{ lt: tomorrow \}/);
    expect(fuente).toMatch(/checkOut: \{ gt: today \}/);
  });

  it('la ruta de huéspedes delega la agrupación y los totales', () => {
    const fuente = leer('app/api/hospitality/guests/route.ts');
    expect(fuente).toContain('agruparHuespedes(');
    expect(fuente).not.toContain('totalGasto');
    expect(fuente).not.toContain('totalNoches');
  });

  it('la página de reservas no recalcula noches ni totales', () => {
    const fuente = leer('app/dashboard/hospitality/reservas/page.tsx');
    expect(fuente).toContain('nightsBetween');
    expect(fuente).toContain('resumenReservas(');
    expect(fuente).not.toContain('function noches(');
  });

  it('la página de reportes usa la ocupación global del módulo, no una media de medias', () => {
    const fuente = leer('app/dashboard/hospitality/reportes/page.tsx');
    expect(fuente).toContain('ocupacionGlobal');
    expect(fuente).not.toContain('ocupacionPropiedades.reduce');
  });

  it('la lista de estados y la regla de producción tienen una sola definición', () => {
    const fuente = leer('lib/hospitality/estados.ts');
    expect(fuente).toContain('export function aportaProduccion');
    expect(fuente).toContain('ESTADOS_SIN_PRODUCCION');
    // Los módulos puros la consumen en vez de repetirla.
    expect(leer('lib/hospitality/analytics.ts')).toContain('aportaProduccion');
    expect(leer('lib/hospitality/guests.ts')).toContain('aportaProduccion');
  });

  it('el motor de disponibilidad aplica la MISMA regla (no-show no bloquea)', () => {
    // Aquí estaba la última variante: el motor solo miraba `cancelled`, así que
    // un no-show dejaba la unidad bloqueada mientras el resto de la vertical lo
    // trataba como no productivo (bloqueo fantasma: no vendible y sin nadie
    // dentro). Debe consumir la regla compartida, no comparar el estado a mano.
    const motor = leer('lib/hospitality/availability.ts');
    expect(motor).toContain('aportaProduccion');
    expect(motor).toContain('estadosSinProduccion()');
    expect(motor).not.toMatch(/estado\s*[!=]==?\s*'cancelled'/);
    expect(motor).not.toMatch(/estado\s*[!=]==?\s*'no_show'/);
  });

  it('las series de fechas son locales (nada de toISOString en la analítica)', () => {
    const fuente = leer('lib/hospitality/analytics.ts');
    expect(fuente).toContain('return toIsoDate(new Date(ms))');
    expect(fuente).not.toMatch(/new Date\(\w+\)\.toISOString\(\)/);
  });

  it('las listas de estados viven solo en estados.ts (no copiadas por la vertical)', () => {
    // Auditoría 17 sep 2026: la MISMA pregunta («¿ocupa?») estaba respondida con
    // cuatro listas distintas, y por eso el motor bloqueaba lo que otro panel
    // daba por terminado. Las tres listas que existen tienen nombre y sitio:
    //   · viva      → ESTADOS_RESERVA_VIVA      (¿la estancia sigue en curso?)
    //   · produccion→ ESTADOS_SIN_PRODUCCION    (¿ocupa y factura?)
    //   · validación→ ESTADOS_RESERVA           (¿es un estado conocido?)
    const listas = [
      /\[\s*'pending'\s*,\s*'confirmed'\s*,\s*'checked_in'\s*\]/,
      /\[\s*'cancelled'\s*,\s*'checked_out'\s*,\s*'no_show'\s*\]/,
      /\[\s*'pending'\s*,\s*'confirmed'\s*,\s*'cancelled'\s*,\s*'checked_in'\s*,\s*'checked_out'\s*,\s*'no_show'\s*\]/,
      /\[\s*'pending'\s*,\s*'confirmed'\s*,\s*'checked_in'\s*,\s*'checked_out'\s*\]/,
    ];
    const culpables = archivosConEstados()
      .filter((f) => f !== 'lib/hospitality/estados.ts')
      .filter((f) => listas.some((re) => re.test(leer(f))));
    expect(culpables, `Listas de estados copiadas en: ${culpables.join(', ')}`).toEqual([]);
  });

  it('la penalización por no-show no se filtra a la ocupación ni al ingreso de alojamiento', () => {
    // Es un cargo de cancelación: se cobra, pero no es ADR, ni RevPAR, ni noches
    // vendidas. Si la analítica la conociera, el período dejaría de cuadrar con
    // la ocupación.
    expect(leer('lib/hospitality/analytics.ts')).not.toContain('penalizacion');
    expect(leer('lib/hospitality/availability.ts')).not.toContain('penalizacion');
    expect(leer('lib/hospitality/guests.ts')).not.toContain('penalizacion');

    // El único sitio donde entra al dinero es el módulo puro, y entra filtrándola
    // fuera del bruto (una sola definición, no una copia por ruta).
    const finance = leer('lib/hospitality/finance.ts');
    expect(finance).toContain("linea.tipo !== 'penalizacion'");
    expect(finance).toContain('export function calcularPenalizacion(');

    // Las rutas consumen el módulo puro: no calculan la penalización por su
    // cuenta (la única aritmética permitida es sumar importes ya calculados
    // para el resumen, igual que con el bruto).
    const finanzasRoute = leer('app/api/hospitality/finanzas/route.ts');
    expect(finanzasRoute).toContain('calcularRentabilidad(');
    expect(finanzasRoute).toContain('TIPO_LINEA_PENALIZACION');
    expect(finanzasRoute).not.toMatch(/a(mountAfterTax|mount)[^\n]*\/\s*noches/);
    // Solo la transición a no_show emite: no se emite al crear ni al editar.
    expect(leer('app/api/hospitality/reservations/route.ts')).not.toContain('no-show');
  });

  it('la penalización se factura por el ERP, no por hospitality (una sola verdad financiera)', () => {
    // Regla 4 del plan: nada de un segundo sistema financiero. Hospitality
    // aporta concepto e importe; la numeración fiscal y Veri*factu son del ERP.
    const emisor = leer('lib/hospitality/penalizaciones.ts');
    expect(emisor).toContain("await import('@/lib/invoicing-service')");
    expect(emisor).toContain('InvoicingService.createInvoice');
    // Hospitality no crea facturas ni toca la tabla del ERP.
    expect(emisor).not.toContain('prisma.invoice');
    // Y emitir el cargo no toca el estado de la reserva (no vuelve a ocupar).
    expect(emisor).not.toMatch(/hospitalityReservation\.update/);
  });

  it('el planning y la analítica preguntan lo mismo con el mismo vocabulario', () => {
    // La vista Mes del planning es OCUPACIÓN: un no-show no puede pintar la
    // noche como ocupada cuando el motor ya la da por libre.
    expect(leer('lib/hospitality/calendar.ts')).toContain('aportaProduccion');
    // Llegadas/salidas y dashboard usan «movimiento del día».
    expect(leer('lib/hospitality/analytics.ts')).toContain('esMovimientoDelDia');
    expect(leer('app/api/hospitality/dashboard/route.ts')).toContain('esMovimientoDelDia');
    expect(leer('app/api/hospitality/dashboard/route.ts')).toContain('esReservaViva');
    // Las consultas de «viva» salen de la lista compartida.
    expect(leer('lib/hospitality/reconciliation.ts')).toContain('ESTADOS_RESERVA_VIVA');
    expect(leer('lib/hospitality/operations.ts')).toContain('ESTADOS_RESERVA_VIVA');
    expect(leer('app/api/hospitality/finanzas/route.ts')).toContain('estadosConProduccion');
  });
});
