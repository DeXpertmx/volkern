import { describe, it, expect } from 'vitest';
import {
  canalDeReferral,
  estaCancelada,
  huellaReserva,
  mapearHabitaciones,
  normalizarEstadoReserva,
  ventanaPorCheckIn,
} from '@/lib/hospitality/nobeds/mapa';
import type { ReservaNobeds } from '@/lib/hospitality/nobeds/tipos';

describe('NOBEDS — estado de reserva', () => {
  it('no distingue mayúsculas: en sus datos conviven Approved y approved', () => {
    expect(normalizarEstadoReserva('Approved').estado).toBe('confirmed');
    expect(normalizarEstadoReserva('approved').estado).toBe('confirmed');
    expect(normalizarEstadoReserva('CHECKED-IN').estado).toBe('checked_in');
    expect(normalizarEstadoReserva('Checked-Out').estado).toBe('checked_out');
  });

  it('traduce los 14 valores medidos sin inventar ninguno', () => {
    const esperado: Record<string, string | null> = {
      New: 'pending',
      Approved: 'confirmed',
      'Checked-In': 'checked_in',
      'Checked-Out': 'checked_out',
      Completed: 'checked_out',
      Paid: null,
      Registered: 'pending',
      PaidOTA: null,
      Debtor: null,
      PaidBank: null,
      PaidCC: null,
      Prepaid: null,
      Cancelled: 'cancelled',
    };
    for (const [crudo, estado] of Object.entries(esperado)) {
      expect(normalizarEstadoReserva(crudo).estado, crudo).toBe(estado);
    }
  });

  it('un estado de cobro NO es un estado de reserva (jamás cierra una noche)', () => {
    for (const crudo of ['Paid', 'PaidBank', 'PaidCC', 'PaidOTA', 'Prepaid', 'Debtor', 'InvalidCC']) {
      const estado = normalizarEstadoReserva(crudo);
      expect(estado.estado, crudo).toBeNull();
      expect(estado.familia, crudo).toBe('cobro');
      expect(estado.requiereRevision, crudo).toBe(true);
    }
  });

  it('Cleaned es limpieza y no afecta disponibilidad', () => {
    const estado = normalizarEstadoReserva('Cleaned');
    expect(estado.estado).toBeNull();
    expect(estado.familia).toBe('operacion');
    expect(estado.requiereRevision).toBe(false);
  });

  it('Registered viene en sus datos pero no en los 16 documentados: se marca', () => {
    const estado = normalizarEstadoReserva('Registered');
    expect(estado.estado).toBe('pending');
    expect(estado.conocido).toBe(true);
    expect(estado.requiereRevision).toBe(true);
  });

  it('un valor desconocido no se adivina', () => {
    const estado = normalizarEstadoReserva('Whatever');
    expect(estado.estado).toBeNull();
    expect(estado.familia).toBe('desconocido');
    expect(estado.conocido).toBe(false);
    expect(estado.requiereRevision).toBe(true);
    expect(estado.crudo).toBe('Whatever');
  });

  it('un estado vacío es desconocido, no confirmado', () => {
    expect(normalizarEstadoReserva('').familia).toBe('desconocido');
    expect(normalizarEstadoReserva(null).familia).toBe('desconocido');
    expect(normalizarEstadoReserva(undefined).estado).toBeNull();
  });
});

describe('NOBEDS — canal de la reserva', () => {
  it('separa su motor de reservas directas del canal directo genérico', () => {
    expect(canalDeReferral('Direct').canal).toBe('direct');
    expect(canalDeReferral('Nobeds.app').canal).toBe('nobeds.app');
    expect(canalDeReferral('Nobeds.app').canal).not.toBe('direct');
  });

  it('agrupa los valores que en el demo significan lo mismo', () => {
    expect(canalDeReferral('Direct Engine').canal).toBe('direct');
    expect(canalDeReferral('Direct step').canal).toBe('direct');
    expect(canalDeReferral('One page').canal).toBe('direct');
    expect(canalDeReferral('Booking').canal).toBe('booking.com');
    expect(canalDeReferral('Agoda.com').canal).toBe('agoda.com');
    expect(canalDeReferral('Manual').canal).toBe('manual');
  });

  it('un canal fuera de la lista se conserva en minúsculas y se marca', () => {
    const canal = canalDeReferral('Appagee');
    expect(canal.canal).toBe('appagee');
    expect(canal.conocido).toBe(false);
    expect(canalDeReferral(null).conocido).toBe(false);
    expect(canalDeReferral(null).canal).toBe('desconocido');
  });
});

