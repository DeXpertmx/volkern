import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Tests de plantillas de comunicación de Hospitality (plan maestro §21):
 *   - GET/POST /api/hospitality/comunicaciones
 *   - PATCH/DELETE /api/hospitality/comunicaciones/[id]
 *   - enviar-prueba con contexto de ejemplo
 *   - renderizado de variables y disparo por evento (helper)
 */

const mockAuth = vi.hoisted(() => vi.fn());
const mockEnviarComunicacion = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  hospitalityCommunicationTemplate: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  hospitalityReservation: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));
vi.mock('@/lib/hospitality/comunicaciones', async () => {
  const actual = await vi.importActual<any>('@/lib/hospitality/comunicaciones');
  return {
    ...actual,
    enviarComunicacion: (...a: any[]) => mockEnviarComunicacion(...a),
  };
});

import { GET as GETPlantillas, POST as POSTPlantillas } from '../app/api/hospitality/comunicaciones/route';
import { PATCH as PATCHPlantilla, DELETE as DELETPlantilla } from '../app/api/hospitality/comunicaciones/[id]/route';
import { POST as POSTPrueba } from '../app/api/hospitality/comunicaciones/[id]/enviar-prueba/route';

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };

function buildReq(body?: any, url = 'https://volkern.app/api/hospitality/comunicaciones') {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

function makePlantilla(overrides: any = {}) {
  return {
    id: overrides.id || 'ct1',
    tenantId: 't1',
    evento: 'confirmacion',
    canal: 'whatsapp',
    asunto: null,
    contenido: '¡Hola {{nombre}}! Tu reserva en {{propiedad}} está confirmada.',
    activo: true,
    fechaCreacion: new Date(),
    fechaEdicion: new Date(),
    ...overrides,
  };
}

describe('GET /api/hospitality/comunicaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('requiere autenticación', async () => {
    mockAuth.mockResolvedValueOnce({ valid: false, error: 'No autorizado' });
    const res = await GETPlantillas(buildReq());
    expect(res.status).toBe(401);
  });

  it('lista plantillas del tenant con filtros', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      makePlantilla(),
      makePlantilla({ id: 'ct2', evento: 'resena', canal: 'email' }),
    ]);
    const res = await GETPlantillas(buildReq(undefined, 'https://volkern.app/api/hospitality/comunicaciones?evento=confirmacion&canal=whatsapp'));
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.total).toBe(2);
    expect(prisma.hospitalityCommunicationTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', evento: 'confirmacion', canal: 'whatsapp' }) })
    );
  });
});

