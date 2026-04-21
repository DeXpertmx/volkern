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
