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
            <style>
              .premium-cta-section { padding: 8rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; }
              .premium-cta-card { max-width: 1200px; margin: 0 auto; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(167, 139, 250, 0.1)); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 4rem; padding: 6rem 4rem; text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(20px); }
              .premium-cta-card::before { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle at center, rgba(99, 102, 241, 0.1) 0%, transparent 50%); pointer-events: none; }
              .premium-cta-title { font-size: 5rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 2rem; line-height: 1; font-style: italic; position: relative; z-index: 10; }
              .premium-cta-desc { font-size: 1.25rem; color: rgba(255, 255, 255, 0.5); line-height: 1.6; max-width: 600px; margin: 0 auto 4rem; font-weight: 500; position: relative; z-index: 10; }
              .premium-cta-btn { display: inline-flex; align-items: center; gap: 1rem; padding: 1.5rem 4rem; background: white; color: black; border: none; border-radius: 1.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em; cursor: pointer; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); position: relative; z-index: 10; box-shadow: 0 20px 50px -10px rgba(255,255,255,0.3); }
              .premium-cta-btn:hover { background: #6366f1; color: white; transform: scale(1.05) translateY(-5px); box-shadow: 0 30px 60px -15px rgba(99, 102, 241, 0.6); }
              .premium-cta-btn svg { transition: transform 0.3s; }
              .premium-cta-btn:hover svg { transform: translateX(5px); }
              @media (max-width: 768px) { .premium-cta-title { font-size: 3rem; } .premium-cta-card { padding: 4rem 2rem; border-radius: 2.5rem; } .premium-cta-btn { width: 100%; justify-content: center; padding: 1.5rem 2rem; } }
            </style>
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
