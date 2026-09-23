/**
 * Stripe Connect para hospitality (FASE 3.C del plan de Booking + Payments).
 *
 * REGLA NO NEGOCIABLE del plan (criterio 4): el dinero de una reserva directa
 * llega a la cuenta Stripe **del tenant**, no a la de Volkern. Todo cobro se
 * crea como cargo directo (`stripe-account` = cuenta del tenant) y la
 * conciliación del webhook crea el `HospitalityPayment` contra esa reserva.
 *
 * La cuenta vive en `HospitalityPaymentAccount` (una por tenant y provider):
 * `sin_conectar` → `pendiente` (onboarding enviado) → `activo` (charges y
 * payouts habilitados) o `restringido` (Stripe exige revisión/datos).
 *
 * La pasarela cobra su comisión al transferir (`application_fee_amount`) y el
 * neto que ve el propietario puede calcularse con `comisionPasarela` del
 * módulo puro de finanzas. Cuando no se cobra fee de plataforma, la comisión
 * real la descuenta Stripe del payout: la conciliación registra lo cobrado y
 * el fee conocido en el pago.
 */

import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { monedaEscritura } from '@/lib/moneda';

export const HOSPITALITY_CONNECT_FEE_PCT = Number(process.env.HOSPITALITY_CONNECT_FEE_PCT || 0);

function esCuentaActiva(account: { charges_enabled?: boolean; payouts_enabled?: boolean }): boolean {
  return Boolean(account.charges_enabled && account.payouts_enabled);
}

function esCuentaRestringida(account: { requirements?: { disabled_reason?: string | null } | null }): boolean {
  return Boolean(account.requirements?.disabled_reason);
}

/** Cuenta Connect del tenant (crea la fila en `sin_conectar` si aún no existe). */
export async function obtenerCuenta(tenantId: string) {
  let cuenta = await prisma.hospitalityPaymentAccount.findUnique({
    where: { tenantId_provider: { tenantId, provider: 'stripe' } },
  });
  if (!cuenta) {
    cuenta = await prisma.hospitalityPaymentAccount.create({
      data: { tenantId, provider: 'stripe' },
    });
  }
  return cuenta;
}

/**
 * Inicia el onboarding KYC del tenant: crea la cuenta Connect Express si no
 * existe y devuelve el link de onboarding para que el propietario complete
 * sus datos en Stripe. Idempotente: si ya hay cuenta, reutiliza su id.
 */
export async function iniciarOnboarding(tenantId: string, email: string, urls: { refresh: string; return: string }) {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_dummy') {
    throw new Error('STRIPE_SECRET_KEY no configurada');
  }

  const actual = await obtenerCuenta(tenantId);

  let stripeAccountId = actual.stripeAccountId;
  if (!stripeAccountId) {
    const cuentaStripe = await stripe.accounts.create({
      type: 'express',
      email,
      metadata: { tenantId, producto: 'hospitality' },
    });
    stripeAccountId = cuentaStripe.id;
    await prisma.hospitalityPaymentAccount.update({
      where: { id: actual.id },
      data: { stripeAccountId, estado: 'pendiente' },
    });
  }

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: urls.refresh,
    return_url: urls.return,
    type: 'account_onboarding',
  });

  return { stripeAccountId, url: link.url };
}

/** Consulta a Stripe y sincroniza el estado real de la cuenta del tenant. */
export async function sincronizarCuenta(tenantId: string) {
  const cuenta = await obtenerCuenta(tenantId);
  if (!cuenta.stripeAccountId) return cuenta;

  const stripeAccount = await stripe.accounts.retrieve(cuenta.stripeAccountId);
  const estado = esCuentaRestringida(stripeAccount)
    ? 'restringido'
    : esCuentaActiva(stripeAccount)
      ? 'activo'
      : 'pendiente';

  const actualizada = await prisma.hospitalityPaymentAccount.update({
    where: { id: cuenta.id },
    data: {
      estado,
      chargesEnabled: Boolean(stripeAccount.charges_enabled),
      payoutsEnabled: Boolean(stripeAccount.payouts_enabled),
      pais: stripeAccount.country || cuenta.pais,
      // La moneda de payouts la fija Stripe al activar la cuenta.
      moneda: stripeAccount.default_currency?.toUpperCase() || cuenta.moneda,
    },
  });
  return actualizada;
}

/** El tenant puede cobrar reserva directa con Stripe: cuenta activa. */
export async function puedeCobrar(tenantId: string): Promise<boolean> {
  const cuenta = await obtenerCuenta(tenantId);
  return cuenta.estado === 'activo' && cuenta.chargesEnabled;
}

export interface CobroDirectoInput {
  tenantId: string;
  reservationId: string;
  importe: number;
  moneda: string;
  concepto: string;
  email?: string | null;
  origen: string; // URL del dashboard, para success/cancel
}

