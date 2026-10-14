// @vitest-environment node

/**
 * Guardia del servicio de la bandeja de mensajes del canal.
 *
 * Lo que se fija aquí es lo que un hotel no puede permitirse que se rompa:
 *  - el TENANT sale del mapping del `hotel_id`, nunca del payload entrante;
 *  - la entrega repetida del mismo `message_id` no duplica ni vuelve a contar
 *    como «sin leer»;
 *  - el eco del hotel desde la app del canal no cuenta como mensaje sin leer;
 *  - una respuesta que el canal rechaza NO se guarda como enviada.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { conectividad, prisma } = vi.hoisted(() => ({
  conectividad: { enviarMensajeCanal: vi.fn() },
  prisma: {
    connectivityMapping: { findFirst: vi.fn() },
    hospitalityReservation: { findFirst: vi.fn() },
    hospitalityCanalConversacion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    hospitalityCanalMensaje: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    hospitalityWebhookEvent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/hospitality/connectivity', () => ({
  enviarMensajeCanal: conectividad.enviarMensajeCanal,
}));

const {
  responderConversacion,
  registrarMensajeEntrante,
  listarConversaciones,
  marcarHiloLeido,
  registrarIncidenciaMensajeSinMapping,
  cerrarIncidenciasMensajeSinMapping,
  listarIncidenciasMensajeSinMapping,
} = await import('@/lib/hospitality/mensajes-service');

const payload = {
  hotel_id: '75fdbbce2e',
  channel: 'Booking.com',
  booking_id: 'BKG-9',
  conversation_id: 'CONV-1',
  message_id: 'MSG-1',
  content: '¿Podemos llegar antes?',
  sender_type: 'guest',
  time_sent: '2026-10-09 18:00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.connectivityMapping.findFirst.mockResolvedValue({ tenantId: 't1', propertyId: 'p1' });
  prisma.hospitalityReservation.findFirst.mockResolvedValue({ id: 'r1' });
  prisma.hospitalityCanalConversacion.findUnique.mockResolvedValue(null);
  prisma.hospitalityCanalConversacion.create.mockResolvedValue({
    id: 'conv-1',
    propertyId: 'p1',
  });
  prisma.hospitalityCanalConversacion.update.mockResolvedValue({ id: 'conv-1' });
  prisma.hospitalityCanalMensaje.findUnique.mockResolvedValue(null);
  prisma.hospitalityCanalMensaje.create.mockResolvedValue({ id: 'msg-1' });
  prisma.hospitalityWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
  prisma.hospitalityWebhookEvent.findFirst.mockResolvedValue(null);
  prisma.hospitalityWebhookEvent.create.mockResolvedValue({ id: 'ev-1' });
  prisma.hospitalityWebhookEvent.update.mockResolvedValue({ id: 'ev-1' });
  prisma.hospitalityWebhookEvent.findMany.mockResolvedValue([]);
  conectividad.enviarMensajeCanal.mockResolvedValue({ ok: true, httpStatus: 200, duracionMs: 5 });
});

describe('registrarMensajeEntrante', () => {
  it('rechaza un payload inválido sin tocar la base', async () => {
    const r = await registrarMensajeEntrante({ channel: 'expedia' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe('invalido');
    expect(prisma.hospitalityCanalConversacion.create).not.toHaveBeenCalled();
  });

  it('sin mapping activo no se guarda nada (el proveedor reintenta)', async () => {
    prisma.connectivityMapping.findFirst.mockResolvedValue(null);
    const r = await registrarMensajeEntrante(payload);
    expect(!r.ok && r.status).toBe('sin_mapping');
    expect(prisma.hospitalityCanalConversacion.create).not.toHaveBeenCalled();
    expect(prisma.hospitalityCanalMensaje.create).not.toHaveBeenCalled();
  });

  it('el tenant sale del mapping, no del payload', async () => {
    await registrarMensajeEntrante({ ...payload, tenantId: 'otro' });
    expect(prisma.hospitalityCanalConversacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 't1' }) })
    );
  });

  it('abre el hilo y guarda el mensaje del huésped como entrante', async () => {
    const r = await registrarMensajeEntrante(payload);
    expect(r.ok && r.estado).toBe('recibido');
    const datos = prisma.hospitalityCanalMensaje.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({
      tenantId: 't1',
      direccion: 'entrante',
      emisor: 'guest',
      estado: 'recibido',
      mensajeExternoId: 'MSG-1',
    });
    // Y suma uno sin leer.
    expect(prisma.hospitalityCanalConversacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sinLeer: { increment: 1 } } })
    );
  });

  it('reaplica el canal en minúsculas y no pisa los datos del huésped con nulls', async () => {
    prisma.hospitalityCanalConversacion.findUnique.mockResolvedValue({
      id: 'conv-1',
      propertyId: null,
      reservationId: null,
      bookingExterno: 'BKG-9',
      huespedNombre: 'Ana',
      huespedEmail: 'ana@example.com',
      huespedTelefono: null,
      ultimoMensajeEn: new Date('2026-10-09T19:00:00Z'),
    });
    await registrarMensajeEntrante({ ...payload, guest_details: undefined });
    const datos = prisma.hospitalityCanalConversacion.update.mock.calls[0][0].data;
    expect(datos.huespedNombre).toBe('Ana');
    expect(datos.huespedEmail).toBe('ana@example.com');
    // Una entrega tardía (18:00 < 19:00) no retrocede el hilo en la bandeja.
    expect(datos.ultimoMensajeEn.toISOString()).toBe('2026-10-09T19:00:00.000Z');
  });

  it('la entrega repetida del mismo message_id no duplica ni cuenta sin leer', async () => {
    prisma.hospitalityCanalMensaje.findUnique.mockResolvedValue({ id: 'msg-1' });
    const r = await registrarMensajeEntrante(payload);
    expect(r.ok && r.estado).toBe('duplicado');
    expect(prisma.hospitalityCanalMensaje.create).not.toHaveBeenCalled();
    expect(prisma.hospitalityCanalConversacion.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { sinLeer: { increment: 1 } } })
    );
  });

  it('el eco del hotel desde la app del canal entra como saliente enviado y no cuenta sin leer', async () => {
    await registrarMensajeEntrante({ ...payload, sender_type: 'property' });
    const datos = prisma.hospitalityCanalMensaje.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ direccion: 'saliente', estado: 'enviado' });
    expect(prisma.hospitalityCanalConversacion.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { sinLeer: { increment: 1 } } })
    );
  });
});

describe('listarConversaciones', () => {
  it('ordena por el último mensaje y recorta solo la vista previa', async () => {
    prisma.hospitalityCanalConversacion.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        canal: 'booking.com',
        huespedNombre: 'Ana',
        huespedEmail: null,
        huespedTelefono: null,
        propertyId: 'p1',
        property: { nombre: 'Ciudad Patio Cuarenta' },
        reservationId: null,
        bookingExterno: 'BKG-9',
        ultimoMensajeEn: new Date('2026-10-09T18:00:00Z'),
        sinLeer: 2,
        mensajes: [{ contenido: 'x'.repeat(500), direccion: 'entrante' }],
      },
    ]);

    const lista = await listarConversaciones('t1', { soloSinLeer: true, limite: 5 });

    const args = prisma.hospitalityCanalConversacion.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: 't1', sinLeer: { gt: 0 } });
    expect(args.orderBy).toEqual({ ultimoMensajeEn: 'desc' });
    expect(args.take).toBe(5);
    expect(lista[0].ultimo).toHaveLength(160);
    expect(lista[0].propiedad).toBe('Ciudad Patio Cuarenta');
    expect(lista[0].sinLeer).toBe(2);
  });

  it('un mensaje solo con adjuntos no se enseña como texto vacío', async () => {
    prisma.hospitalityCanalConversacion.findMany.mockResolvedValue([
      {
        id: 'conv-2',
        canal: 'expedia',
        huespedNombre: null,
        huespedEmail: null,
        huespedTelefono: null,
        propertyId: null,
        property: null,
        reservationId: null,
        bookingExterno: null,
        ultimoMensajeEn: new Date('2026-10-09T18:00:00Z'),
        sinLeer: 0,
        mensajes: [{ contenido: '', direccion: 'entrante' }],
      },
    ]);
    const lista = await listarConversaciones('t1');
    expect(lista[0].ultimo).toBe('(adjunto)');
    expect(lista[0].propiedad).toBeNull();
  });
});

describe('responderConversacion', () => {
  const conversacion = {
    id: 'conv-1',
    canal: 'expedia',
    hotelCode: '75fdbbce2e',
    conversacionId: 'CONV-1',
    bookingExterno: 'BKG-9',
  };

  beforeEach(() => {
    prisma.hospitalityCanalConversacion.findFirst.mockResolvedValue(conversacion);
  });

  it('una conversación de otro tenant no existe aquí', async () => {
    prisma.hospitalityCanalConversacion.findFirst.mockResolvedValue(null);
    const r = await responderConversacion('t1', 'conv-ajena', 'hola');
    expect(!r.ok && r.motivo).toBe('no_encontrada');
    expect(conectividad.enviarMensajeCanal).not.toHaveBeenCalled();
  });

  it('valida antes de llamar al canal (respuesta vacía)', async () => {
    const r = await responderConversacion('t1', 'conv-1', '   ');
    expect(!r.ok && r.motivo).toBe('invalido');
    expect(conectividad.enviarMensajeCanal).not.toHaveBeenCalled();
    expect(prisma.hospitalityCanalMensaje.create).not.toHaveBeenCalled();
  });

  it('Booking.com sin id de reserva no se manda a probar suerte', async () => {
    prisma.hospitalityCanalConversacion.findFirst.mockResolvedValue({
      ...conversacion,
      canal: 'booking.com',
      bookingExterno: null,
    });
    const r = await responderConversacion('t1', 'conv-1', 'gracias');
    expect(!r.ok && r.motivo).toBe('invalido');
    expect(conectividad.enviarMensajeCanal).not.toHaveBeenCalled();
  });

  it('una respuesta aceptada se guarda como enviada y mueve el hilo', async () => {
    const r = await responderConversacion('t1', 'conv-1', '  Claro que sí  ');
    expect(r.ok).toBe(true);
    const datos = prisma.hospitalityCanalMensaje.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ direccion: 'saliente', emisor: 'hotel', estado: 'enviado', contenido: 'Claro que sí' });
    expect(datos.error).toBeNull();
    expect(conectividad.enviarMensajeCanal).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'expedia', content: 'Claro que sí' }),
      't1'
    );
  });

  it('una respuesta rechazada por el canal queda en el hilo como error', async () => {
    conectividad.enviarMensajeCanal.mockResolvedValue({
      ok: false,
      error: 'Missing required fields: conversationId',
      httpStatus: 400,
      duracionMs: 5,
    });
    const r = await responderConversacion('t1', 'conv-1', 'gracias');
    expect(!r.ok && r.motivo).toBe('canal');
    const datos = prisma.hospitalityCanalMensaje.create.mock.calls[0][0].data;
    expect(datos.estado).toBe('error');
    expect(datos.error).toContain('Missing required fields');
    expect(!r.ok && r.mensajeId).toBe('msg-1');
  });
});

describe('marcarHiloLeido', () => {
  it('marca solo el hilo del tenant y devuelve cuántos tocó', async () => {
    prisma.hospitalityCanalConversacion.updateMany.mockResolvedValue({ count: 1 });
    const marcados = await marcarHiloLeido('t1', 'conv-1');
    expect(marcados).toBe(1);
    expect(prisma.hospitalityCanalConversacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conv-1', tenantId: 't1', sinLeer: { gt: 0 } } })
    );
  });
});

describe('incidencia de mensajes de un hotel_id sin mapping', () => {
  it('el fallo devuelve código y canal: sin ellos no hay incidencia que anotar', async () => {
    prisma.connectivityMapping.findFirst.mockResolvedValue(null);
    const r = await registrarMensajeEntrante(payload);
    expect(!r.ok && r.hotelCode).toBe('75fdbbce2e');
    expect(!r.ok && r.canal).toBe('booking.com');
  });

  it('la primera entrega abre UNA fila y NO guarda el mensaje del huésped', async () => {
    await registrarIncidenciaMensajeSinMapping({
      hotelCode: '75fdbbce2e',
      canal: 'booking.com',
      error: 'Sin mapping activo para hotelCode 75fdbbce2e',
    });
    const data = prisma.hospitalityWebhookEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'message',
      hotelCode: '75fdbbce2e',
      channel: 'booking.com',
      estado: 'sin_mapping',
      intentos: 1,
    });
    // Nada del contenido: el mensaje del huésped lleva datos personales.
    expect(data.payload).toBeUndefined();
    expect(data.ultimoIntentoEn).toBeInstanceOf(Date);
  });

  it('el reintento del proveedor refresca la fila abierta y suma un intento', async () => {
    prisma.hospitalityWebhookEvent.findFirst.mockResolvedValue({ id: 'ev-1' });
    const id = await registrarIncidenciaMensajeSinMapping({
      hotelCode: '75fdbbce2e',
      canal: 'booking.com',
      error: 'Sin mapping activo para hotelCode 75fdbbce2e',
    });
    expect(id).toBe('ev-1');
    expect(prisma.hospitalityWebhookEvent.create).not.toHaveBeenCalled();
    const data = prisma.hospitalityWebhookEvent.update.mock.calls[0][0].data;
    expect(data.intentos).toEqual({ increment: 1 });
    expect(data.ultimoIntentoEn).toBeInstanceOf(Date);
  });

  it('la primera entrega CON mapping cierra la incidencia abierta de ese código', async () => {
    prisma.hospitalityWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    await registrarMensajeEntrante(payload);
    expect(prisma.hospitalityWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: 'message', hotelCode: '75fdbbce2e', estado: 'sin_mapping' },
        data: { estado: 'procesado' },
      })
    );
  });

  it('el listado da primera/última fecha y no filtra por tenant (sin mapping no hay tenant)', async () => {
    prisma.hospitalityWebhookEvent.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        hotelCode: '75fdbbce2e',
        channel: 'expedia',
        bookingId: 'B-1',
        intentos: 40,
        ultimoIntentoEn: new Date('2026-10-09T20:00:00Z'),
        errorMensaje: 'Sin mapping activo para hotelCode 75fdbbce2e',
        fechaCreacion: new Date('2026-10-09T18:00:00Z'),
      },
      {
        id: 'ev-2',
        hotelCode: 'otro-hotel',
        channel: null,
        bookingId: null,
        intentos: 1,
        ultimoIntentoEn: null,
        errorMensaje: null,
        fechaCreacion: new Date('2026-10-08T10:00:00Z'),
      },
    ]);

    const lista = await listarIncidenciasMensajeSinMapping();

    expect(prisma.hospitalityWebhookEvent.findMany.mock.calls[0][0].where).toEqual({
      action: 'message',
      estado: 'sin_mapping',
    });
    expect(lista[0]).toMatchObject({
      hotelCode: '75fdbbce2e',
      canal: 'expedia',
      bookingExterno: 'B-1',
      intentos: 40,
    });
    expect(lista[0].ultimaFecha).toBe('2026-10-09T20:00:00.000Z');
    // Sin último intento anotado, la primera entrega es la única que hubo.
    expect(lista[1].ultimaFecha).toBe(lista[1].primeraFecha);
  });

  it('cerrar devuelve cuántas incidencias se cerraron', async () => {
    prisma.hospitalityWebhookEvent.updateMany.mockResolvedValue({ count: 3 });
    expect(await cerrarIncidenciasMensajeSinMapping('75fdbbce2e')).toBe(3);
  });
});