describe('POST /api/hospitality/comunicaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('valida evento, canal y contenido', async () => {
    const res1 = await POSTPlantillas(buildReq({ evento: 'inexistente', canal: 'whatsapp', contenido: 'x' }));
    expect(res1.status).toBe(400);

    const res2 = await POSTPlantillas(buildReq({ evento: 'confirmacion', canal: 'telegram', contenido: 'x' }));
    expect(res2.status).toBe(400);

    const res3 = await POSTPlantillas(buildReq({ evento: 'confirmacion', canal: 'whatsapp', contenido: '' }));
    expect(res3.status).toBe(400);

    // Email sin asunto → 400
    const res4 = await POSTPlantillas(buildReq({ evento: 'confirmacion', canal: 'email', contenido: 'x' }));
    expect(res4.status).toBe(400);
  });

  it('crea una plantilla válida', async () => {
    prisma.hospitalityCommunicationTemplate.create.mockResolvedValue(makePlantilla());
    const res = await POSTPlantillas(buildReq({ evento: 'confirmacion', canal: 'whatsapp', contenido: '¡Hola {{nombre}}!' }));
    const d = await res.json();
    expect(res.status).toBe(201);
    expect(d.plantilla.id).toBe('ct1');
    expect(prisma.hospitalityCommunicationTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 't1', evento: 'confirmacion' }) })
    );
  });

  it('un email con diseño visual no necesita contenido de texto', async () => {
    prisma.hospitalityCommunicationTemplate.create.mockResolvedValue(makePlantilla({ canal: 'email' }));
    const res = await POSTPlantillas(
      buildReq({
        evento: 'confirmacion',
        canal: 'email',
        asunto: 'Tu reserva',
        contenido: '',
        diseno: {
          version: 1,
          titulo: '{{propiedad}}',
          bloques: [{ tipo: 'texto', texto: '  Hola {{nombre}}  ' }],
        },
      })
    );
    expect(res.status).toBe(201);
    const datos = prisma.hospitalityCommunicationTemplate.create.mock.calls[0][0].data;
    // El diseño entra normalizado (recortado) y el contenido queda vacío: el
    // texto del correo se genera del diseño al enviar.
    expect(datos.contenido).toBe('');
    expect(datos.diseno.bloques[0]).toEqual({ tipo: 'texto', texto: 'Hola {{nombre}}' });
  });

  it('un email sin texto y sin diseño se rechaza (saldría vacío)', async () => {
    const res = await POSTPlantillas(
      buildReq({ evento: 'confirmacion', canal: 'email', asunto: 'Tu reserva', contenido: '', diseno: null })
    );
    expect(res.status).toBe(400);
    expect(prisma.hospitalityCommunicationTemplate.create).not.toHaveBeenCalled();
  });

  it('un diseño inválido se rechaza con su motivo y no se guarda nada', async () => {
    const res = await POSTPlantillas(
      buildReq({
        evento: 'confirmacion',
        canal: 'email',
        asunto: 'Tu reserva',
        diseno: { bloques: [{ tipo: 'iframe', texto: 'x' }] },
      })
    );
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toContain('Tipo de bloque inválido');
    expect(prisma.hospitalityCommunicationTemplate.create).not.toHaveBeenCalled();
  });
});

describe('PATCH/DELETE /api/hospitality/comunicaciones/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('404 si la plantilla no pertenece al tenant', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(null);
    const res = await PATCHPlantilla(buildReq({ activo: false }, 'https://volkern.app/api/hospitality/comunicaciones/otra'), {
      params: Promise.resolve({ id: 'otra' }),
    });
    expect(res.status).toBe(404);
  });

  it('actualiza campos parciales', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(makePlantilla());
    prisma.hospitalityCommunicationTemplate.update.mockResolvedValue(makePlantilla({ activo: false }));
    const res = await PATCHPlantilla(buildReq({ activo: false }), { params: Promise.resolve({ id: 'ct1' }) });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(prisma.hospitalityCommunicationTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activo: false }) })
    );
  });

  it('email sin asunto → 400 en PATCH', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(makePlantilla({ canal: 'email', asunto: null }));
    const res = await PATCHPlantilla(buildReq({ canal: 'email' }), { params: Promise.resolve({ id: 'ct1' }) });
    expect(res.status).toBe(400);
  });

  it('guarda el diseño visual y permite borrarlo', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(
      makePlantilla({ canal: 'email', asunto: 'Tu reserva', contenido: 'Hola', diseno: null })
    );
    prisma.hospitalityCommunicationTemplate.update.mockResolvedValue(makePlantilla({ canal: 'email' }));

    const res = await PATCHPlantilla(
      buildReq({ diseno: { bloques: [{ tipo: 'boton', botonTexto: 'Ir', botonEnlace: '{{enlace_checkin}}' }] } }),
      { params: Promise.resolve({ id: 'ct1' }) }
    );
    expect(res.status).toBe(200);
    expect(prisma.hospitalityCommunicationTemplate.update.mock.calls[0][0].data.diseno.bloques[0].botonTexto).toBe('Ir');

    // Borrar el diseño de una plantilla con texto vuelve al correo de texto.
    const res2 = await PATCHPlantilla(buildReq({ diseno: null }), { params: Promise.resolve({ id: 'ct1' }) });
    expect(res2.status).toBe(200);
    expect(prisma.hospitalityCommunicationTemplate.update.mock.calls[1][0].data.diseno).toBe(Prisma.DbNull);
  });

  it('no deja una plantilla de email sin texto y sin diseño', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(
      makePlantilla({
        canal: 'email',
        asunto: 'Tu reserva',
        contenido: '',
        diseno: { version: 1, bloques: [{ tipo: 'texto', texto: 'Hola' }] },
      })
    );
    const res = await PATCHPlantilla(buildReq({ diseno: null }), { params: Promise.resolve({ id: 'ct1' }) });
    expect(res.status).toBe(400);
    expect(prisma.hospitalityCommunicationTemplate.update).not.toHaveBeenCalled();
  });

  it('elimina solo plantillas del tenant', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(makePlantilla());
    prisma.hospitalityCommunicationTemplate.delete.mockResolvedValue({});
    const res = await DELETPlantilla(buildReq(undefined, 'https://volkern.app/api/hospitality/comunicaciones/ct1'), {
      params: Promise.resolve({ id: 'ct1' }),
    });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(prisma.hospitalityCommunicationTemplate.delete).toHaveBeenCalledWith({ where: { id: 'ct1' } });
  });
});

