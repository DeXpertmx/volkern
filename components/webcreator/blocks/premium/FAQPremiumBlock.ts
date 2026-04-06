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
              .premium-faq-section { padding: 10rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; }
              .premium-faq-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; }
              .premium-faq-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 100px; color: #818cf8; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-faq-title { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; font-style: italic; }
              .premium-faq-desc { font-size: 1.125rem; color: rgba(255, 255, 255, 0.4); line-height: 1.6; font-weight: 500; }
              .premium-faq-container { max-width: 900px; margin: 0 auto; }
              .premium-faq-item { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 2rem; margin-bottom: 1.5rem; overflow: hidden; transition: all 0.3s; }
              .premium-faq-item:hover { border-color: rgba(99, 102, 241, 0.3); background: rgba(255,255,255,0.03); }
              .premium-faq-summary { padding: 2rem 2.5rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 1.25rem; font-weight: 800; list-style: none; }
              .premium-faq-summary::-webkit-details-marker { display: none; }
              .premium-faq-icon { width: 32px; height: 32px; background: rgba(255, 255, 255, 0.05); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #818cf8; transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1); }
              .premium-faq-item[open] .premium-faq-icon { transform: rotate(45deg); background: #6366f1; color: white; }
              .premium-faq-content { padding: 0 2.5rem 2.5rem; color: rgba(255, 255, 255, 0.4); line-height: 1.7; font-weight: 500; font-size: 1.125rem; }
              @media (max-width: 768px) { .premium-faq-title { font-size: 2.5rem; } .premium-faq-summary { padding: 1.5rem; font-size: 1.125rem; } }
            </style>
            <div class="premium-faq-header">
              <div class="premium-faq-badge">Soporte Inteligente</div>
              <h2 class="premium-faq-title">Preguntas Frecuentes.</h2>
              <p class="premium-faq-desc">Todo lo que necesitas saber sobre nuestra plataforma y cómo podemos ayudarte a escalar.</p>
            </div>
            <div class="premium-faq-container">
              <details class="premium-faq-item" open>
                <summary class="premium-faq-summary">
                  ¿Cómo funciona la automatización IA?
                  <div class="premium-faq-icon"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg></div>
                </summary>
                <div class="premium-faq-content">
                  Nuestra IA utiliza una arquitectura de agentes autónomos que pueden interactuar entre sí para resolver tareas complejas de marketing, ventas y gestión de datos sin intervención humana constante.
                </div>
              </details>
              <details class="premium-faq-item">
                <summary class="premium-faq-summary">
                  ¿Es posible integrar sistemas heredados?
                  <div class="premium-faq-icon"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg></div>
                </summary>
                <div class="premium-faq-content">
                  Sí, contamos con una capa de abstracción API robusta diseñada específicamente para conectar con infraestructuras legacy de forma segura y eficiente.
                </div>
              </details>
              <details class="premium-faq-item">
                <summary class="premium-faq-summary">
                  ¿Qué nivel de seguridad ofrecen a mis datos?
                  <div class="premium-faq-icon"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg></div>
                </summary>
                <div class="premium-faq-content">
                  Implementamos cifrado de extremo a extremo y cumplimos con los estándares internacionales más estrictos como GDPR y SOC2 tipo II.
                </div>
              </details>
            </div>
          </section>
        `
      }
    }
  });
};
