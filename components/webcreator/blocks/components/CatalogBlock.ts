import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createCatalogBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. Bloque de Galería de Catálogo
  bm.add("volkern-catalog-gallery", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('catalog')}
        </div>
        <div class="gjs-block-label">Galería Catálogo</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-catalog-gallery' }
  });

  // 2. Bloque de Campo Individual (Placeholder)
  bm.add("volkern-catalog-field", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('stats')}
        </div>
        <div class="gjs-block-label">Campo Catálogo</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { 
      type: 'volkern-catalog-field',
      content: '{{nombre}}',
      attributes: { 'data-volkern-field': 'nombre' }
    }
  });

  // ========== COMPONENTE: GALERÍA DE CATÁLOGO ==========
  editor.DomComponents.addType('volkern-catalog-gallery', {
    model: {
      defaults: {
        traits: [
          {
            type: 'select',
            label: 'Categoría',
            name: 'data-category',
            options: [
              { id: 'all', name: 'Todas' },
              { id: 'Propiedades', name: 'Propiedades' },
              { id: 'Servicios', name: 'Servicios' },
              { id: 'Productos', name: 'Productos' },
            ]
          },
          {
            type: 'number',
            label: 'Límite',
            name: 'data-limit',
            value: 6
          },
          {
            type: 'color',
            label: 'Color de Texto (General)',
            name: 'data-color-text',
            value: '#ffffff'
          },
          {
            type: 'color',
            label: 'Color de Acento',
            name: 'data-color-accent',
            value: '#6366f1'
          },
          // Botón
          {
             type: 'text',
             label: 'Botón: Texto',
             name: 'data-btn-text',
             value: 'Ver Detalles'
          },
          {
            type: 'color',
            label: 'Botón: Fuente',
            name: 'data-btn-color-text',
            value: '#ffffff'
          },
          {
            type: 'color',
            label: 'Botón: Fondo',
            name: 'data-btn-bg-color',
            value: '#6366f1'
          },
          // Ubicación
          {
            type: 'checkbox',
            label: 'Mostrar Ubicación',
            name: 'data-show-location',
            value: true
          },
          {
            type: 'text',
            label: 'Ubicación: Texto Manual',
            name: 'data-location-text',
            placeholder: 'Ej: Premium, New York...'
          },
          // Moneda
          {
            type: 'checkbox',
            label: 'Mostrar Moneda',
            name: 'data-show-currency',
            value: true
          },
          // Slots... (Simplified here for focus, but keeping them as requested)
          { type: 'select', label: 'Slot 1: Icono', name: 'data-s1-icon', options: [
            {id: 'bed', name: 'Cama'}, {id: 'bath', name: 'Baño'}, {id: 'area', name: 'Área'}, {id: 'package', name: 'Paquete'}, {id: 'star', name: 'Estrella'}, {id: 'tag', name: 'Etiqueta'}, {id: 'clock', name: 'Reloj'}, {id: 'parking', name: 'Estac.'}
          ]},
          { type: 'text', label: 'Slot 1: Campo', name: 'data-s1-field', placeholder: 'habitaciones' },
          { type: 'select', label: 'Slot 2: Icono', name: 'data-s2-icon', options: [
            {id: 'bed', name: 'Cama'}, {id: 'bath', name: 'Baño'}, {id: 'area', name: 'Área'}, {id: 'package', name: 'Paquete'}, {id: 'star', name: 'Estrella'}, {id: 'tag', name: 'Etiqueta'}, {id: 'clock', name: 'Reloj'}, {id: 'parking', name: 'Estac.'}
          ]},
          { type: 'text', label: 'Slot 2: Campo', name: 'data-s2-field', placeholder: 'baños' },
          { type: 'select', label: 'Slot 3: Icono', name: 'data-s3-icon', options: [
            {id: 'bed', name: 'Cama'}, {id: 'bath', name: 'Baño'}, {id: 'area', name: 'Área'}, {id: 'package', name: 'Paquete'}, {id: 'star', name: 'Estrella'}, {id: 'tag', name: 'Etiqueta'}, {id: 'clock', name: 'Reloj'}, {id: 'parking', name: 'Estac.'}
          ]},
          { type: 'text', label: 'Slot 3: Campo', name: 'data-s3-field', placeholder: 'metros' },
          { type: 'select', label: 'Slot 4: Icono', name: 'data-s4-icon', options: [
            {id: 'bed', name: 'Cama'}, {id: 'bath', name: 'Baño'}, {id: 'area', name: 'Área'}, {id: 'package', name: 'Paquete'}, {id: 'star', name: 'Estrella'}, {id: 'tag', name: 'Etiqueta'}, {id: 'clock', name: 'Reloj'}, {id: 'parking', name: 'Estac.'}
          ]},
          { type: 'text', label: 'Slot 4: Campo', name: 'data-s4-field', placeholder: 'estacionamiento' },
        ],
        components: `
          <section class="volkern-catalog-section">
            <style>
              .volkern-catalog-section { padding: 8rem 2rem; background: transparent; color: var(--v-text, white); font-family: 'Inter', sans-serif; position: relative; }
              .volkern-catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 3rem; max-width: 1300px; margin: 0 auto; }
              .v-card { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 2.5rem; overflow: hidden; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); display: flex; flex-direction: column; height: 100%; position: relative; }
              .v-card:hover { transform: translateY(-15px); border-color: var(--v-accent, #6366f1); box-shadow: 0 40px 100px -30px rgba(99, 102, 241, 0.2); }
              .v-img-container { width: 100%; height: 260px; position: relative; background: #111; overflow: hidden; }
              .v-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s ease; }
              .v-card:hover .v-img { transform: scale(1.1); }
              .v-badge { position: absolute; top: 1.5rem; left: 1.5rem; background: var(--v-accent, #6366f1); color: white; padding: 0.5rem 1.25rem; border-radius: 1rem; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; z-index: 2; box-shadow: 0 10px 20px rgba(99, 102, 241, 0.4); }
              .v-badge-alt { left: auto; right: 1.5rem; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
              .v-content { padding: 2.5rem; flex-grow: 1; display: flex; flex-direction: column; }
              .v-title { font-size: 1.75rem; font-weight: 900; margin-bottom: 0.75rem; letter-spacing: -0.04em; color: inherit; line-height: 1.2; }
              .v-location { font-size: 0.875rem; color: var(--v-text, white); opacity: 0.9; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
              .v-location svg { color: var(--v-accent, #6366f1); }
              .v-price { font-size: 2.25rem; font-weight: 900; color: inherit; margin-top: auto; display: flex; align-items: baseline; gap: 0.5rem; }
              .v-currency { font-size: 1rem; color: var(--v-text, white); opacity: 0.7; }
              .v-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 1.5rem 0; padding: 1.5rem 0; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); }
              .v-stat-item { display: flex; align-items: center; gap: 0.75rem; color: var(--v-text, white); opacity: 0.95; font-size: 0.9rem; font-weight: 600; }
              .v-stat-item svg { color: var(--v-accent, #6366f1); }
              /* Force button colors via variables with highest priority */
              .v-btn { width: 100%; padding: 1.25rem !important; background-color: var(--v-btn-bg, #6366f1) !important; color: var(--v-btn-text, #ffffff) !important; border: none !important; border-radius: 1.25rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; cursor: pointer; transition: all 0.3s; margin-top: 1.5rem; }
              .v-btn:hover { filter: brightness(1.2); transform: scale(1.02); }
              .v-loader { padding: 6rem; text-align: center; color: rgba(255,255,255,0.2); font-weight: 900; letter-spacing: 0.25em; text-transform: uppercase; border: 2px dashed rgba(255,255,255,0.05); border-radius: 3rem; }
            </style>
            <div class="volkern-catalog-grid">
              <div class="v-loader">SINCRONIZANDO CATÁLOGO...</div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const container = el.querySelector('.volkern-catalog-grid');
          if (!container) return;

          const getIconSvgInternal = (name: string) => {
            const icons: Record<string, string> = {
              bed: '<path d="M2 4v16M2 8h20M2 12h20M2 12v8M22 4v16M7 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke-width="2"/>',
              bath: '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-0.5C4.3 2.4 3 3.5 3 4.8V5a2 2 0 0 1 2 2M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V11H3Z" stroke-width="2"/>',
              area: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke-width="2"/>',
              package: '<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke-width="2"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12" stroke-width="2"/>',
              star: '<path d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2Z" stroke-width="2"/>',
              tag: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8-8a1 1 0 0 0 0-1.41L12 2ZM7 7h.01" stroke-width="2"/>',
              clock: '<circle cx="12" cy="12" r="10" stroke-width="2"/><path d="M12 6v6l4 2" stroke-width="2"/>',
              parking: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9" stroke-width="2"/>',
            };
            return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[name] || icons.star || ''}</svg>`;
          };

          const applyConfig = () => {
             const textColor = el.getAttribute('data-color-text') || '#ffffff';
             const accentColor = el.getAttribute('data-color-accent') || '#6366f1';
             const btnTextColor = el.getAttribute('data-btn-color-text') || '#ffffff';
             const btnBgColor = el.getAttribute('data-btn-bg-color') || accentColor;
             
             el.style.setProperty('--v-text', textColor);
             el.style.setProperty('--v-accent', accentColor);
             el.style.setProperty('--v-btn-text', btnTextColor);
             el.style.setProperty('--v-btn-bg', btnBgColor);
          };

          const render = (items: any[]) => {
            if (!container) return;
            if (!items || items.length === 0) {
              container.innerHTML = '<div class="v-loader">Sin resultados en esta categoría</div>';
              return;
            }

            const slots = [
              { icon: el.getAttribute('data-s1-icon'), field: el.getAttribute('data-s1-field') },
              { icon: el.getAttribute('data-s2-icon'), field: el.getAttribute('data-s2-field') },
              { icon: el.getAttribute('data-s3-icon'), field: el.getAttribute('data-s3-field') },
              { icon: el.getAttribute('data-s4-icon'), field: el.getAttribute('data-s4-field') },
            ].filter(s => s.field);

            const btnTextRaw = el.getAttribute('data-btn-text') || 'Ver Detalles';
            const showLocation = el.getAttribute('data-show-location') !== 'false';
            const manualLoc = el.getAttribute('data-location-text');
            const showCurrency = el.getAttribute('data-show-currency') !== 'false';

            container.innerHTML = items.map(item => {
              const mainImg = item.media?.imagenes?.[0] || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=1200';
              const price = new Intl.NumberFormat('es-ES').format(item.precioBase);
              const custom = item.customFieldValues || {};
              
              const statsHtml = slots.map(slot => {
                const val = custom[slot.field || ''] || '-';
                if (val === '-') return '';
                return `
                  <div class="v-stat-item" data-gjs-hoverable="false">
                    ${getIconSvgInternal(slot.icon || 'star')}
                    ${val}
                  </div>
                `;
              }).join('');

              const locationText = manualLoc || item.etiquetas?.[0] || 'Premium';
              const locationHtml = showLocation ? `
                <div class="v-location" data-gjs-hoverable="false">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-gjs-hoverable="false"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  ${locationText}
                </div>
              ` : '';

              const currencyHtml = showCurrency ? `<span class="v-currency" data-gjs-hoverable="false">${item.moneda}</span>` : '';

              return `
                <div class="v-card" data-volkern-item-id="${item.id}" data-gjs-hoverable="false" data-gjs-selectable="false" data-gjs-highlightable="false">
                  <div class="v-img-container" data-gjs-hoverable="false">
                    <img src="${mainImg}" class="v-img" alt="${item.nombre}" data-gjs-hoverable="false">
                    <div class="v-badge" data-gjs-hoverable="false">${item.destacado ? 'Destacado' : (item.categorias?.[0] || 'Nuevo')}</div>
                    <div class="v-badge v-badge-alt" data-gjs-hoverable="false">${item.tipo === 'producto' ? 'Venta' : 'Alquiler'}</div>
                  </div>
                  <div class="v-content" data-gjs-hoverable="false">
                    <h3 class="v-title" data-gjs-hoverable="false">${item.nombre}</h3>
                    ${locationHtml}
                    <div class="v-stats" data-gjs-hoverable="false">${statsHtml}</div>
                    <div class="v-price" data-gjs-hoverable="false">
                       ${price} ${currencyHtml}
                    </div>
                    <button class="v-btn" style="background-color: var(--v-btn-bg) !important; color: var(--v-btn-text) !important;" data-item-id="${item.id}" data-gjs-hoverable="false">${btnTextRaw}</button>
                  </div>
                </div>
              `;
            }).join('');

            container.querySelectorAll('.v-btn').forEach((btn: any) => {
              btn.addEventListener('click', (e: Event) => {
                e.preventDefault();
                const itemId = btn.getAttribute('data-item-id');
                const isEditor = window.location.href.includes('/webcreator/editor/') || (window.parent && (window.parent as any).editor);
                if (isEditor) { alert('Ver detalles: ' + itemId); return; }
                window.location.href = '?id=' + itemId;
              });
            });
          };

          const loadCatalog = async () => {
             const origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin;
             const category = el.getAttribute('data-category') || 'all';
             const limit = el.getAttribute('data-limit') || 6;
             let apiUrl = `${origin}/api/cms/catalogo/data?limit=${limit}`;
             if (category !== 'all') apiUrl += `&category=${encodeURIComponent(category)}`;
             try {
               const res = await fetch(apiUrl);
               if (!res.ok) throw new Error('API Error');
               const data = await res.json();
               render(data.items || []);
               applyConfig();
             } catch (err) {
               console.error('Catalog Error:', err);
               render([]);
             }
          };

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              const attr = mutation.attributeName;
              if (attr && (attr.startsWith('data-') || attr === 'data-category' || attr === 'data-limit')) {
                applyConfig();
                
                // Optimized Reactivity Trace
                const colorAttrs = ['data-color-text', 'data-color-accent', 'data-btn-bg-color', 'data-btn-color-text'];
                const textAttrs = ['data-btn-text'];

                if (colorAttrs.includes(attr!)) {
                  // Only CSS variables needed, already handled by applyConfig()
                  return;
                }

                if (textAttrs.includes(attr!)) {
                  // Update button text instantly without fetch
                  const newText = el.getAttribute('data-btn-text') || 'Ver Detalles';
                  el.querySelectorAll('.v-btn').forEach((btn: any) => {
                    btn.innerText = newText;
                  });
                  return;
                }

                // If it's structural (category, limit, show/hide location, slots), then reload
                loadCatalog();
              }
            });
          });
          observer.observe(el, { attributes: true });
          loadCatalog();
        }
      }
    }
  });

  // ========== COMPONENTE: CAMPO DE CATÁLOGO (INDIVIDUAL) ==========
  editor.DomComponents.addType('volkern-catalog-field', {
    model: {
      defaults: {
        traits: [
          {
            type: 'text',
            label: 'ID del Campo',
            name: 'data-volkern-field',
            placeholder: 'precio, nombre, habitaciones...'
          }
        ],
        tagName: 'span',
        attributes: { class: 'v-dynamic-field' },
      }
    }
  });
};
