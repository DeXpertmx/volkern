// @vitest-environment node
/**
 * Rendimiento de los códigos promocionales: comparativa entre códigos.
 *
 * Reglas que se protegen:
 * 1. El código se atribuye por DATO (payload de la reserva) y, si no está, por
 *    el concepto de la línea de descuento. Lo que no se puede leer no se reparte.
 * 2. «Otorgado» cuenta todas las reservas y «aprovechado» solo las que son venta
 *    (cancelada y no-show no son ingreso), igual que Finanzas.
 * 3. El neto sale de `calcularRentabilidad`: no hay una segunda fórmula.
 * 4. Un código del catálogo sin usar aparece en la comparativa con ceros.
 * 5. La ventana por defecto son los últimos 12 meses, sobre la fecha de entrada.
 * 6. La conversión sale de las consultas registradas, no de las reservas: una
 *    consulta sin reserva baja la conversión en vez de desaparecer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityPromoCode: { findMany: vi.fn() },
  hospitalityPromoConsulta: { findMany: vi.fn() },
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityPromoCode: mocks.hospitalityPromoCode,
    hospitalityPromoConsulta: mocks.hospitalityPromoConsulta,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));

import { GET } from '@/app/api/hospitality/promos/rendimiento/route';
import {
  codigoDeConcepto,
  codigoDeReserva,
  descuentoDeLineas,
  diaLocal,
  rendimientoPromociones,
  resolverVentanaPromos,
  type ReservaConPromocion,
} from '@/lib/hospitality/promos-rendimiento';
import { normalizarLinea } from '@/lib/hospitality/finance';
import {
  normalizarSesion,
  porcentajeConversion,
  resumirConsultas,
  type ConsultaPromocion,
} from '@/lib/hospitality/promos-consultas';

const auth = {
  valid: true,
  tenant: { id: 'tenant_a' },
  user: { id: 'user_a', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
};

const request = (url = 'http://test.local/api/hospitality/promos/rendimiento') =>
  new Request(url, { method: 'GET' });

function linea(tipo: string, importeUnitario: number, concepto = '', cantidad = 1) {
  return normalizarLinea({ tipo, concepto: concepto || tipo, cantidad, importeUnitario });
}

/** Reserva con descuento: alojamiento a tarifa plena de 100 la noche. */
function reserva(over: Partial<ReservaConPromocion> = {}): ReservaConPromocion {
  const noches = over.noches ?? 2;
  return {
    id: 'res_a',
    estado: 'confirmed',
    checkIn: new Date('2026-07-10T15:00:00'),
    noches,
    moneda: 'EUR',
    comisionOta: 0,
    codigo: null,
    lineas: [
      linea('alojamiento', 100, 'Alojamiento', noches),
      linea('descuento', -20, 'Descuento VERANO2027'),
    ],
    pagos: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
  mocks.hospitalityPromoCode.findMany.mockResolvedValue([]);
  mocks.hospitalityPromoConsulta.findMany.mockResolvedValue([]);
});

describe('atribución del código', () => {
  it('lee el código del concepto de la línea de descuento', () => {
    expect(codigoDeConcepto('Descuento VERANO2027')).toBe('VERANO2027');
    expect(codigoDeConcepto('descuento verano 2027')).toBe('VERANO2027');
    expect(codigoDeConcepto('Alojamiento 4 noches')).toBeNull();
  });

  it('el payload de la reserva manda sobre el concepto', () => {
    const conPayload = reserva({ codigo: 'BIENVENIDA' });
    expect(codigoDeReserva(conPayload)).toBe('BIENVENIDA');
  });

  it('sin payload se usa el concepto (datos viejos o cargados a mano)', () => {
    expect(codigoDeReserva(reserva({ codigo: null }))).toBe('VERANO2027');
  });

  it('una línea de descuento sin código legible no se atribuye a nadie', () => {
    const sinCodigo = reserva({
      codigo: null,
      lineas: [linea('alojamiento', 100, 'Alojamiento', 2), linea('descuento', -20, 'Ajuste manual')],
    });
    expect(codigoDeReserva(sinCodigo)).toBeNull();
    expect(rendimientoPromociones([sinCodigo]).sinCodigo).toBe(1);
  });

  it('el descuento de las líneas se lee en positivo', () => {
    expect(descuentoDeLineas(reserva().lineas)).toBe(20);
  });
});

