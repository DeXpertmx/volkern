import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createTestimonialsBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-testimonials", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('testimonials')}
        </div>
        <div class="gjs-block-label">Testimonios</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-testimonials' }
  });

  editor.DomComponents.addType('volkern-testimonials', {
    model: {
      defaults: {
        components: `
          <section class="volkern-testi-section">
            <style>
              .volkern-testi-section { padding: 8rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; }
              .volkern-testi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2.5rem; max-width: 1200px; margin: 0 auto; }
              .volkern-testi-card { background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 2.5rem; padding: 3rem; position: relative; }
              .volkern-testi-quote { font-size: 1.25rem; line-height: 1.8; color: rgba(255,255,255,0.7); margin-bottom: 2rem; font-style: italic; }
              .volkern-testi-author { display: flex; align-items: center; gap: 1rem; }
              .volkern-testi-avatar { width: 48px; height: 48px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.25rem; }
              .volkern-testi-name { font-weight: 900; color: white; }
              .volkern-testi-role { font-size: 0.875rem; color: rgba(255,255,255,0.3); }
              .volkern-testi-stars { color: #818cf8; margin-bottom: 1rem; display: flex; gap: 0.25rem; }
            </style>
            <div class="volkern-testi-grid">
              <div style="padding: 4rem; text-align: center; color: rgba(255,255,255,0.2); font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase;">Cargando impacto...</div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const container = el.querySelector('.volkern-testi-grid');
          if (!container) return;

          const load = async () => {
            try {
              let apiUrl = '/api/volkern?path=testimonios&activo=true';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }
              const res = await fetch(apiUrl);
              const data = await res.json();
              const items = Array.isArray(data) ? data : (data.testimonios || []);
              render(items.length ? items : null);
            } catch (e) { render(null); }
          };

          const render = (items: any) => {
            const list = items || [
              { nombre: 'Alex Rivera', empresa: 'Nexus Tech', contenido: 'La transformación digital que logramos con Volkern no tiene precedentes. Nuestra eficiencia aumentó un 300%.' },
              { nombre: 'Elena Voss', empresa: 'Vortex Studio', contenido: 'El sistema de citas automatizado nos devolvió 20 horas a la semana. Es simplemente brillante.' }
            ];
            container.innerHTML = list.map((t: any) => `
              <div class="volkern-testi-card">
                <div class="volkern-testi-stars">
                  ${Array(5).fill('<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>').join('')}
                </div>
                <p class="volkern-testi-quote">"${t.contenido}"</p>
                <div class="volkern-testi-author">
                  <div class="volkern-testi-avatar">${t.nombre.charAt(0)}</div>
                  <div>
                    <div class="volkern-testi-name">${t.nombre}</div>
                    <div class="volkern-testi-role">${t.empresa}</div>
                  </div>
                </div>
              </div>
            `).join('');
          };
          load();
        }
      }
    }
  });
};