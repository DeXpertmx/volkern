import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    aseguradora: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'test-tenant-id', nombre: 'Test Tenant', slug: 'test', plan: 'growth' },
    user: { id: 'test-user-id', name: 'Test User', email: 'test@test.com' },
    authMethod: 'session',
  }),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/insurance/aseguradoras/route';
import { PATCH, DELETE } from '@/app/api/insurance/aseguradoras/[id]/route';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { MASK_PREFIX } from '@/lib/insurance/aseguradora-types';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockAseguradora = {
  id: 'aseg-1',
  tenantId: 'test-tenant-id',
  nombre: 'AXA Seguros',
  nif: 'A12345678',
  direccion: 'Calle Mayor 1, Madrid',
  telefono: '+34 910 000 000',
  email: 'info@axa.es',
  web: 'https://axa.es',
  razonSocial: 'AXA España Holding, S.A.',
  nombreComercial: 'AXA',
  codigoPostal: '28013',
  provincia: 'Madrid',
  pais: 'España',
  regimenFiscal: 'Gran Contribuyente',
  numeroRegistro: 'REG-2024-001',
  fechaVigenciaLicenciaInicio: new Date('2024-01-01T00:00:00Z'),
  fechaVigenciaLicenciaFin: new Date('2026-12-31T00:00:00Z'),
  notas: 'Cliente premium, renovación anual',
  codigoExterno: 'EXT-1',
  activa: true,
  createdAt: new Date('2025-01-15T10:00:00Z'),
  updatedAt: new Date('2025-01-15T10:00:00Z'),
  _count: { polizas: 3, productos: 5 },
};

function makeReq(url = 'http://localhost/api/insurance/aseguradoras', init?: RequestInit) {
  return new Request(url, init) as any;
}

describe('GET /api/insurance/aseguradoras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.aseguradora.findMany as any).mockResolvedValue([mockAseguradora]);
  });

  it('devuelve { aseguradoras: [...] } (fix: antes devolvía array plano y la UI leía data.aseguradoras)', async () => {
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(false);
    expect(body.aseguradoras).toHaveLength(1);
    expect(body.aseguradoras[0].nombre).toBe('AXA Seguros');
    expect(body.aseguradoras[0]._count.polizas).toBe(3);
  });

  it('filtra por tenant y ordena por nombre', async () => {
    await GET(makeReq());
    expect(prisma.aseguradora.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'test-tenant-id' },
        orderBy: { nombre: 'asc' },
      })
    );
  });

  it('aplica búsqueda incluyendo razonSocial, nombreComercial y numeroRegistro', async () => {
    await GET(makeReq('http://localhost/api/insurance/aseguradoras?search=AXA'));
    expect(prisma.aseguradora.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { razonSocial: { contains: 'AXA', mode: 'insensitive' } },
            { nombreComercial: { contains: 'AXA', mode: 'insensitive' } },
            { numeroRegistro: { contains: 'AXA', mode: 'insensitive' } },
          ]),
        }),
      })
    );
  });

  it('filtra por activa=true', async () => {
    await GET(makeReq('http://localhost/api/insurance/aseguradoras?activa=true'));
    expect(prisma.aseguradora.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ activa: true }) })
    );
  });

  it('devuelve 401 si no hay sesión válida', async () => {
    (authenticateRequest as any).mockResolvedValueOnce({ valid: false, error: 'No autorizado' });
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('devuelve 500 ante error de BD', async () => {
    (prisma.aseguradora.findMany as any).mockRejectedValueOnce(new Error('db down'));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });

  it('enmascara secretos de integración (Bloque 6) en la lista', async () => {
    (prisma.aseguradora.findMany as any).mockResolvedValueOnce([
      {
        ...mockAseguradora,
        integracionApi: {
          apiKey: 'axa_live_secret1234',
          oauth: { clientId: 'volkern-axa', clientSecret: 'super-secret' },
          endpoints: { produccion: 'https://api.axa.es' },
          formatos: ['JSON'],
        },
      },
    ]);
    const res = await GET(makeReq());
    const body = await res.json();
    const api = body.aseguradoras[0].integracionApi;
    expect(api.apiKey).toBe(`${MASK_PREFIX}1234`);
    expect(api.oauth.clientSecret).toBe(MASK_PREFIX + '••••••••');
    expect(api.oauth.clientId).toBe(`${MASK_PREFIX}-axa`); // 'volkern-axa'.slice(-4) = '-axa'
    expect(api.endpoints.produccion).toBe('https://api.axa.es'); // no se enmascara lo no-secreto
  });
});

