export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AttendanceService } from '@/lib/erp/attendance-service';
import { prisma } from '@/lib/db';
import { validateBody } from '@/lib/validation';
import { z } from 'zod';

/** Schema que coincide con el body real del endpoint */
const PunchBodySchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(['entrada', 'salida', 'pausa_inicio', 'pausa_fin']),
  method: z.string().max(50).optional(),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
  evidenceUrl: z.string().optional(),
});

// GET /api/erp/attendance/status
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userEmail = auth.user!.email;

    const employee = await prisma.employee.findFirst({
      where: { email: userEmail, tenantId }
    });

    if (!employee) {
      return NextResponse.json({ status: 'OUT', message: 'No vinculado como empleado' });
    }

    const lastLog = await prisma.attendance.findFirst({
      where: { employeeId: employee.id, tenantId },
      orderBy: { timestamp: 'desc' }
    });

    return NextResponse.json({ 
      status: lastLog?.type || 'OUT',
      lastPunch: lastLog?.timestamp,
      employeeId: employee.id
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// POST /api/erp/attendance/punch
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const raw = await request.json();
    const body = validateBody(PunchBodySchema, raw);
    if (body instanceof NextResponse) return body;

    const { employeeId, type, method, locationLat, locationLng, evidenceUrl } = body;

    const result = await AttendanceService.registerAudit({
      employeeId,
      tenantId,
      type,
      method,
      locationLat,
      locationLng,
      evidenceUrl
    });

    // Desencadenar auditoría de IA asíncrona si hay evidencia
    if (evidenceUrl) {
      const { attendance_context_audit } = await import('@/lib/skills/attendance-skills');
      attendance_context_audit({ attendanceId: result.id, tenantId }).catch(console.error);
    }

    return NextResponse.json(result);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
