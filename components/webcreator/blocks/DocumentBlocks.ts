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
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px;">
        <div style="width: 150px; height: 60px; background: #f8fafc; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; border: 1px dashed #cbd5e1;">Logo Empresa</div>
        <div style="text-align: right;">
          <h1 style="margin: 0; font-size: 24px; color: #0f172a;">CONTRATO</h1>
          <p style="margin: 5px 0; font-size: 12px; color: #64748b;">Ref: {{contrato.numero}}</p>
          <p style="margin: 0; font-size: 12px; color: #64748b;">Fecha: {{fecha.hoy}}</p>
        </div>
      </div>
    `
  });

  bm.add('doc-clause', {
    label: 'Cláusula Legal',
    category: docCategory,
    content: `
      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">CLÁUSULA {{numero}}: TÍTULO</h3>
        <p style="font-size: 12px; line-height: 1.6; color: #334155;">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
      </div>
    `
  });

  bm.add('doc-signature', {
    label: 'Bloque Firma',
    category: docCategory,
    content: `
      <div style="display: flex; justify-content: space-between; margin-top: 60px; gap: 40px;">
        <div style="flex: 1; text-align: center;">
          <div style="border-top: 1px solid #000; margin-bottom: 10px;"></div>
          <p style="margin: 0; font-size: 12px; font-weight: bold;">{{empresa.nombre}}</p>
          <p style="margin: 0; font-size: 10px; color: #64748b;">REPRESENTANTE LEGAL</p>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="border-top: 1px solid #000; margin-bottom: 10px;"></div>
          <p style="margin: 0; font-size: 12px; font-weight: bold;">{{lead.nombre}}</p>
          <p style="margin: 0; font-size: 10px; color: #64748b;">CLIENTE / CONTRATANTE</p>
        </div>
      </div>
    `
  });
};
