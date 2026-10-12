/**
 * app/api/erp/attendance/acknowledge-notice/route.ts
 *
 * Endpoint POST que registra la firma informada por el empleado de la cláusula
 * LOPDGDD Art. 88 sobre tratamiento de geolocalización del sistema de Control
 * Horario.
 *
 * Campos actualizados (Prisma modelo `Employee`):
 *   - `noticeAcknowledgedAt`   → DateTime UTC del momento exacto de la firma
 *   - `noticeVersionAccepted`  → Versión firmada (e.g. "v2-2026-vps")
 *   - `acceptedPolicies`       → JSON array, append-only concat de versiones firmadas
 *
 * Seguridad:
 *   - Sesión requerida (NextAuth `getServerSession`).
 *   - El empleado sólo puede firmar SU PROPIA cláusula; cross-tenant exploits
 *     quedan mitigados forzando que `Employee.userId == session.user.id`.
 *   - Idempotente: si el empleado vuelve a firmar la misma versión, sólo se
 *     añade al set `acceptedPolicies` y se actualiza `noticeAcknowledgedAt` a
 *     la última fecha (la fecha de última firma es la que cuenta para
 *     controversias legales).
 *
 * RGPD:
 *   - Audit log con `actor`, `target`, `acceptedPolicies_before/after`.
 *   - Los metadatos de cumplimiento NO son borrados ni exportados fuera del EEE.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateBody } from '@/lib/validation';

const AcknowledgeSchema = z.object({
  employeeId: z.string().min(1).max(64),
  noticeVersion: z
    .string()
    .min(3)
    .max(32)
    .regex(/^v\d+-\d{4}-[a-z0-9-]+$/, {
      message:
        'noticeVersion debe tener formato v<n>-<año>-<slug>, p.ej. v2-2026-vps',
    }),
  // source cerrado a una whitelist: integridad del audit log y endurecimiento
  // contra inyección de metadatos no controlados por el cliente.
  source: z.enum([
    'self-service',
    'manager-on-behalf',
    'bulk-import',
    'system-api',
  ]),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: 'NOT_AUTHENTICATED' },
      { status: 401 },
    );
  }

  const parsed = await validateBody(AcknowledgeSchema, await request.json());
  if (!(parsed as any).ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_REQUEST',
        message: 'Cuerpo JSON inválido.',
        issues: (parsed as any).issues,
      },
      { status: 400 },
    );
  }

  const { employeeId, noticeVersion, source } = (parsed as any).data;
  // LOPDGDD Art. 88 requiere prueba robusta del momento de firma.
  // SIEMPRE del lado del servidor — nunca aceptar timestamp del cliente,
  // porque eso permitiría retro-fechar la firma y debilitar la prueba
  // ante la AEPD o en un conflicto laboral.
  const whenISO = new Date().toISOString();

  // ── Autorización: el empleado sólo puede firmar SU PROPIA cláusula ────────
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, userId: session.user.id },
    select: {
      id: true,
      tenantId: true,
      noticeAcknowledgedAt: true,
      noticeVersionAccepted: true,
      acceptedPolicies: true,
      isActive: true,
    },
  });
  if (!employee) {
    return NextResponse.json(
      {
        ok: false,
        error: 'NOT_FOUND_OR_FORBIDDEN',
        message:
          'Empleado no encontrado para esta sesión, o no está vinculado a tu usuario.',
      },
      { status: 404 },
    );
  }
  if (!employee.isActive) {
    return NextResponse.json(
      {
        ok: false,
        error: 'EMPLOYEE_INACTIVE',
        message: 'Este expediente está marcado como no activo.',
      },
      { status: 403 },
    );
  }

  // ── Construcción idempotente del set de versiones aceptadas ──────────────
  const before: string[] = Array.isArray(employee.acceptedPolicies)
    ? (employee.acceptedPolicies as unknown as string[])
    : [];
  const after = Array.from(new Set([...before, noticeVersion]));

  // ── Auditoría antes del update (captura el diff) ─────────────────────────
  const updated = await prisma.$transaction(async (tx) => {
    const emp = await tx.employee.update({
      where: { id: employee.id },
      data: {
        noticeAcknowledgedAt: new Date(whenISO),
        noticeVersionAccepted: noticeVersion,
        acceptedPolicies: after,
      },
      select: {
        id: true,
        tenantId: true,
        noticeAcknowledgedAt: true,
        noticeVersionAccepted: true,
        acceptedPolicies: true,
      },
    });

    // Audit log inmutable para AEPD / inspección laboral / DPO.
    await tx.auditLog.create({
      data: {
        tenantId: employee.tenantId,
        userId: session.user.id,
        accion: 'ATTENDANCE_NOTICE_ACKNOWLEDGED',
        modulo: 'rrhh',
        descripcion: `Empleado ${employee.id} firmó cláusula RGPD/LOPDGDD Art. 88 v=${noticeVersion}`,
        metadata: {
          employeeId: employee.id,
          noticeVersion,
          acceptedAt: whenISO,
          source: source ?? 'self-service',
          before: {
            noticeAcknowledgedAt: employee.noticeAcknowledgedAt?.toISOString() ?? null,
            noticeVersionAccepted: employee.noticeVersionAccepted,
            acceptedPolicies: before,
          },
          after: {
            noticeAcknowledgedAt: whenISO,
            acceptedPolicies: after,
          },
          legalBasis: ['LOPDGDD Art. 88', 'RGPD Cap. III'],
        },
      } as any,
    });

    return emp;
  });

  return NextResponse.json({
    ok: true,
    employee: {
      id: updated.id,
      tenantId: updated.tenantId,
      noticeAcknowledgedAt: updated.noticeAcknowledgedAt?.toISOString() ?? null,
      noticeVersionAccepted: updated.noticeVersionAccepted,
      acceptedPolicies: Array.isArray(updated.acceptedPolicies)
        ? (updated.acceptedPolicies as unknown as string[])
        : [],
    },
    message:
      'Cláusula firmada correctamente. Tu próxima marcación quedará habilitada.',
  });
}

export async function GET() {
  // Endpoint de status (no destructivo). Útil para tooling.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }
  const employee = await prisma.employee.findFirst({
    where: { userId: session.user.id },
    select: {
      id: true,
      noticeAcknowledgedAt: true,
      noticeVersionAccepted: true,
      acceptedPolicies: true,
    },
  });
  if (!employee) {
    return NextResponse.json({ ok: false, error: 'NO_LINKED_EMPLOYEE' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    employee: {
      id: employee.id,
      noticeAcknowledgedAt: employee.noticeAcknowledgedAt?.toISOString() ?? null,
      noticeVersionAccepted: employee.noticeVersionAccepted,
      acceptedPolicies: Array.isArray(employee.acceptedPolicies)
        ? (employee.acceptedPolicies as unknown as string[])
        : [],
    },
  });
}
