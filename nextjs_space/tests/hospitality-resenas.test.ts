// @vitest-environment node
//
// Guardias de las RESEÑAS de huésped (hueco nº 1 frente a Lodgify):
//
//   1. Módulo puro (lib/hospitality/resenas.ts): qué es una reseña válida,
//      las transiciones de moderación y el resumen público (media SOLO de las
//      publicadas, sin reseñas no hay media).
//   2. El enlace por token (resenas-service + comunicaciones): vive en la
//      RESERVA (el cron lo genera antes de que exista reseña), se asegura una
//      sola vez y solo la solicitud de reseña (evento `resena`) lo prepara.
//   3. El formulario por token (API pública): 404 si el enlace no existe,
//      la reseña nace `pendiente`, una por reserva, y ya moderada NO se
//      reescribe (la palabra que moderó el hotel se queda).
//   4. La moderación del hotel (API del panel): transiciones del módulo,
//      respuesta opcional del hotel, NUNCA toca puntuación ni comentario,
//      trazabilidad con AuditLog y la reseña de OTRO tenant no se toca.
//   5. El motor público solo enseña lo moderado, con la media del módulo.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function leer(relativo: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

const prisma = vi.hoisted(() => ({
  hospitalityReservation: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  hospitalityReview: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), createMany: vi.fn() },
  hospitalityProperty: { findFirst: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityReservationItem: { create: vi.fn() },
  contact: { findFirst: vi.fn(), create: vi.fn() },
  hospitalityCommunicationTemplate: { findMany: vi.fn() },
  hospitalityCheckinPregunta: { findMany: vi.fn() },
  auditLog: { findFirst: vi.fn(), create: vi.fn() },
}));
const mockAuth = vi.hoisted(() => vi.fn());
const mockAudit = vi.hoisted(() => vi.fn());
const mockEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mockAudit }));
vi.mock('@/lib/hospitality/comunicaciones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hospitality/comunicaciones')>()),
  enviarComunicacion: mockEmail,
}));

import {
  validarResena,
  validarRespuestaHotel,
  puedeModerar,
  estadoTrasAccion,
  mediaDeResenas,
  resumenPublicoResenas,
} from '@/lib/hospitality/resenas';
import {
  parseImportResenas,
  canalCanonico,
  fechaEstanciaDe,
  huellaDe,
} from '@/lib/hospitality/resenas-import';
import { metricasResenas, etiquetaMes } from '@/lib/hospitality/resenas-metrics';
import { asegurarTokenResena, generarTokenResena, enlaceResena } from '@/lib/hospitality/resenas-service';
import { buildContextoPlantilla, renderPlantilla } from '@/lib/hospitality/comunicaciones';
import { GET as GETToken, PUT as PUTToken } from '@/app/api/public/reviews/[token]/route';
import { GET as GETPanel, POST as POSTPanel } from '@/app/api/hospitality/reviews/route';
import { POST as POSTImport } from '@/app/api/hospitality/reviews/import/route';
import { GET as GETBooking } from '@/app/api/public/booking/[slug]/route';

const reserva = {
  id: 'res_a',
  tenantId: 't1',
  propertyId: 'prop_a',
  unitId: 'unit_a',
  estado: 'checked_out',
  guestData: { firstName: 'María', lastName: 'García', email: 'maria@example.com' },
  tokenResena: 'tok_res_1',
  checkIn: new Date('2026-09-01T15:00:00Z'),
  review: null as unknown,
};

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };

