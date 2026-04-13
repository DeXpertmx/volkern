import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createMediaPremiumBlocks = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. Gallery Block
  bm.add("gallery-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('catalog')}</div>
        <div class="gjs-block-label">Galería Masonry</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'gallery-premium' }
  });

  editor.DomComponents.addType('gallery-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Título Galería', name: 'data-title' },
          { type: 'textarea', label: 'URLs Imagenes (separadas por coma)', name: 'data-images' },
        ],
        components: `
          <section class="premium-gallery-section">
            <style>
              .premium-gallery-section { padding: 8rem 2rem; background: #ffffff; }
              .premium-gallery-header { text-align: center; margin-bottom: 4rem; }
              .premium-gallery-title { font-size: 3rem; font-weight: 900; letter-spacing: -0.05em; color: #3D3D3D; }
              .premium-gallery-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); 
                grid-auto-rows: 200px;
                gap: 1.5rem; 
                max-width: 1200px; 
                margin: 0 auto; 
              }
              .premium-gallery-item { position: relative; border-radius: 1.5rem; overflow: hidden; background: #f8fafc; transition: all 0.5s; }
              .premium-gallery-item:nth-child(2n) { grid-row: span 2; }
              .premium-gallery-item:nth-child(3n) { grid-row: span 1.5; }
              .premium-gallery-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s; }
              .premium-gallery-item:hover { transform: scale(0.98); }
              .premium-gallery-item:hover img { transform: scale(1.1); }
            </style>
            <div class="premium-gallery-header">
              <h2 class="premium-gallery-title" data-v-title>Nuestra Galería</h2>
            </div>
            <div class="premium-gallery-grid" data-v-grid>
              <div class="premium-gallery-item"><img src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80"></div>
              <div class="premium-gallery-item"><img src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80"></div>
              <div class="premium-gallery-item"><img src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80"></div>
              <div class="premium-gallery-item"><img src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80"></div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
             const title = el.getAttribute('data-title');
             const images = el.getAttribute('data-images');
             const tEl = el.querySelector('[data-v-title]');
             if (tEl && title) tEl.innerText = title;
             if (images) {
                const grid = el.querySelector('[data-v-grid]');
                if (grid) {
                    const urls = images.split(',').map((s) => s.trim());
                    grid.innerHTML = urls.map((u) => `
                      <div class="premium-gallery-item"><img src="${u}"></div>
                    `).join('');
                }
             }
          };
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });

  // 2. Multimedia Carousel
  bm.add("carousel-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('hero')}</div>
        <div class="gjs-block-label">Carrusel Multimedia</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'carousel-premium' }
  });

  editor.DomComponents.addType('carousel-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'textarea', label: 'Items (URLs separadas por coma)', name: 'data-items' },
        ],
        components: `
          <section class="premium-carousel-section">
            <style>
              .premium-carousel-section { position: relative; padding: 4rem 0; background: #ffffff; overflow: hidden; }
              .premium-carousel-track { display: flex; transition: transform 0.5s ease-out; }
              .premium-carousel-slide { min-width: 100%; height: 600px; position: relative; padding: 0 2rem; }
              .premium-carousel-img { width: 100%; height: 100%; object-fit: cover; border-radius: 3rem; }
              .premium-carousel-nav { position: absolute; bottom: 2rem; left: 50%; transform: translateX(-50%); display: flex; gap: 1rem; z-index: 10; }
              .premium-carousel-dot { width: 12px; height: 12px; border-radius: 50%; background: rgba(0,0,0,0.1); cursor: pointer; border: none; }
              .premium-carousel-dot.active { background: #3D3D3D; width: 30px; border-radius: 10px; }
            </style>
            <div class="premium-carousel-track" data-v-track>
              <div class="premium-carousel-slide"><img class="premium-carousel-img" src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80"></div>
              <div class="premium-carousel-slide"><img class="premium-carousel-img" src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80"></div>
            </div>
            <div class="premium-carousel-nav" data-v-nav></div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          let current = 0;
          const track = el.querySelector('[data-v-track]');
          const nav = el.querySelector('[data-v-nav]');
          
          const update = () => {
            const items = el.getAttribute('data-items');
            if (track && items) {
               const urls = items.split(',').map((s) => s.trim());
               track.innerHTML = urls.map(u => `
                 <div class="premium-carousel-slide"><img class="premium-carousel-img" src="${u}"></div>
               `).join('');
               renderNav(urls.length);
            } else if (track) {
               renderNav(2);
            }
          };

          const renderNav = (count: number) => {
            nav.innerHTML = Array.from({length: count}).map((_, i) => `
              <button class="premium-carousel-dot ${i===0?'active':''}" data-index="${i}"></button>
            `).join('');
            nav.querySelectorAll('button').forEach((b:any) => {
              b.addEventListener('click', () => goto(parseInt(b.dataset.index)));
            });
          }

          const goto = (index: number) => {
            current = index;
            track.style.transform = `translateX(-${current * 100}%)`;
            nav.querySelectorAll('button').forEach((b:any, i:number) => {
              b.classList.toggle('active', i === current);
            });
          };

          const observer = new MutationObserver(() => update());
          observer.observe(el, { attributes: true });
          update();

          // Auto-play simple
          setInterval(() => {
            const count = track.children.length;
            if (count > 0) goto((current + 1) % count);
          }, 5000);
        }
      }
    }
  });
};
