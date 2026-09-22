// @vitest-environment node
//
// Guardia de las MÉTRICAS de holds caducados (lib/hospitality/holds-metrics.ts).
// Convierte las filas de auditoría del barrido en el resumen por tenant que ve
// el operador de plataforma. Misma invariante que la analítica: el cálculo vive
// en el módulo puro y la ruta solo carga y delega.

import { describe, it, expect } from 'vitest';
import {
  eventoDesdeAudit,
  ventanaHoldDias,
  agregarHoldsCaducados,
  metricasHoldsAbandonados,
  alertaHoldsAbandonados,
  HOLD_METRICAS_VENTANA_POR_DEFECTO,
  HOLD_METRICAS_VENTANA_MAXIMA,
  HOLD_ABANDONO_UMBRAL_ALERTA,
  HOLD_ABANDONO_MINIMO_PARA_ALERTA,
  type EventoHoldCaducado,
} from '../lib/hospitality/holds-metrics';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const AHORA = new Date('2026-09-18T12:00:00');
const haceDias = (d: number) => new Date(AHORA.getTime() - d * DIA);

function evento(overrides: Partial<EventoHoldCaducado> = {}): EventoHoldCaducado {
  return {
    tenantId: 'tenant-a',
    propertyId: 'prop-1',
    fecha: haceDias(1),
    horasRetencion: 24,
    ...overrides,
  };
}

describe('eventoDesdeAudit (normaliza la fila de auditoría)', () => {
  it('extrae tenant, propiedad, fecha y ventana del metadata', () => {
    const e = eventoDesdeAudit({
      tenantId: 'tenant-a',
      metadata: { propertyId: 'prop-9', horasRetencion: 48 },
      fechaCreacion: haceDias(2),
    });
    expect(e).not.toBeNull();
    expect(e!.tenantId).toBe('tenant-a');
    expect(e!.propertyId).toBe('prop-9');
    expect(e!.horasRetencion).toBe(48);
    expect(e!.fecha.getTime()).toBe(haceDias(2).getTime());
  });

  it('un metadata corrupto no descarta el evento: cuenta sin propiedad ni ventana', () => {
    const e = eventoDesdeAudit({
      tenantId: 'tenant-a',
      metadata: 'basura',
      fechaCreacion: haceDias(1),
    });
    expect(e?.propertyId).toBeNull();
    expect(e?.horasRetencion).toBeNull();
  });

  it('sin tenant o con fecha inválida no hay evento (no es accionable)', () => {
    expect(eventoDesdeAudit({ tenantId: null, metadata: {}, fechaCreacion: AHORA })).toBeNull();
    expect(
      eventoDesdeAudit({ tenantId: 'tenant-a', metadata: {}, fechaCreacion: new Date('nope') })
    ).toBeNull();
  });
});

describe('ventanaHoldDias (ventana de las métricas)', () => {
  it('sin valor o corrupto cae en el defecto (30 días)', () => {
    expect(ventanaHoldDias(undefined)).toBe(HOLD_METRICAS_VENTANA_POR_DEFECTO);
    expect(ventanaHoldDias(null)).toBe(HOLD_METRICAS_VENTANA_POR_DEFECTO);
    expect(ventanaHoldDias('basura')).toBe(HOLD_METRICAS_VENTANA_POR_DEFECTO);
    expect(ventanaHoldDias(0)).toBe(HOLD_METRICAS_VENTANA_POR_DEFECTO);
    expect(ventanaHoldDias(HOLD_METRICAS_VENTANA_MAXIMA + 1)).toBe(HOLD_METRICAS_VENTANA_POR_DEFECTO);
  });

  it('acepta el string numérico de la query', () => {
    expect(ventanaHoldDias('7')).toBe(7);
    expect(ventanaHoldDias(90)).toBe(90);
  });
});

