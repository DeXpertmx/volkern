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
          <style>
          .volkern-blog-section { padding: 80px 24px; background: #fff; }
          .volkern-blog-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
          .volkern-blog-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden; transition: box-shadow 0.3s, transform 0.3s; }
          .volkern-blog-card:hover { box-shadow: 0 8px 30px rgba(99,102,241,0.1); transform: translateY(-2px); }
          .volkern-blog-img { height: 180px; background: #eef2ff; display: flex; align-items: center; justify-content: center; color: #6366f1; font-weight: 800; font-size: 1.5rem; }
          .volkern-blog-content { padding: 24px; }
          .volkern-blog-date { font-size: 0.8rem; color: #94a3b8; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
          .volkern-blog-title { font-size: 1.15rem; font-weight: 800; color: #1e293b; margin: 0 0 16px; line-height: 1.4; }
          .volkern-blog-link { display: inline-flex; align-items: center; gap: 6px; color: #6366f1; font-weight: 700; font-size: 0.9rem; text-decoration: none; transition: gap 0.2s; }
          .volkern-blog-link:hover { gap: 10px; }
          </style>
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