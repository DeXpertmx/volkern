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
          <style>
.premium-rating-wrap { display: flex; align-items: center; gap: 12px; padding: 16px 0; }
.premium-stars { display: flex; gap: 2px; color: #f59e0b; }
.premium-rating-text { font-size: 14px; color: #475569; }
</style>
           <div class="premium-rating-wrap">
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
                starsWrap.innerHTML = Array.from({length: 5}).map((_: any, i: number) => `
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
        attributes: {
          'data-items': 'Beneficio principal 1, Soporte premium 24/7, Acceso ilimitado',
          'data-icon': 'check',
          'data-color': '#6366f1',
        },
        traits: [
          { 
            type: 'textarea', 
            label: 'Items (separados por coma)', 
            name: 'data-items',
          },
          { 
            type: 'select', 
            label: 'Icono', 
            name: 'data-icon',
            options: [
              { id: 'check', name: 'Check' },
              { id: 'arrow', name: 'Flecha' },
              { id: 'star', name: 'Estrella' },
              { id: 'features', name: 'Cuadrados' },
            ],
          },
          { type: 'color', label: 'Color Icono', name: 'data-color' },
        ],
        components: `
          <style>
.premium-icon-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.premium-list-item { display: flex; align-items: center; gap: 12px; font-size: 15px; color: #475569; }
.premium-list-icon { flex-shrink: 0; display: flex; }
.premium-list-text { }
</style>
           <ul class="premium-icon-list">
            <div data-v-items>
            </div>
          </ul>
        `,
        script: function(this: any) {
          const el = this;
          
          const getIcon = (name: string, color: string) => {
            const icons: Record<string, string> = {
              check: '<path d="M20 6L9 17l-5-5"/>',
              arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
              star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
              features: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
            };
            const path = icons[name] || icons.check;
            const strokeWidth = name === 'star' ? '2' : '3';
            return `<svg width="20" height="20" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${path}</svg>`;
          };

          const update = () => {
             const itemsWrap = el.querySelector('[data-v-items]');
             if (!itemsWrap) return;

             const itemsRaw = el.getAttribute('data-items') || '';
             const color = el.getAttribute('data-color') || '#6366f1';
             const iconName = el.getAttribute('data-icon') || 'check';
             
             const list = itemsRaw.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
             if (list.length === 0) {
                itemsWrap.innerHTML = '<li class="premium-list-item" style="opacity:0.5;">Añade items en la configuración (gear icon)</li>';
                return;
             }
             
             const iconSvg = getIcon(iconName, color);
             itemsWrap.innerHTML = list.map((i: string) => `
                <li class="premium-list-item">
                  <span class="premium-list-icon">${iconSvg}</span> 
                  <span class="premium-list-text">${i}</span>
                </li>
             `).join('');
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
          <style>
.premium-image-box { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.premium-box-img { width: 100%; height: 240px; object-fit: cover; display: block; }
.premium-box-content { padding: 24px; }
.premium-box-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 8px; }
.premium-box-desc { font-size: 14px; color: #475569; line-height: 1.6; margin: 0; }
</style>
           <div class="premium-image-box">
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
          <style>
.premium-divider-container { display: flex; justify-content: center; }
.premium-divider-line { border: 0; }
</style>
           <div class="premium-divider-container">
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
