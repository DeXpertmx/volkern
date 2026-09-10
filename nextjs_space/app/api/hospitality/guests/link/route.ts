export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

/**
 * POST /api/hospitality/guests/link — vincular manualmente un huésped sin
 * contacto a un contacto existente del CRM (plan maestro §20).
 *
 * El huésped viene identificado por su guestKey (la misma que genera el GET):
 *   contact:<id>         → ya vinculado (no-op / error)
 *   email:<email>        → reservas cuyo guestData.email coincide
 *   phone:<telefono>     → reservas cuyo guestData.phone/telefono coincide
 *   name:<nombre>        → reservas cuyo guestData nombre coincide
 *   anon:<reservationId> → una reserva concreta sin datos de huésped
 *
 * Body: { guestKey: string, contactId: string, reservationIds?: string[] }
 * El contacto debe pertenecer al mismo tenant (aislamiento multi-tenant).
 * reservationIds (opcional) permite vincular de forma exacta las reservas
 * del huésped sin depender del matching por nombre/email en guestData.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const guestKey = typeof body?.guestKey === 'string' ? body.guestKey : '';
    const contactId = typeof body?.contactId === 'string' ? body.contactId : '';
    const reservationIds = Array.isArray(body?.reservationIds)
      ? body.reservationIds.filter((x: unknown): x is string => typeof x === 'string')
      : [];

    if ((!guestKey && reservationIds.length === 0) || !contactId) {
      return NextResponse.json(
        { error: 'guestKey o reservationIds y contactId son obligatorios' },
        { status: 400 }
      );
    }

    // El contacto debe existir en el mismo tenant (nunca cruzar tenants).
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
    if (!contact) {
      return NextResponse.json(
        { error: 'El contacto no existe en este tenant' },
        { status: 404 }
      );
    }

    const guestData = {
      nombre: contact.nombre || null,
      firstName: contact.nombre || null,
      name: contact.nombre || null,
      email: contact.email || null,
      phone: contact.telefono || null,
      telefono: contact.telefono || null,
    };

    // Si llegan reservationIds explícitos, son la fuente de verdad exacta:
    // se actualizan esas reservas del tenant directamente (sin matching).
    if (reservationIds.length > 0) {
      const result = await prisma.hospitalityReservation.updateMany({
        where: { id: { in: reservationIds }, tenantId, contactId: null },
        data: { contactId, guestData },
      });
      return NextResponse.json({
        ok: true,
        vinculadas: result.count,
        contactId,
        contact: { id: contact.id, nombre: contact.nombre },
      });
    }

    // ── Interpretar la guestKey para localizar las reservas del huésped ──
    let where: any = { tenantId };
    // (El flujo de reservationIds ya retornó arriba; aquí sigue la guestKey.)

    if (guestKey.startsWith('contact:')) {
      return NextResponse.json(
        { error: 'El huésped ya está vinculado a un contacto del CRM' },
        { status: 400 }
      );
    } else if (guestKey.startsWith('email:')) {
      const email = guestKey.slice('email:'.length).trim();
      if (!email) return NextResponse.json({ error: 'guestKey inválida' }, { status: 400 });
      where = {
        tenantId,
        contactId: null,
        OR: [
          { guestData: { path: ['email'], string_contains: email } },
          { guestData: { path: ['email'], equals: email.toLowerCase() } },
        ],
      };
    } else if (guestKey.startsWith('phone:')) {
      const phone = guestKey.slice('phone:'.length).trim();
      if (!phone) return NextResponse.json({ error: 'guestKey inválida' }, { status: 400 });
      where = {
        tenantId,
        contactId: null,
        OR: [
          { guestData: { path: ['phone'], string_contains: phone } },
          { guestData: { path: ['telefono'], string_contains: phone } },
        ],
      };
    } else if (guestKey.startsWith('name:')) {
      const nombre = guestKey.slice('name:'.length).trim().toLowerCase();
      if (!nombre) return NextResponse.json({ error: 'guestKey inválida' }, { status: 400 });
      where = {
        tenantId,
        contactId: null,
        OR: [
          { guestData: { path: ['nombre'], string_contains: nombre } },
          { guestData: { path: ['firstName'], string_contains: nombre } },
          { guestData: { path: ['name'], string_contains: nombre } },
        ],
      };
    } else if (guestKey.startsWith('anon:')) {
      const reservationId = guestKey.slice('anon:'.length).trim();
      if (!reservationId) return NextResponse.json({ error: 'guestKey inválida' }, { status: 400 });
      where = { tenantId, id: reservationId };
    } else {
      return NextResponse.json({ error: 'guestKey inválida' }, { status: 400 });
    }

    // ── Vincular: asignar contactId y copiar datos del contacto al guestData ──
    const result = await prisma.hospitalityReservation.updateMany({
      where,
      data: { contactId, guestData },
    });

    return NextResponse.json({
      ok: true,
      vinculadas: result.count,
      contactId,
      contact: { id: contact.id, nombre: contact.nombre },
    });
  } catch (error) {
    console.error('Error vinculando huésped a contacto:', error);
    return NextResponse.json({ error: 'Error al vincular el huésped' }, { status: 500 });
  }
}