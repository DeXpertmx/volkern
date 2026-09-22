// @vitest-environment node
//
// Hoja imprimible de housekeeping (lib/hospitality/housekeeping-sheet.ts +
// GET /api/hospitality/reservations/print): la lista del día para el pasillo.
// Lo que se vigila: los horarios son la convención de la vertical (15:00 /
// 11:00, una sola definición en el sistema), la limpieza sale de la unidad y
// de sus tareas (no se inventa), la urgencia de la pantalla se hereda sin
// segunda opinión, y la hoja sale por la MISMA puerta autenticada y con los
// MISMOS filtros que el listado y el CSV.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityCheckinPregunta: { findMany: vi.fn() },
  tenant: { findUnique: vi.fn() },
  authenticateRequest: vi.fn(),
  partesDeViajerosPorReserva: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityCheckinPregunta: mocks.hospitalityCheckinPregunta,
    tenant: mocks.tenant,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/hospitality/registro-viajeros-service', () => ({
  partesDeViajerosPorReserva: mocks.partesDeViajerosPorReserva,
}));

import { GET } from '@/app/api/hospitality/reservations/print/route';
import {
  construirHojaHousekeeping,
  limpiezaDeUnidad,
  ocupantesDe,
  HORA_LLEGADA,
  HORA_SALIDA,
  type ReservaParaHoja,
} from '@/lib/hospitality/housekeeping-sheet';
import {
  esPreguntaHoraLlegada,
  horaDeRespuesta,
  horaEstimadaLlegadaDe,
  type PreguntaCheckin,
} from '@/lib/hospitality/checkin-preguntas';

vi.mock('@/lib/hospitality/registro-viajeros-service', () => ({
  partesDeViajerosPorReserva: mocks.partesDeViajerosPorReserva,
}));

vi.mock('@/lib/hospitality/checkin-preguntas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/hospitality/checkin-preguntas')>();
  return { ...real };
});

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a' } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.tenant.findUnique.mockResolvedValue({ nombre: 'Hotel Volcán' });
  mocks.hospitalityCheckinPregunta.findMany.mockResolvedValue([]);
  mocks.partesDeViajerosPorReserva.mockResolvedValue(new Map());
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
});

const get = (qs: string) => GET(new Request(`http://test.local/api/hospitality/reservations/print?${qs}`));

// Reserva del día de hoy (la hoja es del día: entra siempre que hoy llegue o salga).
function reservaDelDia(sobre: Partial<Record<string, unknown>> = {}) {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  const fecha = `${yyyy}-${mm}-${dd}`;
  return {
    id: 'res_1',
    externalBookingId: 'BE-1',
    estado: 'confirmed',
    checkIn: new Date(`${fecha}T15:00:00`),
    checkOut: new Date(`${fecha}T11:00:00`),
    occupancyAdults: 2,
    occupancyChildren: 0,
    guestData: { firstName: 'Ana', lastName: 'García' },
    contact: { nombre: 'Contacto' },
    unit: { nombre: 'Suite 1', codigo: 'S1', estado: 'available', cleaningTasks: [] },
    property: { nombre: 'P' },
    ...sobre,
  } as Record<string, unknown>;
}

