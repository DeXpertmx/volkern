export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { EmployeeBenefitSchema } from '@/lib/validation/schemas';
import { z } from 'zod';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const raw = await request.json();
    const body = validateBody(EmployeeBenefitSchema.extend({
      frequency: z.string().max(50).optional(),
      category: z.string().max(100).optional(),
      requiresAttendanceValidation: z.boolean().optional(),
      minimumAttendancePercent: z.coerce.number().min(0).max(100).optional(),
      requiresPhysicalPresence: z.boolean().optional(),
    }), raw);
    if (body instanceof NextResponse) return body;

    const benefit = await prisma.employeeBenefit.create({
      data: {
        tenantId: auth.tenant!.id,
        employeeId: body.employeeId,
        concept: body.tipo,
        description: body.descripcion || null,
        amount: body.valorMensual || null,
        frequency: body.frequency || null,
        category: body.category || 'other',
        requiresAttendanceValidation: !!body.requiresAttendanceValidation,
        minimumAttendancePercent: body.minimumAttendancePercent ? Number(body.minimumAttendancePercent) : null,
        requiresPhysicalPresence: !!body.requiresPhysicalPresence,
        startDate: body.fechaInicio ? new Date(body.fechaInicio) : null,
        endDate: body.fechaFin ? new Date(body.fechaFin) : null,
        createdBy: auth.user!.id,
        active: body.activo ?? true,
      } as any
    });

    return NextResponse.json(benefit);
  } catch (error) {
    console.error('Error creating benefit:', error);
    return NextResponse.json({ error: 'Error al crear el beneficio' }, { status: 500 });
  }
}, ['erp:write']);

export const GET = withTenantAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId');

  if (!employeeId) return NextResponse.json({ error: 'Missing employeeId' }, { status: 400 });

  const benefits = await prisma.employeeBenefit.findMany({
    where: {
      tenantId: auth.tenant!.id,
      employeeId,
      active: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json(benefits);
}, ['erp:read']);
