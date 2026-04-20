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
        components: `
          <div class="dynamic-plans-wrapper">
            <div class="plans-loading">Cargando planes de suscripción...</div>
            <div class="plans-grid" data-v-grid></div>
            <style>
              .dynamic-plans-wrapper { padding: 4rem 1rem; font-family: 'Inter', sans-serif; }
              .plans-loading { text-align: center; color: #64748b; font-weight: 500; padding: 2rem; }
              .plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
              .plan-card { background: white; border: 1px solid #e2e8f0; border-radius: 2rem; padding: 3rem 2rem; display: flex; flex-direction: column; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
              .plan-card:hover { transform: translateY(-8px); border-color: #6366f1; box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.15); }
              .plan-card.popular { border-color: #6366f1; border-width: 2px; }
              .popular-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #6366f1; color: white; padding: 4px 16px; border-radius: 100px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
              .plan-name { font-size: 0.875rem; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em; margin-bottom: 0.5rem; }
              .plan-price { font-size: 3.5rem; font-weight: 900; color: #1e293b; margin-bottom: 1rem; display: flex; align-items: baseline; }
              .plan-currency { font-size: 1.5rem; margin-right: 2px; }
              .plan-period { font-size: 1rem; color: #94a3b8; margin-left: 4px; }
              .plan-desc { font-size: 0.875rem; color: #64748b; margin-bottom: 2rem; min-height: 3em; }
              .plan-features { list-style: none; padding: 0; margin: 0 0 2.5rem 0; flex-grow: 1; }
              .plan-features li { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.75rem; font-size: 0.875rem; color: #334155; font-weight: 500; }
              .feature-icon { color: #10b981; flex-shrink: 0; margin-top: 2px; }
              .plan-cta { width: 100%; padding: 1rem; border-radius: 1rem; background: #1e293b; color: white; border: none; font-weight: 700; cursor: pointer; transition: background 0.2s; text-align: center; text-decoration: none; }
              .plan-card.popular .plan-cta { background: #6366f1; }
              .plan-cta:hover { background: #0f172a; }
            </style>
          </div>
        `,
        script: function() {
          const el = this;
          const grid = el.querySelector('[data-v-grid]');
          const loading = el.querySelector('.plans-loading');

          const fetchPlans = async () => {
            try {
              const res = await fetch('/api/public/plans');
              const plans = await res.json();
              
              if (loading) loading.style.display = 'none';
              if (grid) {
                if (plans.length === 0) {
                  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; border: 2px dashed #e2e8f0; border-radius: 2rem; color: #94a3b8;">No hay planes de suscripción configurados en el sistema.</div>';
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
              if (loading) loading.innerText = 'Error al cargar los planes.';
            }
          };

          fetchPlans();
        }
      }
    }
  });
};
