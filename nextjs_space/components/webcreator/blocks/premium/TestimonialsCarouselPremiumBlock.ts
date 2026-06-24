import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createTestimonialsCarouselBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("testimonials-carousel-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('testimonials')}</div>
        <div class="gjs-block-label">Carrusel Testimonios</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'testimonials-carousel-premium' }
  });

  editor.DomComponents.addType('testimonials-carousel-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'textarea', label: 'Citas (separadas por |)', name: 'data-quotes' },
          { type: 'textarea', label: 'Autores (separados por |)', name: 'data-authors' },
        ],
        components: `
          <style>
.premium-testimonial-carousel { padding: 80px 24px; background: #f8fafc; max-width: 800px; margin: 0 auto; text-align: center; overflow: hidden; }
.premium-testimonial-track { display: flex; transition: transform 0.5s ease; }
.premium-testimonial-slide { min-width: 100%; padding: 40px; }
.premium-testimonial-quote { font-size: 22px; color: #1e293b; font-weight: 600; line-height: 1.6; margin: 0 0 16px; font-style: italic; }
.premium-testimonial-author { font-size: 16px; color: #6366f1; font-weight: 600; margin: 0; }
.premium-testimonial-nav { display: flex; gap: 8px; justify-content: center; margin-top: 24px; }
.premium-testimonial-dot { width: 10px; height: 10px; border-radius: 50%; background: #e2e8f0; border: none; cursor: pointer; padding: 0; transition: all 0.2s; }
.premium-testimonial-dot.active { background: #6366f1; width: 24px; border-radius: 5px; }
</style>
           <section class="premium-testimonial-carousel">
            <div class="premium-testimonial-track" data-v-track>
              <div class="premium-testimonial-slide">
                <blockquote class="premium-testimonial-quote">"La mejor inversión tecnológica que hemos hecho este año. Absolutamente impecable."</blockquote>
                <p class="premium-testimonial-author">Alex Rivera — CEO de TechCorp</p>
              </div>
            </div>
            <div class="premium-testimonial-nav" data-v-nav></div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          let current = 0;
          const track = el.querySelector('[data-v-track]');
          const nav = el.querySelector('[data-v-nav]');

          const update = () => {
             const quotesStr = el.getAttribute('data-quotes');
             const authorsStr = el.getAttribute('data-authors');
             if (track && quotesStr && authorsStr) {
                const quotes = quotesStr.split('|').map((s: string) => s.trim());
                const authors = authorsStr.split('|').map((s: string) => s.trim());
                track.innerHTML = quotes.map((q: string, i: number) => `
                  <div class="premium-testimonial-slide">
                    <blockquote class="premium-testimonial-quote">"${q}"</blockquote>
                    <p class="premium-testimonial-author">${authors[i] || 'Anónimo'}</p>
                  </div>
                `).join('');
                renderNav(quotes.length);
             }
          };

          const renderNav = (count: number) => {
                nav.innerHTML = Array.from({length: count}).map((_: any, i: number) => `
              <button class="premium-testimonial-dot ${i===0?'active':''}" data-idx="${i}"></button>
            `).join('');
            nav.querySelectorAll('button').forEach((b:any) => {
              b.addEventListener('click', () => goto(parseInt(b.dataset.idx)));
            });
          };

          const goto = (idx: number) => {
             current = idx;
             track.style.transform = `translateX(-${current * 100}%)`;
             nav.querySelectorAll('button').forEach((b:any, i:number) => {
               b.classList.toggle('active', i === current);
             });
          };

          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();

          setInterval(() => {
            const count = track.children.length;
            if (count > 1) goto((current + 1) % count);
          }, 6000);
        }
      }
    }
  });
};
