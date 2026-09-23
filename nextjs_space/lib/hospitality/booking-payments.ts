/**
 * Cobro de la reserva directa (FASE 3.C, lo que necesita la 3.D).
 *
 * Decisión 5 de la FASE 3: **Stripe Connect tipo Express**. El dinero de una
 * reserva pertenece al tenant, así que el cobro se hace **contra su cuenta**
 * (`stripeAccount`), nunca contra la cuenta de Volkern. Volkern no es
 * intermediario de fondos: si el tenant no tiene cuenta conectada, no se inventa
 * un cobro — se dice que no se puede cobrar online y la reserva sigue su camino
 * como pendiente.
 *
 * Eso no es un caso raro: hoy **ningún** tenant tiene cuenta conectada, así que el
 * camino que realmente corre es el segundo. Por eso los dos están implementados y
 * el estado de la cuenta se consulta en vivo en vez de suponerse.
 *
 * La tarifa de plataforma es configurable con valor 0 (decisión 6): con 0 no se
 * envía `application_fee_amount`, porque mandar un cero es declarar una comisión
 * que no existe.
 */

import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { importeEnUnidadMinima, monedaEscritura } from '@/lib/moneda';
import { emitReservationModified } from './events';
import { dispararComunicacionReserva } from './comunicaciones';

export interface EstadoCobroTenant {
  /** ¿Se puede cobrar online hoy? Exige cuenta conectada y cobros habilitados. */
  disponible: boolean;
  stripeAccountId: string | null;
  estado: string;
  motivo?: string;
}

/**
 * Estado real de la cuenta de cobro del tenant.
 *
 * `chargesEnabled` es el dato que decide: una cuenta creada pero sin verificar no
 * puede cobrar, y aceptar una reserva con cobro online contra ella dejaría al
 * huésped sin poder pagar y al propietario creyendo que cobró.
 */
export async function estadoDeCobroDelTenant(tenantId: string): Promise<EstadoCobroTenant> {
  const cuenta = await prisma.hospitalityPaymentAccount.findFirst({
    where: { tenantId, provider: 'stripe' },
  });

  if (!cuenta?.stripeAccountId) {
    return {
      disponible: false,
      stripeAccountId: null,
      estado: cuenta?.estado || 'sin_conectar',
      motivo: 'La cuenta de cobro del alojamiento todavía no está conectada.',
    };
  }

  if (!cuenta.chargesEnabled) {
    return {
      disponible: false,
      stripeAccountId: cuenta.stripeAccountId,
      estado: cuenta.estado,
      motivo: 'La cuenta de cobro del alojamiento está pendiente de verificación.',
    };
  }

  return {
    disponible: true,
    stripeAccountId: cuenta.stripeAccountId,
    estado: cuenta.estado,
  };
}

export interface SesionDePago {
  url: string;
  sessionId: string;
}

/**
 * Crea la sesión de pago del anticipo (o del total) contra la cuenta del tenant.
 *
 * Devuelve el fallo en vez de lanzarlo: la página tiene que poder explicar que el
 * cobro online no está disponible y ofrecer el camino alternativo, no romperse.
 */
export async function crearSesionDePago(params: {
  tenantId: string;
  reservaId: string;
  /** Importe a cobrar ahora (anticipo, o total si no hay anticipo). */
  importe: number;
  moneda: string;
  descripcion: string;
  urlExito: string;
  urlCancelacion: string;
}): Promise<{ ok: true; sesion: SesionDePago } | { ok: false; motivo: string }> {
  const estado = await estadoDeCobroDelTenant(params.tenantId);
  if (!estado.disponible || !estado.stripeAccountId) {
    return { ok: false, motivo: estado.motivo || 'El cobro online no está disponible.' };
  }

  try {
    const sesion = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: params.moneda.toLowerCase(),
              product_data: { name: params.descripcion },
              unit_amount: importeEnUnidadMinima(params.importe, params.moneda),
            },
            quantity: 1,
          },
        ],
        success_url: params.urlExito,
        cancel_url: params.urlCancelacion,
        // Los identificadores van en la metadata: es lo único que el webhook
        // necesita para saber a qué reserva y a qué tenant pertenece el cobro.
        metadata: {
          hospitalityReservationId: params.reservaId,
          hospitalityTenantId: params.tenantId,
        },
      },
      // Cobro directo contra la cuenta del tenant: el dinero no pasa por Volkern.
      { stripeAccount: estado.stripeAccountId }
    );

    return { ok: true, sesion: { url: sesion.url || '', sessionId: sesion.id } };
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : 'Error de la pasarela de pago';
    console.error('[Hospitality] Error creando la sesión de pago:', mensaje);
    return { ok: false, motivo: `No se pudo abrir el pago: ${mensaje}` };
  }
}

/**
 * Registra un cobro confirmado por la pasarela y confirma la reserva.
 *
 * Idempotente por partida doble: el webhook de la plataforma ya filtra eventos
 * repetidos por su id, y aquí se comprueba además que ese cobro no esté ya
 * registrado, porque un pago contado dos veces descuadra el informe financiero.
 *
 * La reserva pasa a `confirmed` solo si seguía pendiente: si el propietario la
 * canceló mientras el huésped pagaba, resucitarla sería peor que dejar el cobro
 * registrado para devolverlo.
 */
export async function registrarCobroConfirmado(params: {
  sessionId: string;
  reservaId: string;
  tenantId: string;
  importe: number;
  moneda: string;
  paymentIntentId?: string | null;
}): Promise<{ ok: boolean; registrado: boolean; motivo?: string }> {
  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { id: params.reservaId, tenantId: params.tenantId },
    select: { id: true, estado: true, propertyId: true, unitId: true, currency: true },
  });

  if (!reserva) {
    return { ok: false, registrado: false, motivo: 'La reserva del cobro no existe en este tenant' };
  }

  const yaRegistrado = await prisma.hospitalityPayment.findFirst({
    where: { tenantId: params.tenantId, referenciaExterna: params.sessionId },
    select: { id: true },
  });
  if (yaRegistrado) {
    return { ok: true, registrado: false, motivo: 'Cobro ya registrado' };
  }

  await prisma.hospitalityPayment.create({
    data: {
      tenantId: params.tenantId,
      reservationId: reserva.id,
      propertyId: reserva.propertyId,
      unitId: reserva.unitId,
      importe: params.importe,
      // La divisa del cobro es la de la reserva, que ya viene de los datos.
      moneda: monedaEscritura(reserva.currency, params.moneda),
      metodo: 'stripe',
      estado: 'pagado',
      referenciaExterna: params.sessionId,
      stripePaymentIntentId: params.paymentIntentId || null,
      fechaPago: new Date(),
      notas: 'Cobro online de la reserva directa',
    },
  });

  if (reserva.estado === 'pending') {
    await prisma.hospitalityReservation.update({
      where: { id: reserva.id },
      data: { estado: 'confirmed' },
    });

    emitReservationModified({
      tenantId: params.tenantId,
      reservationId: reserva.id,
      propertyId: reserva.propertyId,
      unitId: reserva.unitId,
      channel: 'Directa',
      estado: 'confirmed',
    });

    // La confirmación al huésped se manda cuando la reserva queda pagada: antes
    // de eso no hay nada confirmado que contarle.
    dispararComunicacionReserva({
      tenantId: params.tenantId,
      reservationId: reserva.id,
      evento: 'confirmacion',
    }).catch((e: unknown) =>
      console.error('[Hospitality] Error en comunicación de confirmación (cobro):', e)
    );
  }

  return { ok: true, registrado: true };
}
