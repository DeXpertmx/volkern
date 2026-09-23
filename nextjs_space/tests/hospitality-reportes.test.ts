import { describe, it, expect } from 'vitest';
import {
  csvCanales,
  csvPropiedades,
  esCanalDirecto,
  nochesDelRango,
  reporteFinanciero,
  reporteOperacion,
  reportePropiedades,
  reporteVentas,
  type ReporteReserva,
} from '../lib/hospitality/reportes';

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
  checkOut: new Date('2026-10-15T11:00:00'),
  propertyId: 'p1',
  propertyNombre: 'Centro',
  unitId: 'u1',
  huesped: 'María',
  moneda: 'EUR',
  lineas: [linea('alojamiento', 'Alojamiento', 5, 120)],
  pagos: [],
  comisionOta: 0,
  otrosGastos: 0,
  ...over,
});

const unidades = [
  { id: 'u1', propertyId: 'p1' },
  { id: 'u2', propertyId: 'p1' },
];

const rango = { desde: new Date('2026-10-10T00:00:00'), hasta: new Date('2026-10-13T00:00:00') };

describe('nochesDelRango', () => {
  it('la noche del día final no cuenta (§8)', () => {
    expect(nochesDelRango(new Date('2026-10-10'), new Date('2026-10-13'))).toBe(3);
  });
});

describe('reporteOperacion', () => {
  it('calcula noches disponibles, ocupación, ADR y RevPAR con la ventana exacta', () => {
    // 2 unidades × 3 noches = 6 noches disponibles.
    // Una reserva de 2 noches (10 y 11; la del 12 no la ocupa porque sale el 12).
    const operacion = reporteOperacion({
      reservas: [
        reserva({
          checkIn: new Date('2026-10-10T15:00:00'),
          checkOut: new Date('2026-10-12T11:00:00'),
          lineas: [linea('alojamiento', 'Alojamiento', 2, 120)],
        }),
      ],
      unidades,
      ...rango,
    });

    expect(operacion.nochesDisponibles).toBe(6);
    expect(operacion.nochesOcupadas).toBe(2);
    expect(operacion.ocupacion).toBe(0.3333);
    expect(operacion.ingresos).toBe(240);
    expect(operacion.adr).toBe(120);
    expect(operacion.revpar).toBe(40);
    expect(operacion.estanciaMedia).toBe(2);
    expect(operacion.diario).toHaveLength(3);
    expect(operacion.diario.map((d) => d.ocupadas)).toEqual([1, 1, 0]);
  });

  it('no devuelve ADR ni RevPAR cuando no hay base para calcularlos', () => {
    const operacion = reporteOperacion({ reservas: [], unidades: [], ...rango });
    expect(operacion.adr).toBeNull();
    expect(operacion.revpar).toBeNull();
    expect(operacion.ocupacion).toBe(0);
  });

  it('la reserva cancelada no aporta ocupación ni ingresos, pero cuenta como cancelación', () => {
    const operacion = reporteOperacion({
      reservas: [reserva({ estado: 'cancelled' }), reserva({ id: 'r2', estado: 'no_show' })],
      unidades,
      ...rango,
    });
    expect(operacion.nochesOcupadas).toBe(0);
    expect(operacion.ingresos).toBe(0);
    expect(operacion.cancelaciones).toBe(1);
    expect(operacion.noShows).toBe(1);
    expect(operacion.reservasConVenta).toBe(0);
  });

  it('cuenta llegadas y salidas dentro del rango', () => {
    const operacion = reporteOperacion({
      reservas: [
        reserva({ id: 'llega', checkIn: new Date('2026-10-11T15:00:00') }),
        reserva({ id: 'sale', checkIn: new Date('2026-10-01T15:00:00'), checkOut: new Date('2026-10-11T11:00:00') }),
        reserva({ id: 'fuera', checkIn: new Date('2026-11-01T15:00:00'), checkOut: new Date('2026-11-03T11:00:00') }),
      ],
      unidades,
      ...rango,
    });
    expect(operacion.llegadas).toBe(1);
    expect(operacion.salidas).toBe(1);
  });

  it('solo cuenta el inventario de unidades activas si se indica', () => {
    const operacion = reporteOperacion({
      reservas: [],
      unidades,
      ...rango,
      unidadesActivas: ['u1'],
    });
    expect(operacion.nochesDisponibles).toBe(3);
    expect(operacion.unidades).toBe(1);
  });
});

describe('esCanalDirecto', () => {
  it('reconoce la reserva propia y no la de una OTA', () => {
    expect(esCanalDirecto('Directa')).toBe(true);
    expect(esCanalDirecto('Volkern')).toBe(true);
    expect(esCanalDirecto('Landing web')).toBe(true);
    expect(esCanalDirecto('Booking.com')).toBe(false);
    expect(esCanalDirecto('Airbnb')).toBe(false);
  });
});

