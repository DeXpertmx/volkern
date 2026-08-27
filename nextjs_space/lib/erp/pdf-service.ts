import { SignatureService } from '../security/signature-service';
import { prisma } from '../db';

export interface PDFContext {
  tenantId: string;
  documentType: 'ACTA_ENTREGA' | 'APROBACION_VACACIONES' | 'NOMINA';
  title: string;
  content: string[];
  signerName: string;
  signerId: string;
  location?: { lat: number, lng: number };
  operatorNote?: string;
  metadata?: any;
  payrollData?: {
    baseSalary: number;
    absentDays: number;
    deductions: number;
    commissionAmount: number;
    bonusAmount: number;
    irpfAmount: number;
    ssAmount: number;
    totalNet: number;
    month: string;
    benefits: { concept: string, amount: number }[];
  };
  contractData?: {
    numero: string;
    titulo: string;
    total: number;
    moneda: string;
    frecuencia: string;
    cliente: {
      nombre: string;
      nif: string;
      direccion: string;
    };
    clausulas?: string[];
    anexos?: string[];
  };
}

export class TemplateEngine {
  /**
   * Sustituye placeholders {{objeto.propiedad}} por valores reales
   */
  static replaceVariables(text: string, data: any): string {
    return text.replace(/\{\{(.+?)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value = data;
      for (const key of keys) {
        value = value?.[key];
      }
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Aplica lógica de negocio para inyectar cláusulas dinámicas
   */
  static applyConditionalLogic(clauses: string[], data: any): string[] {
    const processed = [...clauses];
    
    // Regla de Oro: Contratos > 50k requieren revisión jurídica semestral
    if (data.total > 50000) {
      processed.push("CLÁUSULA DE SEGURIDAD OPERATIVA: Debido a que el volumen del presente contrato supera los 50,000.00 €, las partes acuerdan una auditoría de cumplimiento semestral por el equipo legal de Volkern.");
    }

    // Regla: Si es pago anual, aplicar garantía de disponibilidad pro
    if (data.frecuencia === 'anual') {
      processed.push("ANEXO DE DISPONIBILIDAD (SLA): El pago anual habilita el soporte Prioritario 24/7 con tiempo de respuesta < 4h.");
    }

    return processed;
  }
}

export class PDFService {
  /**
   * Genera un acta firmada digitalmente y registrada en el sistema
   */
  static async generateSignedActa(ctx: PDFContext): Promise<{ 
    pdfBuffer: Buffer, 
    signatureId: string, 
    documentHash: string 
  }> {
    // Import diferido: jspdf pesa ~29M y solo se necesita al generar el PDF.
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const margin = 20;

    // 1. Obtener Datos del Tenant para Branding y Sellado (Soberanía Legal)
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { 
        vaultSeed: true, 
        slug: true, 
        nombre: true, 
        razonSocial: true, 
        nifCif: true, 
        direccionFiscal: true 
      }
    });

    if (!tenant?.vaultSeed) throw new Error('Tenant sin semilla de seguridad configurada.');

    // 2. Cabecera Corporativa Dinámica
    const brandName = tenant.razonSocial || tenant.nombre || 'VOLKERN NEXUS';
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(brandName.toUpperCase(), margin, 30);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`${tenant.nifCif || ''} - ${tenant.direccionFiscal || ''}`, margin, 35);
    
    let y = 55;

    // 3. Título del Documento y Metadatos de Periodo (si es nómina)
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(ctx.title, margin, y);
    
    if (ctx.payrollData) {
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`PERIODO: ${ctx.payrollData.month.toUpperCase()}`, 155, y, { align: 'right' });
    }
    
    y += 20;

    // 4. Renderizado Especial para Nómina (Tabla de Devengos/Deducciones)
    if (ctx.documentType === 'NOMINA' && ctx.payrollData) {
      const p = ctx.payrollData;
      
      // Dibujar Tabla de Conceptos
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(margin, y, 170, 75, 'F');
      
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text('CONCEPTO', margin + 5, y + 7);
      doc.text('TIPO', margin + 100, y + 7, { align: 'center' });
      doc.text('TOTAL', margin + 165, y + 7, { align: 'right' });
      
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.line(margin, y + 10, margin + 170, y + 10);
      
      // Filas Devengos
      y += 18;
      doc.setTextColor(15, 23, 42);
      doc.text('SALARIO BASE MENSUAL', margin + 5, y);
      doc.text('Base', margin + 100, y, { align: 'center' });
      doc.text(`${p.baseSalary.toFixed(2)} €`, margin + 165, y, { align: 'right' });
      
      if (p.commissionAmount > 0) {
        y += 8;
        doc.text('COMISIONES PRODUCTIVIDAD / VENTAS', margin + 5, y);
        doc.text('Variable', margin + 100, y, { align: 'center' });
        doc.text(`${p.commissionAmount.toFixed(2)} €`, margin + 165, y, { align: 'right' });
      }

      if (p.bonusAmount > 0) {
        y += 8;
        doc.text('BONOS / INCENTIVOS EXTRA', margin + 5, y);
        doc.text('Bonus', margin + 100, y, { align: 'center' });
        doc.text(`${p.bonusAmount.toFixed(2)} €`, margin + 165, y, { align: 'right' });
      }

      if (p.benefits && p.benefits.length > 0) {
        y += 8;
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('BENEFICIOS SOCIALES Y AYUDAS', margin + 5, y);
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        
        for (const benefit of p.benefits) {
          y += 6;
          doc.text(benefit.concept.toUpperCase(), margin + 10, y);
          doc.text('Ayuda', margin + 100, y, { align: 'center' });
          doc.text(`${benefit.amount.toFixed(2)} €`, margin + 165, y, { align: 'right' });
        }
      }

      // Filas Deducciones
      y += 8;
      doc.setTextColor(185, 28, 28); // red-700
      doc.text('DEDUCCIÓN POR FALTAS / AUSENCIAS', margin + 5, y);
      doc.text(`-${p.absentDays}d`, margin + 100, y, { align: 'center' });
      doc.text(`- ${p.deductions.toFixed(2)} €`, margin + 165, y, { align: 'right' });
      
      y += 8;
      doc.text('RETENCIÓN IRPF', margin + 5, y);
      doc.text('Tributo', margin + 100, y, { align: 'center' });
      doc.text(`- ${p.irpfAmount.toFixed(2)} €`, margin + 165, y, { align: 'right' });

      y += 8;
      doc.text('SEGURIDAD SOCIAL', margin + 5, y);
      doc.text('Cotización', margin + 100, y, { align: 'center' });
      doc.text(`- ${p.ssAmount.toFixed(2)} €`, margin + 165, y, { align: 'right' });

      y += 12;
      doc.setDrawColor(15, 23, 42);
      doc.line(margin + 120, y, margin + 170, y);
      
      y += 8;
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('TOTAL NETO A PERCIBIR', margin + 120, y);
      doc.text(`${p.totalNet.toFixed(2)} €`, margin + 165, y, { align: 'right' });

      // BLOQUE DE AUDITORÍA E INTEGRIDAD (Fase 4)
      const hasAnomalies = ctx.metadata?.benefits?.flagged?.length > 0 || ctx.metadata?.benefits?.excluded?.length > 0;
      
      if (hasAnomalies || ctx.operatorNote) {
        y += 20;
        if (y > 250) { doc.addPage(); y = 20; }
        
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, 180, 50, 3, 3, 'FD');
        
        y += 8;
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('BLOQUE DE AUDITORÍA E INTEGRIDAD (SOBERANÍA OPERATIVA)', margin + 5, y);
        
        y += 6;
        doc.setFontSize(7);
        doc.text(`ASISTENCIA REGISTRADA: ${ctx.metadata?.benefits?.attendancePercent?.toFixed(1) || 0}%`, margin + 5, y);
        
        if (ctx.metadata?.benefits?.flagged?.length > 0) {
          doc.setTextColor(217, 119, 6); // amber-600
          for (const flag of ctx.metadata.benefits.flagged) {
            y += 4;
            doc.text(`⚠️ ALERTA: ${flag.concept} - ${flag.reason} (Severidad: ${flag.severity})`, margin + 5, y);
          }
        }

        if (ctx.metadata?.benefits?.excluded?.length > 0) {
          doc.setTextColor(220, 38, 38); // red-600
          for (const ex of ctx.metadata.benefits.excluded) {
            y += 4;
            doc.text(`🚫 EXCLUIDO: ${ex.concept} - ${ex.reason}`, margin + 5, y);
          }
        }

        if (ctx.operatorNote) {
          y += 6;
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.text('NOTA DE JUSTIFICACIÓN FORENSE:', margin + 5, y);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          const splitNote = doc.splitTextToSize(ctx.operatorNote, 170);
          y += 4;
          doc.text(splitNote, margin + 5, y);
        }
      }
      
      y += 25;
    } else {
      // Contenido Estándar para Actas/Vacaciones
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      ctx.content.forEach(line => {
        const splitText = doc.splitTextToSize(line, 170);
        doc.text(splitText, margin, y);
        y += (splitText.length * 7);
      });
      y += 10;
    }

