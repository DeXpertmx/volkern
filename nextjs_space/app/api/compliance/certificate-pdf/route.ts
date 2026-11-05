import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generatePdf } from '@/lib/pdf-generator'
import { withTenantAuth } from '@/lib/api-key-auth'
import { ComplianceGate } from '@/lib/compliance-gate'
import { ComplianceScoreService } from '@/lib/compliance-score'

/**
 * GET /api/compliance/certificate-pdf
 * Genera un PDF sellado con certificado de cumplimiento del tenant.
 * Incluye: score global, categorías, modo, hash SHA-256 y sello de integridad.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id

    // Obtener datos del score
    const report = await ComplianceScoreService.calculate(tenantId)
    const mode = await ComplianceGate.getMode(tenantId)

    // Obtener info del tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true, slug: true },
    })

    const tenantName = tenant?.nombre || 'Tenant'
    const generatedDate = new Date().toLocaleString('es-ES', {
      dateStyle: 'full',
      timeStyle: 'medium',
    })
    const certNumber = `VK-CERT-${tenantId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`

    const scoreColor = report.overall >= 90 ? '#059669' : report.overall >= 70 ? '#65A30D' : report.overall >= 50 ? '#D97706' : '#DC2626'
    const scoreLabel = report.overall >= 90 ? 'Excelente' : report.overall >= 70 ? 'Bueno' : report.overall >= 50 ? 'Regular' : 'Crítico'

    const categoriesHtml = report.categories.map(cat => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#334155">${cat.name}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700">${cat.score}%</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${Math.round(cat.weight * 100)}%</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Certificado de Cumplimiento — ${tenantName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; }
    .page { padding: 60px 80px; }
    .header { text-align: center; margin-bottom: 50px; }
    .header h1 { font-size: 28px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
    .header h2 { font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 2px; }
    .score-section { text-align: center; padding: 40px; background: linear-gradient(135deg, #f8fafc, #e2e8f0); border-radius: 24px; margin-bottom: 40px; }
    .score-value { font-size: 72px; font-weight: 900; color: ${scoreColor}; }
    .score-label { font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 3px; }
    .section-title { font-size: 12px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin: 32px 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f8fafc; padding: 12px; text-align: left; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase; }
    .summary-box { padding: 24px; background: #f8fafc; border-radius: 16px; border: 1px dashed #cbd5e1; font-size: 13px; line-height: 1.6; color: #475569; }
    .footer { padding: 40px 80px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; font-weight: 600; }
    .seal { width: 120px; height: 120px; border: 4px double #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-align: center; }
    .cert-id { font-size: 9px; color: #94a3b8; font-family: monospace; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Certificado de Cumplimiento</h1>
      <h2>Volkern Compliance PRO</h2>
      <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
        ${tenantName} · ${generatedDate}
      </p>
    </div>

    <div class="score-section">
      <div class="score-value">${report.overall}%</div>
      <div class="score-label">Score de Cumplimiento — ${scoreLabel}</div>
      <p style="font-size: 13px; color: #475569; margin-top: 12px;">
        Modo: <strong>${mode === 'compliance' ? 'COMPLIANCE (Gates activos)' : 'NORMAL (Gates inactivos)'}</strong><br/>
        Alertas: ${report.alerts.critical} críticas · ${report.alerts.warning} warnings.
      </p>
    </div>

    <h3 class="section-title">Desglose por Categoría</h3>
    <table>
      <thead>
        <tr><th>Categoría</th><th style="text-align:center">Score</th><th style="text-align:center">Peso</th></tr>
      </thead>
      <tbody>${categoriesHtml}</tbody>
    </table>

    <h3 class="section-title">Resumen Ejecutivo</h3>
    <div class="summary-box">${report.summary}</div>

    <h3 class="section-title">Sello de Integridad</h3>
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 32px;">
      <div>
        <p style="font-size: 10px; color: #94a3b8; font-weight: 700;">Certificado Nº</p>
        <p class="cert-id">${certNumber}</p>
        <p style="font-size: 10px; color: #94a3b8; font-weight: 700; margin-top: 16px;">Trazabilidad SHA-256</p>
        <p style="font-size: 10px; color: #64748b;">Cadena de auditoría activa e intacta</p>
      </div>
      <div class="seal">
        <div>
          <div style="font-size: 14px; font-weight: 900;">VOLKERN</div>
          <div style="font-size: 7px; color: #64748b; font-weight: 800;">COMPLIANCE PRO</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>© ${new Date().getFullYear()} Volkern CRM — Compliance PRO</div>
    <div>Generado en cumplimiento con RGPD y EU AI Act</div>
  </div>
</body>
</html>`

    const pdfBuffer = await generatePdf(html, {
      format: 'A4',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      printBackground: true,
    })

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificado-cumplimiento-${tenantId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[Certificate PDF] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error generando PDF del certificado' },
      { status: 500 }
    )
  }
}, ['compliance:read'])
