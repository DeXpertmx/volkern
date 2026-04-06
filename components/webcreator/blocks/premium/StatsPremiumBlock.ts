import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createStatsPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("stats-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('stats')}</div>
        <div class="gjs-block-label">Estadísticas</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'stats-premium' }
  });

  editor.DomComponents.addType('stats-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-stats-section">
            <style>
              .premium-stats-section { padding: 10rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; position: relative; }
              .premium-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 4rem; max-width: 1200px; margin: 0 auto; text-align: center; }
              .premium-stat-item { position: relative; }
              .premium-stat-value { font-size: 6rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 0.5rem; line-height: 1; font-style: italic; background: linear-gradient(to bottom, #fff, rgba(255,255,255,0.2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
              .premium-stat-label { font-size: 0.875rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #818cf8; }
              .premium-stat-plus { font-size: 3rem; vertical-align: super; -webkit-text-fill-color: #6366f1; }
              @media (max-width: 768px) { .premium-stat-value { font-size: 4rem; } .premium-stats-grid { gap: 3rem; } }
            </style>
            <div class="premium-stats-grid">
              <div class="premium-stat-item">
                <div class="premium-stat-value">98<span class="premium-stat-plus">%</span></div>
                <div class="premium-stat-label">Satisfacción</div>
              </div>
              <div class="premium-stat-item">
                <div class="premium-stat-value">50<span class="premium-stat-plus">K</span></div>
                <div class="premium-stat-label">Usuarios</div>
              </div>
              <div class="premium-stat-item">
                <div class="premium-stat-value">24<span class="premium-stat-plus">/7</span></div>
                <div class="premium-stat-label">Soporte</div>
              </div>
              <div class="premium-stat-item">
                <div class="premium-stat-value">4.9<span class="premium-stat-plus">★</span></div>
                <div class="premium-stat-label">Rating</div>
              </div>
            </div>
          </section>
        `
      }
    }
  });
};
