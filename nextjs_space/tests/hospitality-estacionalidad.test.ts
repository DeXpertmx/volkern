import { describe, it, expect } from 'vitest';
import {
  normalizarEstacionalidad,
  ordenarTemporadas,
  tieneEstacionalidad,
  tarifaPorNoche,
  serieDeTarifas,
  totalDeSerie,
  precioEstancia,
  hayPrecioPlan,
} from '../lib/hospitality/estacionalidad';

/**
 * Guardias de la estacionalidad (capa 1 del pricing).
 *
 * La regla central que estas pruebas fijan: el precio se aplica POR NOCHE —
 * la noche cuesta la tarifa de SU fecha, sea cual sea el resto de la estancia.
 * El mismo módulo alimenta el booking engine y el push de tarifas, así que
 * estas pruebas son a la vez la garantía página-vs-canal.
 */

const dia = (iso: string) => new Date(`${iso}T00:00:00`);

const PLAN_TEMPORADA = {
  tarifa: 100,
  estacionalidad: normalizarEstacionalidad({
    temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150, nombre: 'Julio' }],
  }),
};

describe('normalizarEstacionalidad', () => {
  it('acepta temporadas y fin de semana válidos', () => {
    const c = normalizarEstacionalidad({
      temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: '150' }],
      finDeSemana: { dias: [5, 6], porcentaje: 20 },
    });
    expect(c).toEqual({
      temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150 }],
      finDeSemana: { dias: [5, 6], porcentaje: 20 },
    });
  });

  it('descarta rangos malformados en vez de lanzar: un Json malo no tumba una cotización', () => {
    const c = normalizarEstacionalidad({
      temporadas: [
        null,
        'basura',
        { desde: '2026-07-01', hasta: '2026-07-31' }, // sin tarifa
        { desde: '2026-07-31', hasta: '2026-07-01', tarifa: 100 }, // invertido
        { desde: 'no-fecha', hasta: '2026-07-31', tarifa: 100 },
        { desde: '2026-08-01', hasta: '2026-08-31', tarifa: 180 },
      ],
    });
    expect(c?.temporadas).toEqual([{ desde: '2026-08-01', hasta: '2026-08-31', tarifa: 180 }]);
  });

  it('sin nada utilizable devuelve null (el plan cae a su tarifa plana)', () => {
    expect(normalizarEstacionalidad(null)).toBeNull();
    expect(normalizarEstacionalidad('x')).toBeNull();
    expect(normalizarEstacionalidad({ temporadas: [], finDeSemana: { dias: [], porcentaje: 10 } })).toBeNull();
    expect(normalizarEstacionalidad({ finDeSemana: { dias: [5], porcentaje: 0 } })).toBeNull();
  });

  it('normaliza números que llegan como string del UI y limpia etiquetas', () => {
    const c = normalizarEstacionalidad({
      temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: '149.999', nombre: '  Verano  ' }],
    });
    expect(c?.temporadas?.[0].tarifa).toBe(150);
    expect(c?.temporadas?.[0].nombre).toBe('Verano');
  });

  it('ordenarTemporadas deja la tabla determinista por fecha de inicio', () => {
    const ordenadas = ordenarTemporadas([
      { desde: '2026-08-01', hasta: '2026-08-31', tarifa: 180 },
      { desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150 },
    ]);
    expect(ordenadas.map((t) => t.desde)).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('tieneEstacionalidad responde solo cuando hay capa utilizable', () => {
    expect(tieneEstacionalidad({ temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150 }] })).toBe(true);
    expect(tieneEstacionalidad({ finDeSemana: { dias: [6], porcentaje: 10 } })).toBe(true);
    expect(tieneEstacionalidad({ temporadas: [] })).toBe(false);
    expect(tieneEstacionalidad(null)).toBe(false);
  });
});

