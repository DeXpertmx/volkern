// @vitest-environment node

/**
 * Paso 9 del onboarding: la limpieza de la reserva de prueba.
 *
 * Caso real que cubre esta prueba (9-oct-2026): la prueba de reserva empujó
 * `available: 0` para las dos noches de la estancia de prueba al proveedor,
 * después borró la reserva del ERP… y las noches se quedaron cerradas en los
 * canales. El borrado no deshace el push de la creación, así que la limpieza
 * tiene que volver a empujar la disponibilidad (recalculada desde el estado
 * interno, que ya no tiene la reserva).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  loadOnboardingSnapshot: vi.fn(),
  dispatchConnectivityPush: vi.fn(),
  processReservationWebhook: vi.fn(),
  logAuditAction: vi.fn(),
  exigirPermisoHospitality: vi.fn(),
  hospitalityReservation: { findFirst: vi.fn(), count: vi.fn(), delete: vi.fn() },
  hospitalityWebhookEvent: { deleteMany: vi.fn() },
  contact: { findFirst: vi.fn(), delete: vi.fn() },
  hospitalitySyncLog: { create: vi.fn() },
  /** Orden real de los efectos: borrado de la reserva y reposición. */
  orden: [] as string[],
}));

vi.mock('@/lib/db', () => ({
  default: mocks,
  prisma: mocks,
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
// El permiso lo decide el rol (§27) y tiene sus propias pruebas: aquí se concede
// para llegar a la limpieza, que es lo que se audita.
vi.mock('@/lib/hospitality/permissions', () => ({
  exigirPermisoHospitality: mocks.exigirPermisoHospitality,
}));
vi.mock('@/lib/hospitality/onboarding-status', () => ({
  loadOnboardingSnapshot: mocks.loadOnboardingSnapshot,
}));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: mocks.dispatchConnectivityPush,
}));
vi.mock('@/lib/hospitality/reservations', () => ({
  processReservationWebhook: mocks.processReservationWebhook,
}));

const { POST } = await import('@/app/api/hospitality/onboarding/probar/route');

const RESERVA_PRUEBA = {
  id: 'res_probar',
  unitId: 'u1',
  checkIn: new Date('2026-10-11T00:00:00.000Z'),
  checkOut: new Date('2026-10-13T00:00:00.000Z'),
  channel: 'direct',
};

function snapshot() {
  return {
    ok: true as const,
    snapshot: {
      hotelCode: '75fdbbce2e',
      unidadesVinculadas: 1,
      unidades: [
        {
          id: 'u1',
          nombre: 'Apartamento 2B',
          codigo: 'CPC-2B',
          vinculada: true,
          roomCode: '2b',
          rateplanCode: '2b-q-ep',
        },
      ],
    },
  };
}

