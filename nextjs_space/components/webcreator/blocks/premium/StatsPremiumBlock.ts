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
          <style>
.premium-stats-section { padding: 80px 24px; background: white; }
.premium-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; max-width: 1200px; margin: 0 auto; }
.premium-stat-item { text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.premium-stat-value { font-size: 44px; font-weight: 800; color: #1e293b; line-height: 1; margin-bottom: 8px; }
.premium-stat-plus { color: #6366f1; font-size: 24px; }
.premium-stat-label { font-size: 15px; color: #475569; font-weight: 500; }
</style>
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
