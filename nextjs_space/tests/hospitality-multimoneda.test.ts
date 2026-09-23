// @vitest-environment node
//
// Guardias de la decisión multimoneda de Reportes (H11/H22, bloqueo §8-B del
// runbook), cerrada el 23 sep 2026: los agregados NO convierten; el informe se
// escribe en UNA divisa y las reservas de las otras se informan aparte.
//
// Lo que se vigila aquí es la propiedad que importa y que es fácil de romper:
// **ningún total puede ser la suma de dos divisas distintas**. También que las
// mismas reglas se apliquen en los dos informes que ve el hotel (Reportes y el
// dashboard que lo alimenta) y que la pantalla avise en vez de callar.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  agruparPorMoneda,
  describirMultimoneda,
  estaEnMonedaDelInforme,
  monedaDelInforme,
} from '@/lib/hospitality/multimoneda';
import { kpisVentana, mixDeCanales, perChannelRevenueTrend } from '@/lib/hospitality/analytics';
import {
  reporteFinanciero,
  reporteOperacion,
  reportePropiedades,
  reporteVentas,
  type ReporteReserva,
} from '@/lib/hospitality/reportes';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

const linea = (tipo: string, concepto: string, cantidad: number, unitario: number) => ({
  tipo,
  concepto,
  cantidad,
  importeUnitario: unitario,
  importeTotal: cantidad * unitario,
});

const reserva = (over: Partial<ReporteReserva> = {}): ReporteReserva => ({
  id: 'r1',
  channel: 'Airbnb',
  estado: 'confirmed',
  checkIn: new Date('2026-10-10T15:00:00'),
  checkOut: new Date('2026-10-12T11:00:00'),
  propertyId: 'p1',
  propertyNombre: 'Centro',
  unitId: 'u1',
  huesped: 'María',
  moneda: 'EUR',
  lineas: [linea('alojamiento', 'Alojamiento', 2, 100)],
  pagos: [],
  comisionOta: 0,
  otrosGastos: 0,
  ...over,
});

const unidades = [{ id: 'u1', propertyId: 'p1' }];
const rango = { desde: new Date('2026-10-09T00:00:00'), hasta: new Date('2026-10-14T00:00:00') };

/** Dos reservas en EUR de 200 (2 noches × 100) y una en USD de 1800: mezcla. */
const MEZCLA: ReporteReserva[] = [
  reserva({ id: 'eur1' }),
  reserva({ id: 'eur2' }),
  reserva({
    id: 'usd1',
    moneda: 'USD',
    lineas: [linea('alojamiento', 'Alojamiento', 2, 900)],
  }),
];
const EUR_TOTAL = 400; // 2 reservas × 200
const USD_TOTAL = 1800; // 2 noches × 900

describe('multimoneda — reglas puras', () => {
  it('la divisa del informe es la de los datos y, sin datos, la del tenant', () => {
    expect(monedaDelInforme(['EUR', 'EUR', 'USD'])).toBe('EUR');
    expect(monedaDelInforme([], 'COP')).toBe('COP');
    expect(monedaDelInforme([])).toBe('');
  });

  it('una fila sin divisa hereda la del informe (no abre un grupo nuevo)', () => {
    const grupos = agruparPorMoneda([{ moneda: null }, { moneda: '' }, { moneda: 'eur' }], 'EUR');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].items).toHaveLength(3);
    expect(estaEnMonedaDelInforme({ moneda: undefined }, 'EUR')).toBe(true);
  });

  it('agrupa por divisa de mayor a menor volumen', () => {
    const grupos = agruparPorMoneda([{ moneda: 'USD' }, { moneda: 'EUR' }, { moneda: 'EUR' }], 'EUR');
    expect(grupos.map((g) => g.moneda)).toEqual(['EUR', 'USD']);
  });

  it('el aviso dice cuántas reservas quedan fuera y en qué divisa, y no promete conversión', () => {
    const grupos = agruparPorMoneda(MEZCLA, 'EUR');
    const aviso = describirMultimoneda({ monedaInforme: 'EUR', grupos, totalFilas: MEZCLA.length });
    expect(aviso.mixto).toBe(true);
    expect(aviso.moneda).toBe('EUR');
    expect(aviso.monedas).toEqual(['EUR', 'USD']);
    expect(aviso.reservasFuera).toBe(1);
    expect(aviso.nota).toContain('no se convierten');
    expect(aviso.nota).toContain('USD');
  });

  it('sin mezcla no hay aviso', () => {
    const grupos = agruparPorMoneda([reserva(), reserva({ id: 'r2' })], 'EUR');
    const aviso = describirMultimoneda({ monedaInforme: 'EUR', grupos, totalFilas: 2 });
    expect(aviso.mixto).toBe(false);
    expect(aviso.nota).toBeNull();
    expect(aviso.reservasFuera).toBe(0);
  });

  it('el módulo no contiene ninguna tasa ni factor de conversión', () => {
    const fuente = leer('lib/hospitality/multimoneda.ts');
    expect(fuente).not.toMatch(/\btasa\b/i);
    expect(fuente).not.toMatch(/\bfactor\b/i);
    expect(fuente).toContain('no se convierten');
  });
});

