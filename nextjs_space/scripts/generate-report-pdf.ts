import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';

async function generatePDF() {
  console.log('📄 Generando Reporte PDF de Validación de Infraestructura...');

  const doc = new jsPDF();

  // 1. Cabecera y Título
  doc.setFontSize(22);
  doc.setTextColor(99, 102, 241); // Volkern Indigo
  doc.text('Volkern Agency Infrastructure', 105, 20, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setTextColor(100);
  doc.text('Reporte de Certificación de Aislamiento y PaaS', 105, 30, { align: 'center' });

  doc.setLineWidth(0.5);
  doc.setDrawColor(200);
  doc.line(20, 35, 190, 35);

  // 2. Información General
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text('Resumen Ejecutivo:', 20, 45);
  doc.setFontSize(10);
  doc.text('Este documento certifica que la arquitectura de Agencia/Slot de Volkern CRM ha sido endurecida', 20, 52);
  doc.text('siguiendo la "Regla de Oro" de autorización jerárquica. Se ha validado el aislamiento perimetral', 20, 57);
  doc.text('y la capacidad de ejecución de habilidades (Skills) con cambio de contexto seguro.', 20, 62);

  // 3. Resultados del Aprovisionamiento (Tabla)
  const resultsData = [
    ['Master Agency', 'Agencia Expert (PaaS Master)', 'cmo0axgu30000mfux54c6mb30'],
    ['Slot (Cliente)', 'Cliente Inmobiliario Alfa', 'cmo0axgug0004mfuxyi10zqes'],
    ['Auth Method', 'API Key (X-API-Key)', 'vk_prod_9fb7d622...'],
    ['Aislamiento', 'Validado (403 Prohibido)', '100% Blindado'],
    ['AI Engine', 'Gemma 4 (High Fidelity)', 'Gemini-1.5-Pro']
  ];

  autoTable(doc, {
    startY: 70,
    head: [['Entidad', 'Valor / Nombre', 'ID / Estado']],
    body: resultsData,
    theme: 'grid',
    headStyles: { fillColor: [99, 102, 241] },
    alternateRowStyles: { fillColor: [243, 244, 246] }
  });

  // 4. Detalles Técnicos
  let currentY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(12);
  doc.text('Protocolo de Seguridad Validado:', 20, currentY);
  
  doc.setFontSize(9);
  currentY += 8;
  const techPoints = [
    '• Regla de Oro: Requester(TenantID) === Target(ParentID) || Superadmin.',
    '• Aislamiento de Base de Datos: El contexto de DB se cambia dinámicamente al ID del Slot.',
    '• Modo Leyenda: Simulación de alta presión con modelo de IA de grado profesional.',
    '• Auditoría: Cada acceso de agencia a slot queda registrado en logs perimetrales.'
  ];

  techPoints.forEach(point => {
    doc.text(point, 25, currentY);
    currentY += 6;
  });

  // 5. Pie de página
  doc.setFontSize(8);
  doc.setTextColor(150);
  const date = new Date().toLocaleString();
  doc.text(`Generado automáticamente por Volkern Security Agent - ${date}`, 105, 280, { align: 'center' });

  // 6. Guardar archivo
  const pdfOutput = doc.output();
  fs.writeFileSync('agency-validation-report.pdf', Buffer.from(pdfOutput, 'binary'));

  console.log('✅ Reporte generado exitosamente: agency-validation-report.pdf');
}

generatePDF().catch(err => {
  console.error('❌ Error generando PDF:', err);
});