describe('tarifaPorNoche — el precio se aplica por NOCHE', () => {
  it('la noche dentro de la temporada cuesta la tarifa de la temporada', () => {
    expect(tarifaPorNoche({ fecha: dia('2026-07-15'), tarifaBase: 100, plan: PLAN_TEMPORADA })).toBe(150);
  });

  it('la noche fuera de la temporada cuesta la tarifa plana del plan', () => {
    expect(tarifaPorNoche({ fecha: dia('2026-09-15'), tarifaBase: 100, plan: PLAN_TEMPORADA })).toBe(100);
  });

  it('una estancia que cruza el borde paga cada noche con su tarifa (junio entra, julio ocupa)', () => {
    // La misma estancia desde el lado de julio: la noche del 1 de julio ya es
    // de temporada aunque el check-in fuera el 30 de junio.
    const junio30 = tarifaPorNoche({ fecha: dia('2026-06-30'), tarifaBase: 100, plan: PLAN_TEMPORADA });
    const julio01 = tarifaPorNoche({ fecha: dia('2026-07-01'), tarifaBase: 100, plan: PLAN_TEMPORADA });
    expect(junio30).toBe(100);
    expect(julio01).toBe(150);
  });

  it('sin plan el respaldo es la tarifa base de la unidad', () => {
    expect(tarifaPorNoche({ fecha: dia('2026-09-15'), tarifaBase: 100, plan: null })).toBe(100);
  });

  it('sin ninguna tarifa no hay precio (la unidad no se vende)', () => {
    expect(tarifaPorNoche({ fecha: dia('2026-09-15'), tarifaBase: null, plan: null })).toBeNull();
    expect(tarifaPorNoche({ fecha: dia('2026-09-15'), tarifaBase: 0, plan: { tarifa: 0 } })).toBeNull();
  });

  it('el recargo de fin de semana aplica a noches sin temporada (viernes/sábado 2026-09)', () => {
    const plan = {
      tarifa: 100,
      estacionalidad: normalizarEstacionalidad({ finDeSemana: { dias: [5, 6], porcentaje: 20 } }),
    };
    // 2026-09-11 es viernes, 09-12 sábado, 09-13 domingo, 09-14 lunes.
    expect(tarifaPorNoche({ fecha: dia('2026-09-11'), tarifaBase: 100, plan })).toBe(120);
    expect(tarifaPorNoche({ fecha: dia('2026-09-12'), tarifaBase: 100, plan })).toBe(120);
    expect(tarifaPorNoche({ fecha: dia('2026-09-13'), tarifaBase: 100, plan })).toBe(100); // domingo fuera
    expect(tarifaPorNoche({ fecha: dia('2026-09-14'), tarifaBase: 100, plan })).toBe(100);
  });

  it('la temporada manda sobre el fin de semana: su precio ya es completo', () => {
    const plan = {
      tarifa: 100,
      estacionalidad: normalizarEstacionalidad({
        temporadas: [{ desde: '2026-08-01', hasta: '2026-08-31', tarifa: 200 }],
        finDeSemana: { dias: [5, 6], porcentaje: 20 },
      }),
    };
    // 2026-08-14 es viernes: temporada, no +20% encima.
    expect(tarifaPorNoche({ fecha: dia('2026-08-14'), tarifaBase: 100, plan })).toBe(200);
  });

  it('el recargo se calcula sobre la tarifa del plan (no de la base) y redondea a céntimo', () => {
    const plan = {
      tarifa: 99.99,
      estacionalidad: normalizarEstacionalidad({ finDeSemana: { dias: [5], porcentaje: 20 } }),
    };
    expect(tarifaPorNoche({ fecha: dia('2026-09-11'), tarifaBase: 1, plan })).toBe(119.99);
  });

  it('un Json envenenado en la base (tarifa 0 o corrupta) no tumba ni vende a cero: cae a la plana', () => {
    // El normalizador descarta el rango malo y la noche vuelve a la tarifa del
    // plan: ni precio roto ni unidad vendida a cero.
    for (const mala of [0, 'abc']) {
      const plan = {
        tarifa: 100,
        estacionalidad: { temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: mala }] },
      };
      expect(tarifaPorNoche({ fecha: dia('2026-07-15'), tarifaBase: 100, plan })).toBe(100);
    }
  });

  it('diaSemana explícito (del push, que ya lo calcula) se respeta', () => {
    const plan = {
      tarifa: 100,
      estacionalidad: normalizarEstacionalidad({ finDeSemana: { dias: [5], porcentaje: 50 } }),
    };
    // 2026-09-16 es miércoles (3): con diaSemana=5 vale como viernes.
    expect(tarifaPorNoche({ fecha: dia('2026-09-16'), tarifaBase: 100, plan, diaSemana: 5 })).toBe(150);
    expect(tarifaPorNoche({ fecha: dia('2026-09-16'), tarifaBase: 100, plan, diaSemana: 3 })).toBe(100);
  });
});

describe('serie y totales — lo que consumen engine y push', () => {
  it('serieDeTarifas da un precio por noche del rango, fin exclusivo', () => {
    const serie = serieDeTarifas({
      desde: dia('2026-06-30'),
      hasta: dia('2026-07-03'),
      tarifaBase: 100,
      plan: PLAN_TEMPORADA,
    });
    expect(serie).toEqual([
      { fecha: '2026-06-30', tarifa: 100 },
      { fecha: '2026-07-01', tarifa: 150 },
      { fecha: '2026-07-02', tarifa: 150 },
    ]);
  });

  it('totalDeSerie suma y devuelve null si la serie no tiene ningún precio', () => {
    expect(totalDeSerie([{ tarifa: 100 }, { tarifa: 150.005 }])).toBe(250.01);
    expect(totalDeSerie([{ tarifa: null }, { tarifa: null }])).toBeNull();
  });

  it('precioEstancia: 1 noche de junio + 3 de julio = 100+150+150+150', () => {
    // 30/06→04/07 son 4 NOCHES: 30/06, 01, 02 y 03/07 (el 04 es checkout).
    expect(
      precioEstancia({
        checkIn: dia('2026-06-30'),
        checkOut: dia('2026-07-04'),
        tarifaBase: 100,
        plan: PLAN_TEMPORADA,
      })
    ).toBe(550);
  });

  it('un plan sin ningún precio no devuelve un total de 0: devuelve null (no se vende)', () => {
    expect(
      precioEstancia({ checkIn: dia('2026-07-01'), checkOut: dia('2026-07-03'), tarifaBase: null, plan: { tarifa: null } })
    ).toBeNull();
  });

  it('hayPrecioPlan replica la precedencia plan→base (comportamiento de tarifaPorNocheDe)', () => {
    expect(hayPrecioPlan({ plan: { tarifa: 140 }, tarifaBase: 99 })).toBe(true);
    expect(hayPrecioPlan({ plan: null, tarifaBase: 99 })).toBe(true);
    expect(hayPrecioPlan({ plan: { tarifa: null }, tarifaBase: null })).toBe(false);
    expect(hayPrecioPlan({ plan: { tarifa: 0 }, tarifaBase: 0 })).toBe(false);
  });
});
