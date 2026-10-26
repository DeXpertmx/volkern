import { describe, it, expect } from 'vitest';
import {
  actualizarPendientes,
  diferenciar,
  resumenDiferencial,
} from '@/lib/hospitality/nobeds/reservas';
import type { ReservaNobeds } from '@/lib/hospitality/nobeds/tipos';

function reserva(parcial: Partial<ReservaNobeds> & { orderId: string }): ReservaNobeds {
  return {
    roomId: 101,
    canal: 'booking.com',
    canalCrudo: 'Booking',
    referenciaCanal: null,
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    noches: 2,
    nombre: 'Demo Guest',
    email: 'demo@example.test',
    telefono: null,
    pais: null,
    adultos: 2,
    ninos: 0,
    bebes: 0,
    precioNoche: 100,
    total: 200,
    estadoCrudo: 'New',
    estado: 'pending',
    familiaEstado: 'reserva',
    requiereRevision: false,
    descripcionEstado: 'pending',
    canceladaEn: null,
    creadaEn: '2026-10-01T10:00:00',
    actualizadaEn: '2026-10-02T10:00:00',
    comentario: null,
    ...parcial,
  };
}

describe('NOBEDS — diferencial de reservas', () => {
  it('separa nuevas, modificadas, canceladas y sin cambios', () => {
    const previas = [
      reserva({ orderId: '1' }),
      reserva({ orderId: '2', actualizadaEn: '2026-10-02T10:00:00' }),
      reserva({ orderId: '3' }),
    ];
    const actuales = [
      reserva({ orderId: '1', actualizadaEn: '2026-10-03T10:00:00' }),
      reserva({ orderId: '2' }),
      reserva({
        orderId: '3',
        estadoCrudo: 'Cancelled',
        estado: 'cancelled',
        canceladaEn: '2026-10-04T10:00:00',
      }),
      reserva({ orderId: '4' }),
    ];

    const d = diferenciar(previas, actuales);

    expect(d.modificadas.map((r) => r.orderId)).toEqual(['1']);
    expect(d.sinCambios.map((r) => r.orderId)).toEqual(['2']);
    expect(d.canceladas.map((r) => r.orderId)).toEqual(['3']);
    expect(d.nuevas.map((r) => r.orderId)).toEqual(['4']);
    expect(d.desaparecidas).toHaveLength(0);
  });

  it('una cancelación solo se informa en el ciclo en que aparece', () => {
    const cancelada = reserva({
      orderId: '9',
      estadoCrudo: 'Cancelled',
      estado: 'cancelled',
      canceladaEn: '2026-10-04T10:00:00',
    });

    const primera = diferenciar([reserva({ orderId: '9' })], [cancelada]);
    expect(primera.canceladas).toHaveLength(1);

    const segunda = diferenciar([cancelada], [cancelada]);
    expect(segunda.canceladas).toHaveLength(0);
    expect(segunda.sinCambios).toHaveLength(1);
  });

  it('una reserva que desaparece NO se da por cancelada', () => {
    const d = diferenciar([reserva({ orderId: '7' })], []);

    expect(d.desaparecidas.map((r) => r.orderId)).toEqual(['7']);
    expect(d.canceladas).toHaveLength(0);
    expect(resumenDiferencial(d)).toEqual({
      nuevas: 0,
      modificadas: 0,
      canceladas: 0,
      desaparecidas: 1,
      sinCambios: 0,
    });
  });

  it('ignora filas sin order_id en vez de crear un fantasma', () => {
    const d = diferenciar([], [reserva({ orderId: '' }), reserva({ orderId: '5' })]);
    expect(d.nuevas.map((r) => r.orderId)).toEqual(['5']);
  });
});

describe('NOBEDS — desapariciones con confirmación', () => {
  const desaparecida = reserva({ orderId: '7', actualizadaEn: '2026-10-02T10:00:00' });

  it('la primera ausencia queda pendiente, no confirmada', () => {
    const r = actualizarPendientes({ desaparecidas: [desaparecida], pendientes: [] });
    expect(r.confirmadas).toHaveLength(0);
    expect(r.pendientes).toEqual([
      { orderId: '7', ciclos: 1, ultimaVezVista: '2026-10-02T10:00:00' },
    ]);
  });

  it('a la segunda ausencia consecutiva se confirma', () => {
    const primera = actualizarPendientes({ desaparecidas: [desaparecida], pendientes: [] });
    const segunda = actualizarPendientes({
      desaparecidas: [desaparecida],
      pendientes: primera.pendientes,
    });

    expect(segunda.confirmadas.map((r) => r.orderId)).toEqual(['7']);
    expect(segunda.pendientes).toHaveLength(0);
  });

  it('si reaparece, deja de estar pendiente y no se cancela nada', () => {
    const primera = actualizarPendientes({ desaparecidas: [desaparecida], pendientes: [] });
    // Reaparece: el llamador pasa `desaparecidas: []` en ese ciclo.
    const segunda = actualizarPendientes({ desaparecidas: [], pendientes: primera.pendientes });

    expect(segunda.confirmadas).toHaveLength(0);
    expect(segunda.pendientes).toHaveLength(0);
  });

  it('la memoria no se comparte entre reservas distintas', () => {
    const otra = reserva({ orderId: '8' });
    const primera = actualizarPendientes({ desaparecidas: [desaparecida], pendientes: [] });
    const segunda = actualizarPendientes({
      desaparecidas: [desaparecida, otra],
      pendientes: primera.pendientes,
    });

    expect(segunda.confirmadas.map((r) => r.orderId)).toEqual(['7']);
    expect(segunda.pendientes.map((p) => [p.orderId, p.ciclos])).toEqual([['8', 1]]);
  });

  it('se puede exigir más de dos ciclos, y un valor imposible se rechaza', () => {
    const uno = actualizarPendientes({
      desaparecidas: [desaparecida],
      pendientes: [],
      ciclosParaConfirmar: 3,
    });
    const dos = actualizarPendientes({
      desaparecidas: [desaparecida],
      pendientes: uno.pendientes,
      ciclosParaConfirmar: 3,
    });
    expect(dos.confirmadas).toHaveLength(0);
    expect(dos.pendientes[0].ciclos).toBe(2);

    const tres = actualizarPendientes({
      desaparecidas: [desaparecida],
      pendientes: dos.pendientes,
      ciclosParaConfirmar: 3,
    });
    expect(tres.confirmadas).toHaveLength(1);

    expect(() =>
      actualizarPendientes({ desaparecidas: [], pendientes: [], ciclosParaConfirmar: 0 })
    ).toThrow();
  });
});
