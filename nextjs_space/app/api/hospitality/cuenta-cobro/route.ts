export const dynamic = 'force-dynamic';

/**
 * Cuenta de cobro Stripe Connect del tenant (FASE 3.C de hospitality).
 *
 * GET    /api/hospitality/cuenta-cobro          — estado de la cuenta Connect.
 * POST   /api/hospitality/cuenta-cobro          — iniciar onboarding KYC
 *          (crea la cuenta Express y devuelve el link de Stripe).
 * PATCH  /api/hospitality/cuenta-cobro          — sincronizar el estado real
 *          con Stripe (tras volver del onboarding, o a demanda).
 *
 * Regla del plan (criterio 4): el dinero de la reserva directa llega a la
 * cuenta DEL TENANT. Esta cuenta es la que habilita ese cobro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import {
  iniciarOnboarding,
  obtenerCuenta,
  sincronizarCuenta,
} from '@/lib/stripe/connect';

// GET /api/hospitality/cuenta-cobro — estado de la cuenta de cobro del tenant.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const cuenta = await obtenerCuenta(auth.tenant!.id);
    return NextResponse.json({ cuenta });
  } catch (error) {
    console.error('Error obteniendo cuenta de cobro:', error);
    return NextResponse.json({ error: 'Error al obtener la cuenta de cobro' }, { status: 500 });
  }
}

// POST /api/hospitality/cuenta-cobro — onboarding KYC (link de Stripe Express).
// Body: { return_url?, refresh_url? }
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => ({}));
    const origen = new URL(req.url).origin;
    const returnUrl = body.return_url || `${origen}/dashboard/hospitality/finanzas?pago_cuenta=retorno`;
    const refreshUrl = body.refresh_url || `${origen}/dashboard/hospitality/finanzas?pago_cuenta=refrescar`;

    // Email del usuario actual como contacto de la cuenta Express.
    const user = await prisma.user.findUnique({ where: { id: auth.user!.id }, select: { email: true } });

    const { stripeAccountId, url } = await iniciarOnboarding(tenantId, user?.email || '', {
      refresh: refreshUrl,
      return: returnUrl,
    });

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'actualizar',
      'hospitality_payment_account',
      stripeAccountId,
      'Onboarding de Stripe Connect iniciado'
    ).catch(() => {});

    return NextResponse.json({ url, stripeAccountId }, { status: 201 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al iniciar el onboarding';
    const codigo = mensaje.includes('STRIPE_SECRET_KEY') ? 503 : 500;
    console.error('Error en onboarding Connect:', error);
    return NextResponse.json({ error: mensaje }, { status: codigo });
  }
}

// PATCH /api/hospitality/cuenta-cobro — sincronizar estado con Stripe.
export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const cuenta = await sincronizarCuenta(auth.tenant!.id);
    return NextResponse.json({ cuenta });
  } catch (error) {
    console.error('Error sincronizando cuenta de cobro:', error);
    return NextResponse.json({ error: 'Error al sincronizar la cuenta de cobro' }, { status: 500 });
  }
}
