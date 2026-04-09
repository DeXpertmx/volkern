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
              .volkern-testi-section { padding: 8rem 2rem; background: transparent; font-family: 'Inter', sans-serif; }
              .volkern-testi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2.5rem; max-width: 1200px; margin: 0 auto; }
              
              .v-testi-card { background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 2.5rem; padding: 3rem; position: relative; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.03); }
              .v-testi-stars { color: #6366f1; margin-bottom: 1rem; display: flex; gap: 0.25rem; }
              .v-testi-quote { font-size: 1.25rem; line-height: 1.8; color: #3D3D3D; opacity: 0.8; margin-bottom: 2rem; font-style: italic; }
              .v-testi-author { display: flex; align-items: center; gap: 1rem; margin-top: auto; }
              .v-testi-avatar { width: 48px; height: 48px; border-radius: 50%; background: #6366f1; color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.25rem; }
              .v-testi-name { font-weight: 900; color: #3D3D3D; }
              .v-testi-role { font-size: 0.875rem; color: #3D3D3D; opacity: 0.4; }
            </style>
            
            <div class="volkern-testi-grid">
              <div class="v-testi-card" data-v-template="testimonial">
                <div class="v-testi-stars">
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                </div>
                <p class="v-testi-quote" data-v-field="contenido">"La transformación digital que logramos con Volkern no tiene precedentes. Nuestra eficiencia aumentó notablemente."</p>
                <div class="v-testi-author">
                  <div class="v-testi-avatar" data-v-field="inicial">A</div>
                  <div>
                    <div class="v-testi-name" data-v-field="nombre">Alex Rivera</div>
                    <div class="v-testi-role" data-v-field="empresa">Nexus Tech</div>
                  </div>
                </div>
              </div>

              <div class="v-testi-card v-editor-preview">
                <div class="v-testi-stars"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>
                <p class="v-testi-quote">"El sistema de citas automatizado nos devolvió 20 horas a la semana. Es simplemente brillante."</p>
                <div class="v-testi-author">
                  <div class="v-testi-avatar">E</div>
                  <div><div class="v-testi-name">Elena Voss</div><div class="v-testi-role">Vortex Studio</div></div>
                </div>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const container = el.querySelector('.volkern-testi-grid');
          const template = el.querySelector('[data-v-template="testimonial"]');
          if (!container || !template) return;

          const isEditor = window.location.href.includes('/webcreator/editor/') || (window.parent && (window.parent as any).editor);

          const load = async () => {
            try {
              let apiUrl = '/api/volkern?path=testimonios&activo=true';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }
              const res = await fetch(apiUrl);
              const data = await res.json();
              const items = Array.isArray(data) ? data : (data.testimonios || []);
              if (items.length) render(items);
            } catch (e) { if (!isEditor) render(getDummies()); }
          };

          const getDummies = () => [
            { nombre: 'Alex Rivera', empresa: 'Nexus Tech', contenido: 'La transformación digital que logramos con Volkern no tiene precedentes.' }
          ];

          const render = (list: any[]) => {
            if (isEditor) {
               el.querySelectorAll('.v-editor-preview').forEach((p: any) => p.style.display = 'none');
            } else {
               container.innerHTML = '';
            }

            list.forEach((t: any) => {
              const clone = template.cloneNode(true) as HTMLElement;
              clone.style.display = 'flex';
              clone.removeAttribute('data-v-template');
              clone.classList.remove('v-editor-preview');

              const fContenido = clone.querySelector('[data-v-field="contenido"]');
              if (fContenido) fContenido.innerText = `"${t.contenido}"`;

              const fNombre = clone.querySelector('[data-v-field="nombre"]');
              if (fNombre) fNombre.innerText = t.nombre;

              const fEmpresa = clone.querySelector('[data-v-field="empresa"]');
              if (fEmpresa) fEmpresa.innerText = t.empresa;

              const fInicial = clone.querySelector('[data-v-field="inicial"]');
              if (fInicial) fInicial.innerText = t.nombre.charAt(0);

              container.appendChild(clone);
            });
            template.style.display = isEditor ? 'flex' : 'none';
          };
          load();
        }
      }
    }
  });
};