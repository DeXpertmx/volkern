import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createFeaturesPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("features-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('features')}</div>
        <div class="gjs-block-label">Features</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'features-premium' }
  });

  editor.DomComponents.addType('features-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Título Sección', name: 'data-title' },
          { type: 'textarea', label: 'Descripción Sección', name: 'data-desc' },
          { type: 'text', label: 'F1: Título', name: 'data-f1-title' },
          { type: 'text', label: 'F1: Texto', name: 'data-f1-desc' },
          { type: 'text', label: 'F2: Título', name: 'data-f2-title' },
          { type: 'text', label: 'F2: Texto', name: 'data-f2-desc' },
          { type: 'text', label: 'F3: Título', name: 'data-f3-title' },
          { type: 'text', label: 'F3: Texto', name: 'data-f3-desc' },
        ],
        components: `
          <style>
.premium-features-section { padding: 80px 24px; background: white; }
.premium-features-header { text-align: center; max-width: 700px; margin: 0 auto 48px; }
.premium-features-badge { display: inline-block; background: #eef2ff; color: #6366f1; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 8px 16px; border-radius: 9999px; margin-bottom: 16px; letter-spacing: 0.5px; }
.premium-features-title { font-size: 36px; font-weight: 800; color: #1e293b; margin: 0 0 12px; }
.premium-features-desc { font-size: 16px; color: #475569; line-height: 1.6; margin: 0; }
.premium-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1200px; margin: 0 auto; }
.premium-feature-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s; }
.premium-feature-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.premium-feature-icon { width: 48px; height: 48px; background: #eef2ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #6366f1; margin-bottom: 20px; }
.premium-feature-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 8px; }
.premium-feature-text { font-size: 15px; color: #475569; line-height: 1.6; margin: 0; }
</style>
           <section class="premium-features-section">
            <div class="premium-features-header">
              <div class="premium-features-badge">Capacidades Elite</div>
              <h2 class="premium-features-title" data-v-title>Potencia sin límites para equipos modernos.</h2>
              <p class="premium-features-desc" data-v-desc>Todo lo que necesitas para construir, desplegar y escalar tus proyectos.</p>
            </div>
            <div class="premium-features-grid">
              <div class="premium-feature-card">
                <div class="premium-feature-icon"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></div>
                <h3 class="premium-feature-title" data-v-f1-t>Velocidad Extrema</h3>
                <p class="premium-feature-text" data-v-f1-d>Optimizado para una carga instantánea y un rendimiento excepcional.</p>
              </div>
              <div class="premium-feature-card">
                <div class="premium-feature-icon"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></div>
                <h3 class="premium-feature-title" data-v-f2-t>Seguridad Blindada</h3>
                <p class="premium-feature-text" data-v-f2-d>Cumplimiento con los estándares más altos de la industria.</p>
              </div>
              <div class="premium-feature-card">
                <div class="premium-feature-icon"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg></div>
                <h3 class="premium-feature-title" data-v-f3-t>Integración Fluida</h3>
                <p class="premium-feature-text" data-v-f3-d>Conecta sin esfuerzo con tus herramientas favoritas.</p>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
            const get = (n) => el.getAttribute(n);
            const set = (sel, val) => {
              if (!val) return;
              const target = el.querySelector(sel);
              if (target) target.innerText = val;
            };
            set('[data-v-title]', get('data-title'));
            set('[data-v-desc]', get('data-desc'));
            set('[data-v-f1-t]', get('data-f1-title'));
            set('[data-v-f1-d]', get('data-f1-desc'));
            set('[data-v-f2-t]', get('data-f2-title'));
            set('[data-v-f2-d]', get('data-f2-desc'));
            set('[data-v-f3-t]', get('data-f3-title'));
            set('[data-v-f3-d]', get('data-f3-desc'));
          };
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
};
