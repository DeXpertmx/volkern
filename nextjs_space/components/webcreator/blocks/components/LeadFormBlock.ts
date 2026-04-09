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
          {
            type: 'color',
            label: 'Color de Texto (General)',
            name: 'data-color-text',
            value: '#3D3D3D'
          },
          {
            type: 'color',
            label: 'Color de Acento',
            name: 'data-color-accent',
            value: '#6366f1'
          },
          {
             type: 'text',
             label: 'Botón: Texto',
             name: 'data-btn-text',
             value: 'Enviar Estrategia'
          },
          {
            type: 'color',
            label: 'Botón: Fuente',
            name: 'data-btn-color-text',
            value: '#ffffff'
          },
          {
            type: 'color',
            label: 'Botón: Fondo',
            name: 'data-btn-bg-color',
            value: '#3D3D3D'
          },
        ],
        components: `
          <section class="volkern-lead-section">
            <style>
              .volkern-lead-section { padding: 8rem 2rem; background: transparent; color: var(--v-text, #3D3D3D); font-family: 'Inter', sans-serif; }
              .volkern-lead-card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 3rem; padding: 4rem; box-shadow: 0 40px 100px -30px rgba(0,0,0,0.05); }
              .volkern-lead-title { font-size: 2.5rem; font-weight: 900; margin-bottom: 1rem; letter-spacing: -0.05em; font-style: italic; text-align: center; color: #3D3D3D; }
              .volkern-lead-subtitle { color: #3D3D3D; opacity: 0.6; text-align: center; margin-bottom: 3rem; font-weight: 500; }
              .volkern-lead-input { width: 100%; padding: 1.25rem; background: #f8fafc; border: 1px solid #3D3D3D; border-radius: 1.25rem; color: #3D3D3D; margin-bottom: 1.5rem; outline: none; transition: all 0.3s; }
              .volkern-lead-input::placeholder { color: #3D3D3D; opacity: 0.4; }
              .volkern-lead-input:focus { border-color: var(--v-accent, #6366f1); background: #ffffff; }
              .volkern-lead-btn { width: 100%; padding: 1.5rem !important; background-color: var(--v-btn-bg, #3D3D3D) !important; color: var(--v-btn-text, #ffffff) !important; border-radius: 1.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; border: none !important; cursor: pointer; transition: all 0.3s; margin-top: 1rem; }
              .volkern-lead-btn:hover { filter: brightness(0.9); transform: translateY(-3px); box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.4); }
            </style>
            <div class="volkern-lead-card">
              <h2 class="volkern-lead-title">Impulsa tu Crecimiento</h2>
              <p class="volkern-lead-subtitle">Déjanos tus datos y un estratega senior te contactará en menos de 24 horas.</p>
              <form class="volkern-lead-form">
                <input type="text" class="volkern-lead-input" placeholder="Nombre completo" required>
                <input type="email" class="volkern-lead-input" placeholder="Email corporativo" required>
                <textarea class="volkern-lead-input" placeholder="¿Cuál es tu mayor reto hoy?" rows="4" style="resize: none;"></textarea>
                <button type="submit" class="volkern-lead-btn">Enviar Estrategia</button>
              </form>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const form = el.querySelector('form');
          if (!form) return;

          const applyConfig = () => {
             const textColor = el.getAttribute('data-color-text') || '#ffffff';
             const accentColor = el.getAttribute('data-color-accent') || '#6366f1';
             const btnTextColor = el.getAttribute('data-btn-color-text') || '#000000';
             const btnBgColor = el.getAttribute('data-btn-bg-color') || '#ffffff';
             const btnText = el.getAttribute('data-btn-text') || 'Enviar Estrategia';
             
             el.style.setProperty('--v-text', textColor);
             el.style.setProperty('--v-accent', accentColor);
             el.style.setProperty('--v-btn-text', btnTextColor);
             el.style.setProperty('--v-btn-bg', btnBgColor);

             const submitBtn = el.querySelector('.volkern-lead-btn');
             if (submitBtn) submitBtn.innerText = btnText;
          };

          form.addEventListener('submit', async (e: any) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            const inputs = form.querySelectorAll('input, textarea');
            const originalText = btn.innerText;
            
            btn.innerText = 'ENVIANDO...';
            btn.disabled = true;

            try {
              let apiUrl = '/api/volkern?path=captacion/leads';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }

              const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nombre: inputs[0].value,
                  email: inputs[1].value,
                  notas: inputs[2].value,
                  fuente: 'WebCreator Landing'
                })
              });

              if (res.ok) {
                el.querySelector('.volkern-lead-card').innerHTML = `
                  <div style="text-align: center; padding: 4rem 0;">
                    <div style="width: 80px; height: 80px; background: rgba(99, 102, 241, 0.1); color: var(--v-accent, #6366f1); border-radius: 50%; margin: 0 auto 2rem; display: flex; align-items: center; justify-content: center;">
                      <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h2 style="font-size: 2.5rem; font-weight: 900; font-style: italic; color: var(--v-text, white);">¡Recibido!</h2>
                    <p style="color: var(--v-text, white); opacity: 0.4; margin-top: 1rem;">Un experto se pondrá en contacto contigo pronto.</p>
                  </div>
                `;
              } else {
                throw new Error('Error');
              }
            } catch (err) {
              alert('Hubo un error al enviar tus datos. Por favor reintenta.');
              btn.innerText = originalText;
              btn.disabled = false;
            }
          });

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              const attr = mutation.attributeName;
              if (attr && attr.startsWith('data-')) {
                applyConfig();
              }
            });
          });
          observer.observe(el, { attributes: true });

          applyConfig();
        }
      }
    }
  });
};