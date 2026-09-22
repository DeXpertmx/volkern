// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { agruparHuespedes, type HuespedReservaInput } from '../lib/hospitality/guests';

/**
 * Guardia del módulo puro de huéspedes (plan maestro §20).
 *
 * La agregación vivía dentro de la ruta de la API: sin test y con una regla
 * distinta al resto del módulo — sumaba el gasto de las reservas CANCELADAS.
 * Aquí se fija la regla: una cancelada queda en el historial pero no suma
 * estancia, noche ni gasto, y no convierte al huésped en «reciente».
 */

function reserva(overrides: Partial<HuespedReservaInput> = {}): HuespedReservaInput {
  return {
    id: 'r1',
    externalBookingId: 'BK-1',
    channel: 'Airbnb',
    estado: 'confirmed',
    checkIn: new Date(2026, 8, 1, 15, 0),
    checkOut: new Date(2026, 8, 5, 11, 0),
    amountAfterTax: 5000,
    currency: 'MXN',
    specialRequests: null,
    contactId: null,
    guestData: null,
    contact: null,
    property: { id: 'p1', nombre: 'Casa Mar' },
    unit: { id: 'u1', nombre: 'Suite Océano', codigo: 'SO-1' },
    ...overrides,
  };
}

const CONTACTO = { id: 'c1', nombre: 'María García', email: 'maria@x.com', telefono: '+52' };

describe('agruparHuespedes — identidad', () => {
  it('agrupa por contacto CRM cuando existe', () => {
    const { guests } = agruparHuespedes([
      reserva({ id: 'r1', contactId: 'c1', contact: CONTACTO }),
      reserva({ id: 'r2', contactId: 'c1', contact: CONTACTO, checkIn: new Date(2026, 7, 1, 15, 0), checkOut: new Date(2026, 7, 3, 11, 0) }),
    ]);
    expect(guests).toHaveLength(1);
    expect(guests[0].nombre).toBe('María García');
    expect(guests[0].totalEstancias).toBe(2);
    expect(guests[0].totalNoches).toBe(6); // 4 + 2
    expect(guests[0].totalGasto).toBe(10000);
    expect(guests[0].reservas).toHaveLength(2);
  });

  it('sin contacto agrupa por email, teléfono o nombre de guestData', () => {
    const { guests } = agruparHuespedes([
      reserva({ id: 'r1', guestData: { firstName: 'Ana', lastName: 'Torres', email: 'ana@x.com' } }),
      reserva({ id: 'r2', guestData: { firstName: 'Ana', lastName: 'Torres', email: 'ANA@x.com' } }),
      reserva({ id: 'r3', guestData: { nombre: 'Bruno', telefono: '555' } }),
      reserva({ id: 'r4', guestData: { nombre: 'Bruno', telefono: '555' } }),
      reserva({ id: 'r5', guestData: { nombre: 'Carla' } }),
      reserva({ id: 'r6', guestData: { nombre: 'Carla' } }),
    ]);
    expect(guests).toHaveLength(3);
    const porNombre = Object.fromEntries(guests.map((g) => [g.nombre, g]));
    expect(porNombre['Ana Torres'].email).toBe('ana@x.com'); // normaliza mayúsculas
    expect(porNombre['Bruno'].telefono).toBe('555');
    expect(porNombre['Carla'].totalEstancias).toBe(2);
  });

  it('sin ningún dato del huésped: una entrada por reserva (no se inventa identidad)', () => {
    const { guests } = agruparHuespedes([reserva({ id: 'a' }), reserva({ id: 'b' })]);
    expect(guests).toHaveLength(2);
    expect(guests.every((g) => g.nombre === 'Huésped sin datos')).toBe(true);
  });
});

