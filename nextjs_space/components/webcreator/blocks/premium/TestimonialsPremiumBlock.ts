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
          <style>
.premium-testimonials-section { padding: 80px 24px; background: white; }
.premium-testimonials-header { text-align: center; max-width: 700px; margin: 0 auto 48px; }
.premium-testimonials-badge { display: inline-block; background: #eef2ff; color: #6366f1; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 8px 16px; border-radius: 9999px; margin-bottom: 16px; letter-spacing: 0.5px; }
.premium-testimonials-title { font-size: 36px; font-weight: 800; color: #1e293b; margin: 0; }
.premium-testimonials-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; max-width: 1200px; margin: 0 auto; }
.premium-testimonial-main { background: #f8fafc; border-radius: 16px; padding: 40px; }
.premium-testimonial-quote { font-size: 20px; color: #1e293b; font-weight: 600; line-height: 1.6; margin: 0 0 24px; font-style: italic; }
.premium-testimonial-author-info h4 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; }
.premium-testimonial-author-info p { font-size: 14px; color: #475569; margin: 4px 0 0; }
.premium-testimonials-sidebar { display: flex; flex-direction: column; gap: 24px; }
.premium-testimonial-small { background: #f8fafc; border-radius: 16px; padding: 24px; }
.premium-testimonial-small-quote { font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 16px; font-style: italic; }
</style>
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
