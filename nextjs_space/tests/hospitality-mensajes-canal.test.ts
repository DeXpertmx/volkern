import { describe, it, expect } from 'vitest';
import {
  MAX_MENSAJE,
  MAX_MENSAJE_ENTRANTE,
  adjuntosDe,
  canalNormalizado,
  construirRespuestaCanal,
  etiquetaCanal,
  fechaMensaje,
  normalizarMensajeEntrante,
} from '@/lib/hospitality/mensajes-canal';

// Mensajes del canal con el huésped (pieza pura): lo que ENTRA por el webhook y
// lo que SALE como respuesta. Los payloads son el ejemplo del contrato del
// proveedor (`apidocs.aiosell.com`, grupo Messages) — medido, no inventado.

const ENTRANTE = {
  hotel_id: 'sandbox-pms',
  channel: 'expedia',
  booking_id: 'EXP123456789',
  guest_details: { name: 'John Doe', phone: '+1-555-000-0000', email: 'guest@example.com' },
  conversation_id: 'CONV-000001',
  message_id: 'MSG-000001',
  attachments: [
    { filename: 'hotel_information.pdf', path: '/attachments/hotel_information.pdf', mime_type: 'application/pdf' },
  ],
  message_type: 'text',
  time_sent: '2026-01-15 12:54:00',
  content: 'Hello, how can we assist you?',
  sender_id: 'hotel_sandbox-pms',
  sender_type: 'property',
};