describe('agregarHoldsCaducados', () => {
  it('agrupa por tenant y suma a todos los tenants', () => {
    const r = agregarHoldsCaducados(
      [
        evento({ tenantId: 'a', propertyId: 'p1' }),
        evento({ tenantId: 'a', propertyId: 'p2' }),
        evento({ tenantId: 'b', propertyId: 'p1' }),
      ],
      { ahora: AHORA, dias: 30 }
    );
    expect(r.total).toBe(3);
    expect(r.tenants.map((t) => [t.tenantId, t.caducados])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('cuenta propiedades distintas (el null no cuenta)', () => {
    const r = agregarHoldsCaducados(
      [
        evento({ propertyId: 'p1' }),
        evento({ propertyId: 'p1' }),
        evento({ propertyId: null }),
      ],
      { ahora: AHORA, dias: 30 }
    );
    expect(r.tenants[0].caducados).toBe(3);
    expect(r.tenants[0].propiedadesAfectadas).toBe(1);
  });

  it('respeta la ventana: lo anterior al rango no cuenta', () => {
    const r = agregarHoldsCaducados(
      [evento({ fecha: haceDias(3) }), evento({ fecha: haceDias(40) })],
      { ahora: AHORA, dias: 30 }
    );
    expect(r.total).toBe(1);
    expect(r.desde.getTime()).toBe(haceDias(30).getTime());
    expect(r.ventanaDias).toBe(30);
  });

  it('una fecha unos ms por delante de `ahora` cuenta (reloj de la BD vs. de la app)', () => {
    // La BD escribe `now()` después de calcular la ventana: descartar el futuro
    // inmediato dejaría fuera la caducidad más reciente de forma sistemática.
    const r = agregarHoldsCaducados(
      [evento({ fecha: new Date(AHORA.getTime() + 1000) })],
      { ahora: AHORA, dias: 30 }
    );
    expect(r.total).toBe(1);
    expect(r.tenants[0].ultimoCaducado?.getTime()).toBe(AHORA.getTime() + 1000);
  });

  it('el último caducado es el más reciente', () => {
    const r = agregarHoldsCaducados(
      [evento({ fecha: haceDias(9) }), evento({ fecha: haceDias(2) }), evento({ fecha: haceDias(5) })],
      { ahora: AHORA, dias: 30 }
    );
    expect(r.tenants[0].ultimoCaducado?.getTime()).toBe(haceDias(2).getTime());
  });

  it('la ventana media ignora los eventos sin ventana legible', () => {
    const r = agregarHoldsCaducados(
      [evento({ horasRetencion: 24 }), evento({ horasRetencion: 48 }), evento({ horasRetencion: null })],
      { ahora: AHORA, dias: 30 }
    );
    expect(r.tenants[0].caducados).toBe(3);
    expect(r.tenants[0].horasRetencionMedia).toBe(36);
  });

  it('sin eventos con ventana legible no inventa una media', () => {
    const r = agregarHoldsCaducados([evento({ horasRetencion: null })], { ahora: AHORA, dias: 30 });
    expect(r.tenants[0].horasRetencionMedia).toBeNull();
  });

  it('ordena por caducados desc y, a igualdad, por tenant', () => {
    const r = agregarHoldsCaducados(
      [
        evento({ tenantId: 'z' }),
        evento({ tenantId: 'b' }),
        evento({ tenantId: 'a' }),
        evento({ tenantId: 'a' }),
      ],
      { ahora: AHORA, dias: 30 }
    );
    expect(r.tenants.map((t) => t.tenantId)).toEqual(['a', 'b', 'z']);
  });

  it('sin eventos devuelve un resumen vacío coherente', () => {
    const r = agregarHoldsCaducados([], { ahora: AHORA, dias: 90 });
    expect(r).toMatchObject({ ventanaDias: 90, total: 0, tenants: [] });
  });
});

describe('metricasHoldsAbandonados (el ciclo del hold: caducado vs. confirmado)', () => {
  it('la tasa es caducados sobre el total de holds cerrados', () => {
    const m = metricasHoldsAbandonados({ caducados: 3, confirmados: 1 });
    expect(m).toEqual({ caducados: 3, confirmados: 1, cerrados: 4, tasaAbandono: 0.75 });
  });

  it('sin holds cerrados la tasa es null, no una división por cero', () => {
    const m = metricasHoldsAbandonados({ caducados: 0, confirmados: 0 });
    expect(m.cerrados).toBe(0);
    expect(m.tasaAbandono).toBeNull();
  });

  it('todo confirmado da tasa 0 (el caso sano)', () => {
    expect(metricasHoldsAbandonados({ caducados: 0, confirmados: 7 }).tasaAbandono).toBe(0);
  });

  it('valores corruptos o negativos no envenenan la tasa', () => {
    const m = metricasHoldsAbandonados({
      caducados: Number.NaN,
      confirmados: -5,
    });
    expect(m).toMatchObject({ caducados: 0, confirmados: 0, cerrados: 0, tasaAbandono: null });
  });
});

describe('alertaHoldsAbandonados (cuándo el abandono merece un aviso)', () => {
  it('con pocos holds no avisa: una tasa alta con 2 holds es ruido', () => {
    // El mínimo del módulo protege la señal: 1 de 2 es 50%, pero no es un patrón.
    expect(alertaHoldsAbandonados(metricasHoldsAbandonados({ caducados: 1, confirmados: 1 }))).toBeNull();
    expect(HOLD_ABANDONO_MINIMO_PARA_ALERTA).toBeGreaterThan(2);
  });

  it('con volumen pero por debajo del umbral no avisa', () => {
    const m = metricasHoldsAbandonados({ caducados: 1, confirmados: 9 });
    expect(m.tasaAbandono!).toBeLessThan(HOLD_ABANDONO_UMBRAL_ALERTA);
    expect(alertaHoldsAbandonados(m)).toBeNull();
  });

  it('avisa con las DOS causas posibles y el número exacto', () => {
    const aviso = alertaHoldsAbandonados(metricasHoldsAbandonados({ caducados: 4, confirmados: 2 }));
    expect(aviso).toContain('4 de 6 holds');
    // Ventana corta o canales lentos: el aviso nombra las dos, no alarma.
    expect(aviso).toContain('ventana de retención');
    expect(aviso).toContain('canales');
  });

  it('justo en el umbral avisa (es «a partir de», no «por encima de»)', () => {
    const m = metricasHoldsAbandonados({ caducados: 3, confirmados: 3 });
    expect(m.tasaAbandono).toBe(HOLD_ABANDONO_UMBRAL_ALERTA);
    expect(alertaHoldsAbandonados(m)).not.toBeNull();
  });

  it('umbral y mínimo son configurables (la política no está incrustada)', () => {
    const m = metricasHoldsAbandonados({ caducados: 1, confirmados: 1 });
    expect(alertaHoldsAbandonados(m, { umbral: 0.5, minimoHolds: 2 })).not.toBeNull();
  });
});
