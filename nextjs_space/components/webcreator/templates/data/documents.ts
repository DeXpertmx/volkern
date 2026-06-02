import { Template } from '../types';

export const documentTemplates: Template[] = [
  {
    id: 'orden-venta-modern',
    name: 'Orden de Venta Profesional',
    description: 'Diseño limpio y corporativo para órdenes de venta y presupuestos.',
    category: 'document',
    tags: ['ventas', 'corporativo', 'pdf'],
    isDefault: true,
    data: {
      html: `
        <div class="document-container">
          <header class="doc-header">
            <div class="logo-area">
              <div class="placeholder-logo" data-gjs-editable="true">LOGO</div>
              <div class="company-info">
                <h1>{{empresa.nombre}}</h1>
                <p>{{empresa.rfc}}</p>
                <p>{{empresa.direccion}}</p>
              </div>
            </div>
            <div class="doc-meta">
              <h2 class="doc-type">ORDEN DE VENTA</h2>
              <p class="doc-number">{{contrato.numero}}</p>
              <p class="doc-date">{{fecha.hoy}}</p>
            </div>
          </header>

          <section class="addresses">
            <div class="address-box">
              <span class="label">CLIENTE:</span>
              <p class="client-name">{{lead.nombre}}</p>
              <p>{{lead.empresa}}</p>
              <p>{{lead.email}}</p>
              <p>{{lead.telefono}}</p>
            </div>
            <div class="address-box contact">
              <span class="label">CONTACTO:</span>
              <p>Ref: {{contrato.numero}}</p>
              <p>Fecha: {{fecha.hoy}}</p>
            </div>
          </section>

          <div class="dynamic-content">
            {{items.tabla}}
          </div>

          <div class="summary-area">
            <div class="notes">
              <span class="label">NOTAS Y CONDICIONES:</span>
              <p data-gjs-editable="true" data-gjs-selectable="true">Validez del presupuesto: 15 días.</p>
              <p data-gjs-editable="true" data-gjs-selectable="true">Forma de pago: Transferencia bancaria.</p>
            </div>
            <div class="totals">
              {{totales.resumen}}
            </div>
          </div>

          <footer class="doc-footer">
            <p>Gracias por su confianza. Volkern CRM - Gestión Inteligente.</p>
          </footer>
        </div>
      `,
      css: `
        .document-container {
          font-family: 'Inter', Helvetica, Arial, sans-serif;
          color: #1e293b;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          background: #ffffff;
          box-shadow: 0 0 20px rgba(0,0,0,0.05);
          min-height: 1000px;
          display: flex;
          flex-direction: column;
        }

        .doc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #f1f5f9;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .placeholder-logo {
          width: 60px;
          height: 60px;
          background: #4f46e5;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          border-radius: 8px;
          margin-bottom: 10px;
        }

        .company-info h1 {
          font-size: 18px;
          font-weight: 800;
          margin: 0;
          color: #0f172a;
        }

        .company-info p {
          font-size: 12px;
          color: #64748b;
          margin: 2px 0;
        }

        .doc-meta {
          text-align: right;
        }

        .doc-type {
          font-size: 24px;
          font-weight: 900;
          color: #4f46e5;
          margin: 0;
        }

        .doc-number {
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          margin: 5px 0;
        }

        .doc-date {
          font-size: 12px;
          color: #64748b;
        }

        .addresses {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 40px;
        }

        .label {
          display: block;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #4f46e5;
          margin-bottom: 8px;
        }

        .client-name {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .address-box p {
          font-size: 13px;
          margin: 2px 0;
          color: #334155;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 40px;
        }

        .items-table th {
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          padding: 12px 8px;
          border-bottom: 2px solid #0f172a;
          color: #0f172a;
        }

        .items-table td {
          padding: 15px 8px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
        }

        .text-center { text-align: center; }
        .text-right { text-align: right; }

        .summary-area {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 40px;
          margin-top: auto;
        }

        .notes p {
          font-size: 12px;
          color: #64748b;
          line-height: 1.5;
        }

        .totals {
          background: #f8fafc;
          padding: 20px;
          border-radius: 12px;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }

        .grand-total {
          border-top: 2px solid #e2e8f0;
          margin-top: 10px;
          padding-top: 15px;
          font-weight: 900;
          font-size: 18px;
          color: #4f46e5;
        }

        .doc-footer {
          margin-top: 40px;
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          border-top: 1px solid #f1f5f9;
          padding-top: 20px;
        }
      `
    }
  },
  {
    id: 'contrato-servicios',
    name: 'Contrato de Servicios Estándar',
    description: 'Borrador legal para prestaciones de servicios profesionales.',
    category: 'document',
    tags: ['legal', 'contrato', 'servicios'],
    data: {
      html: `
        <div class="legal-document">
          <h1 class="legal-title">CONTRATO DE PRESTACIÓN DE SERVICIOS</h1>
          
          <div class="legal-meta">
            <p>{{fecha.hoy}}</p>
          </div>

          <section class="legal-section">
            <h2>REUNIDOS</h2>
            <p>De una parte, <strong>{{empresa.nombre}}</strong>, con NIF {{empresa.rfc}} y domicilio social en {{empresa.direccion}}, representada por <span data-gjs-editable="true" data-gjs-selectable="true">[NOMBRE_REPRESENTANTE]</span>. En adelante, el "PRESTADOR".</p>
            <p>De otra parte, <strong>{{lead.nombre}}</strong>, con NIF <span data-gjs-editable="true" data-gjs-selectable="true">[NIF_CLIENTE]</span> y domicilio en <span data-gjs-editable="true" data-gjs-selectable="true">[DIRECCION_CLIENTE]</span>. En adelante, el "CLIENTE".</p>
          </section>

          <section class="legal-section">
            <h2>EXPOSICIÓN</h2>
            <p>I. Que el PRESTADOR es una entidad especializada en <span data-gjs-editable="true" data-gjs-selectable="true">[DESCRIPCION_SERVICIOS]</span>.</p>
            <p>II. Que el CLIENTE está interesado en la contratación de dichos servicios bajo los términos estipulados en el presente documento.</p>
          </section>

          <section class="legal-section">
            <h2>CLÁUSULAS</h2>
            <h3>PRIMERA.- OBJETO DEL CONTRATO</h3>
            <p>El PRESTADOR se obliga a realizar para el CLIENTE los servicios de <span data-gjs-editable="true" data-gjs-selectable="true">[DETALLE_OBJETO]</span>, conforme a las especificaciones técnicas acordadas.</p>
            
            <h3>SEGUNDA.- HONORARIOS Y FORMA DE PAGO</h3>
            <p>El precio total de los servicios se fija en <span data-gjs-editable="true" data-gjs-selectable="true">[IMPORTE_MENSUAL]</span> euros mensuales, m&aacute;s el IVA correspondiente. El importe total del contrato asciende a {{totales.total}}.</p>
            
            <h3>TERCERA.- CONFIDENCIALIDAD</h3>
            <p>Ambas partes se obligan a mantener absoluta confidencialidad sobre cualquier informaci&oacute;n a la que tengan acceso con motivo de la ejecuci&oacute;n del presente contrato.</p>
          </section>

          <div class="signature-area">
            <div class="signature-box">
              <p>Por el PRESTADOR:</p>
              <div class="sign-line"></div>
              <p>{{empresa.nombre}}</p>
            </div>
            <div class="signature-box">
              <p>Por el CLIENTE:</p>
              <div class="sign-line"></div>
              <p>{{lead.nombre}}</p>
            </div>
          </div>
        </div>
      `,
      css: `
        .legal-document {
          font-family: 'Times New Roman', Times, serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 80px 60px;
          background: white;
          color: #000;
          line-height: 1.6;
          text-align: justify;
        }

        .legal-title {
          text-align: center;
          font-size: 22px;
          font-weight: bold;
          text-decoration: underline;
          margin-bottom: 40px;
        }

        .legal-meta {
          margin-bottom: 30px;
          text-align: right;
        }

        .legal-section {
          margin-bottom: 25px;
        }

        .legal-section h2 {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 15px;
          border-bottom: 1px solid #ccc;
        }

        .legal-section h3 {
          font-size: 14px;
          font-weight: bold;
          text-transform: uppercase;
          margin: 20px 0 10px 0;
        }

        .legal-section p {
          margin-bottom: 15px;
          font-size: 14px;
        }

        .signature-area {
          display: flex;
          justify-content: space-between;
          margin-top: 80px;
          page-break-inside: avoid;
        }

        .signature-box {
          width: 40%;
          text-align: center;
        }

        .sign-line {
          height: 1px;
          background: black;
          margin: 60px auto 10px auto;
          width: 80%;
        }

        .signature-box p {
          font-size: 12px;
          margin: 5px 0;
        }

        @media print {
          .legal-document {
            padding: 0;
            box-shadow: none;
          }
        }
      `
    }
  },
  // === FACTURA ESTÁNDAR (Ordinaria con IVA) ===
  {
    id: 'factura-estandar',
    name: 'Factura Ordinaria (IVA)',
    description: 'Factura completa con todos los requisitos fiscales españoles: emisor, cliente, desglose de IVA (21%/10%/4%), base imponible y total. Cumplimiento Veri*Factu.',
    category: 'document',
    tags: ['factura', 'IVA', 'fiscal', 'España', 'verifactu'],
    isDefault: true,
    data: {
      html: `
        <div class="invoice-container">
          <!-- Header: Emisor -->
          <div class="invoice-header">
            <div class="emisor-block">
              <div class="logo-placeholder" data-gjs-editable="true">EMPRESA</div>
              <h1 class="emisor-name">{{empresa.nombre}}</h1>
              <p class="emisor-nif">NIF: {{empresa.rfc}}</p>
              <p class="emisor-address">{{empresa.direccion}}</p>
              <p class="emisor-contact">{{lead.email}} | {{lead.telefono}}</p>
            </div>
            <div class="invoice-meta">
              <div class="meta-badge">FACTURA</div>
              <p class="meta-number">{{contrato.numero}}</p>
              <p class="meta-date">Fecha emisi&oacute;n: {{fecha.hoy}}</p>
              <p class="meta-date">Vencimiento: <span data-gjs-editable="true" data-gjs-selectable="true">[FECHA_VENCIMIENTO]</span></p>
            </div>
          </div>

          <!-- Cliente -->
          <div class="cliente-block">
            <span class="section-label">CLIENTE</span>
            <h2 class="cliente-name">{{lead.nombre}}</h2>
            <div class="cliente-grid">
              <div>
                <p><strong>Empresa:</strong> {{lead.empresa}}</p>
                <p><strong>Email:</strong> {{lead.email}}</p>
              </div>
              <div>
                <p><strong>Tel&eacute;fono:</strong> {{lead.telefono}}</p>
                <p><strong>Ref:</strong> {{contrato.numero}}</p>
              </div>
            </div>
          </div>

          <!-- Tabla de conceptos -->
          {{items.tabla}}

          <!-- Resumen de importes -->
          <div class="totals-section">
            {{totales.resumen}}
          </div>

          <!-- Forma de pago -->
          <div class="payment-info">
            <h3>Forma de Pago</h3>
            <div class="payment-grid">
              <div>
                <p><strong>Banco:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[NOMBRE_BANCO]</span></p>
                <p><strong>IBAN:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[IBAN]</span></p>
                <p><strong>SWIFT/BIC:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[SWIFT]</span></p>
              </div>
              <div>
                <p><strong>M&eacute;todo:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">Transferencia bancaria</span></p>
                <p><strong>Plazo:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">30 d&iacute;as desde fecha de emisi&oacute;n</span></p>
              </div>
            </div>
          </div>

          <!-- Cumplimiento Veri*Factu -->
          <div class="compliance-footer">
            <p class="compliance-text">
              Esta factura cumple con los requisitos establecidos en el Reglamento Veri*Factu (RD 1007/2023) 
              y la Ley Crea y Crece. Sistema inform&aacute;tico declarado responsablemente ante la AEAT.
            </p>
            <p class="compliance-ref">Volkern ERP - Sistema de Facturaci&oacute;n Veri*Factu v2.0</p>
          </div>

          <div class="doc-footer">
            <p>Documento generado electr&oacute;nicamente. Conserve esta factura a efectos fiscales.</p>
            <p class="footer-small">Volkern ERP - www.volkern.com</p>
          </div>
        </div>
      `,
      css: `
        .invoice-container {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          color: #1e293b;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          background: #ffffff;
          min-height: 1000px;
          display: flex;
          flex-direction: column;
        }

        /* ── Header ── */
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #1e40af;
          padding-bottom: 24px;
          margin-bottom: 28px;
        }

        .logo-placeholder {
          width: 56px;
          height: 56px;
          background: #1e40af;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 9px;
          border-radius: 10px;
          margin-bottom: 10px;
          letter-spacing: 1px;
        }

        .emisor-name {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 4px 0;
        }

        .emisor-nif,
        .emisor-address,
        .emisor-contact {
          font-size: 12px;
          color: #64748b;
          margin: 1px 0;
        }

        .meta-badge {
          display: inline-block;
          background: #1e40af;
          color: white;
          font-size: 14px;
          font-weight: 900;
          padding: 4px 16px;
          border-radius: 6px;
          letter-spacing: 2px;
          margin-bottom: 10px;
        }

        .meta-number {
          font-size: 16px;
          font-weight: 700;
          color: #1e293b;
          margin: 4px 0;
        }

        .meta-date {
          font-size: 12px;
          color: #64748b;
          margin: 2px 0;
        }

        /* ── Cliente ── */
        .cliente-block {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 28px;
        }

        .section-label {
          display: block;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #1e40af;
          margin-bottom: 8px;
        }

        .cliente-name {
          font-size: 17px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 8px 0;
        }

        .cliente-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
          color: #334155;
        }

        .cliente-grid p {
          margin: 2px 0;
        }

        /* ── Items Table ── */
        .invoice-items {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
          flex-shrink: 0;
        }

        .invoice-items thead {
          background: #1e40af;
          color: white;
        }

        .invoice-items th {
          padding: 12px 10px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .invoice-items th:first-child { border-radius: 8px 0 0 0; }
        .invoice-items th:last-child { border-radius: 0 8px 0 0; }

        .invoice-items td {
          padding: 14px 10px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
        }

        .invoice-items tbody tr:last-child td {
          border-bottom: none;
        }

        .col-desc { width: 44%; }
        .col-qty { width: 10%; }
        .col-price { width: 18%; }
        .col-tax { width: 10%; }
        .col-total { width: 18%; }

        .item-name {
          font-weight: 600;
          color: #0f172a;
        }

        .item-desc {
          font-size: 11px;
          color: #64748b;
          margin-top: 2px;
        }

        .text-center { text-align: center; }
        .text-right { text-align: right; }

        /* ── Totals ── */
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }

        .totals-box {
          width: 340px;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 7px 0;
          font-size: 14px;
          border-bottom: 1px solid #f1f5f9;
        }

        .total-row:last-child {
          border-bottom: none;
        }

        .grand-total {
          border-top: 2px solid #1e40af;
          margin-top: 8px;
          padding-top: 12px;
          font-weight: 900;
          font-size: 20px;
          color: #1e40af;
        }

        .text-muted {
          font-size: 11px;
          color: #94a3b8;
          font-style: italic;
        }

        /* ── Payment Info ── */
        .payment-info {
          background: #f1f5f9;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .payment-info h3 {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          color: #1e40af;
          margin: 0 0 10px 0;
          letter-spacing: 0.05em;
        }

        .payment-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          font-size: 12px;
          color: #334155;
        }

        .payment-grid p {
          margin: 3px 0;
        }

        /* ── Compliance ── */
        .compliance-footer {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 12px 16px;
          margin-top: auto;
          margin-bottom: 16px;
        }

        .compliance-text {
          font-size: 10px;
          color: #92400e;
          margin: 0 0 4px 0;
          line-height: 1.4;
        }

        .compliance-ref {
          font-size: 9px;
          color: #a16207;
          font-weight: 600;
          margin: 0;
        }

        /* ── Footer ── */
        .doc-footer {
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
        }

        .doc-footer p {
          margin: 2px 0;
        }

        .footer-small {
          font-size: 9px;
          color: #cbd5e1;
        }
      `
    }
  },
  // === FACTURA CON RETENCIÓN IRPF ===
  {
    id: 'factura-irpf',
    name: 'Factura con Retenci&oacute;n IRPF',
    description: 'Factura para aut&oacute;nomos y profesionales con retenci&oacute;n de IRPF (7% o 15%). Incluye base imponible, IVA, IRPF y total l&iacute;quido a percibir. Cumplimiento Veri*Factu.',
    category: 'document',
    tags: ['factura', 'IRPF', 'autonomo', 'fiscal', 'España', 'verifactu'],
    data: {
      html: `
        <div class="irpf-container">
          <!-- Header: Emisor -->
          <div class="irpf-header">
            <div class="emisor-col">
              <div class="logo-emisor" data-gjs-editable="true">E</div>
              <h1 class="emisor-razon">{{empresa.nombre}}</h1>
              <p class="emisor-nif">NIF: {{empresa.rfc}}</p>
              <p class="emisor-addr">{{empresa.direccion}}</p>
            </div>
            <div class="meta-col">
              <span class="badge-irpf">FACTURA CON IRPF</span>
              <p class="irpf-num">{{contrato.numero}}</p>
              <p class="irpf-date">{{fecha.hoy}}</p>
              <p class="irpf-ref">Ref: <span data-gjs-editable="true" data-gjs-selectable="true">[REFERENCIA_INTERNA]</span></p>
            </div>
          </div>

          <!-- Cliente -->
          <div class="irpf-cliente">
            <span class="irpf-label">DATOS DEL CLIENTE</span>
            <div class="cliente-data">
              <div>
                <p class="cliente-nom">{{lead.nombre}}</p>
                <p>{{lead.empresa}}</p>
                <p>{{lead.email}}</p>
              </div>
              <div>
                <p>{{lead.telefono}}</p>
                <p>Ref: {{contrato.numero}}</p>
              </div>
            </div>
          </div>

          <!-- Tabla de conceptos -->
          {{items.tabla}}

          <!-- Desglose con IRPF -->
          <div class="irpf-totals">
            {{totales.resumen}}
          </div>

          <!-- Datos bancarios -->
          <div class="bank-info">
            <h3>Transferencia Bancaria</h3>
            <div class="bank-grid">
              <div>
                <p><strong>Banco:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[NOMBRE_BANCO]</span></p>
                <p><strong>IBAN:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[IBAN]</span></p>
              </div>
              <div>
                <p><strong>SWIFT:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[SWIFT]</span></p>
                <p><strong>Titular:</strong> {{empresa.nombre}}</p>
                <p><strong>Concepto:</strong> {{contrato.numero}}</p>
              </div>
            </div>
          </div>

          <!-- Compliance -->
          <div class="irpf-compliance">
            <p>
              Factura sujeta a retenci&oacute;n de IRPF seg&uacute;n art&iacute;culos 99 y siguientes de la LIRPF.
              Sistema inform&aacute;tico declarado responsablemente ante la AEAT (Veri*Factu).
            </p>
            <p class="compliance-code">Volkern ERP | Veri*Factu v2.0 | C&oacute;digo seguro: VK-2024-00123</p>
          </div>

          <div class="irpf-footer">
            <p>Genere su factura electr&oacute;nica con Volkern ERP | www.volkern.com</p>
          </div>
        </div>
      `,
      css: `
        .irpf-container {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          color: #1e293b;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          background: #ffffff;
          min-height: 1000px;
          display: flex;
          flex-direction: column;
        }

        /* ── Header ── */
        .irpf-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #9333ea;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }

        .logo-emisor {
          width: 48px;
          height: 48px;
          background: #9333ea;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 18px;
          border-radius: 12px;
          margin-bottom: 10px;
        }

        .emisor-razon {
          font-size: 17px;
          font-weight: 800;
          margin: 0 0 3px 0;
        }

        .emisor-nif,
        .emisor-addr {
          font-size: 12px;
          color: #64748b;
          margin: 1px 0;
        }

        .badge-irpf {
          display: inline-block;
          background: #9333ea;
          color: white;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 14px;
          border-radius: 20px;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .irpf-num {
          font-size: 18px;
          font-weight: 700;
          margin: 4px 0;
        }

        .irpf-date {
          font-size: 12px;
          color: #64748b;
          margin: 2px 0;
        }

        .irpf-ref {
          font-size: 11px;
          color: #94a3b8;
          margin: 2px 0;
        }

        /* ── Cliente ── */
        .irpf-cliente {
          background: #faf5ff;
          border: 1px solid #e9d5ff;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 24px;
        }

        .irpf-label {
          display: block;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #9333ea;
          margin-bottom: 8px;
        }

        .cliente-data {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
          color: #334155;
        }

        .cliente-nom {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
        }

        .cliente-data p {
          margin: 2px 0;
        }

        /* ── Items Table ── */
        .irpf-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }

        .irpf-table thead {
          background: #9333ea;
          color: white;
        }

        .irpf-table th {
          padding: 11px 10px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .irpf-table th:first-child { border-radius: 8px 0 0 0; }
        .irpf-table th:last-child { border-radius: 0 8px 0 0; }

        .irpf-table td {
          padding: 13px 10px;
          border-bottom: 1px solid #e9d5ff;
          font-size: 13px;
        }

        .serv-name {
          font-weight: 600;
        }

        .serv-desc {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
        }

        .text-center { text-align: center; }
        .text-right { text-align: right; }

        /* ── Totals ── */
        .irpf-totals {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }

        .totals-card {
          width: 350px;
          background: #faf5ff;
          border-radius: 12px;
          padding: 20px;
        }

        .calc-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 14px;
        }

        .highlight-irpf {
          color: #b91c1c;
          font-weight: 600;
        }

        .text-red {
          color: #dc2626;
        }

        .calc-divider {
          border-top: 2px dashed #d8b4fe;
          margin: 8px 0;
        }

        .total-final {
          font-weight: 900;
          font-size: 18px;
          color: #9333ea;
          padding: 10px 0 4px 0;
        }

        .subtle {
          font-size: 11px;
          color: #94a3b8;
          border-top: 1px solid #e9d5ff;
          margin-top: 4px;
        }

        /* ── Bank Info ── */
        .bank-info {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 20px;
        }

        .bank-info h3 {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: #9333ea;
          margin: 0 0 8px 0;
          letter-spacing: 0.5px;
        }

        .bank-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
          color: #334155;
        }

        .bank-grid p {
          margin: 2px 0;
        }

        /* ── Compliance ── */
        .irpf-compliance {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 12px 16px;
          margin-top: auto;
          margin-bottom: 16px;
        }

        .irpf-compliance p {
          font-size: 10px;
          color: #92400e;
          margin: 0 0 4px 0;
          line-height: 1.4;
        }

        .compliance-code {
          font-size: 9px;
          color: #a16207;
          font-weight: 600;
          margin: 0;
        }

        /* ── Footer ── */
        .irpf-footer {
          text-align: center;
          font-size: 9px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 14px;
        }

        .irpf-footer p {
          margin: 0;
        }
      `
    }
  },
  // === FACTURA SIMPLIFICADA (TICKET) ===
  {
    id: 'factura-simplificada',
    name: 'Factura Simplificada (Ticket)',
    description: 'Modelo simplificado para operaciones de importe reducido. Formato compacto tipo ticket con IVA incluido. Ideal para comercios, hosteler&iacute;a y ventas al por menor.',
    category: 'document',
    tags: ['factura', 'simplificada', 'ticket', 'comercio', 'España'],
    data: {
      html: `
        <div class="ticket-container">
          <!-- Header compacto -->
          <div class="ticket-header">
            <h1 class="ticket-title">FACTURA SIMPLIFICADA</h1>
            <p class="ticket-business">{{empresa.nombre}}</p>
            <p class="ticket-nif">{{empresa.rfc}}</p>
            <p class="ticket-addr">{{empresa.direccion}}</p>
          </div>

          <div class="ticket-divider">* * *</div>

          <!-- Meta -->
          <div class="ticket-meta">
            <table class="meta-table">
              <tr>
                <td class="meta-label">N&ordm; FACTURA:</td>
                <td class="meta-value">{{contrato.numero}}</td>
              </tr>
              <tr>
                <td class="meta-label">FECHA:</td>
                <td class="meta-value">{{fecha.hoy}}</td>
              </tr>
              <tr>
                <td class="meta-label">CLIENTE:</td>
                <td class="meta-value">{{lead.nombre}}</td>
              </tr>
            </table>
          </div>

          <div class="ticket-divider">- - - - - - - - - - - - - - - - - - - -</div>

          <!-- Items -->
          {{items.tabla}}

          <div class="ticket-divider">- - - - - - - - - - - - - - - - - - - -</div>

          <!-- Totales compactos -->
          {{totales.resumen}}

          <div class="ticket-divider">* * *</div>

          <!-- Barcode / QR visual -->
          <div class="ticket-barcode">
            <div class="barcode-sim">
              <div class="bar bar1"></div>
              <div class="bar bar2"></div>
              <div class="bar bar3"></div>
              <div class="bar bar4"></div>
              <div class="bar bar5"></div>
              <div class="bar bar6"></div>
              <div class="bar bar7"></div>
              <div class="bar bar8"></div>
              <div class="bar bar9"></div>
              <div class="bar bar10"></div>
              <div class="bar bar11"></div>
              <div class="bar bar12"></div>
              <div class="bar bar13"></div>
              <div class="bar bar14"></div>
              <div class="bar bar15"></div>
              <div class="bar bar16"></div>
              <div class="bar bar17"></div>
              <div class="bar bar18"></div>
              <div class="bar bar19"></div>
              <div class="bar bar20"></div>
            </div>
            <p class="barcode-id">VK-98765-2024</p>
          </div>

          <!-- Compliance compacto -->
          <div class="ticket-compliance">
            <p>Factura Simplificada art. 7.2 RD 1619/2012</p>
            <p>SI Veri*Factu – Volkern ERP v2.0</p>
          </div>

          <div class="ticket-footer">
            <p>&iexcl;Gracias por su compra!</p>
            <p class="ticket-footer-small">Conserve este ticket a efectos fiscales</p>
            <p class="ticket-footer-small">www.volkern.com</p>
          </div>
        </div>
      `,
      css: `
        .ticket-container {
          font-family: 'Courier New', 'Lucida Console', monospace;
          color: #1a1a1a;
          max-width: 320px;
          margin: 0 auto;
          padding: 20px;
          background: #ffffff;
          font-size: 11px;
          line-height: 1.4;
          min-height: 600px;
        }

        /* ── Header ── */
        .ticket-header {
          text-align: center;
          margin-bottom: 8px;
        }

        .ticket-title {
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 2px;
          margin: 0 0 6px 0;
          text-transform: uppercase;
        }

        .ticket-business {
          font-size: 13px;
          font-weight: 700;
          margin: 2px 0;
        }

        .ticket-nif,
        .ticket-addr {
          font-size: 10px;
          color: #555;
          margin: 1px 0;
        }

        /* ── Divider ── */
        .ticket-divider {
          text-align: center;
          color: #999;
          margin: 8px 0;
          font-size: 12px;
        }

        /* ── Meta ── */
        .ticket-meta {
          margin-bottom: 6px;
        }

        .meta-table {
          width: 100%;
          font-size: 10px;
        }

        .meta-table td {
          padding: 1px 0;
        }

        .meta-label {
          font-weight: 700;
          width: 100px;
        }

        .meta-value {
          color: #333;
        }

        /* ── Items ── */
        .ticket-items {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
          font-size: 10px;
        }

        .ticket-items th {
          font-weight: 700;
          border-bottom: 1px solid #999;
          padding: 4px 2px;
          font-size: 9px;
          text-transform: uppercase;
        }

        .ticket-items td {
          padding: 4px 2px;
          border-bottom: 1px dotted #ccc;
        }

        .ticket-item {
          font-weight: 400;
        }

        .text-center { text-align: center; }
        .text-right { text-align: right; }

        /* ── Totals ── */
        .ticket-totals {
          margin-bottom: 8px;
        }

        .ticket-line {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          font-size: 10px;
        }

        .grand-ticket {
          font-weight: 900;
          font-size: 14px;
          border-top: 2px solid #1a1a1a;
          border-bottom: 2px solid #1a1a1a;
          padding: 6px 0;
          margin: 4px 0;
        }

        .text-muted-ticket {
          font-size: 9px;
          color: #666;
        }

        /* ── Tax Breakdown ── */
        .ticket-tax-breakdown {
          margin-bottom: 8px;
          padding: 6px;
          background: #f9fafb;
          border-radius: 4px;
        }

        .tax-break-title {
          font-weight: 700;
          font-size: 9px;
          text-transform: uppercase;
          margin: 0 0 4px 0;
        }

        .tax-table {
          width: 100%;
          font-size: 9px;
        }

        .tax-table td {
          padding: 1px 4px;
        }

        /* ── Barcode (visual) ── */
        .ticket-barcode {
          text-align: center;
          margin: 10px 0;
        }

        .barcode-sim {
          display: flex;
          justify-content: center;
          gap: 3px;
          margin-bottom: 4px;
        }

        .bar {
          width: 2px;
          height: 30px;
          background: #1a1a1a;
        }

        .bar:nth-child(odd) { width: 1px; }
        .bar:nth-child(3n) { width: 4px; }
        .bar:nth-child(5n+2) { width: 3px; }
        .bar:nth-child(7n+4) { width: 1px; }

        .barcode-id {
          font-size: 9px;
          color: #666;
          margin: 2px 0;
        }

        /* ── Compliance ── */
        .ticket-compliance {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 4px;
          padding: 6px 10px;
          margin-bottom: 10px;
          text-align: center;
        }

        .ticket-compliance p {
          font-size: 8px;
          color: #92400e;
          margin: 1px 0;
        }

        /* ── Footer ── */
        .ticket-footer {
          text-align: center;
          font-size: 10px;
          border-top: 1px solid #999;
          padding-top: 10px;
        }

        .ticket-footer p {
          margin: 2px 0;
        }

        .ticket-footer-small {
          font-size: 8px;
          color: #999;
        }
      `
    }
  },
  // === NÓMINA / RECIBO DE SALARIOS (España) ===
  {
    id: 'nomina-estandar',
    name: 'N&oacute;mina / Recibo de Salarios',
    description: 'Recibo de salarios conforme al modelo oficial espa&ntilde;ol (RD 491/2024). Incluye devengos, bases de cotizaci&oacute;n, deducciones de Seguridad Social, IRPF y l&iacute;quido a percibir. Cumplimiento Veri*Factu y Sistema de Liquidaci&oacute;n Directa (SLD).',
    category: 'document',
    tags: ['nómina', 'recibo salarios', 'RRHH', 'España', 'SLD', 'verifactu'],
    isDefault: true,
    data: {
      html: `
        <div class="nomina-container">
          <!-- Header: Empresa -->
          <div class="nomina-header">
            <div class="empresa-block">
              <div class="logo-empresa" data-gjs-editable="true">E</div>
              <div>
                <h1 class="razon-social">{{empresa.nombre}}</h1>
                <p class="empresa-nif">NIF/CIF: {{empresa.rfc}}</p>
                <p class="empresa-dir">{{empresa.direccion}}</p>
                <p class="empresa-cuenta" data-gjs-editable="true">C.C.C. Seguridad Social: [CCC_EMPRESA]</p>
              </div>
            </div>
            <div class="nomina-meta">
              <span class="badge-nomina">N&Oacute;MINA</span>
              <p class="nomina-num">N&ordm; <span data-gjs-editable="true" data-gjs-selectable="true">[NUMERO_NOMINA]</span></p>
              <p class="nomina-periodo"><span data-gjs-editable="true" data-gjs-selectable="true">[MES]</span> de <span data-gjs-editable="true" data-gjs-selectable="true">[ANIO]</span></p>
              <p class="nomina-date">Emisi&oacute;n: {{fecha.hoy}}</p>
            </div>
          </div>

          <!-- Datos del Empleado -->
          <div class="empleado-section">
            <span class="section-tag">DATOS DEL TRABAJADOR</span>
            <div class="empleado-grid">
              <div class="empleado-field">
                <span class="field-label">Apellidos y Nombre</span>
                <span class="field-value">{{lead.nombre}}</span>
              </div>
              <div class="empleado-field">
                <span class="field-label">NIF / NIE</span>
                <span class="field-value" data-gjs-editable="true" data-gjs-selectable="true">[NIF_EMPLEADO]</span>
              </div>
              <div class="empleado-field">
                <span class="field-label">N&ordm; Afiliaci&oacute;n Seguridad Social</span>
                <span class="field-value" data-gjs-editable="true" data-gjs-selectable="true">[NUM_AFILIACION]</span>
              </div>
              <div class="empleado-field">
                <span class="field-label">Categor&iacute;a / Grupo Profesional</span>
                <span class="field-value" data-gjs-editable="true" data-gjs-selectable="true">[CATEGORIA]</span>
              </div>
              <div class="empleado-field">
                <span class="field-label">Antig&uuml;edad</span>
                <span class="field-value" data-gjs-editable="true" data-gjs-selectable="true">[FECHA_ALTA]</span>
              </div>
              <div class="empleado-field">
                <span class="field-label">Grupo de Cotizaci&oacute;n</span>
                <span class="field-value" data-gjs-editable="true" data-gjs-selectable="true">[GRUPO_COTIZACION]</span>
              </div>
            </div>
          </div>

          <!-- Tabla de Devengos -->
          <div class="tabla-section">
            <span class="section-tag">DEVENGOS</span>
            <table class="tabla-nomina">
              <thead>
                <tr>
                  <th class="col-concepto">Concepto</th>
                  <th class="col-dias">D&iacute;as</th>
                  <th class="col-importe">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Salario Base</td>
                  <td class="text-center" data-gjs-editable="true" data-gjs-selectable="true">30</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">1.200,00</td>
                </tr>
                <tr>
                  <td>Plus Convenio</td>
                  <td class="text-center" data-gjs-editable="true" data-gjs-selectable="true">30</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">150,00</td>
                </tr>
                <tr>
                  <td>Antig&uuml;edad</td>
                  <td class="text-center" data-gjs-editable="true" data-gjs-selectable="true">30</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">60,00</td>
                </tr>
                <tr>
                  <td>Prorrata Pagas Extra</td>
                  <td class="text-center" data-gjs-editable="true" data-gjs-selectable="true">30</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">200,00</td>
                </tr>
                <tr class="total-row-nomina">
                  <td><strong>TOTAL DEVENGADO</strong></td>
                  <td></td>
                  <td class="text-right"><strong data-gjs-editable="true" data-gjs-selectable="true">1.610,00</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Tabla de Deducciones -->
          <div class="tabla-section">
            <span class="section-tag">DEDUCCIONES</span>
            <table class="tabla-nomina">
              <thead>
                <tr>
                  <th class="col-concepto">Concepto</th>
                  <th class="col-dias">%</th>
                  <th class="col-importe">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Contingencias Comunes</td>
                  <td class="text-center">4,70%</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">75,67</td>
                </tr>
                <tr>
                  <td>Desempleo</td>
                  <td class="text-center">1,55%</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">24,96</td>
                </tr>
                <tr>
                  <td>Formaci&oacute;n Profesional</td>
                  <td class="text-center">0,10%</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">1,61</td>
                </tr>
                <tr>
                  <td>IRPF</td>
                  <td class="text-center" data-gjs-editable="true" data-gjs-selectable="true">12,00%</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">193,20</td>
                </tr>
                <tr class="total-row-nomina">
                  <td><strong>TOTAL A DEDUCIR</strong></td>
                  <td></td>
                  <td class="text-right"><strong data-gjs-editable="true" data-gjs-selectable="true">295,44</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Resumen Líquido -->
          <div class="liquido-section">
            <div class="liquido-card">
              <div class="liquido-row">
                <span class="liquido-label">TOTAL DEVENGADO</span>
                <span class="liquido-valor" data-gjs-editable="true" data-gjs-selectable="true">1.610,00</span>
              </div>
              <div class="liquido-row deduc">
                <span class="liquido-label">TOTAL DEDUCCIONES</span>
                <span class="liquido-valor text-red" data-gjs-editable="true" data-gjs-selectable="true">-295,44</span>
              </div>
              <div class="liquido-divider"></div>
              <div class="liquido-row total-liquido">
                <span class="liquido-label">L&Iacute;QUIDO A PERCIBIR</span>
                <span class="liquido-valor-final" data-gjs-editable="true" data-gjs-selectable="true">1.314,56</span>
              </div>
              <div class="liquido-letras">
                <p>SON: <span data-gjs-editable="true" data-gjs-selectable="true">MIL TRESCIENTOS CATORCE EUROS CON CINCUENTA Y SEIS C&Eacute;NTIMOS</span></p>
              </div>
            </div>
          </div>

          <!-- Bases de Cotización -->
          <div class="bases-section">
            <span class="section-tag">BASES DE COTIZACI&Oacute;N</span>
            <table class="tabla-bases">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th class="text-right">Base</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Contingencias Comunes</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">1.610,00</td>
                </tr>
                <tr>
                  <td>Desempleo / FP / FOGASA</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">1.610,00</td>
                </tr>
                <tr>
                  <td>IRPF (Base sujeta a retenci&oacute;n)</td>
                  <td class="text-right" data-gjs-editable="true" data-gjs-selectable="true">1.610,00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Datos de pago -->
          <div class="pago-section">
            <h3>Datos de Pago</h3>
            <div class="pago-grid">
              <p><strong>Banco:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[ENTIDAD_BANCARIA]</span></p>
              <p><strong>IBAN:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[IBAN]</span></p>
              <p><strong>Fecha de pago:</strong> <span data-gjs-editable="true" data-gjs-selectable="true">[FECHA_PAGO]</span></p>
              <p><strong>Concepto:</strong> N&oacute;mina <span data-gjs-editable="true" data-gjs-selectable="true">[MES]</span> <span data-gjs-editable="true" data-gjs-selectable="true">[ANIO]</span></p>
            </div>
          </div>

          <!-- Compliance -->
          <div class="nomina-compliance">
            <p>Este documento constituye el Recibo Individual de Salarios conforme al art&iacute;culo 29 del Estatuto de los Trabajadores y al RD 491/2024.</p>
            <p class="compliance-code">Volkern ERP | Sistema de Liquidaci&oacute;n Directa (SLD) | Veri*Factu v2.0</p>
          </div>

          <div class="nomina-footer">
            <p>Documento generado electr&oacute;nicamente por Volkern ERP. Conserve este justificante a efectos de IRPF y Seguridad Social.</p>
            <p class="footer-small">Volkern ERP &mdash; www.volkern.com</p>
          </div>
        </div>
      `,
      css: `
        .nomina-container {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          color: #1e293b;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          background: #ffffff;
          min-height: 1000px;
        }

        /* ── Header ── */
        .nomina-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #059669;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }

        .empresa-block {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }

        .logo-empresa {
          width: 48px;
          height: 48px;
          background: #059669;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 18px;
          border-radius: 12px;
          flex-shrink: 0;
        }

        .razon-social {
          font-size: 17px;
          font-weight: 800;
          margin: 0 0 2px 0;
          color: #0f172a;
        }

        .empresa-nif,
        .empresa-dir,
        .empresa-cuenta {
          font-size: 11px;
          color: #64748b;
          margin: 1px 0;
        }

        .nomina-meta {
          text-align: right;
        }

        .badge-nomina {
          display: inline-block;
          background: #059669;
          color: white;
          font-size: 12px;
          font-weight: 900;
          padding: 4px 14px;
          border-radius: 6px;
          letter-spacing: 2px;
          margin-bottom: 8px;
        }

        .nomina-num {
          font-size: 16px;
          font-weight: 700;
          color: #1e293b;
          margin: 4px 0;
        }

        .nomina-periodo {
          font-size: 14px;
          font-weight: 600;
          color: #059669;
          margin: 2px 0;
        }

        .nomina-date {
          font-size: 11px;
          color: #94a3b8;
          margin: 2px 0;
        }

        /* ── Section Tags ── */
        .section-tag {
          display: block;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #059669;
          margin-bottom: 10px;
          border-bottom: 1px solid #d1fae5;
          padding-bottom: 6px;
        }

        /* ── Empleado Grid ── */
        .empleado-section {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 24px;
        }

        .empleado-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .empleado-field {
          display: flex;
          flex-direction: column;
        }

        .field-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .field-value {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }

        /* ── Tables ── */
        .tabla-section {
          margin-bottom: 24px;
        }

        .tabla-nomina {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .tabla-nomina thead {
          background: #059669;
          color: white;
        }

        .tabla-nomina th {
          padding: 10px 12px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .tabla-nomina th:first-child { border-radius: 8px 0 0 0; }
        .tabla-nomina th:last-child { border-radius: 0 8px 0 0; }

        .tabla-nomina td {
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
        }

        .tabla-nomina tbody tr:hover {
          background: #f8fafc;
        }

        .col-concepto { width: 55%; }
        .col-dias { width: 15%; }
        .col-importe { width: 30%; }

        .text-center { text-align: center; }
        .text-right { text-align: right; }

        .total-row-nomina td {
          border-top: 2px solid #059669;
          border-bottom: 2px solid #059669;
          background: #f0fdf4;
          font-weight: 700;
          color: #065f46;
        }

        /* ── Líquido ── */
        .liquido-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }

        .liquido-card {
          width: 380px;
          background: #f0fdf4;
          border: 2px solid #059669;
          border-radius: 16px;
          padding: 24px;
        }

        .liquido-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 13px;
        }

        .liquido-label {
          font-weight: 600;
          color: #334155;
        }

        .liquido-valor {
          font-weight: 700;
        }

        .deduc .liquido-valor {
          color: #dc2626;
        }

        .liquido-divider {
          border-top: 2px dashed #34d399;
          margin: 8px 0;
        }

        .total-liquido {
          margin-top: 6px;
        }

        .liquido-valor-final {
          font-size: 22px;
          font-weight: 900;
          color: #059669;
        }

        .liquido-letras {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #bbf7d0;
        }

        .liquido-letras p {
          font-size: 10px;
          color: #64748b;
          font-style: italic;
          margin: 0;
        }

        .text-red {
          color: #dc2626;
        }

        /* ── Bases ── */
        .bases-section {
          margin-bottom: 24px;
        }

        .tabla-bases {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .tabla-bases th {
          background: #f1f5f9;
          padding: 10px 12px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          border-bottom: 2px solid #cbd5e1;
        }

        .tabla-bases td {
          padding: 8px 12px;
          border-bottom: 1px solid #e2e8f0;
        }

        /* ── Pago ── */
        .pago-section {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 20px;
        }

        .pago-section h3 {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: #059669;
          margin: 0 0 10px 0;
          letter-spacing: 0.5px;
        }

        .pago-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
          color: #334155;
        }

        .pago-grid p {
          margin: 2px 0;
        }

        /* ── Compliance ── */
        .nomina-compliance {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
        }

        .nomina-compliance p {
          font-size: 10px;
          color: #92400e;
          margin: 0 0 4px 0;
          line-height: 1.4;
        }

        .compliance-code {
          font-size: 9px;
          color: #a16207;
          font-weight: 600;
          margin: 0;
        }

        /* ── Footer ── */
        .nomina-footer {
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
        }

        .nomina-footer p {
          margin: 2px 0;
        }

        .footer-small {
          font-size: 9px;
          color: #cbd5e1;
        }

        @media print {
          .nomina-container {
            padding: 0;
            box-shadow: none;
          }
        }
      `
    }
  }
];
