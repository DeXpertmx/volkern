import { describe, it, expect } from 'vitest';
import {
  csvFinanciero,
  desglosePorCanal,
  desglosePorPropiedad,
  esReservaConVenta,
  filasFinancieras,
  lineaParaGuardar,
  resumenFinanciero,
  conteoPorEstadoCobro,
  type ReservaFinanciera,
} from '../lib/hospitality/finance-summary';

const linea = (tipo: string, concepto: string, cantidad: number, unitario: number) => ({
  tipo,
  concepto,
  cantidad,
  importeUnitario: unitario,
  importeTotal: cantidad * unitario,
});

const reserva = (over: Partial<ReservaFinanciera> = {}): ReservaFinanciera => ({
  id: 'r1',
  channel: 'Airbnb',
  estado: 'confirmed',
  checkIn: '2026-10-10',
  checkOut: '2026-10-15',
  propertyId: 'p1',
  propertyNombre: 'Apartamento Centro',
  unitId: 'u1',
  unidadNombre: 'APT 1',
  huesped: 'María García',
  moneda: 'EUR',
  lineas: [linea('alojamiento', 'Alojamiento', 5, 120), linea('limpieza', 'Limpieza', 1, 60)],
  pagos: [],
  comisionOta: 105,
  comisionPasarela: 20,
  otrosGastos: 25,
  ...over,
});

describe('esReservaConVenta', () => {
  it('una reserva cancelada no es venta, y un no_show tampoco', () => {
    expect(esReservaConVenta('confirmed')).toBe(true);
    expect(esReservaConVenta('checked_out')).toBe(true);
    expect(esReservaConVenta('cancelled')).toBe(false);
    expect(esReservaConVenta('no_show')).toBe(false);
  });
});

describe('filasFinancieras', () => {
  it('calcula bruto desde las líneas y neto con las comisiones y gastos', () => {
    const [fila] = filasFinancieras([reserva()]);
    expect(fila.bruto).toBe(660);
    // `penalizacion` es la línea del cargo por no-show: no es ingreso de
    // alojamiento, así que viaja aparte del desglose (ver `finance.ts`).
    expect(fila.desglose).toEqual({
      alojamiento: 600,
      limpieza: 60,
      extra: 0,
      descuento: 0,
      otro: 0,
      penalizacion: 0,
    });
    expect(fila.neto).toBe(510);
    expect(fila.margenPct).toBe(77.27);
    expect(fila.noches).toBe(5);
  });

  it('deriva el estado de cobro de los pagos, no de un campo guardado', () => {
    const sinPagos = filasFinancieras([reserva()])[0];
    expect(sinPagos.estadoCobro).toBe('pendiente');
    expect(sinPagos.pendiente).toBe(660);

    const parcial = filasFinancieras([
      reserva({ pagos: [{ importe: 300, estado: 'pagado', metodo: 'stripe' }] }),
    ])[0];
    expect(parcial.estadoCobro).toBe('parcial');
    expect(parcial.cobrado).toBe(300);
    expect(parcial.pendiente).toBe(360);

    const pagada = filasFinancieras([
      reserva({ pagos: [{ importe: 660, estado: 'pagado', metodo: 'stripe' }] }),
    ])[0];
    expect(pagada.estadoCobro).toBe('pagado');
    expect(pagada.pendiente).toBe(0);
  });

  it('informa el reembolso aunque el cobrado neto quede en cero', () => {
    // Caso que ocultaba el dato: se cobra y se devuelve el mismo importe.
    const fila = filasFinancieras([
      reserva({
        pagos: [
          { importe: 660, estado: 'pagado', metodo: 'stripe' },
          { importe: 660, estado: 'reembolsado', metodo: 'stripe' },
        ],
      }),
    ])[0];
    expect(fila.cobrado).toBe(0);
    expect(fila.reembolsado).toBe(660);
  });
});

describe('resumenFinanciero', () => {
  it('suma solo las reservas con venta y deja fuera bruto y neto de la cancelada', () => {
    const filas = filasFinancieras([
      reserva(),
      reserva({
        id: 'r2',
        channel: 'Booking.com',
        estado: 'cancelled',
        lineas: [linea('alojamiento', 'Alojamiento', 2, 200)],
        comisionOta: 70,
        otrosGastos: 0,
        pagos: [{ importe: 400, estado: 'reembolsado', metodo: 'stripe' }],
      }),
    ]);

    const totales = resumenFinanciero(filas);
    expect(totales.bruto).toBe(660); // la cancelada no aporta
    expect(totales.neto).toBe(510);
    expect(totales.reservas).toBe(2);
    expect(totales.reservasConVenta).toBe(1);
    expect(totales.comisiones).toBe(125);
    expect(totales.ticketMedio).toBe(660);
    // El dinero devuelto sí aparece: salió de la cuenta de verdad.
    expect(totales.reembolsado).toBe(400);
  });

  it('acumula los descuentos aparte de «otro», en negativo', () => {
    const filas = filasFinancieras([
      reserva({
        lineas: [
          linea('alojamiento', 'Alojamiento', 5, 120),
          linea('descuento', 'Descuento VERANO2027', 1, -60),
          linea('otro', 'No previsto', 1, 10),
        ],
      }),
      reserva({
        id: 'r2',
        lineas: [
          linea('alojamiento', 'Alojamiento', 2, 100),
          linea('descuento', 'Descuento BIENVENIDA', 1, -15),
        ],
      }),
    ]);

    const totales = resumenFinanciero(filas);
    expect(totales.desglose.descuento).toBe(-75);
    expect(totales.desglose.otro).toBe(10);
    // El bruto ya viene con la rebaja restada: 600 + 10 - 60 + 200 - 15.
    expect(totales.bruto).toBe(735);
  });

  it('no inventa margen cuando no hay ingreso bruto', () => {
    const totales = resumenFinanciero(filasFinancieras([]));
    expect(totales.bruto).toBe(0);
    expect(totales.margenPct).toBe(0);
    expect(totales.ticketMedio).toBe(0);
  });

  it('acumula el desglose por tipo de línea', () => {
    const filas = filasFinancieras([
      reserva({ lineas: [linea('alojamiento', 'Alojamiento', 5, 120), linea('extra', 'Parking', 3, 10)] }),
      reserva({
        id: 'r2',
        lineas: [linea('alojamiento', 'Alojamiento', 2, 100), linea('limpieza', 'Limpieza', 1, 50)],
      }),
    ]);
    const totales = resumenFinanciero(filas);
    expect(totales.desglose).toEqual({
      alojamiento: 800,
      limpieza: 50,
      extra: 30,
      descuento: 0,
      otro: 0,
      penalizacion: 0,
    });
    expect(totales.bruto).toBe(880);
  });
});

