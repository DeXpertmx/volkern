export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/resend-email';

/**
 * GET /api/cron/compliance-reports
 * 
 * Genera y envía por email reportes PDF de compliance a administradores de tenant.
 * Diseñado para ejecutarse semanalmente (lunes) vía Vercel Cron Jobs.
 * 
 * Protegido por CRON_SECRET en producción.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const results: {
    tenantId: string;
    nombre: string;
    email: string;
    score?: number;
    sent: boolean;
    error?: string;
  }[] = [];

  try {
    // 1. Obtener tenants en modo compliance que tengan el addon activo
    const tenants = await prisma.tenant.findMany({
      where: {
        plan: { in: ['profesional', 'infinity'] },
      },
      select: {
        id: true,
        nombre: true,
        configuracion: true,
        users: {
          where: {
            role: { nombre: { in: ['Superadmin', 'Administrador', 'Admin'] } },
          },
          select: { email: true, name: true },
          take: 3,
        },
      },
      take: 50,
    });

    for (const tenant of tenants) {
      const config = tenant.configuracion as Record<string, any> | null;
      const hasCompliancePro = config?.complianceProActive === true;
      const complianceMode = config?.complianceMode === 'compliance';

      // Solo enviar a tenants con Compliance PRO activo O modo compliance activo
      if (!hasCompliancePro && !complianceMode) continue;

      const adminEmails = tenant.users.map((u) => u.email).filter(Boolean);

      if (adminEmails.length === 0) {
        results.push({
          tenantId: tenant.id,
          nombre: tenant.nombre,
          email: '',
          sent: false,
          error: 'Sin administradores',
        });
        continue;
      }

      try {
        // 2. Calcular score y métricas de compliance
        const [totalAuditLogs, alertasActivas, contratosPendientes, dealsEstancados] = await Promise.all([
          prisma.auditLog.count({ where: { tenantId: tenant.id } }),
          prisma.systemAlert.count({ where: { resolved: false } }),
          prisma.contrato.count({
            where: {
              tenantId: tenant.id,
              estado: 'borrador',
              fechaCreacion: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
          }),
          prisma.deal.count({
            where: {
              tenantId: tenant.id,
              etapa: { notIn: ['ganado', 'perdido', 'closed_won', 'closed_lost'] },
              fechaUltimaActividad: { lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              estado: 'activo',
            },
          }),
        ]);

        // Score simplificado semanal
        const score = Math.min(
          100,
          Math.round(
            40 + // base
            Math.min(30, totalAuditLogs / 100) + // trazabilidad: max +30
            (alertasActivas === 0 ? 15 : Math.max(0, 15 - alertasActivas * 3)) + // alertas: max +15
            (contratosPendientes === 0 ? 10 : Math.max(0, 10 - contratosPendientes * 2)) + // docs: max +10
            (dealsEstancados === 0 ? 5 : Math.max(0, 5 - dealsEstancados)) // procesos: max +5
          )
        );

        // 3. Generar reporte HTML (el PDF se genera al vuelo si se solicita)
        const reporteHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1e293b; font-size: 20px;">📊 Reporte Semanal de Compliance</h1>
            <p style="color: #64748b; font-size: 13px;">Periodo: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            
            <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 16px 0;">
              <h2 style="color: #6366f1; font-size: 32px; margin: 0;">${score}%</h2>
              <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Score de cumplimiento</p>
            </div>

            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                  <strong>🛡️ Trazabilidad</strong><br/>
                  <span style="font-size: 12px; color: #64748b;">${totalAuditLogs.toLocaleString()} registros de auditoría</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                  <span style="font-size: 20px; font-weight: bold; color: ${totalAuditLogs > 100 ? '#059669' : '#d97706'};">${Math.min(100, Math.round(totalAuditLogs / 100 * 33 + 40))}%</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                  <strong>🔔 Alertas</strong><br/>
                  <span style="font-size: 12px; color: #64748b;">${alertasActivas} alertas activas</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                  <span style="font-size: 20px; font-weight: bold; color: ${alertasActivas === 0 ? '#059669' : '#dc2626'};">${alertasActivas === 0 ? '✅' : '⚠️'}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                  <strong>📄 Documentación</strong><br/>
                  <span style="font-size: 12px; color: #64748b;">${contratosPendientes} contratos pendientes de firma</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                  <span style="font-size: 20px; font-weight: bold; color: ${contratosPendientes === 0 ? '#059669' : '#d97706'};">${contratosPendientes === 0 ? '✅' : '⚠️'}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                  <strong>⚙️ Procesos</strong><br/>
                  <span style="font-size: 12px; color: #64748b;">${dealsEstancados} deals sin actividad en 30 días</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                  <span style="font-size: 20px; font-weight: bold; color: ${dealsEstancados === 0 ? '#059669' : '#d97706'};">${dealsEstancados === 0 ? '✅' : '⚠️'}</span>
                </td>
              </tr>
            </table>

            <div style="margin-top: 20px; padding: 16px; background: #eef2ff; border-radius: 8px;">
              <p style="font-size: 12px; color: #4338ca; margin: 0;">
                🔗 <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.volkern.app'}/dashboard/compliance" style="color: #4338ca; font-weight: bold;">Ver dashboard completo →</a>
              </p>
              <p style="font-size: 11px; color: #6366f1; margin: 8px 0 0;">
                Reporte generado automáticamente por Volkern Compliance PRO. Para desactivar, contacta a soporte.
              </p>
            </div>
          </div>
        `;

        // 4. Enviar por email al primer admin
        const adminEmail = adminEmails[0];
        
        // Enviar reporte vía Resend
        const emailResult = await sendEmail({
          to: adminEmail,
          subject: `📊 Reporte Semanal de Compliance — ${tenant.nombre} (${score}%)`,
          html: reporteHtml,
          from: `Volkern Compliance <compliance@volkern.app>`,
        });

        if (!emailResult.success) {
          console.error(`[Cron/ComplianceReports] Error enviando email a ${adminEmail}: ${emailResult.error}`);
        }
        
        await prisma.auditLog.create({
          data: {
            tenantId: tenant.id,
            accion: 'COMPLIANCE_REPORT_SCHEDULED',
            entidad: 'Tenant',
            entidadId: tenant.id,
            descripcion: `Reporte semanal de compliance ${emailResult.success ? 'enviado a' : 'falló para'} ${adminEmail}. Score: ${score}%. Alertas: ${alertasActivas}.`,
            metadata: {
              score,
              alertasActivas,
              contratosPendientes,
              dealsEstancados,
              totalAuditLogs,
              adminEmail,
              emailSent: emailResult.success,
              emailMessageId: emailResult.messageId || null,
              reportType: 'weekly',
              generatedAt: new Date().toISOString(),
            },
          },
        });

        results.push({
          tenantId: tenant.id,
          nombre: tenant.nombre,
          email: adminEmail,
          score,
          sent: emailResult.success,
        });
      } catch (error: any) {
        results.push({
          tenantId: tenant.id,
          nombre: tenant.nombre,
          email: adminEmails[0] || '',
          sent: false,
          error: error.message,
        });
      }
    }

    const succeeded = results.filter((r) => r.sent).length;
    const failed = results.filter((r) => !r.sent).length;

    console.log(`[Cron/ComplianceReports] ${succeeded} enviados, ${failed} fallidos de ${results.length} tenants`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: { total: results.length, succeeded, failed },
      results,
    });
  } catch (error: any) {
    console.error('[Cron/ComplianceReports] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
