export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/academy/supervisor/skill-gaps
 * Analiza la brecha de habilidades de la plantilla.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // 1. Get all staff (Users)
    const staff = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: { select: { name: true } } }
    });

    // 2. Get all operational courses
    const courses = await prisma.curso.findMany({
      where: { tenantId },
      select: { id: true, titulo: true }
    });

    // 3. Map staff to their certifications
    const skillGapReport = await Promise.all(staff.map(async (s) => {
      const estudiante = await prisma.estudiante.findFirst({
        where: { email: s.email, tenantId },
        include: { certificados: true }
      });

      const certifiedCourses = estudiante?.certificados.map(c => c.cursoId) || [];
      const missingCourses = courses.filter(c => !certifiedCourses.includes(c.id));

      return {
        userId: s.id,
        name: s.name || s.email,
        email: s.email,
        role: s.role?.name,
        hasAcademyProfile: !!estudiante,
        certificationsCount: certifiedCourses.length,
        missingSkills: missingCourses,
        status: certifiedCourses.length >= courses.length ? 'FULLY_QUALIFIED' : (certifiedCourses.length > 0 ? 'PARTIAL' : 'NOT_QUALIFIED')
      };
    }));

    // 4. Analyze upcoming work orders and their requirements
    const activeWorkOrders = await prisma.workOrder.findMany({
      where: { tenantId, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      include: { bom: true }
    });

    const criticalRisks = activeWorkOrders.filter(wo => {
      const reqId = wo.requiredCourseId || wo.bom.requiredCourseId;
      if (!reqId) return false;
      // If there are NO staff members certified for this course, it's a critical risk
      const certifiedStaff = skillGapReport.filter(s => 
        !s.missingSkills.find(ms => ms.id === reqId)
      );
      return certifiedStaff.length === 0;
    }).map(wo => ({
      workOrderId: wo.id,
      batchNumber: wo.batchNumber,
      requiredCourseId: wo.requiredCourseId || wo.bom.requiredCourseId,
      severity: 'CRITICAL',
      message: `No hay personal certificado para la orden ${wo.batchNumber}`
    }));

    return NextResponse.json({
      report: skillGapReport,
      criticalRisks,
      stats: {
        totalStaff: staff.length,
        fullyQualified: skillGapReport.filter(s => s.status === 'FULLY_QUALIFIED').length,
        atRiskWorkOrders: criticalRisks.length
      }
    });
  } catch (error: any) {
    console.error('Error in skill gap analysis:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:read']);
