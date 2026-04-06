import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createTestimonialsPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("testimonials-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('testimonials')}</div>
        <div class="gjs-block-label">Testimonials</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'testimonials-premium' }
  });

  editor.DomComponents.addType('testimonials-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-testimonials-section">
            <style>
              .premium-testimonials-section { padding: 10rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; }
              .premium-testimonials-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; position: relative; z-index: 10; }
              .premium-testimonials-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 100px; color: #10b981; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-testimonials-title { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; font-style: italic; }
              .premium-testimonials-grid { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 1200px; margin: 0 auto; position: relative; z-index: 10; }
              @media (min-width: 1024px) { .premium-testimonials-grid { grid-template-columns: 2fr 1fr; } }
              .premium-testimonial-main { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 3rem; padding: 4rem; display: flex; flex-direction: column; justify-content: space-between; }
              .premium-testimonial-quote { font-size: 2.25rem; font-weight: 700; line-height: 1.3; color: white; margin-bottom: 3rem; letter-spacing: -0.03em; }
              .premium-testimonial-author { display: flex; align-items: center; gap: 1.5rem; }
              .premium-testimonial-avatar { width: 64px; height: 64px; border-radius: 20px; object-cover; border: 1px solid rgba(255, 255, 255, 0.1); }
              .premium-testimonial-author-info h4 { font-size: 1.25rem; font-weight: 800; margin: 0; }
              .premium-testimonial-author-info p { font-size: 0.875rem; color: rgba(255, 255, 255, 0.4); margin: 0.25rem 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
              .premium-testimonials-sidebar { display: flex; flex-direction: column; gap: 2rem; }
              .premium-testimonial-small { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 2.5rem; padding: 2.5rem; }
              .premium-testimonial-small-quote { font-size: 1.125rem; font-weight: 600; line-height: 1.6; color: rgba(255, 255, 255, 0.6); margin-bottom: 2rem; }
              .premium-testimonial-small-author { display: flex; align-items: center; gap: 1rem; }
              .premium-testimonial-small-avatar { width: 40px; height: 40px; border-radius: 12px; }
              .premium-testimonials-bg-glow { position: absolute; top: 0; right: 0; width: 600px; height: 600px; background: radial-gradient(circle at center, rgba(16, 185, 129, 0.05) 0%, transparent 70%); pointer-events: none; }
              @media (max-width: 768px) { .premium-testimonials-title { font-size: 2.5rem; } .premium-testimonial-main { padding: 2rem; } .premium-testimonial-quote { font-size: 1.5rem; } }
            </style>
            <div class="premium-testimonials-bg-glow"></div>
            <div class="premium-testimonials-header">
              <div class="premium-testimonials-badge">Confianza Elite</div>
              <h2 class="premium-testimonials-title">Respaldado por líderes de la industria.</h2>
            </div>
            <div class="premium-testimonials-grid">
              <div class="premium-testimonial-main">
                <blockquote class="premium-testimonial-quote">
                  "Esta plataforma ha transformado por completo nuestra forma de colaborar. Los insights de IA nos han ahorrado meses de trabajo."
                </blockquote>
                <div class="premium-testimonial-author">
                  <img class="premium-testimonial-avatar" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="Alex Johnson">
                  <div class="premium-testimonial-author-info">
                    <h4>Alex Johnson</h4>
                    <p>CTO en TechCorp Global</p>
                  </div>
                </div>
              </div>
              <div class="premium-testimonials-sidebar">
                <div class="premium-testimonial-small">
                  <blockquote class="premium-testimonial-small-quote">
                    "La implementación fue impecable y los resultados superaron nuestras expectativas."
                  </blockquote>
                  <div class="premium-testimonial-small-author">
                    <img class="premium-testimonial-small-avatar" src="https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="Sarah Williams">
                    <div class="premium-testimonial-author-info">
                      <h4 style="font-size: 1rem;">Sarah Williams</h4>
                      <p style="font-size: 0.75rem;">Directora de Marketing</p>
                    </div>
                  </div>
                </div>
                <div class="premium-testimonial-small">
                  <blockquote class="premium-testimonial-small-quote">
                    "La mejor inversión que hemos hecho en tecnología este año. Impresionante."
                  </blockquote>
                  <div class="premium-testimonial-small-author">
                    <img class="premium-testimonial-small-avatar" src="https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="Michael Chen">
                    <div class="premium-testimonial-author-info">
                      <h4 style="font-size: 1rem;">Michael Chen</h4>
                      <p style="font-size: 0.75rem;">Product Manager</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        `
      }
    }
  });
};
