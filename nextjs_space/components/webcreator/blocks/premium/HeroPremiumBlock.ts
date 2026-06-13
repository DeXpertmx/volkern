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
          { type: 'text', label: 'Link Botón 1', name: 'data-link-1' },
          { type: 'text', label: 'Texto Botón 2', name: 'data-btn-2' },
          { type: 'text', label: 'Link Botón 2', name: 'data-link-2' },
        ],
        components: `
          <style>
.premium-hero-section { padding: 80px 24px; background: #f8fafc; position: relative; overflow: hidden; }
.premium-hero-container { max-width: 1200px; margin: 0 auto; text-align: center; position: relative; z-index: 2; }
.premium-hero-bg-glow { position: absolute; top: -200px; left: 50%; transform: translateX(-50%); width: 600px; height: 600px; background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%); pointer-events: none; z-index: 1; }
.premium-hero-grid-overlay { position: absolute; inset: 0; background-image: linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; z-index: 1; }
.premium-hero-badge { display: inline-flex; align-items: center; gap: 8px; background: #eef2ff; color: #6366f1; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 8px 16px; border-radius: 9999px; margin-bottom: 24px; letter-spacing: 0.5px; }
.premium-hero-badge-dot { width: 8px; height: 8px; background: #6366f1; border-radius: 50%; }
.premium-hero-badge-text { color: #6366f1; }
.premium-hero-title { font-size: 48px; font-weight: 800; color: #1e293b; line-height: 1.1; margin: 0 0 16px; }
.premium-hero-desc { font-size: 18px; color: #475569; line-height: 1.6; max-width: 600px; margin: 0 auto 32px; }
.premium-hero-cta-group { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.premium-hero-btn-primary { display: inline-block; background: #6366f1; color: white; font-weight: 700; padding: 16px 32px; border-radius: 12px; text-decoration: none; transition: all 0.2s; }
.premium-hero-btn-primary:hover { background: #4f46e5; }
.premium-hero-btn-secondary { display: inline-block; background: white; color: #6366f1; font-weight: 700; padding: 16px 32px; border-radius: 12px; text-decoration: none; border: 2px solid #6366f1; transition: all 0.2s; }
.premium-hero-btn-secondary:hover { background: #f8fafc; }
</style>
           <section class="premium-hero-section">
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
                <a class="premium-hero-btn-primary" data-v-btn-1 data-v-link-1>EMPEZAR AHORA</a>
                <a class="premium-hero-btn-secondary" data-v-btn-2 data-v-link-2>VER DEMO</a>
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
            const link1 = el.getAttribute('data-link-1');
            const link2 = el.getAttribute('data-link-2');

            const tEl = el.querySelector('[data-v-title]');
            if (tEl && title) tEl.innerText = title;

            const dEl = el.querySelector('[data-v-desc]');
            if (dEl && desc) dEl.innerText = desc;

            const b1El = el.querySelector('[data-v-btn-1]');
            if (b1El && btn1) b1El.innerText = btn1;

            const b2El = el.querySelector('[data-v-btn-2]');
            if (b2El && btn2) b2El.innerText = btn2;

            const l1El = el.querySelector('[data-v-link-1]');
            if (l1El && link1) l1El.setAttribute('href', link1);

            const l2El = el.querySelector('[data-v-link-2]');
            if (l2El && link2) l2El.setAttribute('href', link2);
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
