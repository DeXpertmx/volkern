import { describe, it, expect } from 'vitest';

import { buildContextoPlantilla, renderPlantilla } from '@/lib/hospitality/comunicaciones';

const RESERVA_BASE = {
  id: 'r1',
  channel: 'booking_engine',
  estado: 'confirmed',
  checkIn: '2026-10-16',
  checkOut: '2026-10-18',
  amountAfterTax: 300,
  currency: 'EUR',
  guestData: { firstName: 'Ana', email: 'ana@mail.com', idioma: 'en' },
};

describe('ubicación enriquecida — {{indicaciones}} en plantillas', () => {
  it('aparece en el idioma del mensaje cuando el hotel lo escribió', () => {
    const contexto = buildContextoPlantilla({
      reserva: RESERVA_BASE,
      idioma: 'en',
      indicaciones: 'Take the ring road and exit 12',
    });
    expect(contexto.indicaciones).toBe('Take the ring road and exit 12');
    expect(renderPlantilla('How to arrive: {{indicaciones}}', contexto)).toBe(
      'How to arrive: Take the ring road and exit 12'
    );
  });

  it('la variable desaparece del mensaje si el hotel no escribió ninguna', () => {
    const contexto = buildContextoPlantilla({
      reserva: RESERVA_BASE,
      idioma: 'en',
      indicaciones: null,
    });
    expect(contexto.indicaciones).toBe('');
    // El reemplazo sustituye por cadena vacía; sin variable en contexto
    // quedaría el literal — el contrato es vaciarla, no dejar la llave.
    expect(renderPlantilla('Arrival: {{indicaciones}}', contexto)).toBe('Arrival: ');
  });

  it('un texto en blanco se trata como sin indicaciones', () => {
    const contexto = buildContextoPlantilla({
      reserva: RESERVA_BASE,
      idioma: 'es',
      indicaciones: '   ',
    });
    expect(contexto.indicaciones).toBe('');
  });
});
