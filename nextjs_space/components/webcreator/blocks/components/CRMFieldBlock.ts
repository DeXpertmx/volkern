import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createCRMFieldBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-crm-field", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('text')}
        </div>
        <div class="gjs-block-label">Campo CRM</div>
      </div>
    `,
    category: "Volkern CRM 🚀",
    content: {
      tagName: 'div',
      attributes: { class: 'v-field-group' },
      components: `
        <style>
        .v-field-group { display: flex; flex-direction: column; gap: 8px; }
        .v-field-container { display: flex; flex-direction: column; gap: 6px; }
        .v-field-label { font-size: 0.85rem; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; }
        .v-field-input { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; font-size: 15px; color: #1e293b; background: #fff; outline: none; transition: border-color 0.3s; font-family: inherit; }
        .v-field-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        .v-field-input::placeholder { color: #94a3b8; }
        </style>
        <div class="v-field-container" data-gjs-selectable="false" data-gjs-hoverable="false" data-gjs-draggable="false">
          <label class="v-field-label" data-gjs-editable="true">Nuevo Campo CRM</label>
          <input type="text" class="v-field-input" placeholder="Ingrese dato..." data-volkern-map="campo_personalizado">
        </div>
      ` as any
    }
  });

  // Asegurar que el componente sea tratable como un bloque de campo
  editor.DomComponents.addType('v-field-group', {
    model: {
      defaults: {
        traits: [
          {
            name: 'data-volkern-map',
            label: 'Vincular con CRM',
            placeholder: 'ej: nombre, email, telefono',
            target: '.v-field-input' as any
          }
        ]
      }
    }
  });
};
