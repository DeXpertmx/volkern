import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createStockBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-stock-badge", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('inventory')}
        </div>
        <div class="gjs-block-label">Stock Real</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-stock-badge' }
  });

  editor.DomComponents.addType('volkern-stock-badge', {
    model: {
      defaults: {
        tagName: 'div',
        attributes: { 
          class: 'v-stock-badge',
          'data-product-id': '',
          'data-show-number': 'true'
        },
        components: `
          <span class="v-stock-status">Cargando stock...</span>
        `,
        traits: [
          { type: 'text', label: 'ID del Producto', name: 'data-product-id' },
          { type: 'checkbox', label: 'Mostrar número', name: 'data-show-number' }
        ]
      }
    },
    view: {
      onRender() {
        const el = this.el;
        const productId = el.getAttribute('data-product-id');
        const showNumber = el.getAttribute('data-show-number') === 'true';
        
        if (!productId) return;

        // En el editor, solo mostramos un placeholder
        const isEditor = window.location.href.includes('/webcreator/editor/');
        if (isEditor) {
          el.innerHTML = `<span style="color: #6366f1; font-weight: bold;">[STOCK: PROD_${productId}]</span>`;
          return;
        }

        // En producción, fetch real
        const fetchStock = async () => {
          try {
            const res = await fetch(`/api/erp/inventory/stock?id=${productId}`);
            const data = await res.json();
            const stock = data.stock || 0;
            
            if (stock > 10) {
              el.innerHTML = `<span style="color: #22c55e;">● En Stock${showNumber ? `: ${stock}` : ''}</span>`;
            } else if (stock > 0) {
              el.innerHTML = `<span style="color: #f59e0b;">● Últimas unidades${showNumber ? `: ${stock}` : ''}</span>`;
            } else {
              el.innerHTML = `<span style="color: #ef4444;">● Agotado</span>`;
            }
          } catch (err) {
            el.innerHTML = `<span>Stock no disponible</span>`;
          }
        };

        fetchStock();
      }
    }
  });
};
