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
          .v-field-group { 
            margin-bottom: 2rem; 
            font-family: 'Inter', sans-serif; 
            width: 100%; 
            max-width: 500px;
          }
          .v-field-label { 
            display: block; 
            font-size: 0.75rem; 
            font-weight: 900; 
            text-transform: uppercase; 
            letter-spacing: 0.15em; 
            color: #3D3D3D; 
            opacity: 0.6; 
            margin-bottom: 0.75rem; 
            transition: all 0.3s;
          }
          .v-field-input { 
            width: 100%; 
            background: #f8fafc; 
            border: 1px solid rgba(61, 61, 61, 0.1); 
            border-radius: 1rem; 
            padding: 1.15rem 1.5rem; 
            color: #111827; 
            font-size: 1rem; 
            font-weight: 500;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            outline: none;
            box-sizing: border-box;
          }
          .v-field-input:focus { 
            border-color: #6366f1; 
            background: #ffffff; 
            box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
          }
          .v-field-group:hover .v-field-label {
            opacity: 1;
            color: #6366f1;
          }
        </style>
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