describe('POST /api/insurance/aseguradoras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.aseguradora.findFirst as any).mockResolvedValue(null);
    (prisma.aseguradora.create as any).mockResolvedValue(mockAseguradora);
  });

  it('crea con todos los campos del Bloque 1 y 2 + notas', async () => {
    const res = await POST(
      makeReq('http://localhost/api/insurance/aseguradoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'AXA Seguros',
          nif: 'A12345678',
          razonSocial: 'AXA España Holding, S.A.',
          nombreComercial: 'AXA',
          codigoPostal: '28013',
          provincia: 'Madrid',
          pais: 'España',
          regimenFiscal: 'Gran Contribuyente',
          numeroRegistro: 'REG-2024-001',
          ramosAutorizados: ['Vida', 'Salud', 'Autos'],
          fechaVigenciaLicenciaInicio: '2024-01-01',
          fechaVigenciaLicenciaFin: '2026-12-31',
          notas: 'Cliente premium',
          activa: true,
        }),
      })
    );

    expect(res.status).toBe(201);
    expect(prisma.aseguradora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'test-tenant-id',
        razonSocial: 'AXA España Holding, S.A.',
        nombreComercial: 'AXA',
        codigoPostal: '28013',
        provincia: 'Madrid',
        pais: 'España',
        regimenFiscal: 'Gran Contribuyente',
        numeroRegistro: 'REG-2024-001',
        ramosAutorizados: ['Vida', 'Salud', 'Autos'],
        fechaVigenciaLicenciaInicio: new Date('2024-01-01T00:00:00.000Z') as any,
        fechaVigenciaLicenciaFin: expect.any(Date),
        notas: 'Cliente premium',
        activa: true,
      }),
    });
  });

  it('convierte fechas vacías a null (no rompe el create)', async () => {
    await POST(
      makeReq('http://localhost/api/insurance/aseguradoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'MAPFRE' }),
      })
    );
    expect(prisma.aseguradora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        numeroRegistro: null,
        ramosAutorizados: null,
        fechaVigenciaLicenciaInicio: null,
        fechaVigenciaLicenciaFin: null,
        notas: null,
        activa: true,
      }),
    });
  });

  it('rechaza nombre vacío', async () => {
    const res = await POST(
      makeReq('http://localhost/api/insurance/aseguradoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: '' }),
      })
    );
    expect(res.status).toBe(400);
    expect(prisma.aseguradora.create).not.toHaveBeenCalled();
  });

  it('rechaza duplicado por nombre', async () => {
    (prisma.aseguradora.findFirst as any).mockResolvedValueOnce(mockAseguradora);
    const res = await POST(
      makeReq('http://localhost/api/insurance/aseguradoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'AXA Seguros' }),
      })
    );
    expect(res.status).toBe(400);
    expect(prisma.aseguradora.create).not.toHaveBeenCalled();
  });

  it('persiste el campo notas (fix: antes se ignoraba silenciosamente)', async () => {
    await POST(
      makeReq('http://localhost/api/insurance/aseguradoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'GNP', notas: 'Acuerdo marco 2025' }),
      })
    );
    expect(prisma.aseguradora.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notas: 'Acuerdo marco 2025' }) })
    );
  });

  it('persiste los JSON tipados de los Bloques 3-6', async () => {
    const bloques = {
      representanteLegal: { nombre: 'Ana López', documento: 'DNI 123', cargo: 'CEO' },
      mesaEntradas: 'notificaciones@axa.es',
      contactosOperativos: [{ cargo: 'Suscripción', nombre: 'Juan', email: 'juan@axa.es' }],
      modelosComision: [{ nombre: 'Inicial', tipo: 'inicial', pct: 15, aplicaA: 'corredor' }],
      condicionesPago: { diasGracia: 30, politicaCancelacion: 'Cancelación a los 30 días' },
      limitesSuscripcion: { montoMaximoAutomatico: 250000, requiereAprobacionManual: true },
      gestionSiniestros: { slaRespuestaHoras: 24, limiteIndemnizacion: 1000000, tipoLimite: 'por_evento' },
      cuentasBancarias: [{ banco: 'Santander', tipoCuenta: 'recaudacion', numeroCuenta: 'ES91...' }],
      monedaBase: 'EUR',
      monedaLiquidacion: 'EUR',
      integracionApi: { apiKey: 'sk-test', endpoints: { staging: 'https://stg' }, formatos: ['JSON'] },
    };

    await POST(
      makeReq('http://localhost/api/insurance/aseguradoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'AXA Seguros', ...bloques }),
      })
    );

    expect(prisma.aseguradora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        representanteLegal: bloques.representanteLegal,
        mesaEntradas: 'notificaciones@axa.es',
        contactosOperativos: bloques.contactosOperativos,
        modelosComision: bloques.modelosComision,
        condicionesPago: bloques.condicionesPago,
        limitesSuscripcion: bloques.limitesSuscripcion,
        gestionSiniestros: bloques.gestionSiniestros,
        cuentasBancarias: bloques.cuentasBancarias,
        monedaBase: 'EUR',
        monedaLiquidacion: 'EUR',
        integracionApi: bloques.integracionApi,
      }),
    });
  });

  it('convierte bloques JSON ausentes a null (no rompe create legacy)', async () => {
    await POST(
      makeReq('http://localhost/api/insurance/aseguradoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'Allianz' }),
      })
    );
    expect(prisma.aseguradora.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        representanteLegal: null,
        contactosOperativos: null,
        modelosComision: null,
        integracionApi: null,
        monedaBase: null,
      }),
    });
  });
});