// ─── El módulo puro ──────────────────────────────────────────────────────────
describe('housekeeping-sheet — módulo puro', () => {
  it('los horarios son la convención de la vertical: 15:00 y 11:00', () => {
    expect(HORA_LLEGADA).toBe('15:00');
    expect(HORA_SALIDA).toBe('11:00');
  });

  it('la limpieza sale de la unidad: estado dirty o tarea viva, nunca inventada', () => {
    expect(limpiezaDeUnidad({ estado: 'dirty', cleaningTasks: [] }).pendiente).toBe(true);
    expect(
      limpiezaDeUnidad({ estado: 'cleaning', cleaningTasks: [{ estado: 'pending', notas: 'Limpieza automática tras check-out' }] }).pendiente
    ).toBe(true);
    expect(limpiezaDeUnidad({ estado: 'available', cleaningTasks: [] }).pendiente).toBe(false);
    expect(limpiezaDeUnidad(null).pendiente).toBe(false);
  });

  it('la nota es la de la tarea VIVA del sistema, tal cual (sin parafrasear)', () => {
    const notas = 'Limpieza automática tras check-out · dejar toallas extra';
    const r = limpiezaDeUnidad({ estado: 'occupied', cleaningTasks: [{ estado: 'pending', notas }] });
    expect(r.notas).toBe(notas);
    expect(limpiezaDeUnidad({ estado: 'dirty', cleaningTasks: [] }).notas).toBe('');
  });

  it('una tarea completada ya no es limpieza pendiente', () => {
    expect(
      limpiezaDeUnidad({ estado: 'available', cleaningTasks: [{ estado: 'completed', notas: 'x' }] }).pendiente
    ).toBe(false);
  });

  it('los ocupantes se leen de un vistazo («2 adultos · 1 niño»), nunca 0 adultos', () => {
    expect(ocupantesDe(2, 1)).toBe('2 adultos · 1 niño');
    expect(ocupantesDe(1, 0)).toBe('1 adulto');
    expect(ocupantesDe(0, 0)).toBe('1 adulto'); // el mínimo es 1: la unidad no se limpia sola
  });

  it('la detección de la pregunta de hora: por su texto (ES o EN), no por el id', () => {
    expect(esPreguntaHoraLlegada({ es: 'Hora estimada de llegada', en: 'Estimated arrival time' })).toBe(true);
    expect(esPreguntaHoraLlegada({ es: '¿A qué hora llegas?', en: 'Arrival time' })).toBe(true);
    expect(esPreguntaHoraLlegada({ es: 'Matrícula del coche', en: 'Car plate' })).toBe(false);
    expect(esPreguntaHoraLlegada({ es: '', en: 'Estimated arrival time' })).toBe(true);
  });

  it('la hora del huésped se normaliza desde lo que escribe de verdad', () => {
    expect(horaDeRespuesta('15:30')).toBe('15:30');
    expect(horaDeRespuesta('15h')).toBe('15:00');
    expect(horaDeRespuesta('3:30 pm')).toBe('15:30');
    expect(horaDeRespuesta('3pm')).toBe('15:00');
    expect(horaDeRespuesta('12 am')).toBe('00:00');
    expect(horaDeRespuesta('1530')).toBeNull(); // ambiguo sin separador de meridiano
    expect(horaDeRespuesta('mañana')).toBeNull();
    expect(horaDeRespuesta('')).toBeNull();
    expect(horaDeRespuesta(null)).toBeNull();
  });

  it('horaEstimadaLlegadaDe: la respuesta del huésped a ESA pregunta, y solo si es legible', () => {
    const preguntas: PreguntaCheckin[] = [
      { id: 'p_hora', tipo: 'texto', es: 'Hora estimada de llegada', en: 'Estimated arrival time', requerida: true, orden: 0 },
      { id: 'p_mascota', tipo: 'texto', es: 'Mascotas', en: 'Pets', requerida: false, orden: 1 },
    ];
    expect(horaEstimadaLlegadaDe(preguntas, { p_hora: '3:30 pm' })).toBe('15:30');
    expect(horaEstimadaLlegadaDe(preguntas, { p_hora: 'a las 17' })).toBeNull();
    expect(horaEstimadaLlegadaDe(preguntas, { p_mascota: '15:00' })).toBeNull(); // otra pregunta no vale
    expect(horaEstimadaLlegadaDe(preguntas, {})).toBeNull();
    expect(horaEstimadaLlegadaDe([], { p_hora: '15:00' })).toBeNull(); // sin pregunta no hay hora
  });

  it('la hoja: hora por sección, urgente primero y resumen con limpiezas por unidad única', () => {
    const base = { occupancyAdults: 2, occupancyChildren: 0, referencia: 'R', huesped: 'H', checkIn: '2026-09-21', checkOut: '2026-09-24', parteDetalle: '', horaEstimada: null } as const;
    const llegadas: ReservaParaHoja[] = [
      { ...base, huesped: 'Zulu', unidad: { nombre: 'B', estado: 'available', cleaningTasks: [] }, partePendiente: false },
      { ...base, huesped: 'Álvarez', unidad: { nombre: 'A', estado: 'available', cleaningTasks: [] }, partePendiente: true },
      { ...base, huesped: 'Nadie', unidad: { nombre: 'C', estado: 'dirty', cleaningTasks: [] }, partePendiente: false },
    ];
    const salidas: ReservaParaHoja[] = [
      { ...base, huesped: 'Sale', unidad: { nombre: 'A', estado: 'dirty', cleaningTasks: [{ estado: 'pending', notas: 'limpiar a fondo' }] }, partePendiente: false },
    ];

    const hoja = construirHojaHousekeeping({
      fecha: '2026-09-21',
      hotel: 'Hotel Volcán',
      generadoEl: '09:30',
      llegadas,
      salidas,
    });

    // Sin hora del huésped: la convención manda (15:00 llegan · 11:00 salen).
    expect(hoja.llegadas.every((f) => f.hora === '15:00' && !f.horaDelHuesped)).toBe(true);
    expect(hoja.salidas.every((f) => f.hora === '11:00')).toBe(true);
    // Urgente primero, orden por unidad dentro de cada grupo.
    expect(hoja.llegadas[0].unidad).toBe('A');
    expect(hoja.llegadas[0].partePendiente).toBe(true);
    // Limpiezas por unidad ÚNICA (A aparece en las dos secciones, cuenta 1).
    expect(hoja.resumen).toBe('3 llegadas · 1 salida · 2 limpiezas');
    // La nota de la salida viaja completa.
    expect(hoja.salidas[0].limpiezaNotas).toBe('limpiar a fondo');
  });

  it('con hora del huésped, la fila la dice destacada y las llegadas se ordenan por hora real', () => {
    const base = { occupancyAdults: 2, occupancyChildren: 0, referencia: 'R', huesped: 'H', checkIn: '2026-09-21', checkOut: '2026-09-24', parteDetalle: '', partePendiente: false } as const;
    const hoja = construirHojaHousekeeping({
      fecha: '2026-09-21',
      hotel: 'Hotel Volcán',
      generadoEl: '09:30',
      llegadas: [
        { ...base, huesped: 'Tarde', unidad: { nombre: 'B', estado: 'available', cleaningTasks: [] }, horaEstimada: '20:00' },
        { ...base, huesped: 'Temprano', unidad: { nombre: 'A', estado: 'available', cleaningTasks: [] }, horaEstimada: '11:30' },
        { ...base, huesped: 'Sin hora', unidad: { nombre: 'C', estado: 'available', cleaningTasks: [] }, horaEstimada: null },
      ],
      salidas: [],
    });

    // La del huésped manda en su fila (destacada)…
    expect(hoja.llegadas.map((f) => [f.huesped, f.hora, f.horaDelHuesped])).toEqual([
      ['Temprano', '11:30', true],
      ['Sin hora', '15:00', false], // la convención, en su peso normal
      ['Tarde', '20:00', true],
    ]);
  });
});