describe('comparativa entre códigos', () => {
  it('mide reservas, descuento y neto de cada código', () => {
    const informe = rendimientoPromociones([
      reserva({ id: 'r1', codigo: 'VERANO2027', comisionOta: 40 }),
      reserva({ id: 'r2', codigo: 'VERANO2027' }),
      reserva({
        id: 'r3',
        codigo: 'BIENVENIDA',
        lineas: [linea('alojamiento', 100, 'Alojamiento', 1), linea('descuento', -10, 'Descuento BIENVENIDA')],
        noches: 1,
      }),
    ]);

    const verano = informe.filas.find((f) => f.codigo === 'VERANO2027')!;
    // Dos estancias de 2 noches a 100: alojamiento a tarifa plena 400, descuento
    // 40 → bruto 360; con la comisión de 40 el neto es 320.
    expect(verano.reservas).toBe(2);
    expect(verano.noches).toBe(4);
    expect(verano.descuentoOtorgado).toBe(40);
    expect(verano.alojamientoSinDescuento).toBe(400);
    expect(verano.bruto).toBe(360);
    expect(verano.neto).toBe(320);
    expect(verano.ticketMedio).toBe(180);
    // El código rebajó el 10 % del alojamiento y trajo 8 por cada unidad dejada.
    expect(verano.descuentoPct).toBe(10);
    expect(verano.netoPorDescontado).toBe(8);

    const bienvenida = informe.filas.find((f) => f.codigo === 'BIENVENIDA')!;
    expect(bienvenida.reservas).toBe(1);
    expect(bienvenida.descuentoOtorgado).toBe(10);
    expect(bienvenida.neto).toBe(90);
  });

  it('se ordena por lo que se dejó cada código', () => {
    const informe = rendimientoPromociones([
      reserva({ id: 'r1', codigo: 'PEQUENO', lineas: [linea('alojamiento', 100, 'Alojamiento', 1), linea('descuento', -5, 'Descuento PEQUENO')] }),
      reserva({ id: 'r2', codigo: 'GRANDE', lineas: [linea('alojamiento', 100, 'Alojamiento', 1), linea('descuento', -50, 'Descuento GRANDE')] }),
    ]);
    expect(informe.filas.map((f) => f.codigo)).toEqual(['GRANDE', 'PEQUENO']);
  });

  it('una reserva cancelada concede descuento pero no trae ingreso', () => {
    const informe = rendimientoPromociones([
      reserva({ id: 'r1', codigo: 'VERANO2027' }),
      reserva({ id: 'r2', estado: 'cancelled', codigo: 'VERANO2027' }),
      reserva({ id: 'r3', estado: 'no_show', codigo: 'VERANO2027' }),
    ]);

    const fila = informe.filas[0];
    expect(fila.reservas).toBe(1);
    expect(fila.reservasSinVenta).toBe(2);
    expect(fila.descuentoOtorgado).toBe(60);
    expect(fila.descuentoAprovechado).toBe(20);
    expect(fila.bruto).toBe(180);
    expect(fila.alojamientoSinDescuento).toBe(200);
    expect(informe.totales.reservas).toBe(1);
  });

  it('los códigos del catálogo sin usar salen con ceros y su contador', () => {
    const informe = rendimientoPromociones(
      [reserva({ codigo: 'VERANO2027' })],
      [
        { codigo: 'nunca usado', usos: 0, activo: true, maxUsos: 100 },
        { codigo: 'VERANO2027', usos: 5, activo: true, maxUsos: null },
      ]
    );

    const sinUsar = informe.filas.find((f) => f.codigo === 'NUNCAUSADO')!;
    expect(sinUsar.reservas).toBe(0);
    expect(sinUsar.descuentoOtorgado).toBe(0);
    expect(sinUsar.neto).toBe(0);
    expect(sinUsar.netoPorDescontado).toBe(0);
    expect(sinUsar.descuentoPct).toBe(0);
    expect(sinUsar.maxUsos).toBe(100);

    // El contador dice 5 usos y solo hay 1 reserva medida: el hueco se declara
    // en vez de darlo por bueno (puede ser de otro periodo).
    const verano = informe.filas.find((f) => f.codigo === 'VERANO2027')!;
    expect(verano.usosDelContador).toBe(5);
    expect(verano.usosSinReservaMedida).toBe(4);
  });

  it('sin reservas devuelve los totales en cero, no NaN', () => {
    const informe = rendimientoPromociones([], [{ codigo: 'SOLO2027' }]);
    expect(informe.totales).toEqual({
      reservas: 0,
      descuentoOtorgado: 0,
      descuentoAprovechado: 0,
      bruto: 0,
      neto: 0,
      consultas: 0,
      consultasConvertidas: 0,
      intentosRechazados: 0,
      conversionPct: 0,
    });
    expect(informe.filas[0].netoPorDescontado).toBe(0);
    expect(informe.deCodigosDesconocidos).toEqual([]);
  });
});

