// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardia de la FASE 3.C — Stripe Connect para hospitality.
 *
 * Reglas del plan que protege:
 * 1. Criterio 4 (no negociable): el dinero de una reserva directa llega a la
 *    cuenta Stripe DEL TENANT. El Checkout de cobro se crea SIEMPRE con
 *    `stripeAccount` = cuenta Connect del tenant (cargo directo).
 * 2. El pago se registra cuando Stripe confirma (webhook), nunca antes, y la
 *    conciliación es idempotente (una fila por sesión de checkout).
 * 3. La cuenta es una por tenant y provider; su estado se sincroniza con
 *    Stripe (sin_conectar → pendiente → activo | restringido).
 * 4. Sin cuenta activa no hay cobro (error claro, no un cobro silencioso a
 *    otra cuenta).
 */

const mocks = vi.hoisted(() => ({
  stripeAccounts: { create: vi.fn(), retrieve: vi.fn() },
  stripeAccountLinks: { create: vi.fn() },
  stripeCheckout: { create: vi.fn() },
  hospitalityPaymentAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  hospitalityReservation: { findUnique: vi.fn(), findFirst: vi.fn() },
  hospitalityReservationItem: { findMany: vi.fn() },
  hospitalityPayment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  authenticateRequest: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: mocks.stripeAccounts,
    accountLinks: mocks.stripeAccountLinks,
    checkout: { sessions: mocks.stripeCheckout },
    webhooks: { constructEvent: vi.fn() },
  },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityPaymentAccount: mocks.hospitalityPaymentAccount,
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityReservationItem: mocks.hospitalityReservationItem,
    hospitalityPayment: mocks.hospitalityPayment,
    auditLog: mocks.auditLog,
    user: mocks.user,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));

import {
  obtenerCuenta,
  iniciarOnboarding,
  sincronizarCuenta,
  crearCobroReserva,
  conciliarPagoHospitality,
} from '@/lib/stripe/connect';
import { GET, POST, PATCH } from '@/app/api/hospitality/cuenta-cobro/route';
import { POST as cobrarPOST } from '@/app/api/hospitality/finanzas/cobrar/route';

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a' } };

const cuentaBase = {
  id: 'cuenta_a',
  tenantId: 'tenant_a',
  provider: 'stripe',
  stripeAccountId: 'acct_tenant_a',
  estado: 'activo',
  chargesEnabled: true,
  payoutsEnabled: true,
  moneda: 'EUR',
  pais: 'ES',
};

const request = (method: string, body?: unknown, url = 'http://test.local/api/hospitality/cuenta-cobro') =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.auditLog.create.mockResolvedValue({ id: 'log' });
  mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(null);
  mocks.hospitalityPaymentAccount.create.mockImplementation(({ data }: any) => ({
    id: 'cuenta_nueva',
    estado: 'sin_conectar',
    chargesEnabled: false,
    payoutsEnabled: false,
    moneda: 'MXN',
    ...data,
  }));
});

describe('Cuenta Connect — una por tenant, ciclo de estado', () => {
  it('obtenerCuenta crea la fila en sin_conectar si no existe', async () => {
    const cuenta = await obtenerCuenta('tenant_a');
    expect(mocks.hospitalityPaymentAccount.create).toHaveBeenCalledTimes(1);
    expect(cuenta.estado).toBe('sin_conectar');
  });

  it('obtenerCuenta reutiliza la cuenta existente (no crea duplicados)', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);
    const cuenta = await obtenerCuenta('tenant_a');
    expect(mocks.hospitalityPaymentAccount.create).not.toHaveBeenCalled();
    expect(cuenta.id).toBe('cuenta_a');
  });

  it('el onboarding crea la cuenta Express con metadata del tenant y devuelve el link', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue({ ...cuentaBase, stripeAccountId: null, estado: 'sin_conectar' });
    mocks.stripeAccounts.create.mockResolvedValue({ id: 'acct_nueva' });
    mocks.stripeAccountLinks.create.mockResolvedValue({ url: 'https://connect.stripe.com/onboarding' });

    const { url, stripeAccountId } = await iniciarOnboarding('tenant_a', 'dueño@hotel.com', {
      refresh: 'http://x/refresh',
      return: 'http://x/return',
    });

    expect(stripeAccountId).toBe('acct_nueva');
    expect(url).toContain('connect.stripe.com');
    expect(mocks.stripeAccounts.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'express', metadata: expect.objectContaining({ tenantId: 'tenant_a' }) })
    );
    // La fila queda en pendiente (KYC no completado) con el id de Stripe.
    expect(mocks.hospitalityPaymentAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeAccountId: 'acct_nueva', estado: 'pendiente' }) })
    );
  });

  it('sincronizarCuenta marca activo solo con charges Y payouts habilitados', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);
    mocks.stripeAccounts.retrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: true, country: 'ES', default_currency: 'eur', requirements: {} });
    mocks.hospitalityPaymentAccount.update.mockResolvedValue({ ...cuentaBase, estado: 'activo' });

    await sincronizarCuenta('tenant_a');

    // Lo que se escribe en la base es lo que cuenta (no el mock de vuelta).
    const { data } = mocks.hospitalityPaymentAccount.update.mock.calls[0][0];
    expect(data.estado).toBe('activo');
    expect(data.chargesEnabled).toBe(true);
    expect(data.moneda).toBe('EUR');
  });

  it('sincronizarCuenta marca restringido si Stripe deshabilita la cuenta', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);
    mocks.stripeAccounts.retrieve.mockResolvedValue({ charges_enabled: false, payouts_enabled: false, requirements: { disabled_reason: 'requirements.past_due' } });
    mocks.hospitalityPaymentAccount.update.mockResolvedValue({ ...cuentaBase, estado: 'restringido' });

    await sincronizarCuenta('tenant_a');

    const { data } = mocks.hospitalityPaymentAccount.update.mock.calls[0][0];
    expect(data.estado).toBe('restringido');
  });
});

