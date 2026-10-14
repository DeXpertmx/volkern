// @vitest-environment node

/**
 * Guardia del botón «Probar conexión» de superadmin
 * (app/api/admin/conectividad/test): la prueba de PLATAFORMA solo aplica si la
 * plataforma tiene un ID de socio propio.
 *
 * El ID de socio es de cada hotel —es lo que liga sus datos en el proveedor— y
 * la fila de plataforma puede no tenerlo a propósito. En ese estado la sonda
 * (`property_details`) no tiene con qué ID sondear, y lo que NO puede pasar es
 * que el panel lo lea como un fallo: marcaría la capa en rojo y avisaría al
 * equipo por una configuración que es la correcta.
 *
 * Por eso la respuesta lleva `aplica: false` con HTTP 200: el panel distingue
 * «no aplica» de «error» y dice dónde sí se comprueba (el Conectividad de cada
 * hotel, con el código de una de sus propiedades).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  providerFindUnique: vi.fn(),
  mappingFindFirst: vi.fn(),
  testConnection: vi.fn(),
  updateStatus: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    connectivityProvider: { findUnique: mocks.providerFindUnique },
    connectivityMapping: { findFirst: mocks.mappingFindFirst },
  },
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    connectivityProvider: { findUnique: mocks.providerFindUnique },
    connectivityMapping: { findFirst: mocks.mappingFindFirst },
  },
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/telegram/developer-notify', () => ({
  notifyDeveloperSensitiveAction: (...a: unknown[]) => mocks.notify(...a),
}));

// Mock PARCIAL: se conserva la regla real (`partnerIdEsDeCadaHotel` es lo que
// aquí se comprueba); solo se sustituye la llamada al proveedor.
vi.mock('@/lib/hospitality/connectivity', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/hospitality/connectivity')>();
  return {
    ...original,
    testConnectivityConnection: mocks.testConnection,
    updateConnectivityStatus: mocks.updateStatus,
  };
});

const { getServerSession } = await import('next-auth');
const { POST } = await import('@/app/api/admin/conectividad/test/route');

const RAIZ = path.resolve(__dirname, '..');

/** Fila de plataforma; por defecto, el caso «el ID de socio es de cada hotel». */
function filaProvider(extra: Record<string, unknown> = {}) {
  return {
    id: 'prov_1',
    providerKey: 'channel_connectivity',
    nombreVisible: 'Conectividad de Canales',
    baseUrl: 'https://live.example.internal',
    partnerIdEnc: null,
    usernameEnc: 'x',
    passwordEnc: 'x',
    estado: 'conectado',
    configuracion: null,
    ...extra,
  };
}

function reqPost(body: unknown): any {
  return {
    json: async () => body,
    headers: { get: () => null },
  };
}

describe('POST /api/admin/conectividad/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'u1',
      name: 'Root',
      role: { nombre: 'Superadmin' },
    });
    mocks.updateStatus.mockResolvedValue({});
    mocks.notify.mockResolvedValue(undefined);
    mocks.providerFindUnique.mockResolvedValue(filaProvider());
    mocks.mappingFindFirst.mockResolvedValue(null);
  });

  it('sin sesión → 401 y no se sondea nada', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await POST(reqPost({}));
    expect(res.status).toBe(401);
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it('sin rol Superadmin → 403 y no se sondea nada', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Usuario' } });
    const res = await POST(reqPost({}));
    expect(res.status).toBe(403);
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it('par Basic sin ID de socio de plataforma → NO aplica: ni sonda, ni estado, ni aviso, y HTTP 200', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaProvider({ partnerIdEnc: null }));

    const res = await POST(reqPost({ hotelCode: 'HOTEL-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    // La marca que el panel usa para no pintar esto en rojo.
    expect(body.aplica).toBe(false);
    expect(body.error).toMatch(/cada hotel/i);
    expect(mocks.testConnection).not.toHaveBeenCalled();
    // Ni estado tocado ni alarma al equipo: no es un fallo.
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    // «No aplica» se resuelve ANTES de mirar vínculos: sin consulta inútil.
    expect(mocks.mappingFindFirst).not.toHaveBeenCalled();
  });

  it('sin hotelCode sondea un hotel REAL ya vinculado, no el sandbox del contrato', async () => {
    // El sandbox está retirado para los partners de producción (403 Access
    // Denied): sondearlo dejaba el panel en rojo con la capa funcionando.
    mocks.providerFindUnique.mockResolvedValue(filaProvider({ partnerIdEnc: 'x' }));
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: '75fdbbce2e' });
    mocks.testConnection.mockResolvedValue({ ok: true, hotelCode: '75fdbbce2e' });

    const res = await POST(reqPost({}));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(mocks.testConnection).toHaveBeenCalledWith('75fdbbce2e');
  });

  it('el hotelCode indicado manda y no se consultan los vínculos', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaProvider({ partnerIdEnc: 'x' }));
    mocks.testConnection.mockResolvedValue({ ok: true, hotelCode: 'HOTEL-9' });

    await POST(reqPost({ hotelCode: 'HOTEL-9' }));

    expect(mocks.testConnection).toHaveBeenCalledWith('HOTEL-9');
    expect(mocks.mappingFindFirst).not.toHaveBeenCalled();
  });

  it('con ID de socio de plataforma la sonda SÍ corre y mueve el estado', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaProvider({ partnerIdEnc: 'x' }));
    mocks.testConnection.mockResolvedValue({ ok: true, hotelCode: 'HOTEL-1' });

    const res = await POST(reqPost({ hotelCode: 'HOTEL-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.testConnection).toHaveBeenCalledWith('HOTEL-1');
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      estado: 'conectado',
      resetErrores: true,
      ultimaVerificacion: expect.any(Date),
    });
  });

  it('con ID de socio, un fallo real sí marca error y avisa al equipo', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaProvider({ partnerIdEnc: 'x' }));
    mocks.testConnection.mockResolvedValue({ ok: false, error: 'La conexión respondió con estado 401' });

    const res = await POST(reqPost({}));

    expect((await res.json()).ok).toBe(false);
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      estado: 'error',
      error: true,
      ultimaVerificacion: expect.any(Date),
    });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it('la ruta usa la pieza compartida y el panel sabe leer «no aplica» (guardia de fuente)', async () => {
    const ruta = fs.readFileSync(
      path.join(RAIZ, 'app/api/admin/conectividad/test/route.ts'),
      'utf8'
    );
    expect(ruta).toContain('partnerIdEsDeCadaHotel');
    expect(ruta).toContain('aplica: false');

    const panel = fs.readFileSync(path.join(RAIZ, 'app/admin/conectividad/page.tsx'), 'utf8');
    expect(panel).toContain('data.aplica === false');
    expect(panel).toContain('Prueba de plataforma no aplicable');
    // Y la prueba no se ofrece cuando no hay ID de socio de plataforma.
    expect(panel).toContain('!estado?.partnerId');
  });
});