describe('normalizarMensajeEntrante', () => {
  it('normaliza el ejemplo del contrato con todos sus campos', () => {
    const r = normalizarMensajeEntrante(ENTRANTE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensaje.hotelCode).toBe('sandbox-pms');
    expect(r.mensaje.canal).toBe('expedia');
    expect(r.mensaje.conversacionExternaId).toBe('CONV-000001');
    expect(r.mensaje.mensajeExternoId).toBe('MSG-000001');
    expect(r.mensaje.contenido).toBe('Hello, how can we assist you?');
    expect(r.mensaje.emisor).toBe('property');
    expect(r.mensaje.esDelHotel).toBe(true);
    expect(r.mensaje.adjuntos).toHaveLength(1);
    expect(r.mensaje.adjuntos[0].mime).toBe('application/pdf');
    expect(r.mensaje.enviadoEn?.toISOString()).toBe('2026-01-15T12:54:00.000Z');
  });

  it('acepta el mensaje del huésped (sender_type distinto de property)', () => {
    const r = normalizarMensajeEntrante({ ...ENTRANTE, sender_type: 'guest', sender_id: 'GUEST-1' });
    expect(r.ok && r.mensaje.esDelHotel).toBe(false);
    expect(r.ok && r.mensaje.emisor).toBe('guest');
  });

  it('sin sender_type no se inventa: queda como guest', () => {
    const { sender_type, ...sinEmisor } = ENTRANTE;
    const r = normalizarMensajeEntrante(sinEmisor);
    expect(r.ok && r.mensaje.emisor).toBe('guest');
    expect(r.ok && r.mensaje.esDelHotel).toBe(false);
  });

  it('el huésped es opcional: un mensaje sin datos del huésped es válido', () => {
    const { guest_details, ...sinHuesped } = ENTRANTE;
    const r = normalizarMensajeEntrante(sinHuesped);
    expect(r.ok).toBe(true);
    expect(r.ok && r.mensaje.huespedEmail).toBeNull();
    expect(r.ok && r.mensaje.huespedNombre).toBeNull();
  });

  it('enumera los campos obligatorios que faltan', () => {
    const r = normalizarMensajeEntrante({ channel: 'expedia' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe(
      'Faltan campos obligatorios: hotel_id, conversation_id, message_id'
    );
  });

  it('acepta camelCase (hotelCode/conversationId/messageId) como el resto del contrato', () => {
    const r = normalizarMensajeEntrante({
      hotelCode: 'sandbox-pms',
      channel: 'Booking.com',
      conversationId: 'C1',
      messageId: 'M1',
      content: 'hola',
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.mensaje.canal).toBe('booking.com');
  });

  it('rechaza un mensaje sin contenido y sin adjuntos', () => {
    const r = normalizarMensajeEntrante({ ...ENTRANTE, content: '   ', attachments: [] });
    expect(!r.ok && r.error).toBe('El mensaje no trae contenido ni adjuntos');
  });

  it('acepta un mensaje con solo adjuntos (sin texto)', () => {
    const r = normalizarMensajeEntrante({ ...ENTRANTE, content: '' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.mensaje.contenido).toBe('');
    expect(r.ok && r.mensaje.adjuntos).toHaveLength(1);
  });

  it('rechaza un texto que pasa del límite en vez de recortarlo', () => {
    const r = normalizarMensajeEntrante({ ...ENTRANTE, content: 'x'.repeat(MAX_MENSAJE_ENTRANTE + 1) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('no se recorta, se rechaza');
  });

  it('rechaza payloads que no son un objeto', () => {
    expect(normalizarMensajeEntrante(null).ok).toBe(false);
    expect(normalizarMensajeEntrante([]).ok).toBe(false);
    expect(!normalizarMensajeEntrante('hola').ok).toBe(true);
  });

  it('no inventa la hora del huésped: una fecha ilegible queda en null', () => {
    const r = normalizarMensajeEntrante({ ...ENTRANTE, time_sent: 'ayer por la tarde' });
    expect(r.ok && r.mensaje.enviadoEn).toBeNull();
  });

  it('descarta una fecha imposible en vez de rodarla al mes siguiente', () => {
    const r = normalizarMensajeEntrante({ ...ENTRANTE, time_sent: '2026-02-31 10:00:00' });
    expect(r.ok && r.mensaje.enviadoEn).toBeNull();
  });
});

describe('adjuntosDe', () => {
  it('descarta los adjuntos sin nombre o sin ruta', () => {
    expect(adjuntosDe([{ filename: 'a.pdf' }, { path: '/x' }, { filename: 'ok.png', path: '/ok.png' }])).toEqual([
      { nombre: 'ok.png', ruta: '/ok.png', mime: null },
    ]);
  });

  it('no explota con valores que no son un array', () => {
    expect(adjuntosDe(undefined)).toEqual([]);
    expect(adjuntosDe('x')).toEqual([]);
  });

  it('corta el exceso de adjuntos (20)', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({ filename: `f${i}.pdf`, path: `/f${i}.pdf` }));
    expect(adjuntosDe(muchos)).toHaveLength(20);
  });
});

describe('etiquetaCanal / canalNormalizado', () => {
  it('nombra el canal como lo reconoce el hotel', () => {
    expect(etiquetaCanal('booking.com')).toBe('Booking.com');
    expect(etiquetaCanal('MMT')).toBe('MakeMyTrip');
  });

  it('un canal desconocido se enseña tal cual, no como «Otro»', () => {
    expect(etiquetaCanal('NuevaOta')).toBe('nuevaota');
    expect(canalNormalizado(' Expedia ')).toBe('expedia');
  });
});

describe('fechaMensaje', () => {
  it('lee el formato del contrato (UTC) y el ISO', () => {
    expect(fechaMensaje('2026-01-15 12:54:00')?.toISOString()).toBe('2026-01-15T12:54:00.000Z');
    expect(fechaMensaje('2026-01-15T12:54:00Z')?.toISOString()).toBe('2026-01-15T12:54:00.000Z');
    expect(fechaMensaje('2026-01-15 12:54')?.toISOString()).toBe('2026-01-15T12:54:00.000Z');
    expect(fechaMensaje('   ')).toBeNull();
  });
});

describe('construirRespuestaCanal', () => {
  const base = {
    canal: 'expedia',
    contenido: 'Thank you, your request has been noted.',
    hotelCode: '23320659',
    conversacionExternaId: '10672480-fbde-45d6-9cf2-d58ee3f9bc9f',
  };

  it('construye el cuerpo del contrato', () => {
    const r = construirRespuestaCanal(base);
    expect(r.ok).toBe(true);
    expect(r.ok && r.body).toEqual({
      channel: 'expedia',
      content: 'Thank you, your request has been noted.',
      hotel_code: '23320659',
      conversation_id: '10672480-fbde-45d6-9cf2-d58ee3f9bc9f',
    });
  });

  it('exige el id de reserva en Booking.com (regla del contrato)', () => {
    const r = construirRespuestaCanal({ ...base, canal: 'booking.com' });
    expect(!r.ok && r.error).toContain('exige el identificador de la reserva');
  });

  it('con el id de reserva, Booking.com viaja completo', () => {
    const r = construirRespuestaCanal({ ...base, canal: 'booking.com', bookingExterno: '12345' });
    expect(r.ok && r.body.booking_id).toBe('12345');
  });

  it('no manda un cuerpo a medias: valida hilo, propiedad y canal', () => {
    expect(!construirRespuestaCanal({ ...base, conversacionExternaId: '' }).ok).toBe(true);
    expect(!construirRespuestaCanal({ ...base, hotelCode: null }).ok).toBe(true);
    expect(!construirRespuestaCanal({ ...base, canal: '' }).ok).toBe(true);
  });

  it('rechaza la respuesta vacía y la que pasa del límite', () => {
    expect(!construirRespuestaCanal({ ...base, contenido: '   ' }).ok).toBe(true);
    const r = construirRespuestaCanal({ ...base, contenido: 'x'.repeat(MAX_MENSAJE + 1) });
    expect(!r.ok && r.error).toContain(String(MAX_MENSAJE));
  });

  it('recorta los extremos del texto que escribe el hotel', () => {
    const r = construirRespuestaCanal({ ...base, contenido: '  gracias  ' });
    expect(r.ok && r.body.content).toBe('gracias');
  });
});