describe('Cobro directo — el dinero llega a la cuenta DEL TENANT (criterio 4)', () => {
  const input = {
    tenantId: 'tenant_a',
    reservationId: 'res_a',
    importe: 595,
    moneda: 'EUR',
    concepto: 'Reserva BK-1 · Suite 1',
    email: 'huesped@mail.com',
    origen: 'http://test.local/dashboard/hospitality/finanzas',
  };

  it('el Checkout se crea con stripeAccount = cuenta del tenant (cargo directo)', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);
    mocks.stripeCheckout.create.mockResolvedValue({ id: 'cs_a', url: 'https://checkout.stripe.com/x' });

    await crearCobroReserva(input);

    expect(mocks.stripeCheckout.create).toHaveBeenCalledTimes(1);
    const [, opciones] = mocks.stripeCheckout.create.mock.calls[0];
    // LA REGLA: sin esto el dinero iría a la plataforma (Volkern), no al tenant.
    expect(opciones.stripeAccount).toBe('acct_tenant_a');
  });

  it('los metadata del sesión marcan producto hospitality y la reserva (para la conciliación)', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);
    mocks.stripeCheckout.create.mockResolvedValue({ id: 'cs_a', url: 'https://checkout.stripe.com/x' });

    await crearCobroReserva(input);

    const [params] = mocks.stripeCheckout.create.mock.calls[0];
    expect(params.metadata).toEqual({
      producto: 'hospitality',
      tenantId: 'tenant_a',
      reservationId: 'res_a',
    });
    expect(params.mode).toBe('payment');
    expect(params.line_items[0].price_data.unit_amount).toBe(59500); // centavos
  });

  it('sin cuenta Connect: error claro, no se llama a Stripe', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue({ ...cuentaBase, stripeAccountId: null, estado: 'sin_conectar' });

    await expect(crearCobroReserva(input)).rejects.toThrow(/onboarding/i);
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled();
  });

  it('cuenta pendiente o restringida: no se puede cobrar', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue({ ...cuentaBase, estado: 'pendiente', chargesEnabled: false, payoutsEnabled: false });

    await expect(crearCobroReserva(input)).rejects.toThrow(/no está activa/);
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled();
  });

  it('el endpoint de cobro rechaza reservas de otro tenant', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(null);

    const res = await cobrarPOST(request('POST', { reservationId: 'res_ajena' }, 'http://test.local/api/hospitality/finanzas/cobrar'));
    expect(res.status).toBe(404);
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled();
  });

  /** Reserva como la carga la ruta: con líneas, pagos y el huésped. */
  const reservaCobrable = (overrides: Record<string, unknown> = {}) => ({
    id: 'res_a',
    tenantId: 'tenant_a',
    estado: 'confirmed',
    currency: 'EUR',
    amountAfterTax: 700,
    externalBookingId: 'BK-1',
    guestData: { email: 'huesped@mail.com' },
    items: [
      { tipo: 'alojamiento', concepto: 'Noches', cantidad: 1, importeUnitario: 700, importeTotal: 700 },
    ],
    payments: [],
    unit: { nombre: 'Suite 1' },
    contact: { email: 'huesped@mail.com' },
    ...overrides,
  });

  it('una cancelada no se cobra: no queda nada cobrable', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(reservaCobrable({ estado: 'cancelled' }));

    const res = await cobrarPOST(request('POST', { reservationId: 'res_a' }, 'http://test.local/api/hospitality/finanzas/cobrar'));

    expect(res.status).toBe(400);
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled();
  });

  it('un no-show SIN penalización tampoco: la unidad volvió al inventario y no hay cargo', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(reservaCobrable({ estado: 'no_show' }));

    const res = await cobrarPOST(request('POST', { reservationId: 'res_a' }, 'http://test.local/api/hospitality/finanzas/cobrar'));

    expect(res.status).toBe(400);
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled();
  });

  it('un no-show CON penalización sí se cobra: cobrar no es producir', async () => {
    // El no-show no aporta ocupación (regla 7), pero la penalización es dinero
    // que hay que cobrar. Si esto se bloqueara, el cargo quedaría incobrable.
    mocks.hospitalityReservation.findFirst.mockResolvedValue(
      reservaCobrable({
        estado: 'no_show',
        items: [
          { tipo: 'penalizacion', concepto: 'Penalización por no-show · 1 noche', cantidad: 1, importeUnitario: 140, importeTotal: 140 },
        ],
      })
    );
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);
    mocks.stripeCheckout.create.mockResolvedValue({ id: 'cs_a', url: 'https://checkout.stripe.com/x' });

    const res = await cobrarPOST(request('POST', { reservationId: 'res_a' }, 'http://test.local/api/hospitality/finanzas/cobrar'));

    expect(res.status).toBe(201);
    // Y el importe por defecto es lo que queda por cobrar del CARGO, no del
    // alojamiento (que aquí es 0).
    const [params] = mocks.stripeCheckout.create.mock.calls[0];
    expect(params.line_items[0].price_data.unit_amount).toBe(14000);
  });
});