describe('NOBEDS — ventana por check-in', () => {
  const hoy = new Date(Date.UTC(2026, 9, 26, 10, 30));

  it('retrocede para ver a los huéspedes que están dentro, no por antigüedad de la reserva', () => {
    expect(ventanaPorCheckIn({ hoy, diasRetraso: 30 })).toEqual({
      desde: '2026-09-26',
      hasta: '2028-10-25',
    });
  });

  it('respeta el horizonte explícito', () => {
    expect(ventanaPorCheckIn({ hoy, diasRetraso: 0, diasHorizonte: 90 })).toEqual({
      desde: '2026-10-26',
      hasta: '2027-01-24',
    });
  });

  it('rechaza un retroceso negativo en vez de calcular una ventana absurda', () => {
    expect(() => ventanaPorCheckIn({ hoy, diasRetraso: -1 })).toThrow();
    expect(() => ventanaPorCheckIn({ hoy, diasRetraso: 1, diasHorizonte: -5 })).toThrow();
  });
});

describe('NOBEDS — mapeo habitación ↔ unidad', () => {
  it('clasifica vínculos, ausencias, huérfanos y conflictos sin inventar unidades', () => {
    const mapeo = mapearHabitaciones(
      [
        { roomId: 101, titulo: 'Doble' },
        { roomId: 102, titulo: 'Suite' },
        { roomId: 103, titulo: 'Familiar' },
        { roomId: 101, titulo: 'Doble repetida' },
      ],
      [
        { unitId: 'u-1', externalUnitCode: '101' },
        { unitId: 'u-2', externalUnitCode: '103' },
        { unitId: 'u-3', externalUnitCode: '103' },
        { unitId: 'u-4', externalUnitCode: '999' },
      ]
    );

    expect(mapeo.vinculadas).toEqual([{ roomId: 101, unitId: 'u-1', titulo: 'Doble' }]);
    expect(mapeo.sinVinculo.map((h) => h.roomId)).toEqual([102]);
    expect(mapeo.conflictos).toEqual([{ roomId: 103, unitIds: ['u-2', 'u-3'] }]);
    expect(mapeo.huerfanos).toEqual([{ unitId: 'u-4', externalUnitCode: '999' }]);
    expect(mapeo.duplicados).toEqual([101]);
  });

  it('compara los códigos como texto aunque el vínculo venga numérico', () => {
    const mapeo = mapearHabitaciones(
      [{ roomId: 2531705 }],
      [{ unitId: 'u-1', externalUnitCode: ' 2531705 ' }]
    );
    expect(mapeo.vinculadas).toHaveLength(1);
    expect(mapeo.huerfanos).toHaveLength(0);
  });
});

describe('NOBEDS — huella del diferencial', () => {
  const base: ReservaNobeds = {
    orderId: '1',
    roomId: 101,
    canal: 'direct',
    canalCrudo: 'Direct',
    referenciaCanal: null,
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    noches: 2,
    nombre: 'Demo',
    email: null,
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
  };

  it('cambia con updated, con status o con la marca de cancelación', () => {
    const huella = huellaReserva(base);
    expect(huellaReserva({ ...base })).toBe(huella);
    expect(huellaReserva({ ...base, actualizadaEn: '2026-10-03T10:00:00' })).not.toBe(huella);
    expect(huellaReserva({ ...base, estadoCrudo: 'Approved' })).not.toBe(huella);
    expect(huellaReserva({ ...base, canceladaEn: '2026-10-04T10:00:00' })).not.toBe(huella);
  });

  it('cancelada es el estado o la marca, nunca una suposición', () => {
    expect(estaCancelada(base)).toBe(false);
    expect(estaCancelada({ ...base, estado: 'cancelled' })).toBe(true);
    expect(estaCancelada({ ...base, canceladaEn: '2026-10-04T10:00:00' })).toBe(true);
  });
});