describe('PATCH /api/insurance/aseguradoras/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.aseguradora.findFirst as any).mockResolvedValue(mockAseguradora);
    (prisma.aseguradora.update as any).mockResolvedValue({ ...mockAseguradora, notas: 'nuevas notas' });
  });

  it('actualiza campos del Bloque 1 y 2', async () => {
    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razonSocial: 'Nueva Razón Social',
          regimenFiscal: 'Agente de Retención',
          numeroRegistro: 'REG-2025-002',
          fechaVigenciaLicenciaFin: '2027-06-30',
        }),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(res.status).toBe(200);
    expect(prisma.aseguradora.update).toHaveBeenCalledWith({
      where: { id: 'aseg-1' },
      data: expect.objectContaining({
        razonSocial: 'Nueva Razón Social',
        regimenFiscal: 'Agente de Retención',
        numeroRegistro: 'REG-2025-002',
        fechaVigenciaLicenciaFin: expect.any(Date),
      }),
    });
  });

  it('actualiza notas (fix: antes se ignoraba)', async () => {
    await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: 'nuevas notas' }),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(prisma.aseguradora.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notas: 'nuevas notas' }) })
    );
  });

  it('devuelve 404 si la aseguradora no existe en el tenant', async () => {
    (prisma.aseguradora.findFirst as any).mockResolvedValueOnce(null);
    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'X' }),
      }),
      { params: { id: 'aseg-x' } }
    );
    expect(res.status).toBe(404);
    expect(prisma.aseguradora.update).not.toHaveBeenCalled();
  });

  it('rechaza duplicado de nombre al renombrar', async () => {
    (prisma.aseguradora.findFirst as any)
      .mockResolvedValueOnce(mockAseguradora) // existe la actual
      .mockResolvedValueOnce({ id: 'aseg-2', nombre: 'AXA Seguros' }); // duplicado
    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'AXA Seguros' }),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(res.status).toBe(400);
  });

  it('actualiza los JSON tipados de los Bloques 3-6', async () => {
    const bloques = {
      representanteLegal: { nombre: 'Nueva Rep', documento: 'DNI 999', cargo: 'CEO' },
      modelosComision: [{ nombre: 'Renovación', tipo: 'renovacion', pct: 10, aplicaA: 'agente' }],
      cuentasBancarias: [{ banco: 'BBVA', tipoCuenta: 'operativa', numeroCuenta: 'ES85...' }],
      monedaBase: 'USD',
      integracionApi: { apiKey: 'sk-nueva', endpoints: { produccion: 'https://api' }, formatos: ['XML'] },
    };

    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bloques),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(res.status).toBe(200);
    expect(prisma.aseguradora.update).toHaveBeenCalledWith({
      where: { id: 'aseg-1' },
      data: expect.objectContaining({
        representanteLegal: bloques.representanteLegal,
        modelosComision: bloques.modelosComision,
        cuentasBancarias: bloques.cuentasBancarias,
        monedaBase: 'USD',
        integracionApi: bloques.integracionApi,
      }),
    });
  });

  it('puede limpiar un bloque JSON enviando null', async () => {
    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integracionApi: null }),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(res.status).toBe(200);
    expect(prisma.aseguradora.update).toHaveBeenCalledWith({
      where: { id: 'aseg-1' },
      data: expect.objectContaining({ integracionApi: null }),
    });
  });

  it('no sobrescribe secretos reales cuando el cliente reenvía valores enmascarados (merge con existente)', async () => {
    // La BD ya tiene secretos reales almacenados
    (prisma.aseguradora.findFirst as any).mockResolvedValueOnce({
      ...mockAseguradora,
      integracionApi: {
        apiKey: 'axa_live_secure123456',
        oauth: { clientId: 'volkern-axa', clientSecret: 'real-secret-xyz' },
        endpoints: { produccion: 'https://api.axa.es' },
        formatos: ['JSON'],
      },
    });

    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integracionApi: {
            apiKey: '••••1234', // valor enmascarado del GET
            oauth: { clientId: '••••-axa', clientSecret: '••••••••' },
            endpoints: { produccion: 'https://api.axa.es' },
            formatos: ['JSON'],
          },
        }),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(res.status).toBe(200);

    // Prisma reemplaza el Json completo: el PATCH debe ENVIAR el merge de los
    // secretos existentes + campos no-secretos limpios (no los sentinels).
    const callArg = (prisma.aseguradora.update as any).mock.calls[0][0];
    const sent = callArg.data.integracionApi;
    // Secretos reales preservados del valor existente
    expect(sent.apiKey).toBe('axa_live_secure123456');
    expect(sent.oauth?.clientSecret).toBe('real-secret-xyz');
    expect(sent.oauth?.clientId).toBe('volkern-axa');
    // Campos no-secretos persistidos
    expect(sent.endpoints.produccion).toBe('https://api.axa.es');
    expect(sent.formatos).toEqual(['JSON']);
    // Ningún sentinel enmascarado llega a Prisma
    expect(JSON.stringify(sent)).not.toContain('••••');
  });

  it('merge ANIDADO parcial: conserva secretos reales cuando el cliente reenvía solo un campo enmascarado del oauth (fix deep-merge)', async () => {
    // Caso que antes perdía datos: el cliente cambia clientId (valor real) pero
    // reenvía el clientSecret enmascarado del GET. El merge shallow { ...cur, ...clean }
    // reemplazaba TODO el objeto oauth y borraba el clientSecret real de la BD.
    (prisma.aseguradora.findFirst as any).mockResolvedValueOnce({
      ...mockAseguradora,
      integracionApi: {
        apiKey: 'axa_live_secure123456',
        oauth: { clientId: 'volkern-axa', clientSecret: 'real-secret-xyz', tokenUrl: 'https://api.axa.es/oauth/token' },
        certificados: { ssl: 'axa-prod.pem', firmaDigital: 'firma-axa.p12' },
        endpoints: { staging: 'https://stg.axa.es', produccion: 'https://api.axa.es' },
        formatos: ['JSON'],
      },
    });

    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integracionApi: {
            oauth: {
              clientId: 'nuevo-client-real',       // campo REAL que el usuario cambió
              clientSecret: MASK_PREFIX + '••••••••', // enmascarado del GET
              tokenUrl: 'https://api.axa.es/oauth/token',
            },
            endpoints: { staging: 'https://stg.axa.es', produccion: 'https://api.axa.es' },
            formatos: ['JSON', 'XML'],
          },
        }),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(res.status).toBe(200);

    const callArg = (prisma.aseguradora.update as any).mock.calls[0][0];
    const sent = callArg.data.integracionApi;
    // clientId REAL nuevo + clientSecret real de BD preservado (no el sentinel)
    expect(sent.oauth?.clientId).toBe('nuevo-client-real');
    expect(sent.oauth?.clientSecret).toBe('real-secret-xyz');
    // Certificados intactos de la BD
    expect(sent.certificados?.ssl).toBe('axa-prod.pem');
    expect(sent.certificados?.firmaDigital).toBe('firma-axa.p12');
    // apiKey intacta
    expect(sent.apiKey).toBe('axa_live_secure123456');
    // Campos no-secretos actualizados
    expect(sent.formatos).toEqual(['JSON', 'XML']);
    expect(JSON.stringify(sent)).not.toContain('••••');
  });

  it('actualiza ramosAutorizados (Bloque 2)', async () => {
    const res = await PATCH(
      makeReq('http://localhost/api/insurance/aseguradoras/aseg-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ramosAutorizados: ['Vida', 'Autos', 'Caución'] }),
      }),
      { params: { id: 'aseg-1' } }
    );
    expect(res.status).toBe(200);
    expect(prisma.aseguradora.update).toHaveBeenCalledWith({
      where: { id: 'aseg-1' },
      data: expect.objectContaining({ ramosAutorizados: ['Vida', 'Autos', 'Caución'] }),
    });
  });
});