describe('agruparHuespedes — la regla de producción', () => {
  it('las canceladas no suman estancia, noches ni gasto (sí quedan en el historial)', () => {
    const { guests } = agruparHuespedes([
      reserva({ id: 'viva', contactId: 'c1', contact: CONTACTO, amountAfterTax: 2000 }),
      reserva({
        id: 'cancelada',
        contactId: 'c1',
        contact: CONTACTO,
        estado: 'cancelled',
        checkIn: new Date(2026, 9, 1, 15, 0),
        checkOut: new Date(2026, 9, 10, 11, 0),
        amountAfterTax: 9999,
      }),
    ]);

    expect(guests).toHaveLength(1);
    expect(guests[0].totalEstancias).toBe(1);
    expect(guests[0].totalNoches).toBe(4);
    expect(guests[0].totalGasto).toBe(2000);
    // El historial las muestra, marcadas.
    const cancelada = guests[0].reservas.find((r) => r.id === 'cancelada')!;
    expect(cancelada.produjo).toBe(false);
    expect(cancelada.noches).toBe(9); // la reserva sí era de 9 noches: no se falsea el dato
  });

  it('un no-show no suma producción', () => {
    const { guests } = agruparHuespedes([
      reserva({ id: 'ns', contactId: 'c1', contact: CONTACTO, estado: 'no_show', amountAfterTax: 5000 }),
    ]);
    expect(guests[0].totalEstancias).toBe(0);
    expect(guests[0].totalGasto).toBe(0);
  });

  it('una cancelación futura no hace «reciente» al huésped', () => {
    const { guests } = agruparHuespedes([
      reserva({ id: 'viva', contactId: 'c1', contact: CONTACTO, checkIn: new Date(2026, 7, 1, 15, 0), checkOut: new Date(2026, 7, 3, 11, 0) }),
      reserva({ id: 'futura', contactId: 'c1', contact: CONTACTO, estado: 'cancelled', checkIn: new Date(2027, 0, 1, 15, 0), checkOut: new Date(2027, 0, 5, 11, 0) }),
    ]);
    expect(guests[0].totalEstancias).toBe(1);
    expect(guests[0].ultimaEstancia?.getFullYear()).toBe(2026);
  });

  it('un huésped con solo cancelaciones queda con totales a cero y sin última estancia', () => {
    const { guests } = agruparHuespedes([
      reserva({ id: 'c', contactId: 'c1', contact: CONTACTO, estado: 'cancelled' }),
    ]);
    expect(guests[0].totalEstancias).toBe(0);
    expect(guests[0].totalNoches).toBe(0);
    expect(guests[0].totalGasto).toBe(0);
    expect(guests[0].ultimaEstancia).toBeNull();
  });
});

describe('agruparHuespedes — búsqueda, orden y límite', () => {
  const reservas = [
    reserva({ id: 'r1', contactId: 'c1', contact: CONTACTO }),
    reserva({ id: 'r2', guestData: { firstName: 'Ana', lastName: 'Torres', email: 'ana@x.com' }, checkIn: new Date(2026, 8, 10, 15, 0), checkOut: new Date(2026, 8, 12, 11, 0) }),
  ];

  it('q filtra por nombre, email o teléfono (sin distinguir mayúsculas)', () => {
    expect(agruparHuespedes(reservas, { q: 'maría' }).guests).toHaveLength(1);
    expect(agruparHuespedes(reservas, { q: 'ANA@X' }).guests).toHaveLength(1);
    expect(agruparHuespedes(reservas, { q: '+52' }).guests).toHaveLength(1);
    expect(agruparHuespedes(reservas, { q: 'nadie' }).guests).toHaveLength(0);
  });

  it('ordena por última estancia (por defecto) o por nombre', () => {
    expect(agruparHuespedes(reservas).guests.map((g) => g.nombre)).toEqual(['Ana Torres', 'María García']);
    expect(agruparHuespedes(reservas, { order: 'nombre' }).guests.map((g) => g.nombre)).toEqual(['Ana Torres', 'María García']);
  });

  it('el límite se aplica después de ordenar y el total refleja lo devuelto', () => {
    const { guests, total } = agruparHuespedes(reservas, { limit: 1 });
    expect(guests).toHaveLength(1);
    expect(total).toBe(1);
  });
});
