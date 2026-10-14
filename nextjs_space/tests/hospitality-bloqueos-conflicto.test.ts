// La regla que impide cerrar fechas ya contratadas (módulo PURO, sin BD).
//
// Lo que se vigila aquí es la definición de «ocupada», que es la MISMA del
// motor de disponibilidad y no una segunda: una reserva cancelada o un no-show
// liberan sus noches, el día de salida no ocupa, y una salida anticipada
// devuelve las noches no usadas. Si esta regla se aflojara, el producto dejaría
// cerrar una noche que ya tiene un huésped con confirmación.

import { describe, it, expect } from 'vitest';
import {
  reservasQueChocan,
  nochesVendidas,
  choquesParaRespuesta,
  etiquetaReserva,
  mensajeConflictoBloqueo,
  nochesDeRango,
  type ReservaContratada,
} from '../lib/hospitality/bloqueos-conflicto';

/** Día local a las 15:00 (la convención de llegada de la vertical). */
const dia = (iso: string) => new Date(`${iso}T15:00:00`);

function reserva(extra: Partial<ReservaContratada> = {}): ReservaContratada {
  return {
    id: 'r1',
    estado: 'confirmed',
    // Estancia 12 → 14: ocupa las noches 12 y 13, y el día de salida es el 14.
    checkIn: dia('2026-09-12'),
    checkOut: dia('2026-09-14'),
    channel: 'booking.com',
    externalBookingId: '5084548141',
    huesped: 'Mohamed reda Bouchama',
    ...extra,
  };
}

