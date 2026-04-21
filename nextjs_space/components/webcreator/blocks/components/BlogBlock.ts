import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export interface VolkernBlogPost {
  titulo?: string;
  excerpt?: string;
  categoria?: string;
  fecha_publicacion?: string;
  slug?: string;
  imagen?: string;
}

export const createBlogBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-blog", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('blog')}
        </div>
        <div class="gjs-block-label">Blog</div>
      </div>
    `,
    category: "Volkern CRM 🚀",
    content: { type: 'volkern-blog' }
  });

  editor.DomComponents.addType('volkern-blog', {
    model: {
      defaults: {
        components: `
          <section class="volkern-blog-section">
            <div class="volkern-blog-grid">
              <div style="padding: 4rem; text-align: center; color: #3D3D3D; opacity: 0.2; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase;">Cargando conocimiento...</div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const container = el.querySelector('.volkern-blog-grid');
          if (!container) return;

          const load = async () => {
            try {
              let apiUrl = '/api/volkern?path=blog&limit=3';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }
              const res = await fetch(apiUrl);
              const data = await res.json();
              const items = Array.isArray(data) ? data : (data.posts || []);
              render(items.length ? items : null);
            } catch (e) { render(null); }
          };

          const render = (items: any) => {
            const list = items || [
              { titulo: 'El Futuro de la IA en CRM', fecha_publicacion: '2026-03-24' },
              { titulo: 'Maximizando Conversiones 2026', fecha_publicacion: '2026-03-20' },
              { titulo: 'Automatización Humana', fecha_publicacion: '2026-03-15' }
            ];
            container.innerHTML = list.map((p: any) => `
              <div class="volkern-blog-card">
                <div class="volkern-blog-img">VK</div>
                <div class="volkern-blog-content">
                  <div class="volkern-blog-date">${new Date(p.fecha_publicacion).toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                  <h3 class="volkern-blog-title">${p.titulo}</h3>
                  <a href="#" class="volkern-blog-link">Leer artículo <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 12l5-5-5-5M11 12l5-5-5-5"/></svg></a>
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