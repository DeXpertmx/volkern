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
          <style>
.premium-faq-section { padding: 80px 24px; background: #f8fafc; }
.premium-faq-header { text-align: center; max-width: 700px; margin: 0 auto 48px; }
.premium-faq-badge { display: inline-block; background: #eef2ff; color: #6366f1; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 8px 16px; border-radius: 9999px; margin-bottom: 16px; letter-spacing: 0.5px; }
.premium-faq-title { font-size: 36px; font-weight: 800; color: #1e293b; margin: 0 0 12px; }
.premium-faq-desc { font-size: 16px; color: #475569; line-height: 1.6; margin: 0; }
.premium-faq-container { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.v-faq-item { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.v-faq-summary { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; cursor: pointer; font-size: 16px; font-weight: 600; color: #1e293b; list-style: none; }
.v-faq-summary::-webkit-details-marker { display: none; }
.v-faq-icon { color: #6366f1; flex-shrink: 0; transition: transform 0.2s; }
details[open] .v-faq-icon { transform: rotate(45deg); }
.v-faq-content { padding: 0 24px 20px; font-size: 15px; color: #475569; line-height: 1.6; }
</style>
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