describe('Conciliación en el webhook — idempotente y del tenant', () => {
  const session = {
    id: 'cs_test_1',
    payment_intent: 'pi_test_1',
    amount_total: 59500,
    currency: 'eur',
    metadata: { producto: 'hospitality', tenantId: 'tenant_a', reservationId: 'res_a' },
  };

  it('crea el HospitalityPayment contra la reserva cuando Stripe confirma', async () => {
    mocks.hospitalityPayment.findFirst.mockResolvedValue(null);
    mocks.hospitalityReservation.findUnique.mockResolvedValue({
      id: 'res_a', tenantId: 'tenant_a', propertyId: 'prop_a', unitId: 'unit_a', currency: 'EUR', externalBookingId: 'BK-1',
    });
    mocks.hospitalityPayment.create.mockResolvedValue({ id: 'pay_a', moneda: 'EUR' });

    const resultado = await conciliarPagoHospitality(session);

    expect(resultado.creado).toBe(true);
    const data = mocks.hospitalityPayment.create.mock.calls[0][0].data;
    expect(data.reservationId).toBe('res_a');
    expect(data.tenantId).toBe('tenant_a');
    expect(data.importe).toBe(595); // centavos → unidades
    expect(data.metodo).toBe('stripe');
    expect(data.estado).toBe('pagado');
    expect(data.stripePaymentIntentId).toBe('pi_test_1');
  });

  it('es idempotente: una sesión ya conciliada no crea un segundo pago', async () => {
    mocks.hospitalityPayment.findFirst.mockResolvedValue({ id: 'pay_existente' });

    const resultado = await conciliarPagoHospitality(session);

    expect(resultado).toEqual({ creado: false, motivo: 'ya_conciliado' });
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });

  it('ignora sesiones que no son de hospitality (suscripción, citas…)', async () => {
    const resultado = await conciliarPagoHospitality({ ...session, metadata: { producto: 'citas', reservationId: 'res_a' } });
    expect(resultado.motivo).toBe('no_hospitality');
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });

  it('reserva inexistente: no crea pago huérfano', async () => {
    mocks.hospitalityPayment.findFirst.mockResolvedValue(null);
    mocks.hospitalityReservation.findUnique.mockResolvedValue(null);

    const resultado = await conciliarPagoHospitality(session);
    expect(resultado.motivo).toBe('reserva_no_encontrada');
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });
});

describe('API de cuenta de cobro — auth y endpoints', () => {
  it('GET devuelve la cuenta del tenant', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);

    const res = await GET(request('GET'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.cuenta.id).toBe('cuenta_a');
  });

  it('POST inicia el onboarding y devuelve la URL de Stripe', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue({ ...cuentaBase, stripeAccountId: null, estado: 'sin_conectar' });
    mocks.user.findUnique.mockResolvedValue({ email: 'dueño@hotel.com' });
    mocks.stripeAccounts.create.mockResolvedValue({ id: 'acct_nueva' });
    mocks.stripeAccountLinks.create.mockResolvedValue({ url: 'https://connect.stripe.com/onboarding' });

    const res = await POST(request('POST', {}));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.url).toContain('connect.stripe.com');
  });

  it('PATCH sincroniza el estado con Stripe', async () => {
    mocks.hospitalityPaymentAccount.findUnique.mockResolvedValue(cuentaBase);
    mocks.stripeAccounts.retrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: true, country: 'ES', default_currency: 'eur', requirements: {} });
    mocks.hospitalityPaymentAccount.update.mockResolvedValue(cuentaBase);

    const res = await PATCH(request('PATCH'));
    const data = await res.json();
    expect(data.cuenta.estado).toBe('activo');
  });

  it('sin sesión válida, 401 en todos los métodos', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'sin sesión' });
    expect((await GET(request('GET'))).status).toBe(401);
    expect((await POST(request('POST', {}))).status).toBe(401);
    expect((await PATCH(request('PATCH'))).status).toBe(401);
  });
});