describe('reporteOperacion — el dinero no se mezcla', () => {
  it('con una sola divisa el informe es el de siempre', () => {
    const operacion = reporteOperacion({
      reservas: [reserva(), reserva({ id: 'r2' })],
      unidades,
      ...rango,
    });
    expect(operacion.moneda).toBe('EUR');
    expect(operacion.multimoneda.mixto).toBe(false);
    expect(operacion.ingresos).toBe(EUR_TOTAL);
    expect(operacion.porMoneda).toHaveLength(1);
    expect(operacion.porMoneda[0].ingresos).toBe(EUR_TOTAL);
  });

  it('con divisas mezcladas el total es de la divisa del informe, NO la suma', () => {
    const operacion = reporteOperacion({ reservas: MEZCLA, unidades, ...rango });

    expect(operacion.moneda).toBe('EUR');
    expect(operacion.ingresos).toBe(EUR_TOTAL); // solo los EUR, sin los USD
    expect(operacion.ingresos).not.toBe(EUR_TOTAL + USD_TOTAL);

    const porMoneda = Object.fromEntries(operacion.porMoneda.map((m) => [m.moneda, m]));
    expect(porMoneda.EUR.ingresos).toBe(EUR_TOTAL);
    expect(porMoneda.USD.ingresos).toBe(USD_TOTAL);
    expect(porMoneda.EUR.reservasConVenta).toBe(2);
    expect(porMoneda.USD.reservasConVenta).toBe(1);

    expect(operacion.multimoneda.mixto).toBe(true);
    expect(operacion.multimoneda.reservasFuera).toBe(1);
    // La ocupación no depende de la divisa: sigue contando todas las reservas.
    expect(operacion.reservas).toBe(3);
  });

  it('el ADR sale del dinero y las noches de la MISMA divisa', () => {
    const operacion = reporteOperacion({ reservas: MEZCLA, unidades, ...rango });
    // ADR = ingresos de la divisa del informe / noches ocupadas de la ventana
    // (una unidad, dos noches) = 400 / 2 = 200. Si el dinero de la otra divisa
    // se colara en el numerador, el ADR sería 1100: ese es el número inventado
    // que esta regla evita.
    expect(operacion.adr).toBe(200);
    expect(operacion.adr).not.toBe(1100);
  });
});

describe('kpisVentana — los KPIs del hotel no suman divisas', () => {
  const ahora = new Date('2026-10-12T10:00:00');
  // Las reservas de analítica llevan `currency` y `amountAfterTax` (no las
  // líneas del informe): es el shape que lee el dashboard.
  const enVentana = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    propertyId: 'p1',
    unitId: 'u1',
    channel: 'Airbnb',
    estado: 'confirmed',
    checkIn: new Date('2026-10-10T15:00:00'),
    checkOut: new Date('2026-10-12T11:00:00'),
    amountAfterTax: 100,
    currency: 'EUR',
    ...over,
  });

  it('ingresos y ADR salen solo de la divisa del informe, y hay reparto por divisa', () => {
    const kpis = kpisVentana({
      reservations: [
        enVentana({ id: 'eur1' }),
        enVentana({ id: 'usd1', currency: 'USD' }),
      ],
      totalUnidades: 1,
      dias: 7,
      hasta: ahora,
    });

    expect(kpis.moneda).toBe('EUR');
    expect(kpis.ingresos).toBe(100);
    expect(kpis.nochesVendidas).toBe(2);
    expect(kpis.adr).toBe(50);
    expect(kpis.multimoneda.mixto).toBe(true);
    expect(kpis.porMoneda.map((m) => m.moneda).sort()).toEqual(['EUR', 'USD']);
    expect(kpis.porMoneda.find((m) => m.moneda === 'USD')?.ingresos).toBe(100);
  });

  it('sin divisa en los datos cae a la moneda del tenant', () => {
    const kpis = kpisVentana({
      reservations: [enVentana({ id: 'sin-moneda', currency: null })],
      totalUnidades: 1,
      dias: 7,
      hasta: ahora,
      monedaTenant: 'COP',
    });
    expect(kpis.moneda).toBe('COP');
    expect(kpis.ingresos).toBe(100);
    expect(kpis.multimoneda.mixto).toBe(false);
  });

  it('el mix de canales y la tendencia diaria también se limitan a la divisa', () => {
    const reservas = [
      {
        id: 'eur1',
        propertyId: 'p1',
        unitId: 'u1',
        channel: 'Airbnb',
        estado: 'confirmed',
        checkIn: new Date('2026-10-10T15:00:00'),
        checkOut: new Date('2026-10-12T11:00:00'),
        amountAfterTax: 100,
        currency: 'EUR',
      },
      {
        id: 'usd1',
        propertyId: 'p1',
        unitId: 'u1',
        channel: 'Airbnb',
        estado: 'confirmed',
        checkIn: new Date('2026-10-10T15:00:00'),
        checkOut: new Date('2026-10-12T11:00:00'),
        amountAfterTax: 900,
        currency: 'USD',
      },
    ];

    const canales = mixDeCanales(reservas, 'EUR');
    expect(canales).toHaveLength(1);
    expect(canales[0].ingresos).toBe(100);
    // Las reservas en otra divisa no desaparecen del recuento de canales…
    expect(canales[0].reservas).toBe(1);

    const tendencia = perChannelRevenueTrend({ reservations: reservas, dias: 7, hasta: ahora, monedaInforme: 'EUR' });
    expect(tendencia.reduce((t, s) => t + s.total, 0)).toBe(100);
  });
});

