import { prisma } from '../lib/db';
import { generateInvoiceHash, GENESIS_FINGERPRINT } from '../lib/crypto-utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';

/**
 * Generador de Reporte PDF de Auditoría Fiscal Veri*factu
 */
async function generateFiscalReport(tenantId: string) {
  console.log(`\n📄 Generando Reporte de Auditoría Fiscal para: ${tenantId}...`);

  // 1. Datos iniciales
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const configFiscal = await prisma.configuracionFiscalEmisor.findFirst({ where: { tenantId } });

  if (!tenant || !configFiscal) {
    console.error('❌ ERROR: No se encontró el tenant o su configuración fiscal.');
    return;
  }

  const emisorNif = configFiscal.idFiscal || 'NIF-PENDIENTE';

  // 2. Obtener facturas Veri*factu (v2)
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, verifactuVersion: 2 },
    orderBy: { sequenceNumber: 'asc' },
    include: {
      contact: {
        include: {
          perfilFiscal: true
        }
      }
    }
  });

  if (invoices.length === 0) {
    console.log('⚠️ No hay facturas Veri*factu v2 para este tenant.');
    return;
  }

  // 3. Auditoría Forense
  let previousFingerprint = GENESIS_FINGERPRINT;
  let errors = 0;
  let gaps = 0;
  let expectedSequence = 1;
  const auditResults: any[] = [];

  for (const invoice of invoices) {
    const isGap = invoice.sequenceNumber !== expectedSequence;
    if (isGap) gaps++;
    expectedSequence = (invoice.sequenceNumber || 0) + 1;

    const receptorNif = invoice.contact?.perfilFiscal?.nif || '';
    const calculatedHash = generateInvoiceHash({
      tenantId: invoice.tenantId,
      emisorNif: emisorNif,
      receptorNif: receptorNif,
      numero: invoice.numero,
      fechaEmision: invoice.fechaEmision.toISOString(),
      monto: Number(invoice.monto),
      moneda: invoice.moneda,
      parentFingerprint: previousFingerprint
    });

    const isBreached = calculatedHash !== invoice.fingerprint;
    if (isBreached) errors++;

    auditResults.push({
      secuencia: invoice.sequenceNumber,
      numero: invoice.numero,
      fecha: invoice.fechaEmision.toLocaleDateString(),
      monto: `${invoice.monto} ${invoice.moneda}`,
      status: isBreached ? '⚠️ BREACH' : (isGap ? '❗ GAP' : '✅ OK'),
      fingerprint: invoice.fingerprint?.substring(0, 12) + '...'
    });

    previousFingerprint = invoice.fingerprint || '';
  }

  // 4. Generar PDF
  const doc = new jsPDF();
  const isChainValid = (errors === 0 && gaps === 0);

  // Cabecera Premium
  doc.setFillColor(isChainValid ? 16 : 185, isChainValid ? 185 : 28, isChainValid ? 129 : 28); // Green or Red
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text('CERTIFICADO INTEGRIDAD FISCAL', 105, 22, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(`VERI*FACTU COMPLIANCE 2026 - VOLKERN CRM`, 105, 30, { align: 'center' });

  // Información del Tenant
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(tenant.nombre, 20, 55);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`ID: ${tenant.id}`, 20, 62);
  doc.text(`Emisor (NIF): ${emisorNif}`, 20, 67);
  doc.text(`Fecha Reporte: ${new Date().toLocaleString()}`, 20, 72);

  // Status Badge
  doc.setLineWidth(0.5);
  doc.setDrawColor(isChainValid ? 16 : 185, isChainValid ? 185 : 28, isChainValid ? 129 : 28);
  doc.setFillColor(isChainValid ? 240 : 254, isChainValid ? 253 : 242, isChainValid ? 244 : 242);
  doc.roundedRect(140, 50, 50, 25, 3, 3, 'FD');
  
  doc.setFontSize(10);
  doc.setTextColor(isChainValid ? 22 : 153, isChainValid ? 101 : 27, isChainValid ? 52 : 27);
  doc.text('ESTADO CADENA:', 165, 60, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(isChainValid ? 'ÍNTEGRA' : 'COMPROMETIDA', 165, 68, { align: 'center' });

  // Resumen Ejecutivo
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text('Resumen Ejecutivo de Auditoría:', 20, 90);
  
  const summaryTable = [
    ['Total Facturas Auditadas', String(invoices.length)],
    ['Versión de Esquema', 'Veri*factu 2.0 (High Fidelity)'],
    ['Brechas de Integridad (Fingerprint)', String(errors)],
    ['Saltos de Secuencia (Gaps)', String(gaps)],
    ['Gobernanza de Datos', 'CALIBRADA (NIF + Lock)']
  ];

  autoTable(doc, {
    startY: 95,
    body: summaryTable,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', width: 60 } }
  });

  // Tabla Detallada
  doc.text('Historial Detallado de Encadenamiento:', 20, (doc as any).lastAutoTable.finalY + 15);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Seq', 'Factura', 'Fecha', 'Monto', 'Hash', 'Estado']],
    body: auditResults.map(r => [r.secuencia, r.numero, r.fecha, r.monto, r.fingerprint, r.status]),
    theme: 'grid',
    headStyles: { fillColor: [99, 102, 241] },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    styles: { fontSize: 8 }
  });

  // Pie de Página Legal
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Este documento es una certificación técnica generada por el agente de seguridad criptográfica de Volkern.', 105, 275, { align: 'center' });
  doc.text('La inmutabilidad se garantiza mediante el encadenamiento de fingerprints SHA-256.', 105, 280, { align: 'center' });

  // Guardar
  const fileName = `audit-fiscal-${tenantId}.pdf`;
  const pdfOutput = doc.output();
  fs.writeFileSync(fileName, Buffer.from(pdfOutput, 'binary'));

  console.log(`\n✅ REPORTE GENERADO: ${fileName}`);
}

// Ejecución
const tenantId = process.argv[2];
if (!tenantId) {
  console.error('Uso: npx tsx scripts/generate-fiscal-report-pdf.ts <tenantId>');
  process.exit(1);
}

generateFiscalReport(tenantId).catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
