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