// ─── La ruta ─────────────────────────────────────────────────────────────────
describe('GET /api/hospitality/reservations/print', () => {
  it('exige sesión/api key (401 sin auth) y acota por tenant', async () => {
    mocks.authenticateRequest.mockResolvedValueOnce({ valid: false, error: 'no' });
    const sinAuth = await get('');
    expect(sinAuth.status).toBe(401);

    mocks.hospitalityReservation.findMany.mockResolvedValueOnce([reservaDelDia()]);
    await get('propertyId=p1&movimiento=llegadas');
    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant_a');
    expect(where.propertyId).toBe('p1');
  });

  it('resuelve los filtros con la MISMA whereDeFiltrosReservas (el chip va incluido)', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaDelDia()]);
    await get('movimiento=llegadas&q=ana');

    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    // La ventana del chip (día local) y la búsqueda viajan en la MISMA where
    // que usa el listado y el CSV — la hoja no inventa un segundo criterio.
    expect(where.checkIn).toBeDefined();
    expect(where.OR).toBeDefined();
    expect(where.estado).toMatchObject({ notIn: expect.any(Array) });
  });

  it('la unidad viaja con sus tareas de limpieza vivas (para las notas del papel)', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaDelDia()]);
    await get('');

    const include = mocks.hospitalityReservation.findMany.mock.calls[0][0].include;
    expect(include.unit.select.cleaningTasks).toBeDefined();
    expect(include.unit.select.cleaningTasks.where.estado.in).toEqual(['pending', 'in_progress']);
  });

  it('devuelve HTML imprimible con el hotel, las horas y la nota de limpieza', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reservaDelDia({
        unit: {
          nombre: 'Suite 1',
          codigo: 'S1',
          estado: 'dirty',
          cleaningTasks: [{ estado: 'pending', notas: 'Limpieza automática tras check-out' }],
        },
      }),
    ]);
    mocks.partesDeViajerosPorReserva.mockResolvedValueOnce(
      new Map([['res_1', { aplica: true, completo: false, comunicada: false, faltan: ['numeroDocumento'] }]])
    );

    const res = await get('');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Hotel Volcán');
    expect(html).toContain('15:00'); // hora de llegada
    expect(html).toContain('11:00'); // hora de salida
    expect(html).toContain('Limpieza automática tras check-out');
    expect(html).toContain('LIMPIAR');
    expect(html).toContain('window.print');
    // La casilla de papel: una por fila (y en la cabecera), para marcar a lápiz.
    expect((html.match(/class="checkbox"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain('<input'); // es papel, no un formulario
  });

  it('la urgencia de la pantalla se hereda: parte pendiente → fila en rojo con su detalle', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaDelDia()]);
    mocks.partesDeViajerosPorReserva.mockResolvedValueOnce(
      new Map([['res_1', { aplica: true, completo: false, comunicada: false, faltan: ['numeroDocumento'] }]])
    );

    const html = await (await get('')).text();
    expect(html).toContain('fila-urgente');
    expect(html).toContain('Falta parte');
    expect(html).toContain('documento');
  });

  it('la hora que dio el huésped sale destacada; la convención, en su peso normal', async () => {
    mocks.hospitalityCheckinPregunta.findMany.mockResolvedValue([
      { id: 'p_hora', tipo: 'texto', es: 'Hora estimada de llegada', en: 'Estimated arrival time', requerida: true, activa: true, orden: 0 },
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reservaDelDia({ respuestasCheckin: { p_hora: '17:30' } }),
      reservaDelDia({ id: 'res_2', externalBookingId: 'BE-2', respuestasCheckin: {} }),
    ]);

    const html = await (await get('')).text();
    // La del huésped: destacada en negro…
    expect(html).toContain('hora-huesped">17:30</span>');
    // …y la convención para la que no respondió (peso normal, sin destacar).
    expect(html).toContain('>15:00</td>');
    // El subtítulo nombra la regla.
    expect(html).toContain('la hora en negro es la que dio el huésped');
    // La consulta de preguntas es del tenant y solo activas.
    const qWhere = mocks.hospitalityCheckinPregunta.findMany.mock.calls[0][0].where;
    expect(qWhere).toEqual({ tenantId: 'tenant_a', activa: true });
  });

  it('si la consulta de preguntas falla, la hoja sale con la convención (degradación elegante)', async () => {
    mocks.hospitalityCheckinPregunta.findMany.mockRejectedValue(new Error('BD caída'));
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaDelDia()]);

    const res = await get('');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('>15:00</td>');
    // El CSS del <style> define la clase, así que la aserción correcta es que
    // no hay NINGÚN span destacado en el cuerpo: sin respuesta no se destaca.
    expect(html).not.toContain('<span class="hora-huesped">');
  });

  it('sin reservas responde 404 razonado, como el CSV', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);
    const res = await get('');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/No hay reservas/);
  });

  it('el hotel sin nombre no rompe el encabezado', async () => {
    mocks.tenant.findUnique.mockResolvedValueOnce(null);
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaDelDia()]);
    const res = await get('');
    expect(res.status).toBe(200);
  });
});

// ─── La guardia de la pantalla ───────────────────────────────────────────────
describe('Pantalla de reservas — botón Imprimir de housekeeping', () => {
  const fuente = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/hospitality/reservas/page.tsx'),
    'utf8'
  );

  it('abre la vista imprimible por su URL con los filtros de la lista visible', () => {
    expect(fuente).toContain('/api/hospitality/reservations/print');
    expect(fuente).toContain('filtrosCsv');
  });

  it('la hoja no se construye en el cliente (el papel nace en el servidor)', () => {
    expect(fuente).not.toContain('construirHojaHousekeeping');
  });

  it('la casilla de la hoja es de papel: la imprime la ruta, no un estado de la página', () => {
    // La casilla vive en la hoja HTML (imprimible), no en la pantalla: el
    // estado de la limpieza lo cambia el sistema al completar la tarea, no
    // una casilla de navegador.
    const hoja = fs.readFileSync(
      path.join(process.cwd(), 'app/api/hospitality/reservations/print/route.ts'),
      'utf8'
    );
    expect(hoja).toContain('class="checkbox"');
  });
});
