// @vitest-environment node
//
// Rentabilidad operativa de la cartera (MI CARTERA).
//
// El contrato que protegen estas pruebas es de DINERO y de NOMBRES:
// - Tres niveles: ingresos brutos → ingresos netos → rentabilidad operativa real.
// - El tercer nivel NUNCA se llama «ingreso real»: hipoteca, impuestos sobre la
//   renta y amortización son rentabilidad económica del propietario, no de la
//   operación. La guardia de nomenclatura lo exige también en la UI.
// - Los tres niveles salen de las fórmulas existentes (finance.ts): aquí no hay
//   una segunda aritmética de dinero que pueda divergir de la reserva.
// - Una reserva cancelada o no-show no es venta: no suma, salvo penalización.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORIAS_COSTE,
  categoriaDeGasto,
  construirCartera,
  etiquetaCategoriaCoste,
  filasCsvCartera,
  rentabilidadOperativaDeReserva,
  type GastoOperativoAtribuido,
} from '@/lib/hospitality/rentabilidad';
import { calcularRentabilidad } from '@/lib/hospitality/finance';
import type { ReservaFinanciera } from '@/lib/hospitality/finance-summary';

const RAIZ = path.resolve(__dirname, '..');

function reserva(over: Partial<ReservaFinanciera> = {}): ReservaFinanciera {
  return {
    id: 'r1',
    channel: 'Airbnb',
    estado: 'confirmed',
    checkIn: '2026-10-10',
    checkOut: '2026-10-15',
    propertyId: 'p1',
    propertyNombre: 'Apartamento Centro',
    moneda: 'EUR',
    lineas: [
      { tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 5, importeUnitario: 120, importeTotal: 600 },
      { tipo: 'limpieza', concepto: 'Limpieza final', cantidad: 1, importeUnitario: 60, importeTotal: 60 },
    ],
    pagos: [],
    comisionOta: 99,
    comisionPasarela: 0,
    otrosGastos: 0,
    ...over,
  };
}

describe('rentabilidadOperativaDeReserva — los tres niveles', () => {
  it('nivela bruto → neto → rentabilidad operativa real con sus costes', () => {
    const r = rentabilidadOperativaDeReserva({
      ...reserva(),
      gastos: [
        { concepto: 'Limpieza externa', importe: 45, categoria: 'limpieza' },
        { concepto: 'Avería termostato', importe: 80, categoria: 'mantenimiento' },
      ],
    });

    // Nivel 1: bruto de las líneas (600 + 60), la comisión no lo toca.
    expect(r.bruto).toBe(660);
    // Nivel 2: neto de finance.ts (660 - 99 de comisión OTA).
    expect(r.neto).toBe(561);
    // Nivel 3: neto - costes operativos del ERP (45 + 80).
    expect(r.costesOperativos).toBe(125);
    expect(r.rentabilidadOperativaReal).toBe(436);
    // Margen sobre lo que la reserva genera (bruto): 436 / 660.
    expect(r.margenPct).toBe(66.06);
    expect(r.categorias.map((c) => c.categoria)).toEqual(['mantenimiento', 'limpieza']);
  });

  it('reutiliza el neto de finance.ts: sin gastos el nivel 3 es el neto', () => {
    const r = rentabilidadOperativaDeReserva(reserva());
    expect(r.rentabilidadOperativaReal).toBe(r.neto);
    expect(r.costesOperativos).toBe(0);
  });

  it('la penalización por no-show suma dinero sin ser ingreso de alojamiento', () => {
    const r = rentabilidadOperativaDeReserva({
      ...reserva({
        estado: 'no_show',
        comisionOta: 0,
        lineas: [{ tipo: 'penalizacion', concepto: 'No-show', cantidad: 1, importeUnitario: 150, importeTotal: 150 }],
      }),
      gastos: [{ concepto: 'Limpieza', importe: 20, categoria: 'limpieza' }],
    });
    expect(r.bruto).toBe(0);
    expect(r.penalizacion).toBe(150);
    expect(r.neto).toBe(150);
    expect(r.rentabilidadOperativaReal).toBe(130);
  });

  it('delega la divisa en finance.ts en vez de inventarla', () => {
    // El contrato es que NO hay una segunda fuente de divisa: lo que responde
    // este módulo es exactamente lo que responde el cálculo de la reserva.
    for (const moneda of ['MXN', 'EUR', '']) {
      const base = reserva({ moneda });
      expect(rentabilidadOperativaDeReserva(base).moneda).toBe(
        calcularRentabilidad({ lineas: base.lineas, moneda }).moneda
      );
    }
  });
});

