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
          <style>
.premium-tabs-container { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
.premium-tabs-nav { display: flex; gap: 4px; margin-bottom: 24px; background: #f1f5f9; border-radius: 12px; padding: 4px; }
.premium-tab-btn { flex: 1; padding: 12px 20px; font-size: 14px; font-weight: 600; color: #475569; background: transparent; border: none; border-radius: 10px; cursor: pointer; transition: all 0.2s; }
.premium-tab-btn.active { background: white; color: #6366f1; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.premium-tabs-content { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; }
.premium-tab-pane { display: none; font-size: 15px; color: #475569; line-height: 1.6; }
.premium-tab-pane.active { display: block; }
</style>
           <div class="premium-tabs-container">
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
        script: function (this: any) {
          const el = this;
          const nav = el.querySelector('[data-v-nav]');
          const content = el.querySelector('[data-v-content]');

          const update = () => {
            const names = el.getAttribute('data-tab-names');
            if (names && nav && content) {
              const list = names.split(',').map((s) => s.trim());
              nav.innerHTML = list.map((n, i) => `
                    <button class="premium-tab-btn ${i === 0 ? 'active' : ''}" data-idx="${i}">${n}</button>
                `).join('');
              content.innerHTML = list.map((_, i) => `
                    <div class="premium-tab-pane ${i === 0 ? 'active' : ''}" data-idx="${i}">${el.getAttribute(`data-tab-${i + 1}`) || 'Contenido pendiente...'}</div>
                `).join('');
              bind();
            }
          };

          const bind = () => {
            el.querySelectorAll('.premium-tab-btn').forEach((btn: any) => {
              btn.addEventListener('click', () => {
                const idx = btn.dataset.idx;
                el.querySelectorAll('.premium-tab-btn').forEach((b: any) => b.classList.remove('active'));
                el.querySelectorAll('.premium-tab-pane').forEach((p: any) => p.classList.remove('active'));
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
          <style>
.premium-progress-wrap { max-width: 600px; margin: 0 auto; padding: 24px 0; }
.premium-progress-info { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
.premium-progress-bg { width: 100%; height: 8px; background: #e2e8f0; border-radius: 9999px; overflow: hidden; }
.premium-progress-fill { height: 100%; background: #6366f1; border-radius: 9999px; transition: width 1s ease; width: 0%; }
</style>
           <div class="premium-progress-wrap">
            <div class="premium-progress-info">
              <span data-v-label>Eficiencia</span>
              <span data-v-value>0%</span>
            </div>
            <div class="premium-progress-bg">
              <div class="premium-progress-fill" data-v-fill></div>
            </div>
          </div>
        `,
        script: function (this: any) {
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
          <style>
.premium-toc { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; }
.premium-toc-title { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 16px; }
.premium-toc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.premium-toc-item { font-size: 14px; color: #475569; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.premium-toc-item:hover { background: #eef2ff; color: #6366f1; }
</style>
           <div class="premium-toc">
            <h4 class="premium-toc-title" data-v-title>Contenido</h4>
            <ul class="premium-toc-list" data-v-list>
              <li class="premium-toc-item">Introducción</li>
              <li class="premium-toc-item">Beneficios Clave</li>
              <li class="premium-toc-item">Precios</li>
            </ul>
          </div>
        `,
        script: function (this: any) {
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
