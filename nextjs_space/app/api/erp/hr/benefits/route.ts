export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { 
      employeeId, 
      concept, 
      description, 
      amount, 
      frequency, 
      startDate, 
      endDate,
      category,
      requiresAttendanceValidation,
      minimumAttendancePercent,
      requiresPhysicalPresence
    } = body;

    const benefit = await prisma.employeeBenefit.create({
      data: {
        tenantId: auth.tenant!.id,
        employeeId,
        concept,
        description,
        category: category || 'other',
        amount,
        frequency,
        requiresAttendanceValidation: !!requiresAttendanceValidation,
        minimumAttendancePercent: minimumAttendancePercent ? Number(minimumAttendancePercent) : null,
        requiresPhysicalPresence: !!requiresPhysicalPresence,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        createdBy: auth.user!.id,
        active: true
      }
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
