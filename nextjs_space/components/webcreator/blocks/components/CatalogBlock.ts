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
    isComponent: (el) => el.tagName === 'SECTION' && el.classList.contains('volkern-catalog-section'),
    model: {
      defaults: {
        tagName: 'section',
        attributes: { 
          class: 'volkern-catalog-section',
          'data-category': 'all',
          'data-limit': '6',
          'data-s1-icon': 'bed',
          'data-s1-field': 're_habitaciones',
          'data-s1-label': 'Hab',
          'data-s2-icon': 'bath',
          'data-s2-field': 'banos',
          'data-s2-label': 'Baños',
          'data-s3-icon': 'area-c',
          'data-s3-field': 'superficie_construida',
          'data-s3-label': 'm² C.',
          'data-s4-icon': 'area-t',
          'data-s4-field': 'superficie_total',
          'data-s4-label': 'm² T.',
          'data-s5-icon': 'parking',
          'data-s5-field': 'estacionamientos',
          'data-s5-label': 'Est.',
          'data-s6-icon': 'tag',
          'data-s6-field': 'antiguedad',
          'data-s6-label': ''
        },
        components: `
          <style>
            .volkern-catalog-section { padding: 8rem 2rem; background: #ffffff; font-family: 'Inter', sans-serif; position: relative; }
            .volkern-catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 3rem; max-width: 1400px; margin: 0 auto; }
            
            .v-catalog-card { background: #ffffff; border: 1px solid rgba(0,0,0,0.06); border-radius: 2rem; overflow: hidden; transition: all 0.4s ease; display: flex; flex-direction: column; height: 100%; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
            .v-catalog-card:hover { transform: translateY(-8px); box-shadow: 0 30px 60px -12px rgba(0,0,0,0.08); }
            
            .v-img-container { width: 100%; height: 280px; position: relative; background: #f1f5f9; overflow: hidden; }
            .v-img { width: 100%; height: 100%; object-fit: cover; }
            
            .v-badges-top { position: absolute; top: 1.25rem; left: 1.25rem; display: flex; gap: 0.5rem; z-index: 10; }
            .v-badge-pill { padding: 0.4rem 1rem; border-radius: 2rem; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: white; display: flex; align-items: center; justify-content: center; }
            .v-badge-destacado { background: #fbbf24; color: #000; }
            .v-badge-operacion { background: #ef4444; }
            
            .v-content { padding: 2rem; flex-grow: 1; display: flex; flex-direction: column; }
            .v-title { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; color: #111827; letter-spacing: -0.02em; }
            .v-location { font-size: 0.9rem; color: #6b7280; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 1.5rem; font-weight: 500; }
            
            .v-price-box { font-size: 2.25rem; font-weight: 700; color: #1e40af; margin-bottom: 2rem; display: flex; align-items: baseline; gap: 0.5rem; }
            .v-currency { font-size: 1.25rem; opacity: 0.8; }
            
            .v-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem 2rem; margin-bottom: 2rem; padding-top: 1.5rem; border-top: 1px solid #f3f4f6; }
            .v-stat-item { display: flex; align-items: center; gap: 0.75rem; color: #4b5563; font-size: 0.95rem; font-weight: 500; }
            .v-stat-item svg { color: #9ca3af; flex-shrink: 0; }
            
            .v-catalog-btn { width: 100%; padding: 1.15rem; background-color: #f8fafc; color: #1e40af; border: 1px solid #e2e8f0; border-radius: 1rem; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.2s; text-align: center; margin-top: auto; }
            .v-catalog-btn:hover { background-color: #eff6ff; border-color: #1e40af; }
          </style>
          
          <div class="volkern-catalog-grid" data-gjs-selectable="false" data-gjs-hoverable="false">
            <div class="v-catalog-card" data-v-template="catalog" data-gjs-selectable="false" data-gjs-hoverable="false">
              <div class="v-img-container">
                <div class="v-badges-top">
                   <div class="v-badge-pill v-badge-destacado" data-v-field="tag-destacado">Destacado</div>
                   <div class="v-badge-pill v-badge-operacion" data-v-field="tag-tipo">Venta</div>
                </div>
                <img src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=1200" class="v-img" data-v-field="imagen">
              </div>
              <div class="v-content">
                <h3 class="v-title" data-v-field="nombre">Propiedad Premium</h3>
                <div class="v-location">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  <span data-v-field="ubicacion">Málaga, España</span>
                </div>
                
                <div class="v-price-box">
                   <span data-v-field="precio">450.000</span> <span class="v-currency" data-v-field="moneda">€</span>
                </div>

                <div class="v-stats-grid" data-v-field="container-stats">
                   <div class="v-stat-item"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M2 4v16M2 8h20M2 12h20M2 12v8M22 4v16M7 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke-width="2"/></svg> 4 Hab</div>
                   <div class="v-stat-item"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-0.5C4.3 2.4 3 3.5 3 4.8V5a2 2 0 0 1 2 2M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V11H3Z" stroke-width="2"/></svg> 2 Baños</div>
                   <div class="v-stat-item"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke-width="2"/></svg> 160 m² C.</div>
                   <div class="v-stat-item"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" stroke-width="2"/></svg> 1000 m² T.</div>
                   <div class="v-stat-item"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 17v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2m14-5v-1l-1-4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2l-1 4v1h14Z" stroke-width="2"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg> 2 Est.</div>
                   <div class="v-stat-item"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2v20m10-10H2" stroke-width="2"/><circle cx="12" cy="12" r="10" stroke-width="2"/></svg> Nueva</div>
                </div>
                
                <div class="v-catalog-btn">Ver Detalles</div>
              </div>
            </div>

            <!-- Previsualización de Editor para evitar canvas vacío -->
            <div class="v-catalog-card v-editor-preview" data-gjs-selectable="false" data-gjs-hoverable="false">
              <div class="v-img-container">
                <div class="v-badges-top">
                   <div class="v-badge-pill v-badge-destacado">Destacado</div>
                   <div class="v-badge-pill v-badge-operacion">Venta</div>
                </div>
                <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1200" class="v-img">
              </div>
              <div class="v-content">
                <h3 class="v-title">Villa de Playa</h3>
                <div class="v-location">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  <span>Málaga, España</span>
                </div>
                <div class="v-price-box">850.000 <span class="v-currency">€</span></div>
                <div class="v-stats-grid">
                   <div class="v-stat-item">4 Hab</div>
                   <div class="v-stat-item">3 Baños</div>
                   <div class="v-stat-item">450 m² C.</div>
                   <div class="v-stat-item">1200 m² T.</div>
                   <div class="v-stat-item">2 Est.</div>
                   <div class="v-stat-item">Nueva</div>
                </div>
                <div class="v-catalog-btn">Ver Detalles</div>
              </div>
            </div>
          </div>
        `,
        traits: [
          { type: 'text', label: 'Categoría', name: 'data-category' },
          { type: 'number', label: 'Límite', name: 'data-limit' },
          {
            type: 'select',
            label: 'Icono 1',
            name: 'data-s1-icon',
            options: [
              { value: 'bed', name: 'Habitaciones' },
              { value: 'bath', name: 'Baños' },
              { value: 'area-c', name: 'Metros (C)' },
              { value: 'area-t', name: 'Metros (T)' },
              { value: 'parking', name: 'Parking' },
              { value: 'tag', name: 'Etiqueta' },
              { value: 'star', name: 'Estrella' },
              { value: 'clock', name: 'Antigüedad' },
            ]
          },
          { type: 'text', label: 'Campo 1 (CRM)', name: 'data-s1-field' },
          { type: 'text', label: 'Etiqueta 1', name: 'data-s1-label' },
          {
            type: 'select',
            label: 'Icono 2',
            name: 'data-s2-icon',
            options: [
              { value: 'bed', name: 'Habitaciones' },
              { value: 'bath', name: 'Baños' },
              { value: 'area-c', name: 'Metros (C)' },
              { value: 'area-t', name: 'Metros (T)' },
              { value: 'parking', name: 'Parking' },
              { value: 'tag', name: 'Etiqueta' },
            ]
          },
          { type: 'text', label: 'Campo 2 (CRM)', name: 'data-s2-field' },
          { type: 'text', label: 'Etiqueta 2', name: 'data-s2-label' },
          {
            type: 'select',
            label: 'Icono 3',
            name: 'data-s3-icon',
            options: [
                { value: 'bed', name: 'Habitaciones' },{ value: 'bath', name: 'Baños' },{ value: 'area-c', name: 'Metros (C)' },{ value: 'area-t', name: 'Metros (T)' },{ value: 'parking', name: 'Parking' },{ value: 'tag', name: 'Etiqueta' },
            ]
          },
          { type: 'text', label: 'Campo 3 (CRM)', name: 'data-s3-field' },
          { type: 'text', label: 'Etiqueta 3', name: 'data-s3-label' },
          {
            type: 'select',
            label: 'Icono 4',
            name: 'data-s4-icon',
            options: [
                { value: 'bed', name: 'Habitaciones' },{ value: 'bath', name: 'Baños' },{ value: 'area-c', name: 'Metros (C)' },{ value: 'area-t', name: 'Metros (T)' },{ value: 'parking', name: 'Parking' },{ value: 'tag', name: 'Etiqueta' },
            ]
          },
          { type: 'text', label: 'Campo 4 (CRM)', name: 'data-s4-field' },
          { type: 'text', label: 'Etiqueta 4', name: 'data-s4-label' },
          {
            type: 'select',
            label: 'Icono 5',
            name: 'data-s5-icon',
            options: [
                { value: 'bed', name: 'Habitaciones' },{ value: 'bath', name: 'Baños' },{ value: 'area-c', name: 'Metros (C)' },{ value: 'area-t', name: 'Metros (T)' },{ value: 'parking', name: 'Parking' },{ value: 'tag', name: 'Etiqueta' },
            ]
          },
          { type: 'text', label: 'Campo 5 (CRM)', name: 'data-s5-field' },
          { type: 'text', label: 'Etiqueta 5', name: 'data-s5-label' },
          {
            type: 'select',
            label: 'Icono 6',
            name: 'data-s6-icon',
            options: [
                { value: 'bed', name: 'Habitaciones' },{ value: 'bath', name: 'Baños' },{ value: 'area-c', name: 'Metros (C)' },{ value: 'area-t', name: 'Metros (T)' },{ value: 'parking', name: 'Parking' },{ value: 'tag', name: 'Etiqueta' },
            ]
          },
          { type: 'text', label: 'Campo 6 (CRM)', name: 'data-s6-field' },
          { type: 'text', label: 'Etiqueta 6', name: 'data-s6-label' },
        ],
      },
      init() {
        this.on('change:attributes', this.handleAttrChange);
      },
      handleAttrChange() {
        this.view?.render();
      }
    },
    view: {
      onRender() {
        const el = this.el;
        const container = el.querySelector('.volkern-catalog-grid');
        const template = el.querySelector('[data-v-template="catalog"]');
        if (!container || !template) return;

        const isEditor = window.location.href.includes('/webcreator/editor/') || (window.parent && (window.parent as any).editor);

        const getIconSvgInternal = (name: string) => {
          const icons: Record<string, string> = {
            bed: '<path d="M2 4v16M2 8h20M2 12h20M2 12v8M22 4v16M7 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke-width="2"/>',
            bath: '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-0.5C4.3 2.4 3 3.5 3 4.8V5a2 2 0 0 1 2 2M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V11H3Z" stroke-width="2"/>',
            'area-c': '<path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke-width="2"/>',
            'area-t': '<rect width="18" height="18" x="3" y="3" rx="2" stroke-width="2"/>',
            parking: '<path d="M19 17v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2m14-5v-1l-1-4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2l-1 4v1h14Z" stroke-width="2"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/>',
            tag: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8-8a1 1 0 0 0 0-1.41L12 2ZM7 7h.01" stroke-width="2"/>',
            star: '<path d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2Z" stroke-width="2"/>',
            clock: '<circle cx="12" cy="12" r="10" stroke-width="2"/><path d="M12 6v6l4 2" stroke-width="2"/>',
          };
          return `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[name] || icons.star || ''}</svg>`;
        };

        const loadCatalog = async () => {
           const origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin;
           const category = el.getAttribute('data-category') || 'all';
           const limit = el.getAttribute('data-limit') || 6;
           let apiUrl = `${origin}/api/cms/catalogo/data?limit=${limit}`;
           if (category !== 'all') apiUrl += `&category=${encodeURIComponent(category)}`;
           try {
             const res = await fetch(apiUrl);
             const data = await res.json();
             render(data.items || []);
           } catch (err) { render([]); }
        };

        const render = (items: any[]) => {
          if (!isEditor) container.innerHTML = '';
          else {
             (template as any).style.display = 'none';
             container.querySelectorAll('.v-card-clone').forEach((c: any) => c.remove());
          }

          if (!items || items.length === 0) return;

          const slots = [
            { icon: el.getAttribute('data-s1-icon'), field: el.getAttribute('data-s1-field'), label: el.getAttribute('data-s1-label') },
            { icon: el.getAttribute('data-s2-icon'), field: el.getAttribute('data-s2-field'), label: el.getAttribute('data-s2-label') },
            { icon: el.getAttribute('data-s3-icon'), field: el.getAttribute('data-s3-field'), label: el.getAttribute('data-s3-label') },
            { icon: el.getAttribute('data-s4-icon'), field: el.getAttribute('data-s4-field'), label: el.getAttribute('data-s4-label') },
            { icon: el.getAttribute('data-s5-icon'), field: el.getAttribute('data-s5-field'), label: el.getAttribute('data-s5-label') },
            { icon: el.getAttribute('data-s6-icon'), field: el.getAttribute('data-s6-field'), label: el.getAttribute('data-s6-label') },
          ].filter(s => s.field);

          items.forEach(item => {
            const clone = template.cloneNode(true) as HTMLElement;
            clone.style.display = 'flex';
            clone.classList.add('v-card-clone');
            clone.removeAttribute('data-v-template');

            const fImg = clone.querySelector('[data-v-field="imagen"]') as HTMLImageElement;
            if (fImg) fImg.src = item.media?.imagenes?.[0] || fImg.src;

            const fNombre = clone.querySelector('[data-v-field="nombre"]');
            if (fNombre) (fNombre as HTMLElement).innerText = item.nombre;

            const fPrecio = clone.querySelector('[data-v-field="precio"]');
            if (fPrecio) (fPrecio as HTMLElement).innerText = new Intl.NumberFormat('es-MX').format(item.precioBase);

            const fMoneda = clone.querySelector('[data-v-field="moneda"]');
            if (fMoneda) (fMoneda as HTMLElement).innerText = item.moneda || 'MXN';

            const fDest = clone.querySelector('[data-v-field="tag-destacado"]');
            if (fDest) (fDest as HTMLElement).style.display = item.destacado ? 'flex' : 'none';

            const fTipo = clone.querySelector('[data-v-field="tag-tipo"]');
            if (fTipo) (fTipo as HTMLElement).innerText = item.tipo === 'producto' ? 'Venta' : 'Renta';

            const fLoc = clone.querySelector('[data-v-field="ubicacion"]');
            if (fLoc) {
               const city = item.customFieldValues?.['re_ubicacion'] || item.etiquetas?.[0] || 'México';
               (fLoc as HTMLElement).innerText = city;
            }

            const statsCont = clone.querySelector('[data-v-field="container-stats"]');
            if (statsCont) {
              statsCont.innerHTML = slots.map(slot => {
                const val = item.customFieldValues?.[slot.field || ''] || '-';
                if (val === '-') return '';
                return `<div class="v-stat-item">${getIconSvgInternal(slot.icon || 'star')} ${val} ${slot.label || ''}</div>`;
              }).join('');
            }

            const btn = clone.querySelector('.v-catalog-btn');
            if (btn) {
              btn.addEventListener('click', () => {
                 if (isEditor) return;
                 window.location.href = '?id=' + item.id;
              });
            }

            container.appendChild(clone);
          });
        };

        loadCatalog();
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