describe('POST /api/hospitality/comunicaciones/[id]/enviar-prueba', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('valida destinatario y 404 si no existe la plantilla', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(null);
    const res = await POSTPrueba(buildReq({ destinatario: '+52 999 000 0000' }, 'https://volkern.app/api/hospitality/comunicaciones/xx/enviar-prueba'), {
      params: Promise.resolve({ id: 'xx' }),
    });
    expect(res.status).toBe(404);

    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(makePlantilla());
    const res2 = await POSTPrueba(buildReq({}, 'https://volkern.app/api/hospitality/comunicaciones/ct1/enviar-prueba'), {
      params: Promise.resolve({ id: 'ct1' }),
    });
    expect(res2.status).toBe(400);
  });

  it('usa la reserva más reciente como contexto de ejemplo', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(makePlantilla());
    prisma.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'hres_x',
      channel: 'Airbnb',
      externalBookingId: 'BK-1',
      guestData: { nombre: 'María García', email: 'maria@x.com', telefono: '+52 1' },
      checkIn: new Date('2026-10-15T00:00:00Z'),
      checkOut: new Date('2026-10-18T00:00:00Z'),
      amountAfterTax: 6900,
      currency: 'MXN',
      estado: 'confirmed',
      unit: { nombre: 'Suite Océano' },
      property: { nombre: 'Villa Mar' },
    });
    mockEnviarComunicacion.mockResolvedValue({ ok: true, canal: 'whatsapp', destinatario: '+52 999 000 0000' });

    const res = await POSTPrueba(buildReq({ destinatario: '+52 999 000 0000' }, 'https://volkern.app/api/hospitality/comunicaciones/ct1/enviar-prueba'), {
      params: Promise.resolve({ id: 'ct1' }),
    });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(d.contexto.nombre).toBe('María García');
    expect(d.contexto.noches).toBe('3');
    expect(mockEnviarComunicacion).toHaveBeenCalledWith(
      expect.objectContaining({ contenido: expect.stringContaining('María García') })
    );
  });

  it('compila el diseño visual y devuelve el HTML que se envió', async () => {
    prisma.hospitalityCommunicationTemplate.findFirst.mockResolvedValue(
      makePlantilla({
        canal: 'email',
        asunto: 'Tu reserva',
        contenido: '',
        diseno: {
          version: 1,
          cabecera: { etiqueta: 'Reserva confirmada' },
          bloques: [{ tipo: 'texto', texto: 'Hola {{nombre}}' }],
        },
      })
    );
    prisma.hospitalityReservation.findFirst.mockResolvedValue(null);
    mockEnviarComunicacion.mockResolvedValue({ ok: true, canal: 'email', destinatario: 'x@y.com' });

    const res = await POSTPrueba(
      buildReq({ destinatario: 'x@y.com' }, 'https://volkern.app/api/hospitality/comunicaciones/ct1/enviar-prueba'),
      { params: Promise.resolve({ id: 'ct1' }) }
    );
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.htmlPreview).toContain('<table');
    expect(d.htmlPreview).toContain('Hola');
    // El texto que acompaña al HTML se genera del diseño cuando no hay contenido.
    expect(d.contenidoPreview).toContain('Hola');
    expect(mockEnviarComunicacion).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('<table') })
    );
  });
});