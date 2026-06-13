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
          <style>
          .volkern-lead-section { padding: 80px 24px; background: #f8fafc; display: flex; justify-content: center; }
          .volkern-lead-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); padding: 48px; max-width: 560px; width: 100%; }
          .volkern-lead-title { font-size: 2rem; font-weight: 800; color: #1e293b; margin: 0 0 8px; }
          .volkern-lead-subtitle { font-size: 1rem; color: #475569; margin: 0 0 32px; line-height: 1.6; }
          .volkern-lead-form { display: flex; flex-direction: column; gap: 16px; }
          .volkern-lead-input { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; font-size: 15px; color: #1e293b; background: #fff; outline: none; transition: border-color 0.3s; font-family: inherit; }
          .volkern-lead-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
          .volkern-lead-input::placeholder { color: #94a3b8; }
          .volkern-lead-btn { background: #6366f1; color: #fff; font-weight: 700; border-radius: 12px; padding: 14px 28px; border: none; cursor: pointer; font-size: 1rem; transition: background 0.3s, transform 0.2s; }
          .volkern-lead-btn:hover { background: #4f46e5; transform: scale(1.02); }
          .volkern-file-label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 6px; }
          </style>
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