describe('categoriaDeGasto — vocabulario del propietario', () => {
  it('mapea las categorías del ERP a las categorías de coste del informe', () => {
    expect(categoriaDeGasto('limpieza')).toBe('limpieza');
    expect(categoriaDeGasto('Lavandería')).toBe('limpieza');
    expect(categoriaDeGasto('mantenimiento')).toBe('mantenimiento');
    expect(categoriaDeGasto('Reparaciones')).toBe('mantenimiento');
    expect(categoriaDeGasto('suministros')).toBe('suministros');
    expect(categoriaDeGasto('Supermercado')).toBe('consumibles');
    expect(categoriaDeGasto('comision')).toBe('comisiones');
  });

  it('lo desconocido no desaparece: cae en gestión y otros', () => {
    expect(categoriaDeGasto('marketing')).toBe('gestion');
    expect(categoriaDeGasto('categoria inventada')).toBe('gestion');
    expect(categoriaDeGasto(null)).toBe('gestion');
  });

  it('el catálogo tiene etiqueta para todas las categorías y ninguna repetida', () => {
    const claves = CATEGORIAS_COSTE.map((c) => c.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const clave of claves) {
      expect(etiquetaCategoriaCoste(clave)).not.toBe(clave);
    }
  });
});

describe('construirCartera — MI CARTERA', () => {
  const propiedades = [
    { id: 'p1', nombre: 'Apartamento Centro' },
    { id: 'p2', nombre: 'Apartamento Playa' },
    { id: 'p3', nombre: 'Apartamento Norte' },
  ];

  it('el ejemplo del plan: la tabla responde cuál deja más dinero y por qué', () => {
    const cartera = construirCartera({
      propiedades,
      monedaTenant: 'EUR',
      reservas: [
        // Centro: bruto 660, neto 561, costes 125 → 436 (66%).
        reserva({ propertyId: 'p1', gastos: [gasto('Limpieza externa', 45, 'limpieza'), gasto('Avería', 80, 'mantenimiento')] }),
        // Playa vende más (900) y su rentabilidad operativa también gana.
        reserva({
          id: 'r2',
          propertyId: 'p2',
          propertyNombre: 'Apartamento Playa',
          lineas: [{ tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 1, importeUnitario: 900, importeTotal: 900 }],
          comisionOta: 135,
          gastos: [gasto('Consumibles', 40, 'consumibles')],
        }),
        // Norte: bruto 480, neto 408, costes 60 → 348.
        reserva({
          id: 'r3',
          propertyId: 'p3',
          propertyNombre: 'Apartamento Norte',
          lineas: [{ tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 1, importeUnitario: 480, importeTotal: 480 }],
          comisionOta: 72,
          gastos: [gasto('Limpieza', 60, 'limpieza')],
        }),
      ],
    });

    expect(cartera.moneda).toBe('EUR');
    expect(cartera.propiedades.map((f) => f.propertyId)).toEqual(['p2', 'p1', 'p3']);

    const centro = cartera.propiedades.find((f) => f.propertyId === 'p1')!;
    expect(centro.ingresos).toBe(660);
    expect(centro.ingresosNetos).toBe(561);
    expect(centro.costesOperativos).toBe(125);
    expect(centro.gastos).toBe(224); // 99 de comisión + 125 de ERP
    expect(centro.rentabilidadOperativaReal).toBe(436);
    expect(centro.margenPct).toBe(66.06);
    // El desglose de la propiedad arranca por comisiones de canales (paso bruto → neto).
    expect(centro.categorias[0].categoria).toBe('comisiones');
    expect(centro.categorias[0].importe).toBe(99);

    const total = cartera.total;
    expect(total.propiedades).toBe(3);
    expect(total.ingresos).toBe(660 + 900 + 480);
    expect(total.ingresosNetos).toBe(561 + 765 + 408);
    expect(total.gastos).toBe(224 + 175 + 132);
    expect(total.rentabilidadOperativaReal).toBe(436 + 725 + 348);
    expect(total.costeMedioReserva).toBe(75); // (125 + 40 + 60) / 3 reservas
  });

  it('el gasto de la fila cuadra exacto con el desglose por categorías', () => {
    const cartera = construirCartera({
      propiedades: [propiedades[0]],
      monedaTenant: 'EUR',
      reservas: [
        reserva({
          gastos: [gasto('Limpieza', 30, 'limpieza'), gasto('Luz', 15, 'suministros'), gasto('Varios', 10, 'otro')],
        }),
      ],
    });
    const fila = cartera.propiedades[0];
    const sumaCategorias = fila.categorias.reduce((t, c) => t + c.importe, 0);
    expect(sumaCategorias).toBe(fila.gastos);
    // El desglose de la fila, ordenado por importe (comisiones = paso bruto → neto).
    expect(fila.categorias.map((c) => c.categoria)).toEqual([
      'comisiones',
      'limpieza',
      'suministros',
      'gestion',
    ]);
    // Todas las categorías del informe están presentes (a importe 0 si no hay).
    expect(cartera.desgloseCostes).toHaveLength(CATEGORIAS_COSTE.length);
  });

  it('cancelada y no-show no suman; el no-show con penalización sí', () => {
    const cartera = construirCartera({
      propiedades: [propiedades[0]],
      monedaTenant: 'EUR',
      reservas: [
        reserva({ id: 'rc', estado: 'cancelled' }),
        reserva({ id: 'rn', estado: 'no_show', lineas: [] }),
        reserva({ id: 'rp', estado: 'no_show', comisionOta: 0, lineas: [{ tipo: 'penalizacion', concepto: 'No-show', cantidad: 1, importeUnitario: 150, importeTotal: 150 }] }),
      ],
    });
    const fila = cartera.propiedades[0];
    expect(fila.reservas).toBe(0); // ninguna de las tres es venta
    expect(fila.ingresos).toBe(150); // solo la penalización emitida
    expect(fila.rentabilidadOperativaReal).toBe(150);
  });

  it('toda propiedad del tenant entra, incluso sin reservas (con ceros honestos)', () => {
    const cartera = construirCartera({
      propiedades,
      monedaTenant: 'EUR',
      reservas: [reserva({ propertyId: 'p1' })],
    });
    expect(cartera.propiedades).toHaveLength(3);
    const vacia = cartera.propiedades.find((f) => f.propertyId === 'p3')!;
    expect(vacia.nombre).toBe('Apartamento Norte');
    expect(vacia.ingresos).toBe(0);
    expect(vacia.margenPct).toBe(0);
  });

  it('las reservas en otra divisa quedan fuera de los totales y se avisa', () => {
    const cartera = construirCartera({
      propiedades: [propiedades[0]],
      monedaTenant: 'EUR',
      reservas: [reserva(), reserva({ id: 'r_mxn', moneda: 'MXN' })],
    });
    const fila = cartera.propiedades[0];
    expect(fila.ingresos).toBe(660); // solo la EUR
    expect(fila.otrasMonedas).toEqual(['MXN']);
    expect(cartera.multimoneda.mixto).toBe(true);
    expect(cartera.multimoneda.nota).toContain('no se convierten');
  });

  it('sin datos cae a la moneda del tenant, no a un valor por defecto del esquema', () => {
    const cartera = construirCartera({ propiedades, monedaTenant: 'EUR', reservas: [] });
    expect(cartera.moneda).toBe('EUR');
    expect(cartera.total.reservas).toBe(0);
  });

  it('el CSV de cartera exporta los tres niveles y el margen', () => {
    const cartera = construirCartera({
      propiedades: [propiedades[0]],
      monedaTenant: 'EUR',
      reservas: [reserva({ gastos: [gasto('Limpieza', 45, 'limpieza')] })],
    });
    const filas = filasCsvCartera(cartera);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      propiedad: 'Apartamento Centro',
      ingresos_brutos: 660,
      ingresos_netos: 561,
      gastos: 144,
      rentabilidad_operativa_real: 516,
      margen_pct: 78.18,
    });
  });
});

