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
          <style>
.premium-cta-section { padding: 80px 24px; background: white; }
.premium-cta-card { max-width: 800px; margin: 0 auto; text-align: center; background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 64px 48px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.premium-cta-title { font-size: 36px; font-weight: 800; color: #1e293b; margin: 0 0 16px; line-height: 1.2; }
.premium-cta-desc { font-size: 16px; color: #475569; line-height: 1.6; max-width: 500px; margin: 0 auto 32px; }
.premium-cta-btn { display: inline-flex; align-items: center; gap: 8px; background: #6366f1; color: white; font-weight: 700; font-size: 16px; padding: 16px 32px; border: none; border-radius: 12px; cursor: pointer; transition: all 0.2s; }
.premium-cta-btn:hover { background: #4f46e5; }
</style>
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
