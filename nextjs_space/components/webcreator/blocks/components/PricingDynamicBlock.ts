import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

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
    content: { type: 'pricing-dynamic' }
  });

  editor.DomComponents.addType('pricing-dynamic', {
    model: {
      defaults: {
        traits: [],
        stylable: false,
        editable: false,
        droppable: false,
        components: `
          <style>
          .dynamic-plans-wrapper { padding: 80px 24px; background: #f8fafc; }
          .plans-loading { text-align: center; padding: 40px; color: #94a3b8; font-weight: 600; }
          .plans-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
          .plans-empty { text-align: center; padding: 40px; color: #94a3b8; }
          .plan-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); padding: 40px 32px; display: flex; flex-direction: column; transition: box-shadow 0.3s, transform 0.3s; position: relative; }
          .plan-card:hover { box-shadow: 0 8px 30px rgba(99,102,241,0.1); transform: translateY(-2px); }
          .plan-card.popular { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.2); }
          .popular-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #6366f1; color: #fff; font-size: 12px; font-weight: 700; text-transform: uppercase; border-radius: 9999px; padding: 4px 16px; letter-spacing: 0.05em; white-space: nowrap; }
          .plan-name { font-size: 1.1rem; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
          .plan-price { font-size: 2.5rem; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
          .plan-currency { font-size: 1.25rem; color: #94a3b8; margin-right: 2px; }
          .plan-period { font-size: 1rem; color: #94a3b8; font-weight: 400; }
          .plan-desc { font-size: 0.9rem; color: #475569; margin-bottom: 24px; line-height: 1.5; }
          .plan-features { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 12px; flex: 1; }
          .plan-features li { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: #475569; }
          .feature-icon { color: #6366f1; flex-shrink: 0; }
          .plan-cta { display: block; background: #6366f1; color: #fff; font-weight: 700; border-radius: 12px; padding: 14px 28px; text-align: center; text-decoration: none; transition: background 0.3s, transform 0.2s; font-size: 0.95rem; }
          .plan-cta:hover { background: #4f46e5; transform: scale(1.02); }
          </style>
          <div class="dynamic-plans-wrapper" data-gjs-selectable="false" data-gjs-hoverable="false">
            <div class="plans-loading" data-v-loading data-gjs-selectable="false" data-gjs-hoverable="false">Cargando planes de suscripción...</div>
            <div class="plans-grid" data-v-grid data-gjs-selectable="false" data-gjs-hoverable="false"></div>
          </div>
        `,
        script: function() {
          const el = this;
          const grid = el.querySelector('[data-v-grid]');
          const loading = el.querySelector('[data-v-loading]');

          const fetchPlans = async () => {
            try {
              // Determinamos el origen para evitar bloqueos en el editor
              let origin = "";
              try {
                if (window.top && window.top.location.origin !== "null") {
                  origin = window.top.location.origin;
                }
              } catch(e) {}
              
              const res = await fetch(origin + '/api/public/plans');
              const plans = await res.json();
              
              if (loading) loading.style.display = 'none';
              if (grid) {
                if (plans.length === 0) {
                   grid.innerHTML = '<div class="plans-empty">No se encontraron planes activos.</div>';
                   return;
                }
                grid.innerHTML = plans.map((plan: any) => `
                  <div class="plan-card ${plan.popular ? 'popular' : ''}">
                    ${plan.popular ? '<div class="popular-badge">Más Popular</div>' : ''}
                    <div class="plan-name">${plan.name}</div>
                    <div class="plan-price">
                      <span class="plan-currency">${plan.currency}</span>${plan.price}<span class="plan-period">/${plan.period}</span>
                    </div>
                    <div class="plan-desc">${plan.description}</div>
                    <ul class="plan-features">
                      ${plan.features.map((f: string) => `
                        <li>
                          <svg class="feature-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
                          ${f}
                        </li>
                      `).join('')}
                    </ul>
                    <a href="/auth/register?plan=${plan.slug}" class="plan-cta">Elegir Plan</a>
                  </div>
                `).join('');
              }
            } catch (err) {
              console.error('Error loading dynamic plans:', err);
              if (loading) loading.innerText = 'Error al conectar con el sistema de planes.';
            }
          };

          fetchPlans();
        }
      }
    }
  });
};
