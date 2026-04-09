import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createFAQPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("faq-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('faq')}</div>
        <div class="gjs-block-label">FAQ</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'faq-premium' }
  });

  editor.DomComponents.addType('faq-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-faq-section">
            <style>
              .premium-faq-section { padding: 10rem 2rem; background: transparent; color: #3D3D3D; font-family: 'Inter', sans-serif; }
              .premium-faq-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; }
              .premium-faq-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 100px; color: #6366f1; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-faq-title { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; font-style: italic; color: #3D3D3D; }
              .premium-faq-desc { font-size: 1.125rem; color: #3D3D3D; opacity: 0.6; line-height: 1.6; font-weight: 500; }
              .premium-faq-container { max-width: 900px; margin: 0 auto; min-height: 100px; }
              
              .v-faq-item { background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 2rem; margin-bottom: 1.5rem; overflow: hidden; transition: all 0.3s; list-style: none; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
              .v-faq-item:hover { border-color: #6366f1; background: #ffffff; }
              .v-faq-item[open] { background: #ffffff; border-color: #6366f1; box-shadow: 0 20px 50px rgba(0,0,0,0.05); }
              
              .v-faq-summary { padding: 2rem 2.5rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 1.25rem; font-weight: 800; list-style: none; outline: none; color: #3D3D3D; }
              .v-faq-summary::-webkit-details-marker { display: none; }
              
              .v-faq-icon { width: 32px; height: 32px; background: rgba(61, 61, 61, 0.05); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #3D3D3D; opacity: 0.6; transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1); flex-shrink: 0; }
              .v-faq-item[open] .v-faq-icon { transform: rotate(45deg); background: #6366f1; color: white; opacity: 1; }
              
              .v-faq-content { padding: 0 2.5rem 2.5rem; color: #3D3D3D; opacity: 0.6; line-height: 1.7; font-weight: 500; font-size: 1.125rem; }
              
              @media (max-width: 768px) { .premium-faq-title { font-size: 2.5rem; } .v-faq-summary { padding: 1.5rem; font-size: 1.125rem; } }
            </style>
            
            <div class="premium-faq-header">
              <div class="premium-faq-badge">Soporte Inteligente</div>
              <h2 class="premium-faq-title">Preguntas Frecuentes.</h2>
              <p class="premium-faq-desc">Todo lo que necesitas saber sobre nuestra plataforma.</p>
            </div>
            
            <div class="premium-faq-container" data-gjs-droppable=".v-faq-item">
              <details class="v-faq-item" open>
                <summary class="v-faq-summary">
                  <span>¿Cómo funciona la automatización IA?</span>
                  <div class="v-faq-icon"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg></div>
                </summary>
                <div class="v-faq-content">
                  Nuestra IA utiliza una arquitectura de agentes autónomos para resolver tareas complejas sin intervención humana constante.
                </div>
              </details>

              <details class="v-faq-item">
                <summary class="v-faq-summary">
                  <span>¿Es posible integrar sistemas heredados?</span>
                  <div class="v-faq-icon"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg></div>
                </summary>
                <div class="v-faq-content">
                  Sí, contamos con una capa de abstracción API robusta diseñada para conectar con infraestructuras legacy.
                </div>
              </details>
            </div>
          </section>
        `
      }
    }
  });
};