describe('reporteVentas, propiedades y financiero', () => {
  it('los canales informan la divisa del informe y su reparto', () => {
    const ventas = reporteVentas({ reservas: MEZCLA });
    expect(ventas.moneda).toBe('EUR');
    expect(ventas.porMoneda.map((m) => m.moneda).sort()).toEqual(['EUR', 'USD']);
    expect(ventas.canales.reduce((t, c) => t + c.ingresos, 0)).toBe(EUR_TOTAL);
    expect(ventas.multimoneda.nota).toContain('no se convierten');
  });

  it('cada propiedad lleva su divisa y lista aparte las reservas de otras', () => {
    const filas = reportePropiedades({
      propiedades: [{ id: 'p1', nombre: 'Centro' }],
      unidades,
      reservas: MEZCLA,
      ...rango,
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].moneda).toBe('EUR');
    expect(filas[0].ingresos).toBe(EUR_TOTAL); // el USD no se suma a la fila
    expect(filas[0].otrasMonedas.map((m) => m.moneda)).toEqual(['USD']);
    expect(filas[0].otrasMonedas[0].ingresos).toBe(USD_TOTAL);
  });

  it('el bloque financiero suma solo su divisa y publica el reparto', () => {
    const financiero = reporteFinanciero({ reservas: MEZCLA });
    expect(financiero.moneda).toBe('EUR');
    expect(financiero.totales.bruto).toBe(EUR_TOTAL);
    expect(financiero.porMoneda.find((m) => m.moneda === 'USD')?.ingresos).toBe(USD_TOTAL);
    expect(financiero.multimoneda.reservasFuera).toBe(1);
  });
});

describe('multimoneda — cableado', () => {
  it('las dos rutas pasan la moneda del tenant a los informes', () => {
    const dashboard = leer('app/api/hospitality/dashboard/route.ts');
    expect(dashboard).toContain('monedaTenant: auth.tenant?.moneda');
    expect(dashboard).toContain('mixDeCanales(reservasAnalytics, monedaInforme)');
    expect(dashboard).toContain('monedaInforme,');
    expect(dashboard).toContain('multimoneda: reportesKpis.multimoneda');
    expect(dashboard).toContain('porMoneda: reportesKpis.porMoneda');

    const reportes = leer('app/api/hospitality/reportes/route.ts');
    expect(reportes).toContain('const monedaTenant = auth.tenant?.moneda ?? null');
    expect((reportes.match(/monedaTenant/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(reportes).toContain('multimoneda: operacion.multimoneda');
    expect(reportes).toContain('porMoneda: operacion.porMoneda');
  });

  it('la pantalla avisa en vez de callar y escribe cada divisa con la suya', () => {
    const pagina = leer('app/dashboard/hospitality/reportes/page.tsx');
    expect(pagina).toContain('multimoneda?.nota');
    expect(pagina).toContain('Multimoneda (sin convertir)');
    expect(pagina).toContain('formatearImporte(valor, moneda, 0)');
    expect(pagina).toContain('otrasMonedas');
  });

  it('los informes declaran la divisa en la que están escritos', () => {
    const fuente = leer('lib/hospitality/reportes.ts');
    expect(fuente).toContain('partirPorMoneda');
    expect(fuente).toContain('estaEnMonedaDelInforme');
    // Nada de sumar a ciegas: el efectivo sale de las filas ya filtradas.
    expect(fuente).not.toContain('resumenFinanciero(filasFinancieras(conVentaTodas))');
  });
});
