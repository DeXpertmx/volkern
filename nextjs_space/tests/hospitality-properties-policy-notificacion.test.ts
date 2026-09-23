// @vitest-environment node
//
// Guardia de RUTA: el PATCH /api/hospitality/properties/[id] dispara el aviso
// a los operadores SOLO cuando la política de salida anticipada cambia de
// verdad — el mismo PATCH que edita otros campos no debe avisar, ni tampoco
// reenviar el mismo valor. Es la puerta de la UI y de la API del Anfitrión.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  logAuditAction: vi.fn(),
  hospitalityProperty: { findFirst: vi.fn(), update: vi.fn() },
  sendPushNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('@/lib/services/push-notification', () => ({
  sendPushNotification: mocks.sendPushNotification,
}));
// El aviso importa perezosamente ./incidencias (que a su vez carga @/lib/db);
// mockeamos el módulo completo para no arrastrar sus dependencias.
vi.mock('@/lib/hospitality/incidencias', () => ({
  operadoresDelTenant: vi
    .fn()
    .mockResolvedValue([{ id: 'op-1' }, { id: 'op-2' }]),
}));
vi.mock('@/lib/hospitality/sync', () => ({ dispatchConnectivityPush: vi.fn() }));

const { PATCH } = await import('@/app/api/hospitality/properties/[id]/route');

const PROPIEDAD = {
  id: 'p1',
  tenantId: 't1',
  nombre: 'Hotel Ceniza',
  politicaSalidaAnticipada: 'salida_real',
};

function req(cuerpo: Record<string, unknown>) {
  return {
    json: async () => cuerpo,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({
    valid: true,
    tenant: { id: 't1' },
    user: { id: 'u1', name: 'Anfitrión', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
  });
  mocks.hospitalityProperty.findFirst.mockResolvedValue(PROPIEDAD);
  mocks.hospitalityProperty.update.mockImplementation(({ data }: any) =>
    Promise.resolve({ ...PROPIEDAD, ...data })
  );
  // La ruta encadena .catch() al resultado del audit: el mock debe ser promesa.
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.sendPushNotification.mockResolvedValue({ success: true });
});

describe('PATCH de propiedad: aviso del cambio de política de salida anticipada', () => {
  it('avisar a los operadores cuando el apagador cambia (B → A)', async () => {
    const res = await PATCH(req({ politicaSalidaAnticipada: 'cerrar_estancia' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    // Dos operadores, un push a cada uno.
    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(2);
    const [, aviso] = mocks.sendPushNotification.mock.calls[0];
    expect(aviso.body).toContain('Cerrar la estancia');
    expect(aviso.body).toContain('salida real');
  });

  it('NO avisa cuando el PATCH edita otros campos sin tocar el apagador', async () => {
    const res = await PATCH(req({ nombre: 'Hotel Ceniza Sur' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it('NO avisa cuando se reenvía el mismo valor (sin cambio real)', async () => {
    const res = await PATCH(req({ politicaSalidaAnticipada: 'salida_real' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it('el aviso nunca rompe la respuesta: si el push falla, el PATCH sigue en 200', async () => {
    mocks.sendPushNotification.mockRejectedValue(new Error('push caído'));
    const res = await PATCH(req({ politicaSalidaAnticipada: 'cerrar_estancia' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.property.politicaSalidaAnticipada).toBe('cerrar_estancia');
  });

  it('rechaza un valor inválido del apagador con 400 (sin avisar)', async () => {
    const res = await PATCH(req({ politicaSalidaAnticipada: 'otra_cosa' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(400);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });
});
