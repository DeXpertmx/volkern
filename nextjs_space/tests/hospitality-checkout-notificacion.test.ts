// @vitest-environment node
//
// Guardia del AVISO al operador por el cambio del apagador de salida
// anticipada. El apagador decide qué pasa con las noches no usadas a partir
// del PRÓXIMO check-out; si nadie avisa, el operador ve la disponibilidad
// moverse con un criterio que ya no es el que conocía.
//
// El aviso sigue el patrón de `notificarVinculacionAutomatica`: push in-app
// a los operadores del tenant, con qué política había y cuál quedó, y NUNCA
// lanza — un aviso no puede romper el cambio que anuncia. La ruta PATCH de
// propiedades lo dispara SOLO cuando la política cambia de verdad.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  sendPushNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/services/push-notification', () => ({
  sendPushNotification: mocks.sendPushNotification,
}));

const { notificarCambioSalidaAnticipada } = await import('@/lib/hospitality/checkout-avisos');

const AVISO_OK = {
  tenantId: 't1',
  propertyId: 'p1',
  property: 'Hotel Ceniza',
  antes: 'salida_real' as const,
  despues: 'cerrar_estancia' as const,
};

describe('aviso del cambio de política de salida anticipada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.findMany.mockResolvedValue([{ id: 'op-1' }, { id: 'op-2' }]);
    mocks.sendPushNotification.mockResolvedValue({ success: true });
  });

  it('avisa a cada operador con qué política había y cuál quedó', async () => {
    const avisados = await notificarCambioSalidaAnticipada(AVISO_OK);
    expect(avisados).toEqual(['op-1', 'op-2']);
    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(2);
    const [userId, aviso] = mocks.sendPushNotification.mock.calls[0];
    expect(userId).toBe('op-1');
    expect(aviso.title).toContain('salida anticipada');
    // El cuerpo nombra ambas políticas: el operador sabe de qué a qué cambió.
    expect(aviso.body).toContain('salida real');
    expect(aviso.body).toContain('Cerrar la estancia');
    // Y el enlace lleva a la configuración de la propiedad.
    expect(aviso.url).toContain('propertyId=p1');
  });

  it('el cuerpo describe el efecto de la política nueva (A acorta, B conserva)', async () => {
    await notificarCambioSalidaAnticipada({ ...AVISO_OK, despues: 'salida_real' });
    const [, aviso] = mocks.sendPushNotification.mock.calls[0];
    expect(aviso.body).toContain('conserva las fechas previstas');

    vi.clearAllMocks();
    await notificarCambioSalidaAnticipada({ ...AVISO_OK, despues: 'cerrar_estancia' });
    const [, avisoA] = mocks.sendPushNotification.mock.calls[0];
    expect(avisoA.body).toContain('acorta la reserva');
  });

  it('sin operadores no empuja nada (pero tampoco falla)', async () => {
    mocks.user.findMany.mockResolvedValue([]);
    const avisados = await notificarCambioSalidaAnticipada(AVISO_OK);
    expect(avisados).toEqual([]);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it('un fallo del push no rompe el aviso (devuelve los operadores igualmente)', async () => {
    mocks.sendPushNotification.mockRejectedValue(new Error('push caído'));
    const avisados = await notificarCambioSalidaAnticipada(AVISO_OK);
    expect(avisados).toEqual(['op-1', 'op-2']);
  });

  it('nunca lanza: si la BD falla, devuelve [] y lo registra', async () => {
    mocks.user.findMany.mockRejectedValue(new Error('BD caída'));
    const avisados = await notificarCambioSalidaAnticipada(AVISO_OK);
    expect(avisados).toEqual([]);
  });
});
