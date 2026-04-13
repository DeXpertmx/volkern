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
          <section class="premium-testimonial-carousel">
            <style>
              .premium-testimonial-carousel { padding: 8rem 2rem; background: #f8fafc; overflow: hidden; position: relative; font-family: 'Inter', sans-serif; }
              .premium-testimonial-track { display: flex; transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1); }
              .premium-testimonial-slide { min-width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 2rem; }
              .premium-testimonial-quote { font-size: 2.5rem; font-weight: 800; line-height: 1.2; color: #3D3D3D; margin-bottom: 3rem; max-width: 800px; }
              .premium-testimonial-author { font-size: 1.125rem; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.1em; }
              .premium-testimonial-nav { position: absolute; bottom: 3rem; left: 50%; transform: translateX(-50%); display: flex; gap: 0.75rem; }
              .premium-testimonial-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(0,0,0,0.1); border: none; cursor: pointer; }
              .premium-testimonial-dot.active { background: #6366f1; transform: scale(1.5); }
              @media (max-width: 768px) { .premium-testimonial-quote { font-size: 1.5rem; } }
            </style>
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
                const quotes = quotesStr.split('|').map((s) => s.trim());
                const authors = authorsStr.split('|').map((s) => s.trim());
                track.innerHTML = quotes.map((q, i) => `
                  <div class="premium-testimonial-slide">
                    <blockquote class="premium-testimonial-quote">"${q}"</blockquote>
                    <p class="premium-testimonial-author">${authors[i] || 'Anónimo'}</p>
                  </div>
                `).join('');
                renderNav(quotes.length);
             }
          };

          const renderNav = (count: number) => {
            nav.innerHTML = Array.from({length: count}).map((_, i) => `
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
