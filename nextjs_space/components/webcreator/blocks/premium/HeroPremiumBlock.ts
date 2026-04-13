import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createHeroPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("hero-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('hero')}</div>
        <div class="gjs-block-label">Hero / Banner</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'hero-premium' }
  });

  editor.DomComponents.addType('hero-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Título', name: 'data-title' },
          { type: 'textarea', label: 'Descripción', name: 'data-desc' },
          { type: 'text', label: 'Texto Botón 1', name: 'data-btn-1' },
          { type: 'text', label: 'Texto Botón 2', name: 'data-btn-2' },
        ],
        components: `
          <section class="premium-hero-section">
            <style>
              .premium-hero-section { position: relative; padding: 10rem 2rem; background: #ffffff; color: #3D3D3D; font-family: 'Inter', sans-serif; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; }
              .premium-hero-bg-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; background: radial-gradient(circle at center, rgba(99, 102, 241, 0.05) 0%, transparent 70%); pointer-events: none; z-index: 1; }
              .premium-hero-grid-overlay { position: absolute; inset: 0; background-image: linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px); background-size: 50px 50px; pointer-events: none; z-index: 1; }
              .premium-hero-container { max-width: 1000px; position: relative; z-index: 10; }
              .premium-hero-badge { display: inline-flex; align-items: center; padding: 0.5rem 1.25rem; background: rgba(61, 61, 61, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 100px; margin-bottom: 2.5rem; }
              .premium-hero-badge-dot { width: 8px; height: 8px; background: #6366f1; border-radius: 50%; margin-right: 10px; box-shadow: 0 0 15px #6366f1; }
              .premium-hero-badge-text { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #3D3D3D; opacity: 0.6; }
              .premium-hero-title { font-size: 4.5rem; font-weight: 900; line-height: 1.1; letter-spacing: -0.06em; margin-bottom: 2.5rem; color: #3D3D3D; }
              .premium-hero-desc { font-size: 1.25rem; color: #3D3D3D; opacity: 0.6; line-height: 1.6; max-width: 700px; margin: 0 auto 3.5rem; font-weight: 500; }
              .premium-hero-cta-group { display: flex; gap: 1.5rem; justify-content: center; }
              .premium-hero-btn-primary { padding: 1.25rem 3rem; background: #3D3D3D; color: white; border: none; border-radius: 1.25rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; cursor: pointer; transition: all 0.4s; }
              .premium-hero-btn-primary:hover { background: #6366f1; transform: translateY(-5px); }
              .premium-hero-btn-secondary { padding: 1.25rem 3rem; background: transparent; color: #3D3D3D; border: 1px solid #3D3D3D; border-radius: 1.25rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; cursor: pointer; transition: all 0.4s; }
              @media (max-width: 768px) { .premium-hero-title { font-size: 3rem; } .premium-hero-cta-group { flex-direction: column; } }
            </style>
            <div class="premium-hero-bg-glow"></div>
            <div class="premium-hero-grid-overlay"></div>
            <div class="premium-hero-container">
              <div class="premium-hero-badge">
                <div class="premium-hero-badge-dot"></div>
                <span class="premium-hero-badge-text">Powered by Volkern AI</span>
              </div>
              <h1 class="premium-hero-title" data-v-title>REDEFINE TU VISIÓN CON INTELIGENCIA</h1>
              <p class="premium-hero-desc" data-v-desc>La próxima generación de sitios web impulsados por sistemas de agentes IA dinámicos.</p>
              <div class="premium-hero-cta-group">
                <button class="premium-hero-btn-primary" data-v-btn-1>EMPEZAR AHORA</button>
                <button class="premium-hero-btn-secondary" data-v-btn-2>VER DEMO</button>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
            const title = el.getAttribute('data-title');
            const desc = el.getAttribute('data-desc');
            const btn1 = el.getAttribute('data-btn-1');
            const btn2 = el.getAttribute('data-btn-2');

            const tEl = el.querySelector('[data-v-title]');
            if (tEl && title) tEl.innerText = title;

            const dEl = el.querySelector('[data-v-desc]');
            if (dEl && desc) dEl.innerText = desc;

            const b1El = el.querySelector('[data-v-btn-1]');
            if (b1El && btn1) b1El.innerText = btn1;

            const b2El = el.querySelector('[data-v-btn-2]');
            if (b2El && btn2) b2El.innerText = btn2;
          };

          const observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
              if (m.attributeName && m.attributeName.startsWith('data-')) update();
            });
          });
          observer.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
};
