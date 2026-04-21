import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createCTAPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("cta-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('cta')}</div>
        <div class="gjs-block-label">Call to Action</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'cta-premium' }
  });

  editor.DomComponents.addType('cta-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-cta-section">
            <div class="premium-cta-card">
              <h2 class="premium-cta-title">¿LISTO PARA<br>EL SIGUIENTE NIVEL?</h2>
              <p class="premium-cta-desc">Únete a miles de empresas que ya están transformando su futuro con nuestra tecnología inteligente.</p>
              <button class="premium-cta-btn">
                EMPEZAR AHORA
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>
              </button>
            </div>
          </section>
        `
      }
    }
  });
};
