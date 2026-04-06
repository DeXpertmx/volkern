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
    category: "Volkern CRM",
    content: { type: 'volkern-blog' }
  });

  editor.DomComponents.addType('volkern-blog', {
    model: {
      defaults: {
        components: `
          <section class="volkern-blog-section">
            <style>
              .volkern-blog-section { padding: 8rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; }
              .volkern-blog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 3rem; max-width: 1200px; margin: 0 auto; }
              .volkern-blog-card { background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 2rem; overflow: hidden; transition: all 0.4s; }
              .volkern-blog-card:hover { transform: translateY(-10px); background: rgba(255, 255, 255, 0.04); border-color: #6366f1; }
              .volkern-blog-img { height: 240px; background: linear-gradient(45deg, #1a1a1a, #2a2a2a); display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: 900; color: rgba(255,255,255,0.1); }
              .volkern-blog-content { padding: 2.5rem; }
              .volkern-blog-date { font-size: 0.75rem; font-weight: 900; text-transform: uppercase; color: #818cf8; letter-spacing: 0.1em; margin-bottom: 1rem; }
              .volkern-blog-title { font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; line-height: 1.3; font-style: italic; }
              .volkern-blog-link { display: inline-flex; align-items: center; gap: 0.5rem; color: white; font-weight: 700; text-decoration: none; margin-top: 1.5rem; font-size: 0.875rem; }
              .volkern-blog-link:hover { color: #818cf8; }
            </style>
            <div class="volkern-blog-grid">
              <div style="padding: 4rem; text-align: center; color: rgba(255,255,255,0.2); font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase;">Cargando conocimiento...</div>
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
                  <a href="#" class="volkern-blog-link">Leer artículo <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5-5-5-5M11 12l5-5-5-5"/></svg></a>
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