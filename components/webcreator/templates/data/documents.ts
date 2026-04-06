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
              <div class="placeholder-logo">LOGO</div>
              <div class="company-info">
                <h1>Nombre de Empresa</h1>
                <p>NIF: B12345678</p>
                <p>Calle Falsa 123, Madrid</p>
              </div>
            </div>
            <div class="doc-meta">
              <h2 class="doc-type">ORDEN DE VENTA</h2>
              <p class="doc-number">#OV-2024-001</p>
              <p class="doc-date">Fecha: 04/04/2024</p>
            </div>
          </header>

          <section class="addresses">
            <div class="address-box">
              <span class="label">CLIENTE:</span>
              <p class="client-name">Juan Pérez</p>
              <p>NIF/CIF: 12345678X</p>
              <p>Calle del Cliente 45, Barcelona</p>
              <p>juan.perez@email.com</p>
            </div>
            <div class="address-box contact">
              <span class="label">CONTACTO:</span>
              <p>Tel: +34 600 000 000</p>
              <p>Referencia: Proyecto CRM</p>
            </div>
          </section>

          <table class="items-table">
            <thead>
              <tr>
                <th>DESCRIPCIÓN</th>
                <th class="text-center">CANT.</th>
                <th class="text-right">PRECIO</th>
                <th class="text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Servicio de Consultoría CRM - Implementación Base</td>
                <td class="text-center">1</td>
                <td class="text-right">1.500,00 €</td>
                <td class="text-right">1.500,00 €</td>
              </tr>
              <tr>
                <td>Configuración de Módulos (Ventas, Contratos)</td>
                <td class="text-center">1</td>
                <td class="text-right">500,00 €</td>
                <td class="text-right">500,00 €</td>
              </tr>
              <tr class="spacer"><td colspan="4"></td></tr>
            </tbody>
          </table>

          <div class="summary-area">
            <div class="notes">
              <span class="label">NOTAS Y CONDICIONES:</span>
              <p>Validez del presupuesto: 15 días.</p>
              <p>Forma de pago: Transferencia bancaria.</p>
            </div>
            <div class="totals">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>2.000,00 €</span>
              </div>
              <div class="total-row">
                <span>IVA (21%):</span>
                <span>420,00 €</span>
              </div>
              <div class="total-row grand-total">
                <span>TOTAL:</span>
                <span>2.420,00 €</span>
              </div>
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
            <p>En Madrid, a 4 de Abril de 2024</p>
          </div>

          <section class="legal-section">
            <h2>REUNIDOS</h2>
            <p>De una parte, <strong>[NOMBRE_EMPRESA]</strong>, con NIF [NIF_EMPRESA] y domicilio social en [DIRECCION_EMPRESA], representada por [NOMBRE_REPRESENTANTE]. En adelante, el "PRESTADOR".</p>
            <p>De otra parte, <strong>[NOMBRE_CLIENTE]</strong>, con NIF [NIF_CLIENTE] y domicilio en [DIRECCION_CLIENTE]. En adelante, el "CLIENTE".</p>
          </section>

          <section class="legal-section">
            <h2>EXPOSICIÓN</h2>
            <p>I. Que el PRESTADOR es una entidad especializada en [DESCRIPCION_SERVICIOS].</p>
            <p>II. Que el CLIENTE está interesado en la contratación de dichos servicios bajo los términos estipulados en el presente documento.</p>
          </section>

          <section class="legal-section">
            <h2>CLÁUSULAS</h2>
            <h3>PRIMERA.- OBJETO DEL CONTRATO</h3>
            <p>El PRESTADOR se obliga a realizar para el CLIENTE los servicios de [DETALLE_OBJETO], conforme a las especificaciones técnicas acordadas.</p>
            
            <h3>SEGUNDA.- HONORARIOS Y FORMA DE PAGO</h3>
            <p>El precio total de los servicios se fija en [IMPORTE] euros mensuales, más el IVA correspondiente.</p>
            
            <h3>TERCERA.- CONFIDENCIALIDAD</h3>
            <p>Ambas partes se obligan a mantener absoluta confidencialidad sobre cualquier información a la que tengan acceso con motivo de la ejecución del presente contrato.</p>
          </section>

          <div class="signature-area">
            <div class="signature-box">
              <p>Por el PRESTADOR:</p>
              <div class="sign-line"></div>
              <p>Fdo: [Nombre]</p>
            </div>
            <div class="signature-box">
              <p>Por el CLIENTE:</p>
              <div class="sign-line"></div>
              <p>Fdo: [Nombre]</p>
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
  }
];
