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
        components: `
          <section class="premium-features-section">
            <style>
              .premium-features-section { padding: 10rem 2rem; background: #ffffff; color: #3D3D3D; font-family: 'Inter', sans-serif; }
              .premium-features-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; }
              .premium-features-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 100px; color: #6366f1; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-features-title { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; color: #3D3D3D; }
              .premium-features-desc { font-size: 1.125rem; color: #3D3D3D; opacity: 0.6; line-height: 1.6; font-weight: 500; }
              .premium-features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
              .premium-feature-card { background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 2.5rem; padding: 3rem; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
              .premium-feature-card:hover { transform: translateY(-10px); background: #ffffff; border-color: #6366f1; box-shadow: 0 20px 50px rgba(0,0,0,0.05); }
              .premium-feature-icon { width: 56px; height: 56px; background: rgba(61, 61, 61, 0.05); border-radius: 18px; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem; color: #6366f1; }
              .premium-feature-title { font-size: 1.5rem; font-weight: 800; margin-bottom: 1rem; letter-spacing: -0.03em; color: #3D3D3D; }
              .premium-feature-text { color: #3D3D3D; opacity: 0.6; line-height: 1.7; font-weight: 500; }
              @media (max-width: 768px) { .premium-features-title { font-size: 2.5rem; } }
            </style>
            <div class="premium-features-header">
              <div class="premium-features-badge" data-gjs-editable="true" data-gjs-selectable="true">Capacidades Elite</div>
              <h2 class="premium-features-title" data-gjs-editable="true" data-gjs-selectable="true">Potencia sin límites para equipos modernos.</h2>
              <p class="premium-features-desc" data-gjs-editable="true" data-gjs-selectable="true">Todo lo que necesitas para construir, desplegar y escalar tus proyectos con tecnología de vanguardia.</p>
            </div>
            <div class="premium-features-grid">
              <div class="premium-feature-card">
                <div class="premium-feature-icon" data-gjs-hoverable="false">
                  <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <h3 class="premium-feature-title" data-gjs-editable="true" data-gjs-selectable="true">Velocidad Extrema</h3>
                <p class="premium-feature-text" data-gjs-editable="true" data-gjs-selectable="true">Optimizado para una carga instantánea y un rendimiento excepcional en cualquier dispositivo.</p>
              </div>
              <div class="premium-feature-card">
                <div class="premium-feature-icon" data-gjs-hoverable="false">
                   <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <h3 class="premium-feature-title" data-gjs-editable="true" data-gjs-selectable="true">Seguridad Blindada</h3>
                <p class="premium-feature-text" data-gjs-editable="true" data-gjs-selectable="true">Encriptación de grado militar y cumplimiento con los estándares más altos de la industria.</p>
              </div>
              <div class="premium-feature-card">
                <div class="premium-feature-icon" data-gjs-hoverable="false">
                  <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
                </div>
                <h3 class="premium-feature-title" data-gjs-editable="true" data-gjs-selectable="true">Integración Fluida</h3>
                <p class="premium-feature-text" data-gjs-editable="true" data-gjs-selectable="true">Conecta sin esfuerzo con tus herramientas favoritas a través de nuestra API robusta.</p>
              </div>
            </div>
          </section>
        `
      }
    }
  });
};
