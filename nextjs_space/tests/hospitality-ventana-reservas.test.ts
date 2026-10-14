// @vitest-environment node
//
// Ventana del barrido de reservas (Fetch Reservations).
//
// Por qué existe
// --------------
// El proveedor filtra `startDate`/`endDate` por FECHA DE RESERVA (`bookedOn`),
// no por fechas de estancia: medido contra el servicio real el 9 oct 2026
// (una reserva hecha el 8 oct para el 9-11 oct salía en «2026-10-08 → …» y no
// salía en «2026-10-09 → …»). El barrido pedía «hoy → +30», así que solo veía
// reservas hechas hoy: por eso una reserva de booking.com con entrada el mismo
// día, cuyo push se rechazó con 401, no llegó a importarse nunca.
//
// Y fija HASTA DÓNDE mira: 30 días atrás era cómodo pero estructuralmente
// incompleto. Medido el 14 oct 2026 contra el mismo hotel, el barrido devolvía
// 3 reservas con la ventana de 30 días y 5 con la de 365/730/1825/3650 (335-602
// ms, sin coste creciente): las dos que faltaban eran reservas VIVAS reservadas
// el 18 ago 2026 y el 10 abr 2026 para estancias de julio y agosto de 2027 —su
// push se perdió y ninguna ventana futura las iba a recuperar—.
//
// Este archivo fija la ventana (mira hacia atrás, hasta el horizonte de venta),
// qué estancias entran al ERP cuando ya han terminado, y que sus consumidores la
// usen en lugar de inventarse rangos.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DIAS_BARRIDO_RESERVAS_ADELANTE,
  DIAS_BARRIDO_RESERVAS_ATRAS,
  DIAS_ESTANCIA_IMPORTABLE,
  DIAS_HORIZONTE_VENTA,
  diasDesde,
  estanciaImportable,
  toIsoFechaLocal,
  ventanaFetchReservas,
  ventanaParaReserva,
} from '@/lib/hospitality/ventana-reservas';

const RAIZ = path.resolve(__dirname, '..');
/** 9 de octubre de 2026, en hora local (como la de la medición). */
const HOY = new Date(2026, 9, 9, 12, 0, 0);

describe('toIsoFechaLocal', () => {
  it('usa componentes locales: una reserva de las 23:30 no salta al día siguiente', () => {
    expect(toIsoFechaLocal(new Date(2026, 9, 9, 23, 30, 0))).toBe('2026-10-09');
    expect(toIsoFechaLocal(new Date(2026, 0, 1, 0, 30, 0))).toBe('2026-01-01');
  });
});

describe('diasDesde', () => {
  it('cuenta días de calendario, no horas', () => {
    expect(diasDesde(new Date(2026, 9, 9, 23, 59, 0), HOY)).toBe(0);
    expect(diasDesde(new Date(2026, 9, 8, 0, 1, 0), HOY)).toBe(1);
    expect(diasDesde(new Date(2026, 0, 15, 10, 0, 0), HOY)).toBe(267);
  });

  it('una fecha futura no son días negativos', () => {
    expect(diasDesde(new Date(2027, 0, 1), HOY)).toBe(0);
  });
});

describe('ventanaFetchReservas', () => {
  it('por defecto mira el horizonte de venta hacia atrás y 30 días adelante', () => {
    // 730 días antes del 9 oct 2026 = 9 oct 2024 (2025 no es bisiesto, pero
    // 2024-2026 sí cruza uno: el cálculo se hace restando días de calendario).
    expect(ventanaFetchReservas(undefined, undefined, HOY)).toEqual({
      startDate: '2024-10-09',
      endDate: '2026-11-08',
    });
    expect(DIAS_BARRIDO_RESERVAS_ATRAS).toBe(DIAS_HORIZONTE_VENTA);
    expect(DIAS_HORIZONTE_VENTA).toBe(730);
    expect(DIAS_BARRIDO_RESERVAS_ADELANTE).toBe(30);
  });

  it('nunca empieza en el día de hoy salvo que se pida explícitamente', () => {
    // La ventana que causó el fallo, ahora solo posible a propósito.
    expect(ventanaFetchReservas(0, 30, HOY).startDate).toBe('2026-10-09');
    // Y la del barrido: el 8 de octubre (cuando se hizo la reserva) entra.
    const barrido = ventanaFetchReservas(undefined, undefined, HOY);
    expect(barrido.startDate < '2026-10-08').toBe(true);
  });

  it('cubre cualquier reserva VIVA: la hecha el 10 abr 2026 para julio de 2027 entra', () => {
    // Es el caso real que la ventana de 30 días dejaba fuera para siempre
    // (booking.com 5151446790, reservada 2026-04-10, estancia 2027-07-30).
    const barrido = ventanaFetchReservas(undefined, undefined, HOY);
    expect('2026-04-10' > barrido.startDate).toBe(true);
    // Y la del 18 ago 2026 (booking.com 6713291480, estancia 2027-08-07).
    expect('2026-08-18' > barrido.startDate).toBe(true);
  });

  it('resta días de calendario aunque se cruce un cambio de horario', () => {
    // El 25 de octubre de 2026 España cambia de hora: 30 días antes del 8 nov.
    expect(ventanaFetchReservas(0, 30, HOY).endDate).toBe('2026-11-08');
    expect(ventanaFetchReservas(30, 0, new Date(2026, 10, 8, 12, 0, 0))).toEqual({
      startDate: '2026-10-09',
      endDate: '2026-11-08',
    });
  });
});