    // 5. Metadatos de VISION-LOCK & Firma
    if (ctx.location) {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`VISION-LOCK GPS AUTH: ${ctx.location.lat}, ${ctx.location.lng}`, margin, y);
      y += 5;
    }
    doc.text(`Documento Sellado el: ${new Date().toLocaleString('es-ES')}`, margin, y);
    y += 15;

    // 6. Generar Hash y Sellar (Integrity Graph)
    const documentContentForHash = JSON.stringify({
      title: ctx.title,
      content: ctx.content,
      signer: ctx.signerName,
      location: ctx.location,
      payroll: ctx.payrollData,
      operatorNote: ctx.operatorNote // Inclusión de nota de operador en el hash para integridad forense
    });
    const documentHash = SignatureService.hashDocument(documentContentForHash);
    const signatureHash = SignatureService.generateSignature(documentHash, tenant.vaultSeed);
    
    const signatureRecord = await SignatureService.registerSignature({
      tenantId: ctx.tenantId,
      documentType: ctx.documentType,
      documentHash,
      signatureHash,
      signerId: ctx.signerId,
      metadata: { ...ctx.metadata, payroll: ctx.payrollData }
    });

    // 7. Sello Visual QR (Soberanía Legal)
    const qrData = await SignatureService.generateValidationQR(signatureRecord.id, tenant.slug);
    doc.addImage(qrData, 'PNG', 140, y, 40, 40);

    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`SELLO DE GARANTÍA ${tenant.slug.toUpperCase()}`, 142, y + 45);
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(`VERIFACTU-ID: ${signatureRecord.id}`, 142, y + 48);

    const pdfOutput = doc.output('arraybuffer');
    return {
      pdfBuffer: Buffer.from(pdfOutput),
      signatureId: signatureRecord.id,
      documentHash
    };
  }

  /**
   * Genera un Contrato Inviolable con el motor de plantillas
   */
  static async generateContractPDF(ctx: PDFContext): Promise<{ 
    pdfBuffer: Buffer, 
    signatureId: string, 
    documentHash: string 
  }> {
    // Import diferido: jspdf pesa ~29M y solo se necesita al generar el PDF.
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const margin = 20;
    const { contractData } = ctx;

    if (!contractData) throw new Error('Datos de contrato no proporcionados.');

    // 1. Obtener Datos del Tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { vaultSeed: true, slug: true, nombre: true, razonSocial: true, nifCif: true, direccionFiscal: true }
    });

    if (!tenant?.vaultSeed) throw new Error('Tenant sin semilla de seguridad.');

    // 2. Cabecera Corporativa (Soberanía Industrial)
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text((tenant.razonSocial || tenant.nombre || 'VOLKERN').toUpperCase(), margin, 30);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${tenant.nifCif || ''} - ${tenant.direccionFiscal || ''}`, margin, 35);
    
    let y = 60;

    // 3. Título y Número de Contrato
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(`CONTRATO DE SERVICIOS: ${contractData.numero}`, margin, y);
    y += 15;

    // 4. Identidad Legal (Snapshot)
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE (Snapshot Fiscal):', margin, y);
    doc.setFont('helvetica', 'normal');
    y += 7;
    doc.text(`RAZÓN SOCIAL: ${contractData.cliente.nombre}`, margin, y);
    y += 5;
    doc.text(`NIF/CIF: ${contractData.cliente.nif}`, margin, y);
    y += 5;
    doc.text(`DIRECCIÓN: ${contractData.cliente.direccion}`, margin, y);
    y += 20;

    // 5. Cláusulas con Motor de Plantillas
    doc.setFontSize(11);
    const rawClauses = contractData.clausulas || [];
    const smartClauses = TemplateEngine.applyConditionalLogic(rawClauses, contractData);

    doc.text('TÉRMINOS Y CLÁUSULAS CONTRACTUALES:', margin, y);
    y += 10;

    smartClauses.forEach((clause, index) => {
      // Sustitución de variables dinámicas
      const processedClause = TemplateEngine.replaceVariables(clause, contractData);
      
      const splitClause = doc.splitTextToSize(`${index + 1}. ${processedClause}`, 170);
      
      if (y + (splitClause.length * 7) > 270) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(splitClause, margin, y);
      y += (splitClause.length * 7) + 5;
    });

    // 6. Espacio para Firmas
    y += 20;
    if (y > 250) { doc.addPage(); y = 20; }
    
    doc.line(margin, y, margin + 60, y);
    doc.line(130, y, 190, y);
    y += 5;
    doc.setFontSize(8);
    doc.text('POR LA EMPRESA (Emisor)', margin, y);
    doc.text('POR EL CLIENTE (Aceptante)', 130, y);

    // 7. Sello Forense e Integridad (Nexus Protocol)
    const documentHash = SignatureService.hashDocument(JSON.stringify(contractData));
    const signatureHash = SignatureService.generateSignature(documentHash, tenant.vaultSeed);
    
    const signatureRecord = await SignatureService.registerSignature({
      tenantId: ctx.tenantId,
      documentType: 'ACTA_ENTREGA', // Reusamos el tipo o mapeamos a uno nuevo si existe
      documentHash,
      signatureHash,
      signerId: ctx.signerId,
      metadata: { contractData, isContract: true }
    });

    const qrData = await SignatureService.generateValidationQR(signatureRecord.id, tenant.slug);
    doc.addImage(qrData, 'PNG', 140, 240, 40, 40);
    
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`HASH DE INTEGRIDAD: ${documentHash}`, margin, 275);
    doc.text(`VERIFACTU-NEXUS-ID: ${signatureRecord.id}`, margin, 280);

    const pdfOutput = doc.output('arraybuffer');
    return {
      pdfBuffer: Buffer.from(pdfOutput),
      signatureId: signatureRecord.id,
      documentHash
    };
  }
}