describe('reservasQueChocan — qué cuenta como noche ocupada', () => {
  it('una estancia confirmada choca con las noches que cubre', () => {
    const chocan = reservasQueChocan([reserva()], dia('2026-09-13'), dia('2026-09-14'));
    expect(chocan.map((r) => r.id)).toEqual(['r1']);
  });

  it('la primera noche de la estancia choca igual que la última', () => {
    expect(reservasQueChocan([reserva()], dia('2026-09-12'), dia('2026-09-13'))).toHaveLength(1);
  });

  it('el día de salida NO ocupa: el bloqueo que empieza ese día está libre', () => {
    // La estancia ocupa 12 y 13; sale el 14.
    expect(reservasQueChocan([reserva()], dia('2026-09-14'), dia('2026-09-16'))).toEqual([]);
    // Y la última noche ocupada sí choca.
    expect(reservasQueChocan([reserva()], dia('2026-09-13'), dia('2026-09-14'))).toHaveLength(1);
  });

  it('cancelada y no-show liberan sus noches (la regla de producción)', () => {
    const cancelada = reserva({ id: 'r-cancel', estado: 'cancelled' });
    const noShow = reserva({ id: 'r-noshow', estado: 'no_show' });
    expect(reservasQueChocan([cancelada, noShow], dia('2026-09-12'), dia('2026-09-15'))).toEqual([]);
  });

  it('una salida anticipada libera las noches no usadas', () => {
    // Vendida 10→15, el huésped se fue el 12: ocupa 10 y 11.
    const seFueAntes = reserva({ checkIn: dia('2026-09-10'), checkOut: dia('2026-09-15'), checkOutReal: dia('2026-09-12') });
    expect(reservasQueChocan([seFueAntes], dia('2026-09-12'), dia('2026-09-15'))).toEqual([]);
    expect(reservasQueChocan([seFueAntes], dia('2026-09-11'), dia('2026-09-12'))).toHaveLength(1);
  });

  it('una estancia terminada sigue ocupando sus noches (no es lo mismo que cancelada)', () => {
    const terminada = reserva({ estado: 'checked_out' });
    expect(reservasQueChocan([terminada], dia('2026-09-12'), dia('2026-09-15'))).toHaveLength(1);
  });

  it('solo se miran las reservas que llegan: una ajena no estorba', () => {
    const chocan = reservasQueChocan(
      [reserva({ id: 'otra', checkIn: dia('2026-10-01'), checkOut: dia('2026-10-05') })],
      dia('2026-09-12'),
      dia('2026-09-15')
    );
    expect(chocan).toEqual([]);
  });

  it('un rango vacío o invertido no choca con nada (no se inventa un choque)', () => {
    expect(reservasQueChocan([reserva()], dia('2026-09-12'), dia('2026-09-12'))).toEqual([]);
    expect(reservasQueChocan([reserva()], dia('2026-09-15'), dia('2026-09-12'))).toEqual([]);
  });

  it('devuelve TODAS las reservas en conflicto, no la primera', () => {
    const otra = reserva({ id: 'r2', channel: 'Airbnb', externalBookingId: 'AB-7', huesped: 'Eva' });
    const chocan = reservasQueChocan([reserva(), otra], dia('2026-09-12'), dia('2026-09-15'));
    expect(chocan.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('nochesVendidas', () => {
  it('devuelve solo las noches del rango que están ocupadas', () => {
    // Bloqueo 10→15 con una estancia que ocupa 12 y 13.
    expect(nochesVendidas([reserva()], dia('2026-09-10'), dia('2026-09-15'))).toEqual([
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('sin choques no hay noches vendidas', () => {
    expect(nochesVendidas([], dia('2026-09-10'), dia('2026-09-15'))).toEqual([]);
  });
});

describe('nochesDeRango', () => {
  it('enumera [inicio, fin) en días locales', () => {
    expect(nochesDeRango(new Date('2026-09-30T00:00:00'), new Date('2026-10-02T00:00:00'))).toEqual([
      '2026-09-30',
      '2026-10-01',
    ]);
  });
});

describe('choquesParaRespuesta y etiquetaReserva', () => {
  it('describe la estancia completa con canal, referencia y huésped', () => {
    const [choque] = choquesParaRespuesta([reserva()], dia('2026-09-13'), dia('2026-09-14'));
    expect(choque).toMatchObject({
      id: 'r1',
      canal: 'booking.com',
      referencia: '5084548141',
      huesped: 'Mohamed reda Bouchama',
      estado: 'confirmed',
      // La estancia entera, no solo lo que pisa el bloqueo. `hasta` es el día de
      // salida, exclusivo — como `fechaFin` de un bloqueo.
      desde: '2026-09-12',
      hasta: '2026-09-14',
    });
    expect(choque.etiqueta).toBe('booking.com · 5084548141 · Mohamed reda Bouchama');
  });

  it('el nombre sale de guestData cuando no viene resuelto', () => {
    const sinNombre = reserva({
      huesped: undefined,
      guestData: { firstName: 'Ana', lastName: 'García' },
    });
    expect(etiquetaReserva(sinNombre)).toBe('booking.com · 5084548141 · Ana García');
  });

  it('sin datos de huésped, la etiqueta no miente: queda lo que hay', () => {
    expect(etiquetaReserva(reserva({ huesped: null, channel: null, externalBookingId: null }))).toBe(
      'Reserva'
    );
    expect(etiquetaReserva(reserva({ huesped: null, externalBookingId: null }))).toBe('booking.com');
  });
});

describe('mensajeConflictoBloqueo', () => {
  it('dice cuántas reservas, qué noches y qué se puede hacer', () => {
    const choques = choquesParaRespuesta([reserva()], dia('2026-09-12'), dia('2026-09-15'));
    const mensaje = mensajeConflictoBloqueo(choques, nochesVendidas([reserva()], dia('2026-09-12'), dia('2026-09-15')));
    expect(mensaje).toContain('una reserva');
    expect(mensaje).toContain('2026-09-12');
    expect(mensaje).toContain('booking.com · 5084548141 · Mohamed reda Bouchama');
    expect(mensaje).toContain('Libera o mueve esas reservas');
  });

  it('en plural lo dice en plural y recorta la lista larga', () => {
    const tres = choquesParaRespuesta(
      [
        reserva({ id: 'r1' }),
        reserva({ id: 'r2', channel: 'Airbnb', externalBookingId: 'AB-1' }),
        reserva({ id: 'r3', channel: 'Expedia', externalBookingId: 'EX-1' }),
        reserva({ id: 'r4', channel: 'Directa', externalBookingId: 'DIR-1' }),
      ],
      dia('2026-09-12'),
      dia('2026-09-15')
    );
    const mensaje = mensajeConflictoBloqueo(tres);
    expect(mensaje).toContain('4 reservas');
    expect(mensaje).toContain('y 1 más');
  });

  it('sin choques no hay mensaje (no se inventa un aviso)', () => {
    expect(mensajeConflictoBloqueo([])).toBe('');
  });
});