describe('ventanaParaReserva', () => {
  it('sin fecha de reserva usa el barrido por defecto', () => {
    expect(ventanaParaReserva(null, HOY)).toEqual(ventanaFetchReservas(undefined, undefined, HOY));
    expect(ventanaParaReserva(undefined, HOY)).toEqual(ventanaFetchReservas(undefined, undefined, HOY));
  });

  it('se abre hasta cubrir el día en que se hizo la reserva', () => {
    // Una reserva hecha el 15 de enero: el horizonte de venta ya la cubre.
    expect(ventanaParaReserva(new Date(2026, 0, 15, 10, 0, 0), HOY)).toEqual({
      startDate: '2024-10-09',
      endDate: '2026-11-08',
    });
  });

  it('más allá del horizonte de venta se abre lo que haga falta', () => {
    // Una reserva hecha hace más de dos años (posible en un hotel que dejó el
    // canal abierto mucho antes): la ventana se abre hasta su día, no se queda
    // en el horizonte — si no, «no reaparece» cancelaría algo que el proveedor
    // sí reporta.
    const hace3Anios = new Date(2023, 4, 20, 10, 0, 0);
    expect(ventanaParaReserva(hace3Anios, HOY).startDate).toBe('2023-05-19');
  });

  it('una reserva reciente no estrecha la ventana por debajo del barrido', () => {
    expect(ventanaParaReserva(new Date(2026, 9, 8, 0, 16, 0), HOY).startDate).toBe('2024-10-09');
  });
});

describe('estanciaImportable (qué estancias ya terminadas entran al ERP)', () => {
  it('una estancia futura o en curso entra siempre', () => {
    expect(estanciaImportable('2027-08-09', HOY)).toBe(true);
    expect(estanciaImportable('2026-10-09', HOY)).toBe(true); // checkout hoy
    expect(estanciaImportable('2026-10-08', HOY)).toBe(true); // terminó ayer
  });

  it('una estancia terminada dentro del plazo sigue entrando (factura, parte, mes en curso)', () => {
    expect(DIAS_ESTANCIA_IMPORTABLE).toBe(30);
    expect(estanciaImportable('2026-09-09', HOY)).toBe(true); // hace 30 días
    expect(estanciaImportable('2026-09-10', HOY)).toBe(true);
  });

  it('una estancia terminada hace más del plazo es historia: no entra', () => {
    expect(estanciaImportable('2026-09-08', HOY)).toBe(false);
    expect(estanciaImportable('2026-04-15', HOY)).toBe(false);
  });

  it('sin fecha de salida válida no se descarta nada (no se puede juzgar)', () => {
    expect(estanciaImportable(null, HOY)).toBe(true);
    expect(estanciaImportable(undefined, HOY)).toBe(true);
    expect(estanciaImportable('', HOY)).toBe(true);
    expect(estanciaImportable('no-es-fecha', HOY)).toBe(true);
  });

  it('la fecha se compara como texto: la zona del servidor no decide si entra', () => {
    // Un `checkout` con hora (o un ISO completo) se lee por su día.
    expect(estanciaImportable('2026-09-08T23:00:00.000Z', HOY)).toBe(false);
    expect(estanciaImportable('2026-09-09 00:00:00', HOY)).toBe(true);
  });
});

describe('los consumidores usan la ventana (no rangos inventados)', () => {
  it('la reconciliación pide la ventana del barrido y descarta la historia por estancia', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/hospitality/reconciliation.ts'), 'utf8');
    expect(fuente).toContain('ventanaFetchReservas');
    expect(fuente).toContain('diasAtras');
    // La ventana profunda NO puede volcar la historia del hotel al ERP: la
    // decisión de importar una reserva nueva pasa por `estanciaImportable`.
    expect(fuente).toContain('estanciaImportable');
    // Ya no se le pasa el día de hoy como inicio del rango.
    expect(fuente).not.toContain('fetchReservations(hotelCode, toIsoDate(today)');
  });

  it('el cron pasa el horizonte de venta explícito (no un literal suelto)', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/cron/hospitality-reconcile.ts'), 'utf8');
    expect(fuente).toContain('diasAtras: DIAS_BARRIDO_RESERVAS_ATRAS');
  });

  it('la re-verificación de una divergencia pide la ventana de ESA reserva', () => {
    const fuente = fs.readFileSync(
      path.join(RAIZ, 'app/api/admin/conectividad/divergencias/route.ts'),
      'utf8'
    );
    expect(fuente).toContain('ventanaParaReserva');
    // El rango de estancia ya no se usa como ventana de búsqueda.
    expect(fuente).not.toContain('ci.toISOString().slice(0, 10)');
  });

  it('el adapter avisa de la semántica real en su propio docstring', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/hospitality/connectivity.ts'), 'utf8');
    const doc = fuente.slice(fuente.indexOf('Fetch Reservations — POST'));
    expect(doc.slice(0, 900)).toContain('FECHA DE RESERVA');
    expect(doc.slice(0, 900)).toContain('ventana-reservas');
  });
});
