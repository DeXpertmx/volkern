export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { PayrollService } from '@/lib/erp/payroll-service';
import { PDFService } from '@/lib/erp/pdf-service';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/erp/payroll/sign/[id]
 * Genera el sello inmutable para una nómina y la registra en la base de datos
 */
export const POST = withTenantAuth(async (request, auth) => {
  const url = new URL(request.url);
  // Extracción del ID desde la URL (Next.js App Router params)
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];
  
  const body = await request.json();
  const { bonuses, finalNet, operatorNote } = body;

  try {
    // Si es una nómina pendiente (ID temporal), necesitamos el employeeId real
    // En este flujo, el ID es 'pending_employeeId_month_year'
    const parts = id.split('_');
    const employeeId = parts[1];
    const month = parseInt(parts[2]);
    const year = parseInt(parts[3]);

    // 1. Recalcular para asegurar integridad en servidor
    const calculation = await PayrollService.calculateEmployeePayroll(employeeId, month, year);
    
    // Aplicar bonos manuales si existen
    const bonusArray = Array.isArray(bonuses) ? bonuses : [];
    const totalBonus = bonusArray.reduce((acc, b) => acc + Number(b.amount), 0);
    calculation.bonusAmount = totalBonus;
    calculation.bonusesDetails = bonusArray;
    
    // 2. Generar Acta Firmada (PDF + Hash)
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true }
    });

    if (!employee) throw new Error('Empleado no encontrado');

    const signResult = await PDFService.generateSignedActa({
      tenantId: auth.tenant!.id,
      documentType: 'NOMINA',
      title: `NÓMINA: ${employee.user!.name}`,
      content: [],
      signerName: (employee.user as any)?.name || 'CEO Volkern',
      signerId: employee.id, // En producción sería el ID del administrador
      operatorNote: operatorNote,
      payrollData: {
        baseSalary: calculation.baseSalary,
        absentDays: calculation.absentDays,
        deductions: calculation.deductions,
        commissionAmount: calculation.commissionAmount,
        bonusAmount: calculation.bonusAmount,
        irpfAmount: calculation.irpfAmount,
        ssAmount: calculation.ssAmount,
        totalNet: calculation.totalNet,
        month: `${new Date(year, month-1).toLocaleString('es-ES', { month: 'long' })} ${year}`,
        benefits: calculation.benefitsDetails
      }
    });

    // 3. Persistir en la base de datos
    const record = await prisma.payrollRecord.create({
      data: {
        tenantId: auth.tenant!.id,
        employeeId: employee.id,
        month,
        year,
        amountEncrypted: calculation.totalNet.toString(),
        status: 'PAID',
        vaultSeed: signResult.documentHash,
        notes: `Nómina sellada con ${bonusArray.length} bonos y ${calculation.benefitsDetails.length} ayudas. Anomalías: ${calculation.flaggedBenefits.length}${operatorNote ? ` | Justificación: ${operatorNote}` : ''}`,
        metadata: {
           bonuses: bonusArray,
           operatorNote,
           benefits: {
             applied: calculation.benefitsDetails,
             flagged: calculation.flaggedBenefits,
             excluded: calculation.excludedBenefits,
             attendancePercent: calculation.attendancePercent,
             snifferSnapshot: calculation.snifferSnapshot
           },
           documentHash: signResult.documentHash,
           signatureId: signResult.signatureId,
           evaluatedAt: new Date().toISOString()
        }
      } as any
    });

    // 6. Disparar Alerta de Telegram si hay anomalías justificadas (Fase 5)
    if (calculation.flaggedBenefits.length > 0 && operatorNote) {
       const { TelegramWatchdog } = await import('@/lib/security/telegram-watchdog');
       await TelegramWatchdog.sendSecurityBrief(auth.tenant!.id, {
         event: 'PAYROLL_ANOMALY_SIGNATURE',
         employeeName: employee.fullName,
         riskSummary: `${calculation.flaggedBenefits.length} anomalías detectadas en beneficios.`,
         metadata: {
           attendancePercent: calculation.attendancePercent,
           operatorNote
         },
         roadmapLink: `https://volkern.nexus/dashboard/rrhh?payroll=${id}`
       });
    }

    return NextResponse.json({ 
      success: true, 
      record, 
      hash: signResult.documentHash,
      signatureId: signResult.signatureId
    });
  } catch (error) {
    console.error('Error signing payroll:', error);
    return NextResponse.json({ error: 'Error en el protocolo de firma digital' }, { status: 500 });
  }
}, ['erp:write']);
