import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    perfilFiscalCliente: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    lead: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'tenant-1', nombre: 'T', slug: 't', plan: 'growth' },
  }),
  withTenantAuth: (handler: any) => async (req: any) => handler(req, { tenant: { id: 'tenant-1' } }),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { PATCH, GET as GET_ONE } from '@/app/api/configuracion/fiscal/perfiles/[id]/route';
import { GET, POST } from '@/app/api/configuracion/fiscal/perfiles/route';
import { prisma } from '@/lib/db';

function makeReq(body: any, url = 'http://localhost/api/configuracion/fiscal/perfiles/x') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

const perfilExistente = {
  id: 'perfil-1',
  tenantId: 'tenant-1',
  leadId: 'lead-1',
  contactId: null,
  razonSocial: 'TechCorp SL',
  nif: 'B12345674',
  country: 'ES',
  tipoIdFiscal: 'CIF',
  regimenFiscal: null,
  idIntracomunitario: null,
  exentoImpuestos: false,
  motivoExencion: null,
  aplicaRetencion: false,
  idFiscalValidado: true,
  fechaValidacion: new Date('2026-01-01'),
  address: 'Calle Mayor 1',
  city: 'Madrid',
  province: 'Madrid',
  zipCode: '28001',
  fechaCreacion: new Date('2026-01-01'),
  fechaActualizacion: new Date('2026-01-01'),
};

// Payload EXACTO que envía PerfilesFiscalesTab (nombres nuevos)
const payloadFrontend = {
  leadId: 'lead-1',
  contactId: null,
  idFiscal: 'B12345674',
  tipoIdFiscal: 'CIF',
  razonSocial: 'TechCorp SL Editada',
  regimenFiscal: null,
  pais: 'ES',
  direccionFiscal: 'Calle Nueva 2',
  codigoPostalFiscal: '28002',
  ciudadFiscal: 'Madrid',
  estadoFiscal: 'Madrid',
  exentoImpuestos: false,
  idIntracomunitario: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/configuracion/fiscal/perfiles/:id', () => {
  it('mapea el payload del frontend a las columnas reales (nif/country/address/city/province/zipCode)', async () => {
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue(perfilExistente);
    (prisma.perfilFiscalCliente.update as any).mockResolvedValue(perfilExistente);

    const res = await PATCH(makeReq(payloadFrontend), { params: { id: 'perfil-1' } });
    expect(res.status).toBe(200);

    const updateCall = (prisma.perfilFiscalCliente.update as any).mock.calls[0][0];
    const data = updateCall.data;

    // Columnas REALES de la BD
    expect(data.nif).toBe('B12345674');
    expect(data.country).toBe('ES');
    expect(data.address).toBe('Calle Nueva 2');
    expect(data.city).toBe('Madrid');
    expect(data.province).toBe('Madrid');
    expect(data.zipCode).toBe('28002');
    expect(data.razonSocial).toBe('TechCorp SL Editada');

    // NUNCA debe escribir los nombres que no existen en la BD
    expect(data).not.toHaveProperty('idFiscal');
    expect(data).not.toHaveProperty('pais');
    expect(data).not.toHaveProperty('direccionFiscal');
    expect(data).not.toHaveProperty('ciudadFiscal');
    expect(data).not.toHaveProperty('estadoFiscal');
    expect(data).not.toHaveProperty('codigoPostalFiscal');
  });

  it('valida el ID fiscal solo si cambió y marca idFiscalValidado/fechaValidacion', async () => {
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue({ ...perfilExistente, nif: 'Viejo123' });
    (prisma.perfilFiscalCliente.update as any).mockResolvedValue({ ...perfilExistente, nif: 'XAXX010101000' });

    const res = await PATCH(makeReq({ ...payloadFrontend, idFiscal: 'XAXX010101000', pais: 'MX', tipoIdFiscal: 'RFC' }), {
      params: { id: 'perfil-1' },
    });
    expect(res.status).toBe(200);

    const data = (prisma.perfilFiscalCliente.update as any).mock.calls[0][0].data;
    expect(data.nif).toBe('XAXX010101000');
    expect(data.country).toBe('MX');
    expect(data.idFiscalValidado).toBe(true);
    expect(data.fechaValidacion).toBeInstanceOf(Date);
  });

  it('rechaza ID fiscal inválido con 400 sin tocar la BD', async () => {
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue({ ...perfilExistente, nif: 'Viejo123' });

    const res = await PATCH(makeReq({ ...payloadFrontend, idFiscal: '12345', pais: 'MX', tipoIdFiscal: 'RFC' }), {
      params: { id: 'perfil-1' },
    });
    expect(res.status).toBe(400);
    expect(prisma.perfilFiscalCliente.update).not.toHaveBeenCalled();
  });

  it('exige motivo de exención al marcar exento sin motivo previo (400)', async () => {
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue(perfilExistente);

    const res = await PATCH(makeReq({ ...payloadFrontend, exentoImpuestos: true }), { params: { id: 'perfil-1' } });
    expect(res.status).toBe(400);
    expect(prisma.perfilFiscalCliente.update).not.toHaveBeenCalled();
  });

  it('acepta exento con motivoExencion y lo guarda', async () => {
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue(perfilExistente);
    (prisma.perfilFiscalCliente.update as any).mockResolvedValue({ ...perfilExistente, exentoImpuestos: true, motivoExencion: 'Art. 20 Ley 37/1992' });

    const res = await PATCH(
      makeReq({ ...payloadFrontend, exentoImpuestos: true, motivoExencion: 'Art. 20 Ley 37/1992' }),
      { params: { id: 'perfil-1' } }
    );
    expect(res.status).toBe(200);
    const data = (prisma.perfilFiscalCliente.update as any).mock.calls[0][0].data;
    expect(data.exentoImpuestos).toBe(true);
    expect(data.motivoExencion).toBe('Art. 20 Ley 37/1992');
  });
});

