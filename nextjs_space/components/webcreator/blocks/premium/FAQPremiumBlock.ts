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
