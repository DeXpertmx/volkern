import { Editor } from "grapesjs";
import { getIconSvg, MODERN_ICONS } from "../../icons/BlockIcons";

export const createStandardBlocks = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. Add "Volkern Button" Block
  bm.add("v-button", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('cta')}</div>
        <div class="gjs-block-label">Botón Icon</div>
      </div>
    `,
    category: "Volkern CRM 🚀",
    content: { type: 'v-button' }
  });

  // 2. Add "Volkern Heading" Block
  bm.add("v-heading", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('hero')}</div>
        <div class="gjs-block-label">Título CRM</div>
      </div>
    `,
    category: "Volkern CRM 🚀",
    content: {
      type: 'text',
      tagName: 'h2',
      editable: true,
      selectable: true,
      content: 'Título de Sección',
      style: {
        'font-size': '2.5rem',
        'font-weight': 'bold',
        'margin-bottom': '1rem',
        'color': '#000000',
        'font-family': 'Inter, sans-serif'
      }
    }
  });

  // 3. Add "Volkern Text" Block
  bm.add("v-text", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('blog')}</div>
        <div class="gjs-block-label">Texto CRM</div>
      </div>
    `,
    category: "Volkern CRM 🚀",
    content: {
      type: 'text',
      tagName: 'p',
      editable: true,
      selectable: true,
      content: 'Este es un bloque de texto editable con el estilo estándar de Volkern.',
      style: {
        'font-size': '1.1rem',
        'line-height': '1.6',
        'color': '#374151',
        'font-family': 'Inter, sans-serif'
      }
    }
  });

  // 4. Define v-button component
  editor.DomComponents.addType('v-button', {
    model: {
      defaults: {
        tagName: 'a',
        attributes: { class: 'v-btn' },
        components: [
          {
            tagName: 'span',
            attributes: { class: 'v-icon' },
            content: getIconSvg('hero', 20),
            hoverable: false,
            selectable: false,
            draggable: false,
            removable: false,
          },
          {
            tagName: 'span',
            attributes: { class: 'v-text' },
            content: 'Botón con Icono',
            hoverable: true,
            selectable: true,
            editable: true,
          }
        ],
        traits: [
          {
            type: 'select',
            label: 'Icono',
            name: 'icon_type',
            options: Object.keys(MODERN_ICONS).map(key => ({ id: key, name: key.toUpperCase() })),
            changeProp: true,
          },
          {
            type: 'select',
            label: 'Posición Icono',
            name: 'icon_position',
            options: [
              { id: 'left', name: 'Izquierda' },
              { id: 'right', name: 'Derecha' }
            ],
            changeProp: true,
          },
          {
            type: 'button',
            label: 'Diseñar en Canva',
            text: 'Abrir Canva',
            full: true,
            command: 'open-canva'
          },
          'href',
          'target'
        ]
      },

      init() {
        this.on('change:icon_type', this.updateIcon);
        this.on('change:icon_position', this.updatePosition);
      },

      updateIcon() {
        const iconType = this.get('icon_type');
        const components = this.components();
        const iconComp = components.at(0);
        if (iconComp) {
          iconComp.set('content', getIconSvg(iconType, 20));
        }
      },

      updatePosition() {
        const pos = this.get('icon_position');
        const classes = this.getAttributes().class || '';
        let newClasses = classes.replace('icon-right', '').trim();
        if (pos === 'right') {
          newClasses += ' icon-right';
        }
        this.addAttributes({ class: newClasses });
      }
    }
  });
};