describe('consultas y conversión', () => {
  const consulta = (over: Partial<ConsultaPromocion> = {}): ConsultaPromocion => ({
    codigo: 'VERANO2027',
    resultado: 'aplicada',
    reservationId: null,
    sesionId: 'sesion-0001',
    ...over,
  });

  it('la sesión se normaliza y lo que no puede ser una clave se descarta', () => {
    expect(normalizarSesion('  sesion-0001 ')).toBe('sesion-0001');
    expect(normalizarSesion('corta')).toBeNull();
    expect(normalizarSesion('con espacios y símbolos!')).toBeNull();
    expect(normalizarSesion(null)).toBeNull();
  });

  it('convierte consultas en porcentaje, con 0 cuando no hubo consultas', () => {
    expect(porcentajeConversion(1, 4)).toBe(25);
    expect(porcentajeConversion(0, 0)).toBe(0);
    expect(porcentajeConversion(1, 3)).toBe(33.33);
  });

  it('una consulta aplicada sin reserva baja la conversión del código', () => {
    const informe = rendimientoPromociones(
      [reserva({ id: 'r1', codigo: 'VERANO2027' })],
      [{ codigo: 'VERANO2027', usos: 1 }],
      [
        consulta({ reservationId: 'r1' }),
        consulta({ sesionId: 'sesion-0002' }),
        consulta({ sesionId: 'sesion-0003' }),
        consulta({ sesionId: 'sesion-0004' }),
      ]
    );

    const fila = informe.filas[0];
    expect(fila.consultas).toBe(4);
    expect(fila.consultasConvertidas).toBe(1);
    expect(fila.consultasSinReserva).toBe(3);
    expect(fila.conversionPct).toBe(25);
    // Las reservas miden ventas; las consultas, intentos.
    expect(fila.reservas).toBe(1);
    expect(informe.totales).toMatchObject({
      consultas: 4,
      consultasConvertidas: 1,
      conversionPct: 25,
    });
  });

  it('un código sin consultas registradas no presume de conversión: 0, no 100 %', () => {
    const informe = rendimientoPromociones([], [{ codigo: 'SINUSO' }], []);
    const fila = informe.filas.find((f) => f.codigo === 'SINUSO')!;
    expect(fila.consultas).toBe(0);
    expect(fila.conversionPct).toBe(0);
  });

  it('los rechazos no entran en el denominador y se cuentan aparte', () => {
    const informe = rendimientoPromociones(
      [],
      [{ codigo: 'VERANO2027' }],
      [
        consulta({ sesionId: 'sesion-0001' }),
        consulta({ sesionId: 'sesion-0002', resultado: 'min_noches' }),
        consulta({ sesionId: 'sesion-0003', resultado: 'fuera_de_fecha' }),
      ]
    );

    const fila = informe.filas[0];
    expect(fila.consultas).toBe(1);
    expect(fila.intentosRechazados).toBe(2);
    expect(fila.conversionPct).toBe(0);
    expect(informe.totales.intentosRechazados).toBe(2);
  });

  it('las erratas de códigos inexistentes se agrupan fuera de la tabla', () => {
    const informe = rendimientoPromociones(
      [],
      [{ codigo: 'VERANO2027' }],
      [
        consulta({ codigo: 'VERANO207', resultado: 'no_existe', sesionId: 's1-000001' }),
        consulta({ codigo: 'VERANO207', resultado: 'no_existe', sesionId: 's2-000002' }),
        consulta({ codigo: 'BIENVENIDA', resultado: 'no_existe', sesionId: 's3-000003' }),
      ]
    );

    // No crean fila: no son rendimiento de ningún código real.
    expect(informe.filas.map((f) => f.codigo)).toEqual(['VERANO2027']);
    expect(informe.deCodigosDesconocidos).toEqual([
      { codigo: 'VERANO207', intentos: 2 },
      { codigo: 'BIENVENIDA', intentos: 1 },
    ]);
  });

  it('un código borrado que sí se aplicó conserva su fila con el intento', () => {
    const informe = rendimientoPromociones([], [], [consulta({ codigo: 'BORRADO2026' })]);
    const fila = informe.filas.find((f) => f.codigo === 'BORRADO2026')!;
    expect(fila.consultas).toBe(1);
    expect(fila.reservas).toBe(0);
    expect(fila.conversionPct).toBe(0);
  });

  it('resumirConsultas no atribuye consultas sin código legible', () => {
    const resumen = resumirConsultas([consulta({ codigo: '   ' })], ['VERANO2027']);
    expect(resumen.aplicadas).toBe(0);
    expect(resumen.porCodigo.size).toBe(0);
  });
});

