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