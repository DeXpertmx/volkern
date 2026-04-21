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