describe('ventana del informe', () => {
  it('por defecto son los últimos 12 meses, sin incluir el día de hoy entero', () => {
    const hoy = new Date('2026-10-19T10:00:00');
    const { desde, hasta } = resolverVentanaPromos({}, hoy);
    expect(diaLocal(desde)).toBe('2025-10-19');
    expect(diaLocal(hasta)).toBe('2026-10-20');
  });

  it('`hasta` es exclusivo: la estancia que entra el último día del rango cuenta', () => {
    const { desde, hasta } = resolverVentanaPromos({ desde: '2026-06-01', hasta: '2026-06-30' });
    expect(diaLocal(desde)).toBe('2026-06-01');
    expect(diaLocal(hasta)).toBe('2026-07-01');
  });

  it('una fecha inválida se ignora en vez de inventar una ventana', () => {
    const hoy = new Date('2026-10-19T10:00:00');
    const { desde, hasta } = resolverVentanaPromos({ desde: 'ayer', hasta: '2026-13-99' }, hoy);
    expect(diaLocal(desde)).toBe('2025-10-19');
    expect(diaLocal(hasta)).toBe('2026-10-20');
  });
});

describe('GET /api/hospitality/promos/rendimiento', () => {
  it('sin autenticación responde 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'Token inválido' });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it('sin la capacidad de finanzas responde 403', async () => {
    mocks.authenticateRequest.mockResolvedValue({
      valid: true,
      tenant: { id: 'tenant_a' },
      user: { id: 'user_b', role: { id: 'role_x', nombre: 'Recepción', permisos: { hospitality: { reservas: { ver: true } } } } },
    });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it('lee solo el tenant, las reservas con descuento y su payload', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      {
        id: 'res_a',
        estado: 'confirmed',
        checkIn: new Date('2026-07-10T15:00:00'),
        checkOut: new Date('2026-07-12T11:00:00'),
        currency: 'EUR',
        commission: 0,
        payload: { promocion: { codigo: 'VERANO2027', descuento: 20 } },
        items: [
          { tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 2, importeUnitario: 100, importeTotal: 200 },
          { tipo: 'descuento', concepto: 'Descuento VERANO2027', cantidad: 1, importeUnitario: -20, importeTotal: -20 },
        ],
      },
    ]);
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { codigo: 'VERANO2027', moneda: 'EUR', usos: 1, activo: true, maxUsos: null },
      { codigo: 'SINUSO', moneda: 'EUR', usos: 0, activo: true, maxUsos: null },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue([
      { codigo: 'VERANO2027', resultado: 'aplicada', reservationId: 'res_a', sesionId: 's-1' },
      { codigo: 'VERANO2027', resultado: 'aplicada', reservationId: null, sesionId: 's-2' },
      { codigo: 'VERANO2027', resultado: 'min_noches', reservationId: null, sesionId: 's-3' },
      { codigo: 'VERANO207', resultado: 'no_existe', reservationId: null, sesionId: 's-4' },
    ]);

    const res = await GET(request('http://test.local/api/hospitality/promos/rendimiento?desde=2026-07-01&hasta=2026-07-31'));
    const data = await res.json();

    const args = mocks.hospitalityReservation.findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe('tenant_a');
    // Solo las reservas que un código puede explicar.
    expect(args.where.items).toEqual({ some: { tipo: 'descuento' } });
    expect(diaLocal(args.where.checkIn.gte)).toBe('2026-07-01');
    expect(diaLocal(args.where.checkIn.lt)).toBe('2026-08-01');
    expect(mocks.hospitalityPromoCode.findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant_a' });

    // Las consultas se leen con la MISMA ventana de entrada que las reservas,
    // y solo con los campos que hacen falta para contar.
    const argsConsultas = mocks.hospitalityPromoConsulta.findMany.mock.calls[0][0];
    expect(argsConsultas.where.tenantId).toBe('tenant_a');
    expect(diaLocal(argsConsultas.where.checkIn.gte)).toBe('2026-07-01');
    expect(diaLocal(argsConsultas.where.checkIn.lt)).toBe('2026-08-01');
    expect(argsConsultas.select).toEqual({
      codigo: true,
      resultado: true,
      reservationId: true,
      sesionId: true,
    });

    expect(data.desde).toBe('2026-07-01');
    expect(data.hasta).toBe('2026-07-31');
    expect(data.sinCodigo).toBe(0);
    expect(data.totales).toMatchObject({ reservas: 1, descuentoOtorgado: 20, bruto: 180, neto: 180 });

    // Todo lo que la tabla del panel pinta viaja en la respuesta.
    const verano = data.filas.find((f: any) => f.codigo === 'VERANO2027');
    expect(verano).toMatchObject({
      moneda: 'EUR',
      noches: 2,
      reservas: 1,
      reservasSinVenta: 0,
      descuentoOtorgado: 20,
      alojamientoSinDescuento: 200,
      descuentoPct: 10,
      bruto: 180,
      neto: 180,
      // 180 de neto por 20 descontados.
      netoPorDescontado: 9,
      usosDelContador: 1,
      usosSinReservaMedida: 0,
      // Dos consultas aplicadas de cuatro intentos: una reservó, otra no; el
      // mínimo de noches no cuenta como consulta.
      consultas: 2,
      consultasConvertidas: 1,
      consultasSinReserva: 1,
      intentosRechazados: 1,
      conversionPct: 50,
    });
    expect(data.totales).toMatchObject({
      consultas: 2,
      consultasConvertidas: 1,
      intentosRechazados: 1,
      conversionPct: 50,
    });
    expect(data.deCodigosDesconocidos).toEqual([{ codigo: 'VERANO207', intentos: 1 }]);

    // El código que nadie usó también viaja en la comparativa, con ceros.
    const sinUso = data.filas.find((f: any) => f.codigo === 'SINUSO');
    expect(sinUso).toMatchObject({ reservas: 0, descuentoOtorgado: 0, bruto: 0, neto: 0 });
  });

  it('devuelve las alertas de códigos sin conversión con SU ventana de registro', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { codigo: 'VERANO2027', moneda: 'EUR', usos: 0, activo: true, maxUsos: null },
    ]);
    mocks.hospitalityPromoConsulta.findMany
      // Primera lectura: la ventana de la tabla (check-in).
      .mockResolvedValueOnce([])
      // Segunda: la actividad reciente por fecha de registro, que es la que
      // decide la alerta (una consulta para dentro de seis meses cuenta hoy).
      .mockResolvedValueOnce(
        Array.from({ length: 25 }, () => ({ codigo: 'VERANO2027', reservationId: null }))
      );

    const res = await GET(request());
    const data = await res.json();

    const argsAlerta = mocks.hospitalityPromoConsulta.findMany.mock.calls[1][0];
    expect(argsAlerta.where.tenantId).toBe('tenant_a');
    expect(argsAlerta.where.resultado).toBe('aplicada');
    expect(argsAlerta.where.fecha).toBeDefined();
    expect(argsAlerta.select).toEqual({ codigo: true, reservationId: true });

    expect(data.alertas).toHaveLength(1);
    expect(data.alertas[0]).toMatchObject({
      codigo: 'VERANO2027',
      consultas: 25,
      consultasConvertidas: 0,
      conversionPct: 0,
      motivo: 'sin_conversion',
    });
    expect(data.ventanaAlertas.minimoConsultas).toBe(20);
    expect(data.ventanaAlertas.conversionMinimaPct).toBe(5);
  });
});