/**
 * Crea el cobro de una reserva directa contra la cuenta DEL TENANT.
 * Devuelve la URL de pago (Checkout hosted por Stripe). El pago se registra
 * cuando Stripe confirma (webhook `checkout.session.completed` con
 * `metadata.producto = 'hospitality'`), nunca antes.
 */
export async function crearCobroReserva(input: CobroDirectoInput) {
  const cuenta = await obtenerCuenta(input.tenantId);
  if (!cuenta.stripeAccountId) {
    throw new Error('El tenant no tiene cuenta Stripe Connect: completa el onboarding primero');
  }
  if (cuenta.estado !== 'activo' || !cuenta.chargesEnabled) {
    throw new Error(`La cuenta de cobro no está activa (estado: ${cuenta.estado})`);
  }

  const centavos = Math.round(input.importe * 100);
  if (!Number.isFinite(centavos) || centavos <= 0) {
    throw new Error('El importe del cobro debe ser mayor que cero');
  }

  // Fee de plataforma opcional (por defecto 0: Volkern no toca el dinero del
  // tenant; el modelo de negocio es la suscripción). Si se define, se retiene
  // al transferir y la comisión se refleja en la rentabilidad.
  const applicationFee = HOSPITALITY_CONNECT_FEE_PCT > 0
    ? Math.max(0, Math.round(centavos * (HOSPITALITY_CONNECT_FEE_PCT / 100)))
    : undefined;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.moneda.toLowerCase(),
            unit_amount: centavos,
            product_data: { name: input.concepto },
          },
        },
      ],
      customer_email: input.email || undefined,
      success_url: `${input.origen}${input.origen.includes('?') ? '&' : '?'}pago=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.origen}${input.origen.includes('?') ? '&' : '?'}pago=cancelado`,
      metadata: {
        producto: 'hospitality',
        tenantId: input.tenantId,
        reservationId: input.reservationId,
      },
      // Fee de plataforma: se retiene al confirmar el PaymentIntent del cargo
      // directo. Sin fee (por defecto), Stripe solo cobra su comisión estándar.
      ...(applicationFee ? { payment_intent_data: { application_fee_amount: applicationFee } } : {}),
    },
    // Cargo DIRECTO: el dinero del huésped cae en la cuenta del tenant.
    { stripeAccount: cuenta.stripeAccountId },
  );

  return { url: session.url, sessionId: session.id, stripeAccountId: cuenta.stripeAccountId };
}

/**
 * Concilia un pago confirmado por Stripe con su reserva de hospitality.
 * Idempotente: si la sesión ya se concilió, no crea un segundo pago.
 * Devuelve el pago creado (o null si el evento no es de hospitality).
 */
export async function conciliarPagoHospitality(session: {
  id: string;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
}): Promise<{ creado: boolean; pagoId?: string; motivo?: string }> {
  const meta = session.metadata || {};
  if (meta.producto !== 'hospitality' || !meta.reservationId) {
    return { creado: false, motivo: 'no_hospitality' };
  }

  const reservationId = meta.reservationId;
  const tenantId = meta.tenantId || '';

  // Idempotencia real: una sola fila de pago por sesión de checkout.
  const yaConciliado = await prisma.hospitalityPayment.findFirst({
    where: { reservationId, stripePaymentIntentId: session.id },
    select: { id: true },
  });
  if (yaConciliado) return { creado: false, motivo: 'ya_conciliado' };

  const reserva = await prisma.hospitalityReservation.findUnique({
    where: { id: reservationId },
    select: { id: true, tenantId: true, propertyId: true, unitId: true, currency: true, externalBookingId: true },
  });
  if (!reserva) return { creado: false, motivo: 'reserva_no_encontrada' };

  const importe = (session.amount_total || 0) / 100;
  const pago = await prisma.hospitalityPayment.create({
    data: {
      tenantId: reserva.tenantId || tenantId,
      reservationId: reserva.id,
      propertyId: reserva.propertyId,
      unitId: reserva.unitId,
      importe,
      // La divisa del cobro: la que confirma Stripe (es la que se cobró de
      // verdad), si no la de la reserva y, en último término, el mínimo del
      // esquema —que es lo que exige la escritura y no una divisa elegida—.
      moneda: monedaEscritura(session.currency, reserva.currency),
      metodo: 'stripe',
      estado: 'pagado',
      referenciaExterna: session.id,
      stripePaymentIntentId: (session.payment_intent as string) || null,
      fechaPago: new Date(),
      notas: 'Cobro directo Stripe Connect (reserva directa)',
    },
  });

  await prisma.auditLog.create({
    data: {
      accion: 'crear',
      entidad: 'HospitalityPayment',
      entidadId: pago.id,
      descripcion: `Pago Stripe conciliado (${importe} ${pago.moneda}) en reserva ${reserva.externalBookingId}`,
      userId: null,
      tenantId: reserva.tenantId || tenantId,
    },
  }).catch(() => {});

  return { creado: true, pagoId: pago.id };
}
