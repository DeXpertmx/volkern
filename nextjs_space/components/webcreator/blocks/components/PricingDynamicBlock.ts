import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

/**
 * Dynamic Pricing Block - Volkern CRM
 *
 * IMPORTANT: The fetch logic is embedded as a real <script> tag inside the HTML,
 * NOT as a GrapesJS `script` function. This is because GrapesJS script functions
 * are sandboxed to the editor canvas and are NOT exported in getHtml().
 * Using an inline <script> tag ensures the block works identically in both
 * the editor preview and on the published public page.
 */
export const createPricingDynamicBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("pricing-dynamic", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('pricing')}</div>
        <div class="gjs-block-label">Planes Dinámicos</div>
      </div>
    `,
    category: "Volkern CRM 🚀",
    content: `
      <div class="dyn-plans-wrapper">
        <div class="dyn-plans-loading">Cargando planes...</div>
        <div class="dyn-plans-grid"></div>
        <style>
          .dyn-plans-wrapper { padding: 4rem 1rem; font-family: Inter, sans-serif; }
          .dyn-plans-loading { text-align: center; color: #64748b; font-weight: 500; padding: 2rem; }
          .dyn-plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
          .dyn-plan-card { background: white; border: 1px solid #e2e8f0; border-radius: 2rem; padding: 3rem 2rem; display: flex; flex-direction: column; transition: all 0.4s; position: relative; }
          .dyn-plan-card:hover { transform: translateY(-8px); border-color: #6366f1; box-shadow: 0 25px 50px -12px rgba(99,102,241,0.15); }
          .dyn-plan-card.popular { border-color: #6366f1; border-width: 2px; }
          .dyn-popular-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #6366f1; color: white; padding: 4px 16px; border-radius: 100px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
          .dyn-plan-name { font-size: 0.875rem; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em; margin-bottom: 0.5rem; }
          .dyn-plan-price { font-size: 3.5rem; font-weight: 900; color: #1e293b; margin-bottom: 1rem; display: flex; align-items: baseline; }
          .dyn-plan-currency { font-size: 1.5rem; margin-right: 2px; }
          .dyn-plan-period { font-size: 1rem; color: #94a3b8; margin-left: 4px; }
          .dyn-plan-desc { font-size: 0.875rem; color: #64748b; margin-bottom: 2rem; min-height: 3em; line-height: 1.6; }
          .dyn-plan-features { list-style: none; padding: 0; margin: 0 0 2.5rem 0; flex-grow: 1; }
          .dyn-plan-features li { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.75rem; font-size: 0.875rem; color: #334155; font-weight: 500; }
          .dyn-plan-cta { display: block; width: 100%; padding: 1rem; border-radius: 1rem; background: #1e293b; color: white; border: none; font-weight: 700; cursor: pointer; text-align: center; text-decoration: none; transition: opacity 0.2s; }
          .dyn-plan-card.popular .dyn-plan-cta { background: #6366f1; }
          .dyn-plan-cta:hover { opacity: 0.85; }
        </style>
        <script>
          (function() {
            var wrapper = document.currentScript ? document.currentScript.parentNode : null;
            if (!wrapper) {
              var scripts = document.querySelectorAll('.dyn-plans-wrapper script');
              if (scripts.length) wrapper = scripts[scripts.length - 1].parentNode;
            }
            if (!wrapper) return;
            var loading = wrapper.querySelector('.dyn-plans-loading');
            var grid = wrapper.querySelector('.dyn-plans-grid');
            if (!grid) return;
            fetch('/api/public/plans')
              .then(function(r) { return r.json(); })
              .then(function(plans) {
                if (loading) loading.style.display = 'none';
                if (!plans || !plans.length) {
                  grid.innerHTML = '<div style="text-align:center;padding:2rem;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:1rem;">No hay planes configurados en el sistema.</div>';
                  return;
                }
                grid.innerHTML = plans.map(function(p) {
                  var feats = (p.features || []).map(function(f) {
                    return '<li><svg width="16" height="16" fill="none" stroke="#10b981" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>' + f + '</li>';
                  }).join('');
                  return '<div class="dyn-plan-card' + (p.popular ? ' popular' : '') + '">' +
                    (p.popular ? '<div class="dyn-popular-badge">M\u00e1s Popular</div>' : '') +
                    '<div class="dyn-plan-name">' + p.name + '</div>' +
                    '<div class="dyn-plan-price"><span class="dyn-plan-currency">' + p.currency + '</span>' + p.price + '<span class="dyn-plan-period">/' + p.period + '</span></div>' +
                    '<div class="dyn-plan-desc">' + (p.description || '') + '</div>' +
                    '<ul class="dyn-plan-features">' + feats + '</ul>' +
                    '<a href="/auth/register?plan=' + p.slug + '" class="dyn-plan-cta">Elegir Plan</a>' +
                    '</div>';
                }).join('');
              })
              .catch(function() {
                if (loading) loading.innerText = 'Error al cargar los planes.';
              });
          })();
        </script>
      </div>
    `
  });
};
