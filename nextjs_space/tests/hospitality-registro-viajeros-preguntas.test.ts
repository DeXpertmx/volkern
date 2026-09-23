// @vitest-environment node
//
// Preguntas personalizadas del check-in — API del hotel
// (app/api/hospitality/registro-viajeros/route.ts, acciones pregunta_*).
// La regla que se vigila: la config es del hotel y NUNCA toca el XML del parte
// (por eso la baja es lógica: las respuestas ya guardadas en reservas no se
// pierden), y todo queda acotado al tenant que llama.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const __mockPrisma = vi.hoisted(() => ({
  hospitalityCheckinPregunta: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  hospitalityProperty: { updateMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));

// La ruta exige capacidad (§27) además del tenant: la sesión de prueba trae un
// rol con el permiso completo, que es el caso del Anfitrión del hotel.
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'tenant-1', moneda: 'EUR' },
    user: { id: 'user-1', role: { id: 'role-1', nombre: 'Admin', permisos: { all: true } } },
  }),
}));

vi.mock('@/lib/hospitality/registro-viajeros-service', () => ({
  ESTADO_REGISTRO: { PENDIENTE: 'pendiente', ENVIADA: 'enviada', RECHAZADA: 'rechazada' },
  ESTADOS_PROPIEDAD_REGISTRO: ['activa', 'conectada'],
  anularComunicacion: vi.fn(),
  consultarLotesPendientes: vi.fn(),
  enviarRegistroDeReserva: vi.fn(),
  enviarReservaHospedaje: vi.fn(),
  estadoRegistroViajeros: vi.fn(),
  saveMirConfig: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/hospitality/registro-viajeros/route';

function peticion(cuerpo: unknown) {
  return new NextRequest('http://localhost/api/hospitality/registro-viajeros', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Preguntas personalizadas del check-in — API de registro-viajeros', () => {
  it('pregunta_crear persiste la pregunta con opciones normalizadas (ES reutilizado en EN si falta)', async () => {
    __mockPrisma.hospitalityCheckinPregunta.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'nueva', ...data })
    );

    const res = await POST(peticion({
      accion: 'pregunta_crear',
      tipo: 'opcion',
      es: 'Hora estimada de llegada',
      opcionesEs: ['Mañana', ' Mañana ', 'Tarde', ''],
      requerida: true,
    }));
    const data = await res.json();

    expect(data.ok).toBe(true);
    const datos = __mockPrisma.hospitalityCheckinPregunta.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({
      tenantId: 'tenant-1',
      tipo: 'opcion',
      es: 'Hora estimada de llegada',
      en: 'Hora estimada de llegada',
      requerida: true,
    });
    // Deduplicadas, sin vacíos, y el objeto de opciones con las dos claves.
    expect(datos.opciones).toEqual({ es: ['Mañana', 'Tarde'], en: ['Mañana', 'Tarde'] });
  });

  it('pregunta_crear rechaza una pregunta sin texto y una de opción sin opciones', async () => {
    const sinTexto = await POST(peticion({ accion: 'pregunta_crear', es: '   ' }));
    expect(sinTexto.status).toBe(400);

    const sinOpciones = await POST(peticion({ accion: 'pregunta_crear', tipo: 'opcion', es: '¿Cómo?', opcionesEs: [] }));
    expect(sinOpciones.status).toBe(400);
    expect(__mockPrisma.hospitalityCheckinPregunta.create).not.toHaveBeenCalled();
  });

  it('pregunta_crear con tipo desconocido cae a «texto», no rechaza', async () => {
    __mockPrisma.hospitalityCheckinPregunta.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'nueva', ...data })
    );

    await POST(peticion({ accion: 'pregunta_crear', tipo: 'xlsx', es: 'Matrícula' }));
    const datos = __mockPrisma.hospitalityCheckinPregunta.create.mock.calls[0][0].data;
    expect(datos.tipo).toBe('texto');
  });

  it('pregunta_actualizar solo toca preguntas del propio tenant (404 si es ajena)', async () => {
    __mockPrisma.hospitalityCheckinPregunta.findFirst.mockResolvedValue(null);

    const res = await POST(peticion({ accion: 'pregunta_actualizar', id: 'ajena', es: 'X' }));
    expect(res.status).toBe(404);
    expect(__mockPrisma.hospitalityCheckinPregunta.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ajena', tenantId: 'tenant-1' } })
    );
    expect(__mockPrisma.hospitalityCheckinPregunta.update).not.toHaveBeenCalled();
  });

  it('pregunta_eliminar es baja LÓGICA (activa=false) y acotada al tenant', async () => {
    __mockPrisma.hospitalityCheckinPregunta.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(peticion({ accion: 'pregunta_eliminar', id: 'p1' }));
    const data = await res.json();

    expect(data).toEqual({ ok: true });
    expect(__mockPrisma.hospitalityCheckinPregunta.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', tenantId: 'tenant-1' },
      data: { activa: false },
    });
  });

  it('pregunta_eliminar de un id ajeno responde ok:false sin borrar nada', async () => {
    __mockPrisma.hospitalityCheckinPregunta.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(peticion({ accion: 'pregunta_eliminar', id: 'de-otro-hotel' }));
    expect((await res.json()).ok).toBe(false);
  });

  it('las acciones de preguntas no tocan el servicio MIR ni emiten XML', async () => {
    const { enviarRegistroDeReserva } = await import('@/lib/hospitality/registro-viajeros-service');

    __mockPrisma.hospitalityCheckinPregunta.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'nueva', ...data })
    );
    await POST(peticion({ accion: 'pregunta_crear', es: 'Hora de llegada' }));

    expect(enviarRegistroDeReserva).not.toHaveBeenCalled();
  });
});
