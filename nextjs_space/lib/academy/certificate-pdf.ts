/**
 * Genera el PDF de un certificado de la Academia.
 * Devuelve el Buffer listo para servir como application/pdf.
 * Se reutiliza desde el endpoint de descarga y desde el render público.
 */
export interface CertificatePdfData {
  codigoUnico: string;
  integrityHash?: string | null;
  fechaEmision: Date;
  estudianteNombre: string;
  cursoTitulo: string;
  cursoDescripcion?: string | null;
  instructor?: string | null;
  tenantNombre?: string | null;
}

export async function generateCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  // Import diferido: jspdf pesa ~29M y solo se necesita al generar el PDF.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 297mm
  const pageH = doc.internal.pageSize.getHeight(); // 210mm
  const MARGIN = 14;

  // Fondo sutil con marco
  doc.setFillColor(245, 242, 255); // indigo-50
  doc.rect(0, 0, pageW, pageH, 'F');

  // Marco decorativo
  doc.setDrawColor(124, 58, 237); // indigo-600
  doc.setLineWidth(1.5);
  doc.roundedRect(MARGIN, MARGIN, pageW - MARGIN * 2, pageH - MARGIN * 2, 6, 6, 'S');
  doc.setDrawColor(196, 181, 253); // indigo-300
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN + 3, MARGIN + 3, pageW - (MARGIN + 3) * 2, pageH - (MARGIN + 3) * 2, 4, 4, 'S');

  // Cabecera
  const tenantName = data.tenantNombre || 'VOLKERN ACADEMY';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(124, 58, 237);
  doc.text(tenantName.toUpperCase(), pageW / 2, 34, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(124, 58, 237);
  doc.text('CERTIFICA QUE', pageW / 2, 48, { align: 'center', charSpace: 2 });

  // Nombre del estudiante
  doc.setFontSize(34);
  doc.setTextColor(30, 27, 75); // indigo-950
  doc.text(data.estudianteNombre.toUpperCase(), pageW / 2, 70, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('ha completado de forma satisfactoria el curso', pageW / 2, 82, { align: 'center' });

  // Curso
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // slate-900
  const cursoSplit = doc.splitTextToSize(data.cursoTitulo.toUpperCase(), pageW - 80);
  doc.text(cursoSplit, pageW / 2, 96, { align: 'center' });

  let y = 96 + (cursoSplit.length * 8) + 4;

  if (data.cursoDescripcion) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    const descSplit = doc.splitTextToSize(data.cursoDescripcion, pageW - 110);
    doc.text(descSplit, pageW / 2, y, { align: 'center' });
    y += descSplit.length * 4.5 + 6;
  }

  if (data.instructor) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(124, 58, 237);
    doc.text(`Impartido por ${data.instructor}`, pageW / 2, y, { align: 'center' });
  }

  // Fecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const fecha = new Date(data.fechaEmision).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  doc.text(`Expedido el ${fecha}`, pageW / 2, pageH - 46, { align: 'center' });

  // Código de verificación
  doc.setDrawColor(196, 181, 253);
  doc.setLineWidth(0.4);
  doc.line(pageW / 2 - 55, pageH - 40, pageW / 2 + 55, pageH - 40);
  doc.setFontSize(8);
  doc.setTextColor(124, 58, 237);
  doc.text('CÓDIGO DE VERIFICACIÓN', pageW / 2, pageH - 33, { align: 'center', charSpace: 1 });
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 27, 75);
  // Distribuir el código para facilitar su lectura manual
  const code = data.codigoUnico.replace(/-/g, '  ');
  doc.text(code, pageW / 2, pageH - 27, { align: 'center' });

  if (data.integrityHash) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(`Hash de integridad: ${data.integrityHash}`, pageW / 2, pageH - 19, { align: 'center' });
    doc.text('Verifica la autenticidad en el portal de la Academia', pageW / 2, pageH - 14, { align: 'center' });
  }

  const output = doc.output('arraybuffer');
  return Buffer.from(output);
}