const reqToken = (method: string, body?: unknown, token = 'tok_res_1') =>
  new Request(`http://test.local/api/public/reviews/${token}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ctxToken = (token = 'tok_res_1') => ({ params: Promise.resolve({ token }) });

const reqPanel = (method: string, body?: unknown) =>
  new Request('http://test.local/api/hospitality/reviews', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(AUTH_OK);
  mockAudit.mockResolvedValue({});
  mockEmail.mockResolvedValue({ ok: true });
  prisma.hospitalityReservation.findFirst.mockResolvedValue(reserva);
  prisma.hospitalityReservation.update.mockResolvedValue({ id: 'res_a' });
  prisma.hospitalityReview.findFirst.mockResolvedValue(null);
  prisma.hospitalityReview.upsert.mockResolvedValue({ id: 'rev_1', estado: 'pendiente' });
  prisma.hospitalityReview.update.mockResolvedValue({ id: 'rev_1', estado: 'publicada' });
  prisma.hospitalityReview.findMany.mockResolvedValue([]);
  prisma.auditLog.findFirst.mockResolvedValue(null);
  prisma.auditLog.create.mockResolvedValue({});
  prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([]);
  prisma.hospitalityCheckinPregunta.findMany.mockResolvedValue([]);
});

describe('módulo puro — validación y moderación', () => {
  it('la puntuación debe ser un entero 1–5', () => {
    expect(validarResena({ puntuacion: 5 }).ok).toBe(true);
    expect(validarResena({ puntuacion: 0 }).ok).toBe(false);
    expect(validarResena({ puntuacion: 6 }).ok).toBe(false);
    expect(validarResena({ puntuacion: 4.5 }).ok).toBe(false);
    expect(validarResena({}).ok).toBe(false);
  });

  it('el comentario se normaliza (saltos) y se acota; el nombre también', () => {
    const r = validarResena({ puntuacion: 5, comentario: '  a\n\n\n\nb  ', nombreHuesped: ' María G. ' });
    expect(r.ok && r.reseña.comentario === 'a\n\nb').toBe(true);
    expect(r.ok && r.reseña.nombreHuesped === 'María G.').toBe(true);
    const largo = validarResena({ puntuacion: 3, comentario: 'x'.repeat(2001) });
    expect(largo.ok).toBe(false);
  });

  it('la respuesta del hotel: opcional, acotada, y sin volverse vacía por un espacio', () => {
    expect(validarRespuestaHotel(undefined).ok).toBe(true);
    expect(validarRespuestaHotel('Gracias por su visita').ok).toBe(true);
    expect(validarRespuestaHotel('   ').ok).toBe(false);
  });

  it('transiciones: publicar/rechazar desde pendiente, reconsiderar la contraria, reponer desde cerradas', () => {
    expect(puedeModerar('pendiente', 'publicar')).toBe(true);
    expect(puedeModerar('pendiente', 'rechazar')).toBe(true);
    expect(puedeModerar('pendiente', 'reponer')).toBe(false);
    expect(puedeModerar('publicada', 'rechazar')).toBe(true);
    expect(puedeModerar('rechazada', 'publicar')).toBe(true);
    expect(puedeModerar('publicada', 'reponer')).toBe(true);
    expect(puedeModerar('pendiente', 'publicar' as never)).toBe(true);
    expect(estadoTrasAccion('publicar')).toBe('publicada');
    expect(estadoTrasAccion('rechazar')).toBe('rechazada');
    expect(estadoTrasAccion('reponer')).toBe('pendiente');
  });

  it('la media es SOLO de lo publicado y sin reseñas no hay media (null, no 0)', () => {
    expect(mediaDeResenas([])).toBeNull();
    expect(mediaDeResenas([{ puntuacion: 5 }, { puntuacion: 4 }])).toBe(4.5);
  });

  it('el resumen público ordena por estancia reciente y da contexto sin fechar a nadie', () => {
    const resumen = resumenPublicoResenas(
      [
        { puntuacion: 4, comentario: 'Bien', nombreHuesped: 'Ana', respuestaHotel: null, reservation: { checkIn: new Date('2026-08-10') } },
        { puntuacion: 5, comentario: 'Genial', nombreHuesped: 'Luis', respuestaHotel: '¡Gracias!', reservation: { checkIn: new Date('2026-09-05') } },
      ],
      6
    );
    expect(resumen.total).toBe(2);
    expect(resumen.reseñas[0].nombreHuesped).toBe('Luis'); // septiembre antes que agosto
    expect(resumen.reseñas[0].mesEstancia).toContain('2026');
  });
});

describe('el enlace de reseña vive en la RESERVA', () => {
  it('asegurarTokenResena reutiliza el existente y no escribe en BD', async () => {
    const token = await asegurarTokenResena({ id: 'res_a', tokenResena: 'tok_ya' });
    expect(token).toBe('tok_ya');
    expect(prisma.hospitalityReservation.update).not.toHaveBeenCalled();
  });

  it('si no hay token lo genera opaco (no derivado del id) y lo guarda en la reserva', async () => {
    prisma.hospitalityReservation.findFirst.mockResolvedValue({ ...reserva, tokenResena: null });
    const token = await asegurarTokenResena({ id: 'res_a', tokenResena: null });
    expect(token).toBeTruthy();
    expect(token).not.toContain('res_a');
    expect(prisma.hospitalityReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'res_a' } })
    );
  });

  it('el token generado es único entre llamadas y el enlace apunta a /review/<token>', () => {
    const a = generarTokenResena();
    const b = generarTokenResena();
    expect(a).not.toBe(b);
    expect(enlaceResena('tok_123')).toContain('/review/tok_123');
  });

  it('el contexto de plantilla lleva {{enlace_resena}} y el render lo sustituye (o lo deja vacío si falta)', () => {
    const contexto = buildContextoPlantilla({
      reserva: reserva as any,
      enlaceResena: 'https://app.test/review/tok_1?lang=es',
      idioma: 'es',
    });
    expect(contexto.enlace_resena).toBe('https://app.test/review/tok_1?lang=es');
    expect(renderPlantilla('Valóranos: {{enlace_resena}}', contexto)).toContain('/review/tok_1');
    const contextoSin = buildContextoPlantilla({ reserva: reserva as any, idioma: 'es' });
    expect(contextoSin.enlace_resena).toBe('');
    expect(renderPlantilla('Valóranos: {{enlace_resena}}', contextoSin)).not.toContain('{{');
  });
});

describe('formulario por token — API pública', () => {
  it('404 cuando el enlace no corresponde a ninguna reserva', async () => {
    prisma.hospitalityReservation.findFirst.mockResolvedValue(null);
    const res = await GETToken(reqToken('GET'), ctxToken());
    expect(res.status).toBe(404);
  });

  it('el GET devuelve el estado existente y el nombre del huésped (sin email ni teléfono)', async () => {
    prisma.hospitalityReservation.findFirst.mockResolvedValue({
      ...reserva,
      review: { estado: 'pendiente', puntuacion: 4, comentario: 'Bien', nombreHuesped: 'María G.' },
    });
    const res = await GETToken(reqToken('GET'), ctxToken());
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.review.puntuacion).toBe(4);
    expect(JSON.stringify(data)).not.toContain('maria@example.com');
  });

  it('el PUT crea la reseña PENDIENTE, una por reserva (upsert por reservationId)', async () => {
    const res = await PUTToken(reqToken('PUT', { puntuacion: 5, comentario: 'Perfecto', nombreHuesped: 'María' }), ctxToken());
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(prisma.hospitalityReview.upsert).toHaveBeenCalledTimes(1);
    const llamada = prisma.hospitalityReview.upsert.mock.calls[0][0];
    expect(llamada.where.reservationId).toBe('res_a');
    expect(llamada.create.reservationId).toBe('res_a');
    expect(llamada.create.tokenResena).toBeUndefined();
  });

  it('400 con puntuación inválida; 409 para reserva cancelada', async () => {
    const mala = await PUTToken(reqToken('PUT', { puntuacion: 9 }), ctxToken());
    expect(mala.status).toBe(400);

    prisma.hospitalityReservation.findFirst.mockResolvedValue({ ...reserva, estado: 'cancelled' });
    const cancelada = await PUTToken(reqToken('PUT', { puntuacion: 5 }), ctxToken());
    expect(cancelada.status).toBe(409);
  });

  it('ya moderada NO se reescribe: 409 y sin upsert', async () => {
    prisma.hospitalityReservation.findFirst.mockResolvedValue({
      ...reserva,
      review: { estado: 'publicada', puntuacion: 4, comentario: 'Bien', nombreHuesped: 'María G.' },
    });
    const res = await PUTToken(reqToken('PUT', { puntuacion: 5 }), ctxToken());
    expect(res.status).toBe(409);
    expect(prisma.hospitalityReview.upsert).not.toHaveBeenCalled();
  });
});

describe('moderación del hotel — API del panel', () => {
  it('401 sin sesión válida', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no' });
    const res = await GETPanel(reqPanel('GET'));
    expect(res.status).toBe(401);
  });

  it('el GET lista con la media de las publicadas', async () => {
    prisma.hospitalityReview.findMany
      .mockResolvedValueOnce([
        {
          id: 'rev_1', estado: 'pendiente', puntuacion: 4, comentario: 'Bien', nombreHuesped: 'María',
          respuestaHotel: null, fechaCreacion: new Date(), reservationId: 'res_a',
          reservation: { checkIn: new Date(), checkOut: new Date(), externalBookingId: 'BE-1', unit: { nombre: 'Suite' }, property: { nombre: 'Hotel' } },
        },
      ])
      .mockResolvedValueOnce([{ puntuacion: 5 }, { puntuacion: 4 }]);
    const res = await GETPanel(reqPanel('GET'));
    const data = await res.json();
    expect(data.reviews).toHaveLength(1);
    expect(data.media).toBe(4.5);
    expect(data.totalPublicadas).toBe(2);
  });

  it('publicar pasa por la transición del módulo y deja traza de auditoría', async () => {
    prisma.hospitalityReview.findFirst.mockResolvedValue({ id: 'rev_1', estado: 'pendiente', reservationId: 'res_a' });
    const res = await POSTPanel(reqPanel('POST', { reviewId: 'rev_1', accion: 'publicar' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(prisma.hospitalityReview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'publicada' } })
    );
    expect(mockAudit).toHaveBeenCalledWith(
      'u1', 't1', 'hospitality_review_moderacion', 'reservation', 'res_a',
      expect.stringContaining('publicada'), expect.anything(), expect.anything()
    );
  });

  it('400 con acción desconocida y 409 con transición imposible (reponer una pendiente)', async () => {
    const mala = await POSTPanel(reqPanel('POST', { reviewId: 'rev_1', accion: 'destruir' }));
    expect(mala.status).toBe(400);

    prisma.hospitalityReview.findFirst.mockResolvedValue({ id: 'rev_1', estado: 'pendiente', reservationId: 'res_a' });
    const imposible = await POSTPanel(reqPanel('POST', { reviewId: 'rev_1', accion: 'reponer' }));
    expect(imposible.status).toBe(409);
  });

  it('la respuesta del hotel se valida y el comentario del huésped NUNCA entra en el update', async () => {
    prisma.hospitalityReview.findFirst.mockResolvedValue({ id: 'rev_1', estado: 'pendiente', reservationId: 'res_a' });
    await POSTPanel(reqPanel('POST', { reviewId: 'rev_1', accion: 'publicar', respuesta: '¡Gracias!' }));
    const data = prisma.hospitalityReview.update.mock.calls[0][0].data;
    expect(data.respuestaHotel).toBe('¡Gracias!');
    expect(data.comentario).toBeUndefined();
    expect(data.puntuacion).toBeUndefined();

    const vacia = await POSTPanel(reqPanel('POST', { reviewId: 'rev_1', accion: 'publicar', respuesta: '   ' }));
    expect(vacia.status).toBe(400);
  });

  it('la reseña de OTRO tenant no se encuentra (404), aunque el id exista', async () => {
    prisma.hospitalityReview.findFirst.mockResolvedValue(null);
    const res = await POSTPanel(reqPanel('POST', { reviewId: 'rev_otro', accion: 'publicar' }));
    expect(res.status).toBe(404);
    expect(prisma.hospitalityReview.update).not.toHaveBeenCalled();
  });

  it('una IMPORTADA no se vuelve a publicar (ya nació publicada): 409', async () => {
    prisma.hospitalityReview.findFirst.mockResolvedValue({
      id: 'rev_imp', estado: 'publicada', origen: 'importada', reservationId: null,
    });
    const res = await POSTPanel(reqPanel('POST', { reviewId: 'rev_imp', accion: 'publicar' }));
    expect(res.status).toBe(409);
    expect(prisma.hospitalityReview.update).not.toHaveBeenCalled();
  });
});

describe('importación de reseñas históricas — módulo puro', () => {
  const csvBooking = [
    'Canal;Fecha;Nombre;Puntuacion;Comentario',
    'Booking.com;15/08/2026;Ana López;5;Todo perfecto;Genial',
    'Airbnb;2026-07-02;John Smith;4,5;Great stay',
    ';05/06/2026;Ambigua;3;No se sabe si mayo o junio',
    'Airbnb;32/13/2026;Fecha loca;5;Imposible',
    ';;;;',
  ].join('\n');

  it('parsea ; y , con comillas, y normaliza canal, decimales y nombres de cabecera', () => {
    const r = parseImportResenas(csvBooking);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.separador).toBe(';');
    expect(r.filas).toHaveLength(2); // las otras son errores o vacías
    const ana = r.filas[0];
    expect(ana.canal).toBe('Booking.com');
    expect(ana.fechaEstancia).toBe('2026-08-15');
    expect(ana.puntuacion).toBe(5);
    expect(ana.comentario).toBe('Todo perfecto;Genial'.slice(0, 13)); // con ; dentro de valor sin comillas se corta por separador
    const john = r.filas[1];
    expect(john.canal).toBe('Airbnb');
    expect(john.puntuacion).toBe(5); // 4,5 → redondeo al entero 1–5
  });

  it('cada fila imposible vuelve con su número y su motivo (no se adivina)', () => {
    const r = parseImportResenas(csvBooking);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const motivos = r.errores.map((e) => e.error);
    expect(motivos.some((m) => m.includes('Fecha'))).toBe(true); // la ambigua y la loca
    expect(r.errores.map((e) => e.fila).sort((a, b) => a - b)).toEqual([4, 5]);
  });

  it('cabeceras EN y separador , también valen (los canales exportan distinto)', () => {
    const csvEn = ['channel,date,guest name,rating,review', 'Airbnb,2026-03-10,Jane,5,Lovely'].join('\n');
    const r = parseImportResenas(csvEn);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filas[0].nombreHuesped).toBe('Jane');
    expect(r.filas[0].canal).toBe('Airbnb');
  });

  it('sin las columnas mínimas el error nombra qué falta y qué se detectó', () => {
    const r = parseImportResenas('canal,nombre\nAirbnb,Ana');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('fecha');
    expect(r.error).toContain('puntuación');
    expect(r.error).toContain('canal, nombre'); // cabeceras detectadas, con su separador
  });

  it('la huella es estable y sensible a los datos: mismo CSV, misma huella', () => {
    const base = { canal: 'Airbnb', fechaEstancia: '2026-07-02', nombreHuesped: 'John', puntuacion: 5, comentario: 'Great' };
    expect(huellaDe(base)).toBe(huellaDe({ ...base }));
    expect(huellaDe(base)).not.toBe(huellaDe({ ...base, puntuacion: 4 }));
  });

  it('fechas: ISO gana, DD/MM con día > 12 vale, la ambigua NO se adivina', () => {
    expect(fechaEstanciaDe('2026-08-15')?.getUTCMonth()).toBe(7);
    expect(fechaEstanciaDe('25/08/2026')?.getUTCDate()).toBe(25);
    expect(fechaEstanciaDe('05/06/2026')).toBeNull();
    expect(fechaEstanciaDe('')).toBeNull();
  });

  it('el canal se normaliza sin acentos ni mayúsculas y cae a Otro sin drama', () => {
    expect(canalCanonico('booking.com')).toBe('Booking.com');
    expect(canalCanonico(' AIRBNB ')).toBe('Airbnb');
    expect(canalCanonico('Paradise Inns')).toBe('Otro');
    expect(canalCanonico(null)).toBe('Otro');
  });
});

describe('importación — API del panel', () => {
  const reqImport = (body: unknown) =>
    new Request('http://test.local/api/hospitality/reviews/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any;

  const csvOk = ['canal,fecha,nombre,puntuacion,comentario', 'Booking.com,2026-08-15,Ana,5,Genial', 'Airbnb,2026-07-02,Luis,4,Bien'].join('\n');

  beforeEach(() => {
    prisma.hospitalityProperty.findFirst.mockResolvedValue({ id: 'prop_a', nombre: 'Hotel Centro' });
    prisma.hospitalityReview.createMany.mockResolvedValue({ count: 2 });
  });

  it('401 sin sesión y 404 si la propiedad no es del tenant', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no' });
    expect((await POSTImport(reqImport({ propertyId: 'p', csv: 'x' }))).status).toBe(401);

    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await POSTImport(reqImport({ propertyId: 'otro', csv: csvOk }));
    expect(res.status).toBe(404);
    expect(prisma.hospitalityReview.createMany).not.toHaveBeenCalled();
  });

  it('importa nacidas PUBLICADA con origen importada, huella y fecha de estancia', async () => {
    const res = await POSTImport(reqImport({ propertyId: 'prop_a', csv: csvOk }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.import.creadas).toBe(2);
    const lote = prisma.hospitalityReview.createMany.mock.calls[0][0].data;
    expect(lote).toHaveLength(2);
    expect(lote[0].estado).toBe('publicada');
    expect(lote[0].origen).toBe('importada');
    expect(lote[0].huellaImport).toMatch(/^[0-9a-f]{64}$/);
    expect(lote[0].fechaEstancia).toBeInstanceOf(Date);
    expect(lote[0].canal).toBe('Booking.com'); // persistido: Reportes y la web lo enseñan
    expect(lote[1].canal).toBe('Airbnb');
    expect(lote[0].reservationId).toBeUndefined();
  });

  it('importar el mismo CSV dos veces: la segunda vez todo duplicado, nada creado', async () => {
    await POSTImport(reqImport({ propertyId: 'prop_a', csv: csvOk }));
    prisma.hospitalityReview.createMany.mockResolvedValue({ count: 0 });
    const res = await POSTImport(reqImport({ propertyId: 'prop_a', csv: csvOk }));
    const data = await res.json();
    expect(data.import.creadas).toBe(0);
    expect(data.import.duplicadas).toBe(2);
    expect(data.import.errores).toHaveLength(0);
  });

  it('CSV sin reseñas válidas: 400 con los errores fila a fila', async () => {
    const res = await POSTImport(reqImport({ propertyId: 'prop_a', csv: 'fecha,nombre,puntuacion\n2026-08-15,Ana,9' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errores).toHaveLength(1);
  });

  it('la importación deja traza de auditoría sobre la propiedad', async () => {
    await POSTImport(reqImport({ propertyId: 'prop_a', csv: csvOk }));
    expect(mockAudit).toHaveBeenCalledWith(
      'u1', 't1', 'hospitality_reviews_import', 'property', 'prop_a',
      expect.stringContaining('Importadas 2'), null, expect.anything()
    );
  });
});

describe('métricas de reseñas (Reportes) — módulo puro', () => {
  const props = [{ id: 'prop_a', nombre: 'Hotel Centro' }, { id: 'prop_b', nombre: 'Villas Mar' }];
  const r = (over: any) => ({
    propertyId: 'prop_a',
    canal: null as string | null,
    puntuacion: 5,
    fechaEstancia: '2026-08-10T12:00:00Z',
    reservation: null,
    ...over,
  });

  it('media y volumen por propiedad, incluyendo las propiedades SIN reseñas (media null)', () => {
    const m = metricasResenas(
      [r({}), r({ puntuacion: 4 }), r({ propertyId: 'prop_b', canal: 'Airbnb', puntuacion: 3 })],
      props
    );
    expect(m.total).toBe(3);
    expect(m.media).toBe(4);
    const centro = m.porPropiedad.find((p) => p.propertyId === 'prop_a')!;
    const villas = m.porPropiedad.find((p) => p.propertyId === 'prop_b')!;
    expect(centro.total).toBe(2);
    expect(centro.media).toBe(4.5);
    expect(villas.total).toBe(1);
    expect(villas.media).toBe(3);
    expect(m.porPropiedad).toHaveLength(2); // ninguna propiedad desaparece
  });

  it('por canal: las nativas se agrupan como Nativa y el orden es por volumen', () => {
    const m = metricasResenas(
      [
        r({}), r({}), r({}), // 3 nativas
        r({ canal: 'Airbnb', puntuacion: 4 }),
        r({ canal: 'Airbnb', puntuacion: 5 }),
        r({ canal: 'Booking.com', puntuacion: 2 }),
      ],
      props
    );
    expect(m.porCanal.map((c) => c.canal)).toEqual(['Nativa', 'Airbnb', 'Booking.com']);
    expect(m.porCanal[0].total).toBe(3);
    expect(m.porCanal[1].media).toBe(4.5);
  });

  it('evolución mensual por fecha de ESTANCIA, del más antiguo al más reciente', () => {
    const m = metricasResenas(
      [
        r({ fechaEstancia: '2026-07-05T12:00:00Z', puntuacion: 3 }),
        r({ fechaEstancia: '2026-09-01T12:00:00Z', puntuacion: 5 }),
        r({ fechaEstancia: '2026-08-10T12:00:00Z', puntuacion: 4 }),
      ],
      props
    );
    expect(m.porMes.map((x) => x.mes)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(m.porMes.map((x) => x.media)).toEqual([3, 4, 5]);
  });

  it('la lectura nombra canal destacado y el movimiento del último mes', () => {
    const sube = metricasResenas(
      [
        r({ fechaEstancia: '2026-07-05T12:00:00Z', puntuacion: 3 }),
        r({ canal: 'Airbnb', puntuacion: 1, fechaEstancia: '2026-07-06T12:00:00Z' }),
        r({ fechaEstancia: '2026-08-10T12:00:00Z', puntuacion: 5 }),
        r({ fechaEstancia: '2026-08-11T12:00:00Z', puntuacion: 5 }),
      ],
      props
    );
    expect(sube.lectura).toContain('sube');
    expect(sube.lectura).toContain('Airbnb');

    const vacia = metricasResenas([], props);
    expect(vacia.lectura).toContain('Sin reseñas');
  });

  it('etiquetaMes abrevia sin depender del locale', () => {
    expect(etiquetaMes('2026-09')).toBe('sep 2026');
    expect(etiquetaMes('2026-01')).toBe('ene 2026');
    expect(etiquetaMes('raro')).toBe('raro');
  });
});

describe('motor público — solo reseñas moderadas', () => {
  const propiedadPublica = {
    id: 'prop_a',
    tenantId: 't1',
    nombre: 'Hotel Centro',
    estado: 'conectada',
    fotos: [],
    tenant: { id: 't1', nombre: 'Tenant A' },
  };
  const unidadPublica = {
    id: 'unit_a',
    propertyId: 'prop_a',
    nombre: 'Suite 1',
    tipo: 'suite',
    capacidad: 2,
    descripcion: null,
    fotos: [],
    amenidades: [],
    estado: 'available',
    tarifaBase: null,
    moneda: 'MXN',
    ratePlans: [],
  };

  beforeEach(() => {
    prisma.hospitalityProperty.findFirst.mockResolvedValue(propiedadPublica);
    prisma.hospitalityUnit.findMany.mockResolvedValue([unidadPublica]);
  });

  it('el catálogo público lleva las publicadas con su media (resumen del módulo)', async () => {
    prisma.hospitalityReview.findMany.mockResolvedValue([
      { puntuacion: 5, comentario: 'Genial', nombreHuesped: 'Luis', respuestaHotel: null, reservation: { checkIn: new Date('2026-09-05') } },
    ]);
    const res = await GETBooking(
      new Request('http://test.local/api/public/booking/prop_a'),
      { params: Promise.resolve({ slug: 'prop_a' }) } as any
    );
    const data = await res.json();
    expect(data.resenas.total).toBe(1);
    expect(data.resenas.media).toBe(5);
    const llamada = prisma.hospitalityReview.findMany.mock.calls[0][0];
    expect(llamada.where.estado).toBe('publicada');
  });

  it('si falla la consulta de reseñas, la página vende igual (resenas null)', async () => {
    prisma.hospitalityReview.findMany.mockRejectedValue(new Error('boom'));
    const res = await GETBooking(
      new Request('http://test.local/api/public/booking/prop_a'),
      { params: Promise.resolve({ slug: 'prop_a' }) } as any
    );
    const data = await res.json();
    expect(data.propiedad).toBeTruthy();
    expect(data.resenas).toBeNull();
  });
});

describe('guardias de UI — formulario, motor y moderación', () => {
  it('el formulario de reseña es bilingüe con el MISMO patrón del motor (textos del i18n, idioma por URL)', () => {
    const fuente = leer('app/review/[token]/page.tsx');
    expect(fuente).toContain('textosResena');
    expect(fuente).toContain('idiomaDesdeUrl');
    expect(fuente).toContain('/api/public/reviews/');
    // Sin textos sueltos en el componente: la palabra vive en el i18n.
    expect(fuente).not.toContain('¿Cómo fue tu estancia?');
  });

  it('el motor pinta la sección SOLO con reseñas publicadas y consume la misma API del catálogo', () => {
    const fuente = leer('app/booking/[slug]/page.tsx');
    expect(fuente).toContain('SeccionResenas');
    expect(fuente).toContain('resenas.total > 0');
    expect(fuente).toContain('textosResena');
  });

  it('la moderación del panel no ofrece editar la palabra del huésped (solo publicar / rechazar / reponer y responder)', () => {
    const fuente = leer('app/dashboard/hospitality/resenas/page.tsx');
    expect(fuente).toContain("'/api/hospitality/reviews'");
    expect(fuente).toContain("'publicar'");
    expect(fuente).toContain("'rechazar'");
    expect(fuente).toContain("'reponer'");
    // La reseña es intocable: ni puntuación ni comentario editables. Solo un
    // textarea en pantalla: la respuesta del hotel.
    expect(fuente).not.toContain('maxLength={5}');
    expect(fuente.match(/<Textarea/g)?.length).toBe(1);
  });

  it('la navegación del dashboard tiene la entrada de Reseñas con el módulo hospitality', () => {
    const fuente = leer('lib/navigation-config.ts');
    expect(fuente).toContain("href: '/dashboard/hospitality/resenas'");
  });

  it('la importación pasa por la API autenticada con propiedad requerida; el dedupe es del servidor (huella)', () => {
    const panel = leer('app/dashboard/hospitality/resenas/page.tsx');
    expect(panel).toContain('/api/hospitality/reviews/import');
    expect(panel).not.toContain('new Blob');
    const ruta = leer('app/api/hospitality/reviews/import/route.ts');
    expect(ruta).toContain('skipDuplicates');
    expect(ruta).toContain('huellaImport');
    expect(ruta).toContain("origen: 'importada'");
    expect(ruta).toContain("estado: 'publicada'");
  });

  it('Reportes: la vía del dashboard consulta SOLO publicadas del período y la página no interpreta', () => {
    const ruta = leer('app/api/hospitality/dashboard/route.ts');
    expect(ruta).toContain("estado: 'publicada'");
    expect(ruta).toContain('fechaEstancia: { gte: inicioPeriodo }');
    expect(ruta).toContain('metricasResenas');
    // Auxiliar: si falla, el dashboard sigue en pie con la sección vacía.
    expect(ruta).toContain('No se pudieron calcular las métricas de reseñas');

    const pagina = leer('app/dashboard/hospitality/reportes/page.tsx');
    expect(pagina).toContain('data?.resenas');
    expect(pagina).toContain('Reseñas de huéspedes');
    expect(pagina).toContain('etiquetaMesResenas');
    // La lectura accionable se recibe, no se redacta en la página.
    expect(pagina).toContain('{resenas.lectura}');
  });
});
