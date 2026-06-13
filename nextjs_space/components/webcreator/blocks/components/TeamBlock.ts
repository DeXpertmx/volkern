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
    category: "Volkern CRM 🚀",
    content: { type: 'volkern-team' }
  });

  editor.DomComponents.addType('volkern-team', {
    model: {
      defaults: {
        components: `
          <style>
          .volkern-team-section { padding: 80px 24px; background: #f8fafc; }
          .volkern-team-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
          .volkern-team-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); padding: 32px; text-align: center; transition: box-shadow 0.3s, transform 0.3s; }
          .volkern-team-card:hover { box-shadow: 0 8px 30px rgba(99,102,241,0.1); transform: translateY(-2px); }
          .volkern-team-img-wrap { margin-bottom: 16px; }
          .volkern-team-avatar { width: 72px; height: 72px; border-radius: 50%; background: #eef2ff; color: #6366f1; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800; margin: 0 auto; }
          .volkern-team-name { font-size: 1.15rem; font-weight: 800; color: #1e293b; margin: 0 0 4px; }
          .volkern-team-role { font-size: 0.9rem; color: #6366f1; font-weight: 600; }
          </style>
          <section class="volkern-team-section">
            <div class="volkern-team-grid">
              <div style="padding: 4rem; text-align: center; color: #3D3D3D; opacity: 0.1; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase;">Invocando mentes...</div>
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