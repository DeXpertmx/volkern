import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export interface VolkernTeamMember {
  nombre?: string;
  puesto?: string;
  descripcion?: string;
  email?: string;
  telefono?: string;
  foto?: string;
}

export const createTeamBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-team", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('team')}
        </div>
        <div class="gjs-block-label">Equipo</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-team' }
  });

  editor.DomComponents.addType('volkern-team', {
    model: {
      defaults: {
        components: `
          <section class="volkern-team-section">
            <style>
              .volkern-team-section { padding: 8rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; }
              .volkern-team-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 3rem; max-width: 1200px; margin: 0 auto; }
              .volkern-team-card { text-align: center; }
              .volkern-team-img-wrap { width: 200px; height: 200px; border-radius: 50%; margin: 0 auto 2rem; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
              .volkern-team-avatar { width: 100%; height: 100%; object-cover: cover; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 4rem; font-weight: 900; }
              .volkern-team-name { font-size: 1.5rem; font-weight: 900; font-style: italic; margin-bottom: 0.5rem; }
              .volkern-team-role { font-size: 0.75rem; font-weight: 900; text-transform: uppercase; color: #818cf8; letter-spacing: 0.2em; }
            </style>
            <div class="volkern-team-grid">
              <div style="padding: 4rem; text-align: center; color: rgba(255,255,255,0.2); font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase;">Cargando talento...</div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const container = el.querySelector('.volkern-team-grid');
          if (!container) return;

          const load = async () => {
            try {
              let apiUrl = '/api/volkern?path=equipo&activo=true';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }
              const res = await fetch(apiUrl);
              const data = await res.json();
              const items = Array.isArray(data) ? data : (data.equipo || []);
              render(items.length ? items : null);
            } catch (e) { render(null); }
          };

          const render = (items: any) => {
            const list = items || [
               { nombre: 'David Volkern', puesto: 'Chief Architect' },
               { nombre: 'Sarah Blade', puesto: 'Senior Strategist' },
               { nombre: 'Marcus Zen', puesto: 'Lead Developer' }
            ];
            container.innerHTML = list.map((m: any) => `
              <div class="volkern-team-card">
                <div class="volkern-team-img-wrap">
                  <div class="volkern-team-avatar">${m.nombre.charAt(0)}</div>
                </div>
                <h3 class="volkern-team-name">${m.nombre}</h3>
                <div class="volkern-team-role">${m.puesto}</div>
              </div>
            `).join('');
          };
          load();
        }
      }
    }
  });
};