/** Gasto ERP atribuido, tal como lo lee la API. */
function gasto(concepto: string, importe: number, categoria: string): GastoOperativoAtribuido {
  return { concepto, importe, categoria };
}

// ─── Guardia de nomenclatura: el tercer nivel NO es un «ingreso real» ───────

describe('guardia de nomenclatura del informe', () => {
  const fuentes = [
    'lib/hospitality/rentabilidad.ts',
    'app/api/hospitality/rentabilidad/route.ts',
    'app/dashboard/hospitality/rentabilidad/page.tsx',
  ].map((relativo) => ({
    relativo,
    // La regla de nomenclatura es para lo que se pinta y se exporta. Los
    // comentarios que EXPLICAN la decisión (por qué no se usa la otra
    // expresión) quedan fuera: si no, prohibiríamos documentarla.
    contenido: fs
      .readFileSync(path.join(RAIZ, relativo), 'utf8')
      .split('\n')
      .filter((linea) => {
        const t = linea.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
      })
      .join('\n'),
  }));

  it('donde el propietario lee, el informe dice «Rentabilidad operativa real»', () => {
    for (const { relativo, contenido } of fuentes.filter((f) => !f.relativo.endsWith('route.ts'))) {
      expect(contenido, relativo).toContain('Rentabilidad operativa real');
    }
    // La nota terminológica que sirve la API se verifica conductualmente en
    // hospitality-rentabilidad-api.test.ts (data.notaTerminologica).
  });

  it('la expresión prohibida no aparece en lo que se pinta ni en lo que se sirve', () => {
    for (const { relativo, contenido } of fuentes) {
      expect(contenido.toLowerCase(), relativo).not.toContain('ingreso real');
      expect(contenido.toLowerCase(), relativo).not.toContain('ingresos reales');
    }
  });

  it('la página MI CARTERA pinta la tabla y el desglose del plan', () => {
    const pagina = fuentes.find((f) => f.relativo.endsWith('page.tsx'))!.contenido;
    expect(pagina).toContain('MI CARTERA');
    expect(pagina).toContain('¿Dónde se está yendo el dinero?');
    expect(pagina).toContain('Rentabilidad operativa real');
    expect(pagina).toContain('/api/hospitality/rentabilidad');
  });

  it('la API no escribe nada: es un informe de lectura', () => {
    const api = fuentes.find((f) => f.relativo.endsWith('route.ts'))!.contenido;
    expect(api).not.toMatch(/\.create\(/);
    expect(api).not.toMatch(/\.update\(/);
    expect(api).not.toMatch(/\.delete\(/);
  });
});
