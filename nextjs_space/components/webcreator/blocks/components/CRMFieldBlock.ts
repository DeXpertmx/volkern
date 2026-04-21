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
        <div class="v-field-container" data-gjs-selectable="false" data-gjs-hoverable="false" data-gjs-draggable="false">
          <label class="v-field-label" data-gjs-editable="true">Nuevo Campo CRM</label>
          <input type="text" class="v-field-input" placeholder="Ingrese dato..." data-volkern-map="campo_personalizado">
        </div>
      `
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
            target: '.v-field-input'
          }
        ]
      }
    }
  });
};
