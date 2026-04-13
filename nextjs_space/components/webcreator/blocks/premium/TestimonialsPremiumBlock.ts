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
        traits: [
          { type: 'textarea', label: 'Cita Principal', name: 'data-main-quote' },
          { type: 'text', label: 'Autor Principal', name: 'data-main-author' },
          { type: 'text', label: 'Cargo Principal', name: 'data-main-job' },
          { type: 'textarea', label: 'Cita 2', name: 'data-s1-quote' },
          { type: 'text', label: 'Autor 2', name: 'data-s1-author' },
        ],
        components: `
          <section class="premium-testimonials-section">
            <style>
              .premium-testimonials-section { padding: 10rem 2rem; background: #ffffff; color: #3D3D3D; font-family: 'Inter', sans-serif; position: relative; }
              .premium-testimonials-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; }
              .premium-testimonials-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 100px; color: #10b981; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-testimonials-title { font-size: 3.5rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; color: #3D3D3D; }
              .premium-testimonials-grid { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 1200px; margin: 0 auto; }
              @media (min-width: 1024px) { .premium-testimonials-grid { grid-template-columns: 2fr 1fr; } }
              .premium-testimonial-main { background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 3rem; padding: 4rem; box-shadow: 0 40px 100px -30px rgba(0,0,0,0.05); }
              .premium-testimonial-quote { font-size: 2rem; font-weight: 700; line-height: 1.3; color: #3D3D3D; margin-bottom: 3rem; }
              .premium-testimonial-author-info h4 { font-size: 1.25rem; font-weight: 800; margin: 0; color: #3D3D3D; }
              .premium-testimonial-author-info p { font-size: 0.875rem; color: #3D3D3D; opacity: 0.4; margin-top: 5px; font-weight: 600; text-transform: uppercase; }
              .premium-testimonials-sidebar { display: flex; flex-direction: column; gap: 2rem; }
              .premium-testimonial-small { background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 2.5rem; padding: 2.5rem; }
              .premium-testimonial-small-quote { font-size: 1.125rem; font-weight: 600; line-height: 1.6; color: #3D3D3D; opacity: 0.6; margin-bottom: 1.5rem; }
            </style>
            <div class="premium-testimonials-header">
              <div class="premium-testimonials-badge">Confianza Elite</div>
              <h2 class="premium-testimonials-title">Respaldado por líderes locales.</h2>
            </div>
            <div class="premium-testimonials-grid">
              <div class="premium-testimonial-main">
                <blockquote class="premium-testimonial-quote" data-v-quote>
                  "Esta solución ha superado todas nuestras expectativas. El ahorro es real y el soporte es excepcional."
                </blockquote>
                <div class="premium-testimonial-author-info">
                  <h4 data-v-author>Alex Johnson</h4>
                  <p data-v-job>Director de Operaciones</p>
                </div>
              </div>
              <div class="premium-testimonials-sidebar">
                <div class="premium-testimonial-small">
                  <blockquote class="premium-testimonial-small-quote" data-v-s1-q>
                    "La implementación fue rápida y los resultados se vieron desde el primer mes."
                  </blockquote>
                  <div class="premium-testimonial-author-info">
                    <h4 style="font-size: 1rem;" data-v-s1-a>Sarah Williams</h4>
                  </div>
                </div>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
            const get = (a) => el.getAttribute(a);
            const set = (sel, val) => {
              if (!val) return;
              const target = el.querySelector(sel);
              if (target) target.innerText = val;
            };
            set('[data-v-quote]', get('data-main-quote'));
            set('[data-v-author]', get('data-main-author'));
            set('[data-v-job]', get('data-main-job'));
            set('[data-v-s1-q]', get('data-s1-quote'));
            set('[data-v-s1-a]', get('data-s1-author'));
          };
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
};
