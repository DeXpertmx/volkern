// @vitest-environment node
//
// Ocupación por noche: la lectura de demanda que consume la capa 2 del precio
// (regla de ocupación). Se calcula con la regla única del Availability Engine
// —reserva activa ocupa, bloqueo activo también, la unidad fuera de servicio no
// cuenta— sobre TODO el inventario de la propiedad.
//
// Lo que protege: que el porcentaje que mueve el precio sea el de la demanda
// real y no una cuenta paralela, y que sin dato (ninguna unidad vendible) no
// haya porcentaje: la regla entonces no aplica.

import { describe, it, expect } from 'vitest';
import {
  ocupacionPorNoche,
  type ActiveReservationSpan,
  type ActiveUnitBlockSpan,
  type AvailabilityUnit,
} from '../lib/hospitality/availability';

const d = (dia: number) => new Date(2026, 8, dia); // septiembre 2026

const unidad = (id: string, estado = 'available'): AvailabilityUnit => ({
  id,
  propertyId: 'prop_1',
  roomCode: id,
  estado,
});

const UNIDADES = [unidad('u1'), unidad('u2'), unidad('u3'), unidad('u4', 'maintenance')];

const RANGO: [Date, Date] = [d(11), d(14)]; // noches 11, 12 y 13

describe('ocupacionPorNoche', () => {
  it('mide las unidades vendibles que ya no están libres, día a día', () => {
    const reservas: ActiveReservationSpan[] = [
      { unitId: 'u1', checkIn: d(12), checkOut: d(13), estado: 'confirmed' },
    ];
    const bloques: ActiveUnitBlockSpan[] = [
      { unitId: 'u2', fechaInicio: d(12), fechaFin: d(14), estado: 'activo' },
    ];

    const ocupacion = ocupacionPorNoche(UNIDADES, RANGO[0], RANGO[1], reservas, bloques);
    // Tres unidades vendibles (la de mantenimiento queda fuera del denominador).
    expect(ocupacion).toEqual({
      '2026-09-11': 0,
      '2026-09-12': 66.7,
      '2026-09-13': 33.3,
    });
  });

  it('una reserva cancelada no ocupa: la habitación volvió al inventario', () => {
    const ocupacion = ocupacionPorNoche(
      UNIDADES,
      RANGO[0],
      RANGO[1],
      [{ unitId: 'u1', checkIn: d(11), checkOut: d(14), estado: 'cancelled' }]
    );
    expect(ocupacion['2026-09-11']).toBe(0);
    expect(ocupacion['2026-09-12']).toBe(0);
  });

  it('la propiedad llena da el 100 %, no más', () => {
    const reservas: ActiveReservationSpan[] = ['u1', 'u2', 'u3'].map((unitId) => ({
      unitId,
      checkIn: d(11),
      checkOut: d(14),
      estado: 'confirmed',
    }));
    const ocupacion = ocupacionPorNoche(UNIDADES, RANGO[0], RANGO[1], reservas);
    expect(Object.values(ocupacion)).toEqual([100, 100, 100]);
  });

  it('sin unidades vendibles devuelve vacío: sin dato, la regla no aplica', () => {
    const soloMantenimiento = [unidad('u1', 'out_of_service'), unidad('u2', 'maintenance')];
    expect(ocupacionPorNoche(soloMantenimiento, RANGO[0], RANGO[1], [])).toEqual({});
  });

  it('el día de salida no cuenta como ocupado (misma regla que la disponibilidad)', () => {
    const ocupacion = ocupacionPorNoche(
      UNIDADES,
      RANGO[0],
      RANGO[1],
      [{ unitId: 'u1', checkIn: d(11), checkOut: d(12), estado: 'confirmed' }]
    );
    // La noche del 11 se durmió; la del 12 ya está libre.
    expect(ocupacion['2026-09-11']).toBe(33.3);
    expect(ocupacion['2026-09-12']).toBe(0);
  });
});
