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
            <style>
              .volkern-lead-section { padding: 8rem 2rem; background: transparent; color: #3D3D3D; font-family: 'Inter', sans-serif; }
              .volkern-lead-card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 3rem; padding: 4rem; box-shadow: 0 40px 100px -30px rgba(0,0,0,0.05); }
              .volkern-lead-title { font-size: 2.5rem; font-weight: 900; margin-bottom: 1rem; letter-spacing: -0.05em; text-align: center; color: #3D3D3D; }
              .volkern-lead-subtitle { color: #3D3D3D; opacity: 0.6; text-align: center; margin-bottom: 3rem; font-weight: 500; }
              .volkern-lead-input { width: 100%; padding: 1.25rem; background: #f8fafc; border: 1px solid rgba(61,61,61,0.1); border-radius: 1.25rem; color: #3D3D3D; margin-bottom: 1.5rem; outline: none; transition: all 0.3s; font-family: inherit; }
              .volkern-lead-input:focus { border-color: #6366f1; background: #ffffff; }
              .volkern-file-label { display: block; margin-bottom: 0.5rem; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #6366f1; }
              .volkern-lead-btn { width: 100%; padding: 1.5rem; background: #3D3D3D; color: #ffffff; border-radius: 1.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; border: none; cursor: pointer; transition: all 0.3s; margin-top: 1rem; }
              .volkern-lead-btn:hover { background: #6366f1; transform: translateY(-3px); box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.4); }
            </style>
            <div class="volkern-lead-card">
              <h2 class="volkern-lead-title" data-v-title>Impulsa tu Crecimiento</h2>
              <p class="volkern-lead-subtitle" data-v-subtitle>Déjanos tus datos y un estratega senior te contactará pronto.</p>
              <form class="volkern-lead-form">
                <input type="text" class="volkern-lead-input" placeholder="Nombre completo" required>
                <input type="email" class="volkern-lead-input" placeholder="Email corporativo" required>
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
          form.addEventListener('submit', (e) => {
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