describe('DELETE /api/insurance/aseguradoras/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.aseguradora.findFirst as any).mockResolvedValue(mockAseguradora);
    (prisma.aseguradora.delete as any).mockResolvedValue({ success: true });
  });

  it('elimina cuando no tiene pólizas', async () => {
    (prisma.aseguradora.findFirst as any).mockResolvedValueOnce({
      ...mockAseguradora,
      _count: { polizas: 0 },
    });
    const res = await DELETE(makeReq('http://localhost/api/insurance/aseguradoras/aseg-1'), {
      params: { id: 'aseg-1' },
    });
    expect(res.status).toBe(200);
    expect(prisma.aseguradora.delete).toHaveBeenCalledWith({ where: { id: 'aseg-1' } });
  });

  it('bloquea la eliminación si tiene pólizas asociadas', async () => {
    const res = await DELETE(makeReq('http://localhost/api/insurance/aseguradoras/aseg-1'), {
      params: { id: 'aseg-1' },
    });
    expect(res.status).toBe(400);
    expect(prisma.aseguradora.delete).not.toHaveBeenCalled();
  });

  it('devuelve 404 si no existe', async () => {
    (prisma.aseguradora.findFirst as any).mockResolvedValueOnce(null);
    const res = await DELETE(makeReq('http://localhost/api/insurance/aseguradoras/aseg-x'), {
      params: { id: 'aseg-x' },
    });
    expect(res.status).toBe(404);
  });
});
