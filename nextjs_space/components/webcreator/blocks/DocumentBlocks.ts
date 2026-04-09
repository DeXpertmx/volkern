import { Editor } from "grapesjs";

/**
 * Setup specialized blocks for Document Editing (A4/Letter)
 * and Email Marketing (Email-safe tables).
 */
export const setupDocumentBlocks = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. TOKENS / VARIABLES CATEGORY
  const tokenCategory = 'Tokens 🔑';
  
  const tokens = [
    { id: 'tk-lead-name', label: 'Nombre Cliente', content: '{{lead.nombre}}' },
    { id: 'tk-lead-email', label: 'Email Cliente', content: '{{lead.email}}' },
    { id: 'tk-lead-phone', label: 'Teléfono Cliente', content: '{{lead.telefono}}' },
    { id: 'tk-company-name', label: 'Empresa', content: '{{empresa.nombre}}' },
    { id: 'tk-date-today', label: 'Fecha Hoy', content: '{{fecha.hoy}}' },
    { id: 'tk-contract-id', label: 'ID Contrato', content: '{{contrato.numero}}' },
  ];

  tokens.forEach(token => {
    bm.add(token.id, {
      label: `
        <div class="flex flex-col items-center gap-1">
          <div class="text-indigo-600 dark:text-indigo-400 font-bold text-[10px]">VAR</div>
          <div class="text-[9px] font-medium text-center">${token.label}</div>
        </div>
      `,
      category: tokenCategory,
      content: {
        type: 'text',
        content: token.content,
        style: { color: '#4f46e5', 'font-weight': 'bold' },
        attributes: { 'data-token': token.id }
      }
    });
  });

  // 2. DOCUMENT STRUCTURE CATEGORY
  const docCategory = 'Documento 📄';

  bm.add('doc-header', {
    label: 'Encabezado Pro',
    category: docCategory,
    content: `
      <div class="v-doc-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 50px; border-bottom: 3px solid #1e293b; padding-bottom: 30px; font-family: 'Inter', sans-serif;">
        <div>
           <div style="width: 120px; height: 60px; background: #f1f5f9; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #64748b; border: 1px dashed #cbd5e1; margin-bottom: 10px;">LOGO</div>
           <p style="margin: 0; font-size: 11px; color: #64748b; font-weight: 600;">{{empresa.nombre}}</p>
        </div>
        <div style="text-align: right;">
          <h1 style="margin: 0; font-size: 32px; font-weight: 900; color: #1e293b; letter-spacing: -0.02em;" data-gjs-editable="true" data-gjs-selectable="true">CONTRATO</h1>
          <p style="margin: 8px 0; font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;" data-gjs-editable="true" data-gjs-selectable="true">Ref: {{contrato.numero}}</p>
          <p style="margin: 0; font-size: 13px; color: #94a3b8;" data-gjs-editable="true" data-gjs-selectable="true">Fecha de emisión: {{fecha.hoy}}</p>
        </div>
      </div>
    `
  });

  bm.add('doc-clause', {
    label: 'Cláusula Legal',
    category: docCategory,
    content: `
      <div class="v-doc-clause" style="margin-bottom: 30px; font-family: 'Inter', sans-serif;">
        <h3 style="font-size: 16px; font-weight: 800; color: #1e293b; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.05em;" data-gjs-editable="true" data-gjs-selectable="true">CLÁUSULA {{numero}}: TÍTULO</h3>
        <p style="font-size: 13px; line-height: 1.8; color: #334155; text-align: justify;" data-gjs-editable="true" data-gjs-selectable="true">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
      </div>
    `
  });

  // --- NUEVOS BLOQUES PREMIUM ---

  bm.add('doc-intro', {
    label: 'Introducción Pro',
    category: docCategory,
    content: `
      <div class="v-doc-intro" style="margin-bottom: 40px; font-family: 'Inter', sans-serif; background: #ffffff; padding: 20px; border-radius: 8px;">
        <h2 style="font-size: 24px; font-weight: 900; color: #3D3D3D; margin-bottom: 10px; letter-spacing: -0.01em;">Propuesta de Colaboración</h2>
        <p style="font-size: 16px; color: #64748b; margin-bottom: 20px;">Preparado para: <strong>{{lead.nombre}}</strong></p>
        <p style="font-size: 14px; line-height: 1.6; color: #3D3D3D;">Es un placer presentarte esta propuesta detallada. Nuestro objetivo es proporcionarte una solución integral que impulse el crecimiento de tu proyecto y asegure el éxito a largo plazo mediante nuestra metodología comprobada.</p>
      </div>
    `
  });

  bm.add('doc-product-table', {
    label: 'Tabla Productos',
    category: docCategory,
    content: `
      <div class="v-doc-table-wrapper" style="margin: 30px 0; font-family: 'Inter', sans-serif;">
        <table style="width: 100%; border-collapse: collapse; background: #ffffff;">
          <thead>
            <tr style="border-bottom: 2px solid #3D3D3D;">
              <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b;">Concepto</th>
              <th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; color: #64748b; width: 80px;">Cant.</th>
              <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: #64748b; width: 120px;">Precio</th>
              <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: #64748b; width: 120px;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 15px 12px;">
                <div style="font-weight: 700; color: #3D3D3D;">Producto o Servicio Premium</div>
                <div style="font-size: 12px; color: #64748b;">Descripción detallada de la solución implementada.</div>
              </td>
              <td style="padding: 15px 12px; text-align: center; color: #3D3D3D;">1</td>
              <td style="padding: 15px 12px; text-align: right; color: #3D3D3D;">$0.00</td>
              <td style="padding: 15px 12px; text-align: right; font-weight: 700; color: #3D3D3D;">$0.00</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 15px 12px; text-align: right; font-weight: 600; color: #64748b;">TOTAL PROPUESTA</td>
              <td style="padding: 15px 12px; text-align: right; font-size: 18px; font-weight: 900; color: #3D3D3D;">$0.00</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `
  });

  bm.add('doc-product-card', {
    label: 'Selección Producto',
    category: docCategory,
    content: `
      <div class="v-doc-product-card" style="display: flex; gap: 20px; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin: 20px 0; font-family: 'Inter', sans-serif;">
        <div style="width: 100px; height: 100px; background: #ffffff; border-radius: 8px; border: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8;">IMAGE</div>
        <div style="flex: 1;">
          <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: #3D3D3D;">Nombre del Producto</h4>
          <p style="margin: 5px 0 10px; font-size: 13px; color: #64748b;">Breve descripción resaltando las características principales para el cliente.</p>
          <div style="font-size: 18px; font-weight: 900; color: #4f46e5;">$0.00</div>
        </div>
      </div>
    `
  });

  bm.add('doc-benefits', {
    label: 'Beneficios',
    category: docCategory,
    content: `
      <div class="v-doc-benefits" style="margin: 30px 0; font-family: 'Inter', sans-serif;">
        <h3 style="font-size: 14px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 20px;">Beneficios Exclusivos</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div style="padding: 15px; border-left: 3px solid #4f46e5; background: #f5f3ff;">
            <div style="font-weight: 800; color: #3D3D3D; margin-bottom: 5px;">Ahorro de Tiempo</div>
            <p style="font-size: 12px; color: #64748b; margin: 0;">Optimización de procesos internos para mayor eficiencia.</p>
          </div>
          <div style="padding: 15px; border-left: 3px solid #10b981; background: #ecfdf5;">
            <div style="font-weight: 800; color: #3D3D3D; margin-bottom: 5px;">Soporte 24/7</div>
            <p style="font-size: 12px; color: #64748b; margin: 0;">Asistencia técnica personalizada en todo momento.</p>
          </div>
        </div>
      </div>
    `
  });

  bm.add('doc-about', {
    label: 'Sobre Mí / Empresa',
    category: docCategory,
    content: `
      <div class="v-doc-about" style="display: flex; align-items: center; gap: 30px; padding: 30px; background: #ffffff; border: 1px solid #f1f5f9; border-radius: 16px; margin: 40px 0; font-family: 'Inter', sans-serif;">
        <div style="width: 80px; height: 80px; background: #e2e8f0; border-radius: 50%; overflow: hidden;"></div>
        <div style="flex: 1;">
          <h4 style="margin: 0; font-size: 18px; font-weight: 900; color: #3D3D3D;">{{empresa.nombre}}</h4>
          <p style="margin: 4px 0 12px; font-size: 14px; color: #4f46e5; font-weight: 600;">Tu Aliado Estratégico</p>
          <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #64748b;">Contamos con más de 10 años de experiencia transformando negocios mediante tecnología y consultoría personalizada de alto nivel.</p>
        </div>
      </div>
    `
  });

  bm.add('doc-cta', {
    label: 'CTA Propuesta',
    category: docCategory,
    content: `
      <div class="v-doc-cta" style="margin: 50px 0; padding: 40px; text-align: center; background: #3D3D3D; border-radius: 16px; font-family: 'Inter', sans-serif;">
        <h3 style="color: #ffffff; font-size: 22px; font-weight: 800; margin-bottom: 15px;">¿Listo para comenzar el proyecto?</h3>
        <p style="color: #cbd5e1; font-size: 15px; margin-bottom: 25px;">Haz clic en el enlace de firma para formalizar esta propuesta comercial.</p>
        <div style="display: inline-block; padding: 14px 30px; background: #4f46e5; color: #ffffff; font-weight: 800; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">ACEPTAR PROPUESTA</div>
      </div>
    `
  });

  bm.add('doc-faq', {
    label: 'FAQ',
    category: docCategory,
    content: `
      <div class="v-doc-faq" style="margin: 30px 0; font-family: 'Inter', sans-serif;">
        <h3 style="font-size: 14px; font-weight: 800; color: #3D3D3D; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Preguntas Frecuentes</h3>
        <div style="margin-bottom: 15px;">
          <div style="font-weight: 700; color: #3D3D3D; margin-bottom: 5px;">¿Cuál es el tiempo de entrega estimado?</div>
          <p style="font-size: 13px; color: #64748b; margin: 0;">El plazo estándar de implementación es de 15 a 20 días hábiles tras la firma.</p>
        </div>
        <div style="margin-bottom: 15px;">
          <div style="font-weight: 700; color: #3D3D3D; margin-bottom: 5px;">¿Se requiere algún pago por adelantado?</div>
          <p style="font-size: 13px; color: #64748b; margin: 0;">Solicitamos un anticipo del 50% para dar inicio a las actividades de diagnóstico.</p>
        </div>
      </div>
    `
  });

  bm.add('doc-terms-global', {
    label: 'Términos Base',
    category: docCategory,
    content: `
      <div class="v-doc-terms-global" style="margin: 30px 0; font-family: 'Inter', sans-serif; background: #fdfdfd; padding: 25px; border: 1px solid #f1f5f9; border-radius: 8px;">
        <h3 style="font-size: 14px; font-weight: 800; color: #3D3D3D; text-transform: uppercase; margin-bottom: 15px; letter-spacing: 0.1em;">Términos y Condiciones</h3>
        <div style="font-size: 13px; line-height: 1.6; color: #64748b; text-align: justify; white-space: pre-wrap;">{{config.doc_terms_default}}</div>
      </div>
    `
  });

  bm.add('doc-warranty-global', {
    label: 'Garantía Base',
    category: docCategory,
    content: `
      <div class="v-doc-warranty-global" style="margin: 30px 0; font-family: 'Inter', sans-serif; background: #f8fafc; padding: 25px; border-left: 4px solid #3D3D3D; border-radius: 0 8px 8px 0;">
        <h3 style="font-size: 14px; font-weight: 800; color: #3D3D3D; text-transform: uppercase; margin-bottom: 15px; letter-spacing: 0.1em;">Garantía de Servicio</h3>
        <div style="font-size: 13px; line-height: 1.6; color: #64748b; white-space: pre-wrap;">{{config.doc_warranty_default}}</div>
      </div>
    `
  });


  // 3. SIGANATURE / LIBRESIGN CATEGORY
  const signCategory = 'Firma Digital 🖋️';

  bm.add('v-signer-field', {
    label: 'Campo de Firma',
    category: signCategory,
    content: {
      type: 'v-signer-field',
      attributes: { 'data-signer-id': 'signer_1', 'data-signer-role': 'Cliente' },
      content: `
        <div class="v-signer-placeholder" style="width: 100%; border-top: 2px solid #1e293b; padding-top: 15px; text-align: center; font-family: 'Inter', sans-serif;">
          <div style="font-size: 10px; color: #6366f1; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px;">ÁREA DE FIRMA EIDAS</div>
          <p style="margin: 0; font-size: 14px; font-weight: 800; color: #1e293b;">{{lead.nombre}}</p>
          <p style="margin: 5px 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">FIRMANTE: CLIENTE</p>
        </div>
      `
    }
  });

  bm.add('doc-signature-dual', {
    label: 'Firma Doble',
    category: signCategory,
    content: `
      <div class="v-doc-signatures" style="display: flex; justify-content: space-between; margin-top: 80px; gap: 60px; font-family: 'Inter', sans-serif;">
        <div style="flex: 1; text-align: center;">
           <div data-gjs-type="v-signer-field" data-signer-id="representative" data-signer-role="Representante Legal">
              <div class="v-signer-placeholder" style="width: 100%; border-top: 2px solid #1e293b; padding-top: 15px; text-align: center;">
                <div style="font-size: 10px; color: #6366f1; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px;">ÁREA DE FIRMA EIDAS</div>
                <p style="margin: 0; font-size: 14px; font-weight: 800; color: #1e293b;">{{empresa.nombre}}</p>
                <p style="margin: 5px 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">FIRMANTE: REPRESENTANTE</p>
              </div>
           </div>
        </div>
        <div style="flex: 1; text-align: center;">
           <div data-gjs-type="v-signer-field" data-signer-id="client" data-signer-role="Cliente / Contratante">
              <div class="v-signer-placeholder" style="width: 100%; border-top: 2px solid #1e293b; padding-top: 15px; text-align: center;">
                <div style="font-size: 10px; color: #6366f1; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px;">ÁREA DE FIRMA EIDAS</div>
                <p style="margin: 0; font-size: 14px; font-weight: 800; color: #1e293b;">{{lead.nombre}}</p>
                <p style="margin: 5px 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">FIRMANTE: CLIENTE</p>
              </div>
           </div>
        </div>
      </div>
    `
  });
};
