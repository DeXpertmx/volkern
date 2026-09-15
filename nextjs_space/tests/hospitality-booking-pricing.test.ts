import { describe, it, expect } from 'vitest';
import {
  cotizarEstancia,
  tarifaPorNocheDe,
  validarEstancia,
  type RestriccionesEstancia,
} from '../lib/hospitality/pricing';

/**
 * Guardias de la tarificación de la reserva directa.
 *
 * Estas dos preguntas —cuánto cuesta y si se puede vender— las hacen la página
 * pública, el motor al crear la reserva y la ficha de la reserva al explicar su
 * desglose. Si discrepasen, el huésped vería un precio y se guardaría otro.
 */

function fecha(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

const HOY = fecha('2026-09-15');

describe('cotizarEstancia', () => {
  it('suma las noches y la limpieza, y reparte el anticipo', () => {
    const cotizacion = cotizarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-15'),
      tarifaPorNoche: 120,
      limpieza: 60,
      anticipoPorcentaje: 20,
      moneda: 'eur',
    });

    expect(cotizacion.noches).toBe(5);
    expect(cotizacion.alojamiento).toBe(600);
    expect(cotizacion.limpieza).toBe(60);
    expect(cotizacion.total).toBe(660);
    expect(cotizacion.anticipo).toBe(132);
    expect(cotizacion.saldo).toBe(528);
    // La divisa llega normalizada en mayúsculas para que la use el formateador.
    expect(cotizacion.moneda).toBe('EUR');
  });

  it('la noche de salida no se cobra (check-in 10, check-out 15 → cinco noches)', () => {
    const cotizacion = cotizarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-15'),
      tarifaPorNoche: 100,
      moneda: 'EUR',
    });
    expect(cotizacion.noches).toBe(5);
    expect(cotizacion.total).toBe(500);
  });

  it('sin limpieza no inventa la línea', () => {
    const cotizacion = cotizarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-12'),
      tarifaPorNoche: 90,
      limpieza: null,
      moneda: 'EUR',
    });
    expect(cotizacion.limpieza).toBe(0);
    expect(cotizacion.total).toBe(180);
  });

  it('sin anticipo no se pide nada por adelantado', () => {
    const cotizacion = cotizarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-12'),
      tarifaPorNoche: 90,
      anticipoPorcentaje: 0,
      moneda: 'EUR',
    });
    expect(cotizacion.anticipo).toBe(0);
    expect(cotizacion.saldo).toBe(180);
  });

  it('un anticipo fuera de rango se recorta en vez de cobrarse', () => {
    const base = {
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-12'),
      tarifaPorNoche: 100,
      moneda: 'EUR',
    };
    expect(cotizarEstancia({ ...base, anticipoPorcentaje: 250 }).anticipo).toBe(200);
    expect(cotizarEstancia({ ...base, anticipoPorcentaje: -30 }).anticipo).toBe(0);
  });

  it('redondea a céntimo la tarifa antes de multiplicar', () => {
    const cotizacion = cotizarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-13'),
      tarifaPorNoche: 10.005,
      moneda: 'EUR',
    });
    expect(cotizacion.tarifaPorNoche).toBe(10.01);
    expect(cotizacion.alojamiento).toBe(30.03);
  });

  it('una estancia sin noches es un error de quien llama, no un cero', () => {
    expect(() =>
      cotizarEstancia({
        checkIn: fecha('2026-10-10'),
        checkOut: fecha('2026-10-10'),
        tarifaPorNoche: 100,
        moneda: 'EUR',
      })
    ).toThrow();
  });
});

describe('validarEstancia', () => {
  const restricciones = (r: RestriccionesEstancia) => r;

  it('acepta una estancia normal', () => {
    const resultado = validarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-13'),
      hoy: HOY,
    });
    expect(resultado).toEqual({ ok: true, noches: 3 });
  });

  it('rechaza la salida anterior o igual a la entrada', () => {
    const resultado = validarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-09'),
      hoy: HOY,
    });
    expect(resultado).toMatchObject({ ok: false, motivo: 'fechas_invalidas' });
  });

  it('rechaza fechas pasadas', () => {
    const resultado = validarEstancia({
      checkIn: fecha('2026-09-01'),
      checkOut: fecha('2026-09-05'),
      hoy: HOY,
    });
    expect(resultado).toMatchObject({ ok: false, motivo: 'en_pasado' });
  });

  it('rechaza por debajo del mínimo de noches y dice cuántas pide', () => {
    const resultado = validarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-11'),
      restricciones: restricciones({ minNoches: 3 }),
      hoy: HOY,
    });
    expect(resultado).toMatchObject({ ok: false, motivo: 'min_noches' });
    expect(resultado.ok === false && resultado.mensaje).toContain('3 noches');
  });

  it('rechaza por encima del máximo de noches', () => {
    const resultado = validarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-20'),
      restricciones: restricciones({ maxNoches: 7 }),
      hoy: HOY,
    });
    expect(resultado).toMatchObject({ ok: false, motivo: 'max_noches' });
  });

  it('respeta los días de entrada permitidos y los nombra en el mensaje', () => {
    // 2026-10-10 es sábado: si solo se entra en martes, esta estancia no vale.
    const resultado = validarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-12'),
      restricciones: restricciones({ checkInDias: [2] }),
      hoy: HOY,
    });
    expect(resultado).toMatchObject({ ok: false, motivo: 'dia_checkin' });
    expect(resultado.ok === false && resultado.mensaje).toContain('martes');
  });

  it('respeta los días de salida permitidos', () => {
    const resultado = validarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-12'),
      restricciones: restricciones({ checkOutDias: [0, 6] }),
      hoy: HOY,
    });
    expect(resultado).toMatchObject({ ok: false, motivo: 'dia_checkout' });
  });

  it('una lista de días vacía o ausente no restringe', () => {
    const resultado = validarEstancia({
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-12'),
      restricciones: restricciones({ minNoches: 1, checkInDias: [], checkOutDias: null }),
      hoy: HOY,
    });
    expect(resultado.ok).toBe(true);
  });
});

describe('tarifaPorNocheDe', () => {
  it('el plan de tarifa activo manda sobre la tarifa base de la unidad', () => {
    expect(tarifaPorNocheDe({ plan: { tarifa: 140 }, tarifaBase: 99 })).toBe(140);
  });

  it('sin plan usa la tarifa base', () => {
    expect(tarifaPorNocheDe({ plan: null, tarifaBase: 99 })).toBe(99);
  });

  it('sin precio no hay tarifa: la unidad no se puede vender', () => {
    expect(tarifaPorNocheDe({ plan: null, tarifaBase: null })).toBeNull();
    expect(tarifaPorNocheDe({ plan: { tarifa: null }, tarifaBase: undefined })).toBeNull();
  });
});
