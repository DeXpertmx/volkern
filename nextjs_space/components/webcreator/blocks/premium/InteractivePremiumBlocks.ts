import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createInteractivePremiumBlocks = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. Tabs Block
  bm.add("tabs-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('faq')}</div>
        <div class="gjs-block-label">Pestañas</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'tabs-premium' }
  });

  editor.DomComponents.addType('tabs-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Títulos (coma)', name: 'data-tab-names' },
          { type: 'textarea', label: 'Contenido 1', name: 'data-tab-1' },
          { type: 'textarea', label: 'Contenido 2', name: 'data-tab-2' },
          { type: 'textarea', label: 'Contenido 3', name: 'data-tab-3' },
        ],
        components: `
          <div class="premium-tabs-container">
            <style>
              .premium-tabs-container { padding: 4rem 2rem; max-width: 900px; margin: 0 auto; font-family: 'Inter', sans-serif; }
              .premium-tabs-nav { display: flex; gap: 1rem; border-bottom: 1px solid rgba(61,61,61,0.1); margin-bottom: 2rem; overflow-x: auto; padding-bottom: 5px; }
              .premium-tab-btn { padding: 1rem 2rem; border: none; background: transparent; font-weight: 800; color: #3D3D3D; opacity: 0.4; cursor: pointer; transition: all 0.3s; white-space: nowrap; border-bottom: 3px solid transparent; }
              .premium-tab-btn.active { opacity: 1; border-bottom-color: #6366f1; }
              .premium-tab-pane { display: none; padding: 2rem; background: #f8fafc; border-radius: 2rem; animation: fadeIn 0.5s; font-size: 1.125rem; line-height: 1.6; color: #3D3D3D; }
              .premium-tab-pane.active { display: block; }
              @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            </style>
            <div class="premium-tabs-nav" data-v-nav>
              <button class="premium-tab-btn active" data-idx="0">Características</button>
              <button class="premium-tab-btn" data-idx="1">Uso</button>
              <button class="premium-tab-btn" data-idx="2">Soporte</button>
            </div>
            <div class="premium-tabs-content" data-v-content>
              <div class="premium-tab-pane active" data-idx="0">Selecciona una pestaña para ver el contenido.</div>
              <div class="premium-tab-pane" data-idx="1"></div>
              <div class="premium-tab-pane" data-idx="2"></div>
            </div>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const nav = el.querySelector('[data-v-nav]');
          const content = el.querySelector('[data-v-content]');

          const update = () => {
             const names = el.getAttribute('data-tab-names');
             if (names && nav && content) {
                const list = names.split(',').map((s) => s.trim());
                nav.innerHTML = list.map((n, i) => `
                    <button class="premium-tab-btn ${i===0?'active':''}" data-idx="${i}">${n}</button>
                `).join('');
                content.innerHTML = list.map((_, i) => `
                    <div class="premium-tab-pane ${i===0?'active':''}" data-idx="${i}">${el.getAttribute(`data-tab-${i+1}`) || 'Contenido pendiente...'}</div>
                `).join('');
                bind();
             }
          };

          const bind = () => {
             el.querySelectorAll('.premium-tab-btn').forEach((btn:any) => {
                btn.addEventListener('click', () => {
                    const idx = btn.dataset.idx;
                    el.querySelectorAll('.premium-tab-btn').forEach((b:any) => b.classList.remove('active'));
                    el.querySelectorAll('.premium-tab-pane').forEach((p:any) => p.classList.remove('active'));
                    btn.classList.add('active');
                    el.querySelector(`.premium-tab-pane[data-idx="${idx}"]`).classList.add('active');
                });
             });
          };

          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
          bind();
        }
      }
    }
  });

  // 2. Progress Bar Block
  bm.add("progress-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('stats')}</div>
        <div class="gjs-block-label">Barra Progreso</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'progress-premium' }
  });

  editor.DomComponents.addType('progress-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Etiqueta', name: 'data-label' },
          { type: 'number', label: 'Porcentaje', name: 'data-value', min: 0, max: 100 },
          { type: 'color', label: 'Color', name: 'data-color' },
        ],
        components: `
          <div class="premium-progress-wrap">
            <style>
              .premium-progress-wrap { padding: 1.5rem; max-width: 600px; margin: 0 auto; }
              .premium-progress-info { display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-weight: 800; font-family: 'Inter', sans-serif; color: #3D3D3D; }
              .premium-progress-bg { height: 12px; background: rgba(61,61,61,0.05); border-radius: 100px; overflow: hidden; }
              .premium-progress-fill { height: 100%; background: #6366f1; border-radius: 100px; transition: width 1.5s cubic-bezier(0.16, 1, 0.3, 1); width: 0; }
            </style>
            <div class="premium-progress-info">
              <span data-v-label>Eficiencia</span>
              <span data-v-value>0%</span>
            </div>
            <div class="premium-progress-bg">
              <div class="premium-progress-fill" data-v-fill></div>
            </div>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
             const label = el.getAttribute('data-label');
             const value = el.getAttribute('data-value') || 75;
             const color = el.getAttribute('data-color');
             
             const labelEl = el.querySelector('[data-v-label]');
             if (labelEl && label) labelEl.innerText = label;
             
             const vEl = el.querySelector('[data-v-value]');
             if (vEl) vEl.innerText = value + '%';
             
             const fill = el.querySelector('[data-v-fill]');
             if (fill) {
                fill.style.width = value + '%';
                if (color) fill.style.background = color;
             }
          };
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          setTimeout(update, 500); // Animación inicial
        }
      }
    }
  });

  // 3. Table of Contents Block
  bm.add("toc-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('blog')}</div>
        <div class="gjs-block-label">Índice</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'toc-premium' }
  });

  editor.DomComponents.addType('toc-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Título Índice', name: 'data-title', value: 'Tabla de Contenidos' },
          { type: 'textarea', label: 'Items (coma)', name: 'data-items' },
        ],
        components: `
          <div class="premium-toc">
            <style>
              .premium-toc { padding: 2.5rem; background: #f8fafc; border: 1px solid rgba(61,61,61,0.1); border-radius: 2rem; max-width: 400px; font-family: 'Inter', sans-serif; }
              .premium-toc-title { font-size: 1.25rem; font-weight: 900; margin-bottom: 1.5rem; color: #3D3D3D; letter-spacing: -0.02em; }
              .premium-toc-list { list-style: none; padding: 0; margin: 0; }
              .premium-toc-item { margin-bottom: 0.75rem; padding-left: 1.5rem; position: relative; font-weight: 600; color: #3D3D3D; opacity: 0.6; cursor: pointer; transition: all 0.3s; }
              .premium-toc-item::before { content: ''; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; background: #6366f1; border-radius: 50%; opacity: 0; transition: all 0.3s; }
              .premium-toc-item:hover { opacity: 1; padding-left: 2rem; }
              .premium-toc-item:hover::before { opacity: 1; }
            </style>
            <h4 class="premium-toc-title" data-v-title>Contenido</h4>
            <ul class="premium-toc-list" data-v-list>
              <li class="premium-toc-item">Introducción</li>
              <li class="premium-toc-item">Beneficios Clave</li>
              <li class="premium-toc-item">Precios</li>
            </ul>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
             const title = el.getAttribute('data-title');
             const items = el.getAttribute('data-items');
             const tEl = el.querySelector('[data-v-title]');
             if (tEl && title) tEl.innerText = title;
             if (items) {
                const listEl = el.querySelector('[data-v-list]');
                if (listEl) {
                    const list = items.split(',').map((s) => s.trim());
                    listEl.innerHTML = list.map(i => `
                        <li class="premium-toc-item">${i}</li>
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
};