describe('POST /api/configuracion/fiscal/perfiles', () => {
  it('crea con columnas reales y devuelve los nombres nuevos (mapper)', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: 'lead-1', tenantId: 'tenant-1' });
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue(null); // sin duplicado
    (prisma.perfilFiscalCliente.create as any).mockResolvedValue({ ...perfilExistente, id: 'perfil-2' });

    const res = await POST(makeReq({ ...payloadFrontend, razonSocial: 'Nueva SL' }));
    expect(res.status).toBe(201);

    const data = (prisma.perfilFiscalCliente.create as any).mock.calls[0][0].data;
    expect(data.nif).toBe('B12345674');
    expect(data.country).toBe('ES');
    expect(data.address).toBe('Calle Nueva 2');
    expect(data).not.toHaveProperty('pais');
    expect(data).not.toHaveProperty('idFiscal');

    const json = await res.json();
    expect(json.idFiscal).toBe('B12345674');
    expect(json.pais).toBe('ES');
    expect(json.direccionFiscal).toBe('Calle Mayor 1');
  });
});

describe('GET /api/configuracion/fiscal/perfiles', () => {
  it('expone idFiscal/pais/direccionFiscal desde las columnas reales', async () => {
    (prisma.perfilFiscalCliente.findMany as any).mockResolvedValue([perfilExistente]);

    const res = await GET(makeReq({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.perfiles[0].idFiscal).toBe('B12345674');
    expect(json.perfiles[0].pais).toBe('ES');
    expect(json.perfiles[0].direccionFiscal).toBe('Calle Mayor 1');
    expect(json.perfiles[0].ciudadFiscal).toBe('Madrid');
    expect(json.perfiles[0].estadoFiscal).toBe('Madrid');
    expect(json.perfiles[0].codigoPostalFiscal).toBe('28001');
  });
});

describe('GET /api/configuracion/fiscal/perfiles/:id', () => {
  it('expone los nombres nuevos en el detalle', async () => {
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue(perfilExistente);

    const res = await GET_ONE(makeReq({}), { params: { id: 'perfil-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idFiscal).toBe('B12345674');
    expect(json.pais).toBe('ES');
  });

  it('normaliza país nombre -> código (España -> ES) para la UI', async () => {
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue({ ...perfilExistente, country: 'España' });

    const res = await GET_ONE(makeReq({}), { params: { id: 'perfil-1' } });
    const json = await res.json();
    expect(json.pais).toBe('ES');
  });
});

describe('normalización de país en POST', () => {
  it('guarda el código aunque el frontend envíe el nombre', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({ id: 'lead-1', tenantId: 'tenant-1' });
    (prisma.perfilFiscalCliente.findFirst as any).mockResolvedValue(null);
    (prisma.perfilFiscalCliente.create as any).mockResolvedValue(perfilExistente);

    const res = await POST(makeReq({ ...payloadFrontend, pais: 'España' }));
    expect(res.status).toBe(201);
    const data = (prisma.perfilFiscalCliente.create as any).mock.calls[0][0].data;
    expect(data.country).toBe('ES');
  });
});