describe('reporteVentas', () => {
  it('reparte reservas e ingresos por canal y mide el peso de la directa', () => {
    const ventas = reporteVentas({
      reservas: [
        reserva({ id: 'r1', channel: 'Airbnb', lineas: [linea('alojamiento', 'A', 2, 100)] }),
        reserva({ id: 'r2', channel: 'Booking.com', lineas: [linea('alojamiento', 'A', 2, 150)] }),
        reserva({ id: 'r3', channel: 'Directa', lineas: [linea('alojamiento', 'A', 2, 50)] }),
      ],
    });

    expect(ventas.canales).toHaveLength(3);
    expect(ventas.canales[0].canal).toBe('Booking.com');
    expect(ventas.canales[0].ingresos).toBe(300);
    expect(ventas.canales[0].pctReservas).toBe(33.33);
    expect(ventas.canales[0].pctIngresos).toBe(50);

    expect(ventas.directas.reservas).toBe(1);
    expect(ventas.directas.ingresos).toBe(100);
    expect(ventas.directas.pctIngresos).toBe(16.67);
  });

  it('calcula la antelación media entre la reserva y la llegada', () => {
    const ventas = reporteVentas({
      reservas: [
        reserva({ id: 'r1', bookedOn: new Date('2026-10-01'), checkIn: new Date('2026-10-11') }),
        reserva({ id: 'r2', bookedOn: new Date('2026-10-05'), checkIn: new Date('2026-10-11') }),
      ],
    });
    expect(ventas.antelacionMedia).toBe(8);
    expect(ventas.masAnticipada).toBe(10);
    expect(ventas.masTardia).toBe(6);
  });

  it('deja la antelación en nulo si ninguna reserva la trae, en vez de inventar un cero', () => {
    const ventas = reporteVentas({ reservas: [reserva()] });
    expect(ventas.antelacionMedia).toBeNull();
  });

  it('excluye las canceladas del mix de canales', () => {
    const ventas = reporteVentas({
      reservas: [
        reserva({ id: 'r1', channel: 'Airbnb' }),
        reserva({ id: 'r2', channel: 'Booking.com', estado: 'cancelled' }),
      ],
    });
    expect(ventas.canales.map((c) => c.canal)).toEqual(['Airbnb']);
    expect(ventas.canales[0].pctReservas).toBe(100);
  });
});

describe('reportePropiedades', () => {
  it('responde qué propiedad deja más dinero, no solo cuál vende más', () => {
    const propiedades = reportePropiedades({
      propiedades: [
        { id: 'p1', nombre: 'Centro' },
        { id: 'p2', nombre: 'Playa' },
      ],
      unidades: [
        { id: 'u1', propertyId: 'p1' },
        { id: 'u2', propertyId: 'p1' },
        { id: 'u3', propertyId: 'p2' },
      ],
      reservas: [
        reserva({ id: 'r1', propertyId: 'p1', lineas: [linea('alojamiento', 'A', 2, 100)], comisionOta: 0 }),
        reserva({ id: 'r2', propertyId: 'p2', lineas: [linea('alojamiento', 'A', 2, 120)], comisionOta: 200 }),
      ],
      ...rango,
    });

    expect(propiedades[0].nombre).toBe('Centro');
    expect(propiedades[0].ingresos).toBe(200);
    expect(propiedades[0].neto).toBe(200);
    expect(propiedades[0].unidades).toBe(2);
    expect(propiedades[0].nochesDisponibles).toBe(6);
    // La reserva cubre las 3 noches del rango sobre 2 unidades: 3 de 6.
    expect(propiedades[0].nochesOcupadas).toBe(3);
    expect(propiedades[0].ocupacion).toBe(0.5);

    expect(propiedades[1].nombre).toBe('Playa');
    expect(propiedades[1].ingresos).toBe(240);
    // Playa vende más pero las comisiones la dejan peor: el informe debe verlo.
    expect(propiedades[1].neto).toBe(40);
  });

  it('incluye las propiedades sin datos en lugar de esconderlas', () => {
    const propiedades = reportePropiedades({
      propiedades: [{ id: 'p1', nombre: 'Centro' }, { id: 'p3', nombre: 'Vacía' }],
      unidades: [{ id: 'u1', propertyId: 'p1' }],
      reservas: [reserva()],
      ...rango,
    });
    const vacia = propiedades.find((p) => p.nombre === 'Vacía');
    expect(vacia).toBeDefined();
    expect(vacia!.ingresos).toBe(0);
    expect(vacia!.adr).toBeNull();
  });
});

describe('reporteFinanciero', () => {
  it('devuelve totales, desglose por canal y las filas del período', () => {
    const financiero = reporteFinanciero({
      reservas: [
        reserva({ id: 'r1', pagos: [{ importe: 600, estado: 'pagado' }] }),
        reserva({ id: 'r2', channel: 'Booking.com', estado: 'cancelled' }),
      ],
    });
    expect(financiero.totales.bruto).toBe(600);
    expect(financiero.totales.cobrado).toBe(600);
    expect(financiero.totales.reservasConVenta).toBe(1);
    expect(financiero.porCanal).toHaveLength(1);
    expect(financiero.filas).toHaveLength(2);
  });
});

describe('exportaciones CSV', () => {
  it('exporta el reporte por propiedad con la ocupación en porcentaje', () => {
    const csv = csvPropiedades(
      reportePropiedades({
        propiedades: [{ id: 'p1', nombre: 'Centro' }],
        unidades: [{ id: 'u1', propertyId: 'p1' }],
        reservas: [
          reserva({
            checkIn: new Date('2026-10-10T15:00:00'),
            checkOut: new Date('2026-10-12T11:00:00'),
            lineas: [linea('alojamiento', 'A', 2, 100)],
          }),
        ],
        ...rango,
      })
    );
    const [cabecera, fila] = csv.split('\n');
    expect(cabecera).toContain('ocupacion_pct');
    expect(fila).toContain('Centro');
    expect(fila).toContain('66.67'); // 2 noches de 3 disponibles
  });

  it('exporta el mix de canales marcando cuál es directo', () => {
    const csv = csvCanales(
      reporteVentas({ reservas: [reserva({ channel: 'Directa', lineas: [linea('alojamiento', 'A', 2, 100)] })] })
        .canales
    );
    const [cabecera, fila] = csv.split('\n');
    expect(cabecera).toContain('directo');
    expect(fila).toContain('Directa');
    expect(fila).toContain('sí');
  });
});
