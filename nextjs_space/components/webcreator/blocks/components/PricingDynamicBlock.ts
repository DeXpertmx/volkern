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
