import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createElementPremiumBlocks = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. Star Rating Block
  bm.add("star-rating-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('stats')}</div>
        <div class="gjs-block-label">Rating Estrellas</div>
      </div>
    `,
    category: "Elementos Premium",
    content: { type: 'star-rating-premium' }
  });

  editor.DomComponents.addType('star-rating-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'number', label: 'Estrellas (max 5)', name: 'data-rating', min: 0, max: 5, value: 5 },
          { type: 'text', label: 'Mensaje', name: 'data-text', value: '4.9/5 basado en 2k reseñas' },
        ],
        components: `
          <div class="premium-rating-wrap">
            <style>
              .premium-rating-wrap { padding: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; font-family: 'Inter', sans-serif; }
              .premium-stars { display: flex; gap: 0.25rem; color: #fbbf24; }
              .premium-rating-text { font-size: 0.875rem; font-weight: 700; color: #3D3D3D; opacity: 0.6; }
            </style>
            <div class="premium-stars" data-v-stars>
            </div>
            <div class="premium-rating-text" data-v-text>4.9/5 basado en 2k reseñas</div>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const starsWrap = el.querySelector('[data-v-stars]');
          const textEl = el.querySelector('[data-v-text]');

          const update = () => {
             const rating = parseInt(el.getAttribute('data-rating') || '5');
             const text = el.getAttribute('data-text');
             
             if (starsWrap) {
                starsWrap.innerHTML = Array.from({length: 5}).map((_, i) => `
                  <svg width="20" height="20" fill="${i < rating ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                `).join('');
             }
             
             if (textEl && text) textEl.innerText = text;
          };
          
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });

  // 2. Icon List Block
  bm.add("icon-list-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('features')}</div>
        <div class="gjs-block-label">Lista de Iconos</div>
      </div>
    `,
    category: "Elementos Premium",
    content: { type: 'icon-list-premium' }
  });

  editor.DomComponents.addType('icon-list-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'textarea', label: 'Items (coma)', name: 'data-items' },
          { type: 'color', label: 'Color Icono', name: 'data-color', value: '#10b981' },
        ],
        components: `
          <ul class="premium-icon-list">
            <style>
              .premium-icon-list { list-style: none; padding: 2rem; margin: 0; display: flex; flex-direction: column; gap: 1rem; font-family: 'Inter', sans-serif; }
              .premium-list-item { display: flex; align-items: center; gap: 1rem; font-weight: 600; color: #3D3D3D; }
              .premium-list-icon { flex-shrink: 0; display: flex; align-items: center; }
            </style>
            <div data-v-items>
               <li class="premium-list-item"><span class="premium-list-icon"><svg width="20" height="20" fill="none" stroke="#10b981" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg></span> Punto de control 1</li>
            </div>
          </ul>
        `,
        script: function(this: any) {
          const el = this;
          const itemsWrap = el.querySelector('[data-v-items]');

          const update = () => {
             const items = el.getAttribute('data-items');
             const color = el.getAttribute('data-color') || '#10b981';
             
             if (items && itemsWrap) {
                const list = items.split(',').map((s) => s.trim());
                itemsWrap.innerHTML = list.map(i => `
                  <li class="premium-list-item">
                    <span class="premium-list-icon">
                      <svg width="20" height="20" fill="none" stroke="${color}" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
                    </span> 
                    ${i}
                  </li>
                `).join('');
             }
          };
          
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });

  // 3. Image Box Block
  bm.add("image-box-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('catalog')}</div>
        <div class="gjs-block-label">Cuadro Imagen + Texto</div>
      </div>
    `,
    category: "Elementos Premium",
    content: { type: 'image-box-premium' }
  });

  editor.DomComponents.addType('image-box-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Imagen URL', name: 'data-img' },
          { type: 'text', label: 'Título', name: 'data-title' },
          { type: 'textarea', label: 'Descripción', name: 'data-desc' },
        ],
        components: `
          <div class="premium-image-box">
            <style>
              .premium-image-box { border-radius: 2.5rem; overflow: hidden; background: #ffffff; border: 1px solid rgba(61,61,61,0.1); transition: all 0.5s; font-family: 'Inter', sans-serif; }
              .premium-image-box:hover { transform: translateY(-10px); box-shadow: 0 40px 80px -20px rgba(0,0,0,0.1); }
              .premium-box-img { width: 100%; height: 300px; object-fit: cover; }
              .premium-box-content { padding: 2.5rem; }
              .premium-box-title { font-size: 1.5rem; font-weight: 800; margin-bottom: 1rem; color: #3D3D3D; }
              .premium-box-desc { font-size: 1rem; opacity: 0.6; line-height: 1.6; color: #3D3D3D; }
            </style>
            <img class="premium-box-img" data-v-img src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80">
            <div class="premium-box-content">
              <h3 class="premium-box-title" data-v-title>Nombre del Proyecto</h3>
              <p class="premium-box-desc" data-v-desc>Breve descripción del impacto y los resultados obtenidos en este caso de éxito.</p>
            </div>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
             const img = el.getAttribute('data-img');
             const title = el.getAttribute('data-title');
             const desc = el.getAttribute('data-desc');
             
             const imgEl = el.querySelector('[data-v-img]');
             if (imgEl && img) imgEl.src = img;
             
             const tEl = el.querySelector('[data-v-title]');
             if (tEl && title) tEl.innerText = title;
             
             const dEl = el.querySelector('[data-v-desc]');
             if (dEl && desc) dEl.innerText = desc;
          };
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
  
  // 4. Divider Block
  bm.add("divider-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('divider')}</div>
        <div class="gjs-block-label">Separador</div>
      </div>
    `,
    category: "Elementos Premium",
    content: { type: 'divider-premium' }
  });

  editor.DomComponents.addType('divider-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'color', label: 'Color', name: 'data-color', value: '#e2e8f0' },
          { type: 'number', label: 'Grosor (px)', name: 'data-height', min: 1, max: 20, value: 1 },
          { type: 'number', label: 'Ancho (%)', name: 'data-width', min: 1, max: 100, value: 100 },
          { type: 'select', label: 'Estilo', name: 'data-style', options: [
            { id: 'solid', name: 'Sólido' },
            { id: 'dashed', name: 'Guiones' },
            { id: 'dotted', name: 'Puntos' },
          ], value: 'solid' },
          { type: 'number', label: 'Margen V (px)', name: 'data-margin', min: 0, max: 100, value: 20 },
        ],
        components: `
          <div class="premium-divider-container">
            <style>
              .premium-divider-container { display: flex; justify-content: center; width: 100%; }
              .premium-divider-line { transition: all 0.3s; }
            </style>
            <div class="premium-divider-line" data-v-line></div>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const line = el.querySelector('[data-v-line]');

          const update = () => {
             const color = el.getAttribute('data-color') || '#e2e8f0';
             const height = el.getAttribute('data-height') || '1';
             const width = el.getAttribute('data-width') || '100';
             const style = el.getAttribute('data-style') || 'solid';
             const margin = el.getAttribute('data-margin') || '20';
             
             if (line) {
                line.style.borderTop = `${height}px ${style} ${color}`;
                line.style.width = `${width}%`;
                line.style.marginTop = `${margin}px`;
                line.style.marginBottom = `${margin}px`;
             }
          };
          
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
};