describe('desgloses', () => {
  it('agrupa por canal ordenando por bruto descendente', () => {
    const filas = filasFinancieras([
      reserva({ id: 'r1', channel: 'Airbnb', lineas: [linea('alojamiento', 'A', 1, 300)] }),
      reserva({ id: 'r2', channel: 'Booking.com', lineas: [linea('alojamiento', 'A', 1, 900)] }),
      reserva({ id: 'r3', channel: 'Booking.com', lineas: [linea('alojamiento', 'A', 1, 200)] }),
    ]);
    const canales = desglosePorCanal(filas);
    expect(canales.map((c) => c.etiqueta)).toEqual(['Booking.com', 'Airbnb']);
    expect(canales[0].totales.bruto).toBe(1100);
    expect(canales[0].totales.reservasConVenta).toBe(2);
  });

  it('agrupa por propiedad usando el nombre, no el identificador', () => {
    const filas = filasFinancieras([
      reserva({ id: 'r1', propertyId: 'p1', propertyNombre: 'Centro', lineas: [linea('alojamiento', 'A', 1, 500)] }),
      reserva({ id: 'r2', propertyId: 'p2', propertyNombre: 'Playa', lineas: [linea('alojamiento', 'A', 1, 100)] }),
    ]);
    const propiedades = desglosePorPropiedad(filas);
    expect(propiedades.map((p) => p.etiqueta)).toEqual(['Centro', 'Playa']);
    expect(propiedades[0].totales.bruto).toBe(500);
  });

  it('cuenta los estados de cobro de las reservas con venta', () => {
    const filas = filasFinancieras([
      reserva({ id: 'r1', pagos: [{ importe: 660, estado: 'pagado' }] }),
      reserva({ id: 'r2', pagos: [{ importe: 100, estado: 'pagado' }] }),
      reserva({ id: 'r3' }),
      reserva({ id: 'r4', estado: 'cancelled' }),
    ]);
    expect(conteoPorEstadoCobro(filas)).toEqual({
      pendiente: 1,
      parcial: 1,
      pagado: 1,
      sobrepagado: 0,
      reembolsado: 0,
    });
  });
});

describe('lineaParaGuardar', () => {
  it('el total es siempre cantidad por importe unitario', () => {
    const guardada = lineaParaGuardar({ tipo: 'extra', concepto: '  Parking  ', cantidad: 3, importeUnitario: 12.5 });
    expect(guardada).toEqual({
      tipo: 'extra',
      concepto: 'Parking',
      cantidad: 3,
      importeUnitario: 12.5,
      importeTotal: 37.5,
    });
  });

  it('una línea sin concepto no queda vacía y sin cantidad vale 1', () => {
    const guardada = lineaParaGuardar({ importeUnitario: 20 });
    expect(guardada.concepto).toBe('Concepto');
    expect(guardada.tipo).toBe('otro');
    expect(guardada.cantidad).toBe(1);
    expect(guardada.importeTotal).toBe(20);
  });
});

describe('csvFinanciero', () => {
  it('exporta una fila por reserva con el desglose y el estado de cobro', () => {
    const csv = csvFinanciero(
      filasFinancieras([reserva({ pagos: [{ importe: 660, estado: 'pagado' }] })])
    );
    const [cabecera, fila] = csv.split('\n');
    expect(cabecera).toContain('ingreso_bruto');
    expect(cabecera).toContain('estado_cobro');
    // Las rebajas tienen su propia columna: no se mezclan con «importe_otros».
    expect(cabecera).toContain('importe_descuento');
    expect(fila).toContain('Airbnb');
    expect(fila).toContain('660');
    expect(fila).toContain('pagado');
  });

  it('escapa los valores que llevan separador o comillas', () => {
    const csv = csvFinanciero(
      filasFinancieras([reserva({ huesped: 'Pérez, José "El Zurdo"' })])
    );
    expect(csv).toContain('"Pérez, José ""El Zurdo"""');
  });
});
