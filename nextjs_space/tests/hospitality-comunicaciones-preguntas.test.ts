// @vitest-environment node
//
// El recordatorio de las preguntas obligatorias del hotel en las
// comunicaciones al huésped (pre-llegada y check-in del día):
//
//   1. Módulo puro (`requeridasPendientes`): solo REQUERIDAS sin respuesta,
//      en orden de formulario, con el texto en el idioma del mensaje y
//      saneado (el texto del hotel no fabrica líneas en el mensaje).
//   2. El envío: la variable {{preguntas_pendientes}} se rellena con las
//      preguntas del tenant y las respuestas de la reserva; solo ACTIVE y
//      requeridas; si la consulta falla, el mensaje sale sin recordatorio.
//   3. La plantilla sugerida lleva la variable en los dos idiomas y el
//      mensaje nunca sale con la variable literal sin resolver.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const prisma = vi.hoisted(() => ({
  hospitalityCommunicationTemplate: { findMany: vi.fn() },
  hospitalityReservation: { findFirst: vi.fn(), update: vi.fn() },
  hospitalityCheckinPregunta: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));

import { requeridasPendientes, type PreguntaCheckin } from '@/lib/hospitality/checkin-preguntas';
import { dispararComunicacionPorEvento } from '@/lib/hospitality/comunicaciones';

function pregunta(over: Partial<PreguntaCheckin> = {}): PreguntaCheckin {
  return {
    id: 'p1',
    tipo: 'texto',
    es: 'Hora estimada de llegada',
    en: 'Estimated arrival time',
    opciones: null,
    requerida: true,
    orden: 0,
    ...over,
  };
}

describe('requeridasPendientes — módulo puro', () => {
  it('solo las REQUERIDAS sin respuesta, en orden de formulario', () => {
    const pendientes = requeridasPendientes(
      [
        pregunta({ id: 'a', es: 'Hora de llegada', requerida: true }),
        pregunta({ id: 'b', es: 'Cómo nos conociste', requerida: false }),
        pregunta({ id: 'c', es: 'Matrícula', requerida: true }),
      ],
      { c: '1234ABC' },
      'es'
    );
    expect(pendientes.map((p) => p.texto)).toEqual(['Hora de llegada']);
  });

  it('el texto va en el idioma del mensaje (en falta cae a español)', () => {
    const lista = [
      pregunta({ id: 'x', es: 'Hora de llegada', en: '' }),
      pregunta({ id: 'y', es: 'Hora', en: 'Arrival time' }),
    ];
    expect(requeridasPendientes(lista, {}, 'en').map((p) => p.texto)).toEqual([
      'Hora de llegada', // sin EN, cae al español
      'Arrival time',
    ]);
    expect(requeridasPendientes(lista, {}, 'es').map((p) => p.texto)).toEqual([
      'Hora de llegada',
      'Hora',
    ]);
  });

  it('el saneado corta saltos de línea y el delimitador de la lista', () => {
    const pendientes = requeridasPendientes(
      [pregunta({ id: 'x', es: 'Hora;\nde llegada\n\n' })],
      {},
      'es'
    );
    expect(pendientes[0].saneado).toBe('Hora, de llegada');
  });

  it('una respuesta guardada (aunque la pregunta ya no exista) no se recuerda', () => {
    const pendientes = requeridasPendientes([pregunta({ id: 'x' })], { x: 'ya respondida' }, 'es');
    expect(pendientes).toHaveLength(0);
  });

  it('respuestas ausentes o corruptas no rompen: trata como sin responder', () => {
    expect(requeridasPendientes([pregunta()], null, 'es')).toHaveLength(1);
    expect(requeridasPendientes([pregunta()], undefined, 'es')).toHaveLength(1);
  });
});

