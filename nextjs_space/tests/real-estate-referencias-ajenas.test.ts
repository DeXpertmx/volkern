/**
 * Aislamiento multitenant del módulo inmobiliario — referencias ajenas.
 *
 * Dos sitios donde un id que llega del cliente cruzaba la frontera del tenant:
 *
 *   1. Las captaciones guardan `propiedadId` / `contactoPropietarioId` del cuerpo
 *      y las relaciones se resuelven por clave foránea, sin filtro de tenant: una
 *      captación podía quedar enlazada al inmueble o al contacto de otra cuenta y
 *      la API los devolvía resueltos.
 *   2. El formulario público de contacto escribía la metadata de la propiedad a
 *      partir de un `propertyId` sin comprobar de quién era.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  catalogoItem: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  contact: { findFirst: vi.fn(), update: vi.fn() },
  captacion: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
}));

const mockGlobalPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), findMany: vi.fn() },
}));

const mockEjecutarSkill = vi.hoisted(() => vi.fn());
const mockSqlCrudo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  globalPrisma: mockGlobalPrisma,
  getTenantDb: vi.fn().mockResolvedValue({
    client: {},
    $executeRawUnsafe: mockSqlCrudo,
  }),
  dbContext: { run: vi.fn((_ctx: unknown, cb: () => unknown) => cb()) },
  getCurrentTenantId: vi.fn().mockReturnValue('t1'),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMIT_ACTIONS: { API_MINUTE: 'api_minute' },
}));

vi.mock('@/lib/skills', () => ({ executeSkill: mockEjecutarSkill }));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: { LEAD_CREATED: 'lead.created' },
}));

import {
  createCaptacion,
  serializeCaptacion,
  ReferenciaAjenaError,
} from '@/lib/real-estate/captacion-helpers';
import { POST as ContactoPOST } from '@/app/api/public/real-estate/contact/route';

const ALTA = { tipoCaptacion: 'exclusiva' as const, fechaInicio: '2026-01-01', fechaFin: '2026-12-31' };

function captacionCreada(extra: Record<string, unknown> = {}) {
  return {
    id: 'cap-1',
    tenantId: 't1',
    creadoPor: 'u1',
    propiedadId: null,
    contactoPropietarioId: null,
    tipoCaptacion: 'exclusiva',
    estado: 'borrador',
    esExclusiva: true,
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    fechaFirma: null,
    fechaVencimiento: null,
    clausulasExclusividad: null,
    precioOferta: null,
    precioMinimo: null,
    comisionPorcentaje: null,
    comisionFija: null,
    comisionMoneda: 'EUR',
    comisionCondiciones: null,
    comisionNotas: null,
    condicionesPago: null,
    documentoUrl: null,
    documentoHash: null,
    notasCliente: null,
    notasInternas: null,
    metadata: null,
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
    propiedad: null,
    contactoPropietario: null,
    creador: null,
    ...extra,
  };
}

// ─── Captaciones: relaciones que no son de la cuenta ─────────────────────────

describe('captaciones — pertenencia de las relaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.captacion.create.mockResolvedValue(captacionCreada());
  });

  it('rechaza una propiedad de otra cuenta y no crea nada', async () => {
    mockPrisma.catalogoItem.findFirst.mockResolvedValue(null);

    await expect(
      createCaptacion('t1', 'u1', { ...ALTA, propiedadId: 'prop-de-otra-cuenta' }),
    ).rejects.toThrow(ReferenciaAjenaError);

    expect(mockPrisma.catalogoItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop-de-otra-cuenta', tenantId: 't1', tipo: 'inmueble' },
      }),
    );
    expect(mockPrisma.captacion.create).not.toHaveBeenCalled();
  });

  it('rechaza un contacto de otra cuenta', async () => {
    mockPrisma.catalogoItem.findFirst.mockResolvedValue({ id: 'prop-1' });
    mockPrisma.contact.findFirst.mockResolvedValue(null);

    await expect(
      createCaptacion('t1', 'u1', { ...ALTA, propiedadId: 'prop-1', contactoPropietarioId: 'contacto-ajeno' }),
    ).rejects.toThrow(/contacto del propietario/);

    expect(mockPrisma.captacion.create).not.toHaveBeenCalled();
  });

  it('crea la captación cuando las relaciones son de la cuenta', async () => {
    mockPrisma.catalogoItem.findFirst.mockResolvedValue({ id: 'prop-1' });
    mockPrisma.contact.findFirst.mockResolvedValue({ id: 'contacto-1' });

    const captacion = await createCaptacion('t1', 'u1', {
      ...ALTA,
      propiedadId: 'prop-1',
      contactoPropietarioId: 'contacto-1',
    });

    expect(captacion.id).toBe('cap-1');
    expect(mockPrisma.captacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 't1', propiedadId: 'prop-1' }),
      }),
    );
  });

  it('no devuelve relaciones de otra cuenta en la lectura', () => {
    const captacion = serializeCaptacion(
      captacionCreada({
        propiedad: { id: 'p', nombre: 'Ajena', precioBase: 1, moneda: 'EUR', media: null, tenantId: 'otra' },
        contactoPropietario: { id: 'c', nombre: 'Ajeno', email: 'a@a.com', telefono: null, tenantId: 'otra' },
      }) as never,
    );

    expect(captacion.propiedad).toBeNull();
    expect(captacion.contactoPropietario).toBeNull();
  });

  it('devuelve las relaciones de la propia cuenta sin exponer su tenantId', () => {
    const captacion = serializeCaptacion(
      captacionCreada({
        propiedad: { id: 'p', nombre: 'Propia', precioBase: 1, moneda: 'EUR', media: null, tenantId: 't1' },
      }) as never,
    );

    expect(captacion.propiedad).toEqual({
      id: 'p',
      nombre: 'Propia',
      precioBase: 1,
      moneda: 'EUR',
      media: null,
    });
  });
});

// ─── Formulario público de contacto ──────────────────────────────────────────

describe('POST /api/public/real-estate/contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobalPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', nombre: 'Inmobiliaria Uno' });
    mockEjecutarSkill.mockResolvedValue({ id: 'lead-1', email: 'vecino@test.com' });
  });

  function peticion(propertyId: string) {
    return new NextRequest('http://localhost/api/public/real-estate/contact', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'inmobiliaria-uno',
        propertyId,
        name: 'Vecino',
        email: 'vecino@test.com',
      }),
    });
  }

  it('no escribe en una propiedad de otra cuenta', async () => {
    mockPrisma.catalogoItem.findFirst.mockResolvedValue(null);

    const res = await ContactoPOST(peticion('prop-de-otra-cuenta'));
    expect(res.status).toBe(200);

    expect(mockPrisma.catalogoItem.updateMany).not.toHaveBeenCalled();
    expect(mockSqlCrudo).not.toHaveBeenCalled();
  });

  it('escribe solo en la propiedad de la cuenta y acota el SQL crudo por tenant', async () => {
    mockPrisma.catalogoItem.findFirst.mockResolvedValue({
      id: 'prop-1',
      nombre: 'Ático',
      metadata: { totalLeads: 3 },
    });

    const res = await ContactoPOST(peticion('prop-1'));
    expect(res.status).toBe(200);

    expect(mockPrisma.catalogoItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop-1', tenantId: 't1' },
      }),
    );

    // El SQL crudo sale siempre por la conexión global, así que el filtro tiene
    // que ir en la propia sentencia.
    const [sql, ...args] = mockSqlCrudo.mock.calls[0];
    expect(sql).toContain('"tenantId" = $2');
    expect(args).toEqual(['prop-1', 't1']);
  });
});
