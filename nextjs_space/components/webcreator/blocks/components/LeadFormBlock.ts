import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createLeadFormBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-lead-form", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('leads')}
        </div>
        <div class="gjs-block-label">Leads</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-lead-form' }
  });

  editor.DomComponents.addType("volkern-lead-form", {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Título', name: 'data-title' },
          { type: 'text', label: 'Subtítulo', name: 'data-subtitle' },
          { type: 'checkbox', label: '¿Subir Factura?', name: 'data-with-invoice' },
          { type: 'color', label: 'Color de Acento', name: 'data-color-accent', value: '#6366f1' },
          { type: 'text', label: 'Botón: Texto', name: 'data-btn-text', value: 'Enviar Estrategia' },
        ],
        components: `
          <section class="volkern-lead-section">
            <div class="volkern-lead-card">
              <h2 class="volkern-lead-title" data-v-title>Impulsa tu Crecimiento</h2>
              <p class="volkern-lead-subtitle" data-v-subtitle>Déjanos tus datos y un estratega senior te contactará pronto.</p>
              <form class="volkern-lead-form">
                <input type="text" class="volkern-lead-input" placeholder="Nombre completo" autocomplete="name" required>
                <input type="email" class="volkern-lead-input" placeholder="Email corporativo" autocomplete="email" required>
                <div data-v-invoice-area style="display: none;">
                  <label class="volkern-file-label">Adjuntar Factura (PDF/Imagen)</label>
                  <input type="file" class="volkern-lead-input" accept=".pdf,image/*">
                </div>
                <textarea class="volkern-lead-input" placeholder="¿Cómo podemos ayudarte?" rows="4" style="resize: none;"></textarea>
                <button type="submit" class="volkern-lead-btn">Enviar Estrategia</button>
              </form>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
            const title = el.getAttribute('data-title');
            const subtitle = el.getAttribute('data-subtitle');
            const withInvoice = el.getAttribute('data-with-invoice');
            const btnText = el.getAttribute('data-btn-text');
            const accent = el.getAttribute('data-color-accent');

            const tEl = el.querySelector('[data-v-title]');
            if (tEl && title) tEl.innerText = title;

            const sEl = el.querySelector('[data-v-subtitle]');
            if (sEl && subtitle) sEl.innerText = subtitle;

            const bEl = el.querySelector('.volkern-lead-btn');
            if (bEl && btnText) bEl.innerText = btnText;
            
            const invoiceArea = el.querySelector('[data-v-invoice-area]');
            if (invoiceArea) {
                invoiceArea.style.display = (withInvoice === 'true' || withInvoice === true) ? 'block' : 'none';
            }
            
            if (accent) {
                el.style.setProperty('--v-accent', accent);
                const btn = el.querySelector('.volkern-lead-btn');
                // Al sobreescribir estilos via JS el hover podria fallar si no usamos clases, pero para demo sirve
            }
          };

          const observer = new MutationObserver(() => update());
          observer.observe(el, { attributes: true });
          update();

          // Manejo de Formulario (Simplificado para la demo)
          const form = el.querySelector('form');
          form.addEventListener('submit', (e: any) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            btn.innerText = 'ENVIADO ✓';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.innerText = el.getAttribute('data-btn-text') || 'ENVIAR';
                btn.style.background = '';
            }, 3000);
          });
        }
      }
    }
  });
};