describe('la pre-llegada recuerda las preguntas obligatorias (envío real)', () => {
  const PLANTILLA = (idioma: string) => ({
    id: 'tpl',
    canal: 'email',
    asunto: 'Tu llegada',
    contenido:
      'Completa el registro: {{enlace_checkin}}\nFalta por responder: {{preguntas_pendientes}}',
    idioma,
  });
  const RESERVA = {
    id: 'r1',
    channel: 'Directa',
    externalBookingId: 'BE-123',
    estado: 'confirmed',
    checkIn: new Date('2026-10-16T15:00:00Z'),
    checkOut: new Date('2026-10-18T11:00:00Z'),
    amountAfterTax: 2400,
    currency: 'MXN',
    tokenCheckin: 'TOKEN-FIJO',
    guestData: { firstName: 'Ana', email: 'ana@mail.com', idioma: 'es' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.hospitalityReservation.update.mockReset();
    prisma.hospitalityReservation.update.mockResolvedValue({ id: 'r1' });
    prisma.hospitalityCheckinPregunta.findMany.mockResolvedValue([
      { id: 'p1', tipo: 'texto', es: 'Hora estimada de llegada', en: 'Estimated arrival time', requerida: true, activa: true, orden: 0 },
      { id: 'p2', tipo: 'texto', es: 'Cómo nos conociste', en: 'How you found us', requerida: false, activa: true, orden: 1 },
    ]);
  });

  const capturarEmail = async (): Promise<string[]> => {
    const enviados: string[] = [];
    const email = await import('@/lib/ses-email');
    vi.spyOn(email, 'sendEmail').mockImplementation(async (args: any) => {
      enviados.push(String(args.text));
      return { success: true } as any;
    });
    return enviados;
  };

  it('la pre-llegada nombra la requerida sin responder y calla la respondida', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([PLANTILLA('es')]);
    const enviados = await capturarEmail();

    // p1 respondida, p2 es opcional (la consulta solo pide requeridas):
    // la lista sale vacía y ningún nombre entra en el mensaje.
    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: { ...RESERVA, respuestasCheckin: { p1: '19:00' } },
    });

    expect(enviados[0]).not.toContain('Hora estimada de llegada');
    expect(enviados[0]).not.toContain('{{preguntas_pendientes}}');
  });

  it('con la requerida sin responder, el mensaje la nombra con su texto', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([PLANTILLA('es')]);
    const enviados = await capturarEmail();

    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: RESERVA,
    });

    expect(enviados[0]).toContain('Falta por responder: Hora estimada de llegada');
    expect(enviados[0]).not.toContain('{{preguntas_pendientes}}');
  });

  it('con todo respondido, el mensaje sale sin la lista (ni el literal de la variable)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([PLANTILLA('es')]);
    const enviados = await capturarEmail();

    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: { ...RESERVA, respuestasCheckin: { p1: '19:00', p2: 'Google' } },
    });

    expect(enviados[0]).toContain('Falta por responder: ');
    expect(enviados[0]).not.toContain('Cómo nos conociste');
    expect(enviados[0]).not.toContain('{{preguntas_pendientes}}');
  });

  it('un huésped EN recibe los nombres de las preguntas en inglés', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([PLANTILLA('en')]);
    const enviados = await capturarEmail();

    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: {
        ...RESERVA,
        guestData: { firstName: 'Ana', email: 'ana@mail.com', idioma: 'en' },
      },
    });

    expect(enviados[0]).toContain('Estimated arrival time');
    expect(enviados[0]).not.toContain('Hora estimada de llegada');
  });

  it('solo pregunta por las ACTIVAS (el formulario tampoco pregunta las desactivadas)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([PLANTILLA('es')]);
    await capturarEmail();

    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: RESERVA,
    });

    const consulta = prisma.hospitalityCheckinPregunta.findMany.mock.calls[0][0];
    expect(consulta.where).toMatchObject({ tenantId: 't1', activa: true, requerida: true });
  });

  it('si la consulta de preguntas falla, el mensaje sale igual (sin recordatorio)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([PLANTILLA('es')]);
    prisma.hospitalityCheckinPregunta.findMany.mockRejectedValueOnce(new Error('bd caída'));
    const enviados = await capturarEmail();

    const resultados = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: RESERVA,
    });

    expect(resultados[0].ok).toBe(true);
    expect(enviados[0]).toContain('Completa el registro');
    expect(enviados[0]).not.toContain('{{preguntas_pendientes}}');
  });

  it('una reserva sin token también dispara la consulta (el recordatorio no depende del enlace)', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValueOnce([PLANTILLA('es')]);
    const enviados = await capturarEmail();

    await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'pre_llegada',
      reserva: { ...RESERVA, tokenCheckin: null },
    });

    expect(prisma.hospitalityCheckinPregunta.findMany).toHaveBeenCalled();
    expect(enviados[0]).toContain('Hora estimada de llegada');
  });
});