function peticion(prueba = 'reserva') {
  return new Request('https://volkern.app/api/hospitality/onboarding/probar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId: 'p1', prueba }),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.orden.length = 0;

  mocks.authenticateRequest.mockResolvedValue({
    valid: true,
    tenant: { id: 't1', moneda: 'MXN' },
    user: { id: 'user_1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
  });
  mocks.exigirPermisoHospitality.mockReturnValue(null);
  mocks.loadOnboardingSnapshot.mockResolvedValue(snapshot());
  mocks.processReservationWebhook.mockResolvedValue({ ok: true, status: 'creada' });
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.hospitalityReservation.findFirst.mockResolvedValue(RESERVA_PRUEBA);
  mocks.hospitalityReservation.count.mockResolvedValue(0);
  mocks.hospitalityReservation.delete.mockImplementation(async () => {
    mocks.orden.push('borrado');
    return RESERVA_PRUEBA;
  });
  mocks.hospitalityWebhookEvent.deleteMany.mockResolvedValue({ count: 1 });
  mocks.contact.findFirst.mockResolvedValue(null);
  mocks.hospitalitySyncLog.create.mockResolvedValue({ id: 'log_1' });
  mocks.dispatchConnectivityPush.mockImplementation(async () => {
    mocks.orden.push('reposicion');
    return {
      ok: true,
      inventory: { ok: true },
      rates: { ok: true },
      inventoryRestrictions: { ok: true },
      rateRestrictions: { ok: true },
      pushCount: 4,
      errores: 0,
    };
  });
});

describe('POST /api/hospitality/onboarding/probar · prueba de reserva', () => {
  it('borra la reserva de prueba y vuelve a empujar la disponibilidad', async () => {
    const res = await POST(peticion());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(mocks.hospitalityReservation.delete).toHaveBeenCalledWith({ where: { id: 'res_probar' } });

    // La reposición va DESPUÉS del borrado: recalcula la disponibilidad desde el
    // estado interno, así que con la reserva todavía dentro volvería a cerrar las
    // noches que se quieren reabrir.
    expect(mocks.orden).toEqual(['borrado', 'reposicion']);
    expect(mocks.dispatchConnectivityPush).toHaveBeenCalledWith('t1', 'p1', 'onboarding_limpieza', {
      diasHorizonte: 30,
    });

    expect(body.detalle.limpieza).toBe('completa');
    expect(body.detalle.reposicion).toEqual({ ok: true, pushCount: 4, errores: 0 });
    expect(body.aviso).toBeUndefined();
  });

  it('la reposición no se confunde con las pruebas 7 y 8 del wizard', async () => {
    await POST(peticion());

    // El wizard deriva los pasos 7 y 8 del último `inventory`/`rates` con
    // `operacion: 'onboarding'`: marcar así la reposición cambiaría el estado de
    // dos pasos que nadie acaba de ejecutar.
    const operaciones = mocks.dispatchConnectivityPush.mock.calls.map((c) => c[2]);
    expect(operaciones).toEqual(['onboarding_limpieza']);
    expect(operaciones).not.toContain('onboarding');
  });

  it('si el borrado falla, no repone nada y lo declara limpieza parcial', async () => {
    mocks.hospitalityReservation.delete.mockRejectedValue(new Error('FK en uso'));

    const res = await POST(peticion());
    const body = await res.json();

    // La reserva sigue en el sistema: sus noches siguen ocupadas de verdad, así
    // que reponer disponibilidad sería mentir sobre el calendario.
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
    expect(body.detalle.limpieza).toBe('parcial');
    expect(body.detalle.reposicion).toBeNull();
    expect(body.aviso).toBeUndefined();
  });

  it('si la reposición falla, avisa al operador y lo deja en el log', async () => {
    mocks.dispatchConnectivityPush.mockResolvedValue({
      ok: false,
      inventory: { ok: false, error: 'proveedor 503' },
      rates: { ok: true },
      inventoryRestrictions: { ok: true },
      rateRestrictions: { ok: true },
      pushCount: 3,
      errores: 1,
    });

    const res = await POST(peticion());
    const body = await res.json();

    // El paso no se marca fallido —la reserva llegó y se borró—, pero el aviso
    // tiene que salir: son las noches que el hotel perdería en los canales.
    expect(body.ok).toBe(true);
    expect(body.detalle.reposicion.ok).toBe(false);
    expect(body.aviso).toMatch(/no se pudo reponer la disponibilidad/i);

    const log = mocks.hospitalitySyncLog.create.mock.calls.at(-1)?.[0];
    expect(log.data.tipo).toBe('reservacion_prueba');
    expect(log.data.responseBody.reposicion).toEqual({ ok: false, pushCount: 3, errores: 1 });
  });

  it('un push que no manda nada tampoco repone: cuenta como no repuesto', async () => {
    mocks.dispatchConnectivityPush.mockResolvedValue({
      ok: true,
      inventory: { ok: true },
      rates: { ok: true },
      inventoryRestrictions: { ok: true },
      rateRestrictions: { ok: true },
      pushCount: 0,
      errores: 0,
    });

    const res = await POST(peticion());
    const body = await res.json();

    expect(body.detalle.reposicion).toEqual({ ok: true, pushCount: 0, errores: 0 });
    expect(body.aviso).toMatch(/no se pudo reponer la disponibilidad/i);
  });

  it('la prueba de disponibilidad no toca la reserva ni repone', async () => {
    const res = await POST(peticion('disponibilidad'));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(mocks.orden).toEqual(['reposicion']);
    // La prueba 7 usa el push normal del onboarding.
    expect(mocks.dispatchConnectivityPush).toHaveBeenCalledWith('t1', 'p1', 'onboarding', {
      diasHorizonte: 30,
      skipRates: true,
      skipInventory: false,
    });
    expect(mocks.hospitalityReservation.delete).not.toHaveBeenCalled();
  });
});
