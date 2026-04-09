import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createPricingPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("pricing-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('pricing')}</div>
        <div class="gjs-block-label">Precios</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'pricing-premium' }
  });

  editor.DomComponents.addType('pricing-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-pricing-section">
            <style>
              .premium-pricing-section { padding: 10rem 2rem; background: #ffffff; color: #3D3D3D; font-family: 'Inter', sans-serif; position: relative; }
              .premium-pricing-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; }
              .premium-pricing-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 100px; color: #6366f1; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-pricing-title { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; font-style: italic; color: #3D3D3D; }
              .premium-pricing-desc { font-size: 1.125rem; color: #3D3D3D; opacity: 0.6; line-height: 1.6; font-weight: 500; }
              .premium-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
              .premium-pricing-card { background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 3rem; padding: 4rem 3rem; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); display: flex; flex-direction: column; position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
              .premium-pricing-card.featured { background: #ffffff; border-color: #6366f1; transform: scale(1.05); z-index: 10; box-shadow: 0 40px 100px -30px rgba(99, 102, 241, 0.15); }
              .premium-pricing-card.featured::before { content: 'MAS POPULAR'; position: absolute; top: 1.5rem; right: -2.5rem; background: #6366f1; color: white; font-size: 10px; font-weight: 900; padding: 0.5rem 3rem; transform: rotate(45deg); letter-spacing: 0.1em; }
              .premium-pricing-card:hover { transform: translateY(-10px); }
              .premium-pricing-card.featured:hover { transform: scale(1.05) translateY(-10px); }
              .premium-plan-name { font-size: 1.25rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #3D3D3D; opacity: 0.4; margin-bottom: 1rem; }
              .premium-plan-price { font-size: 4.5rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 0.5rem; display: flex; align-items: flex-start; color: #3D3D3D; }
              .premium-price-currency { font-size: 1.5rem; margin-top: 1rem; margin-right: 0.25rem; }
              .premium-price-period { font-size: 1rem; color: #3D3D3D; opacity: 0.3; margin-top: auto; margin-bottom: 1.5rem; }
              .premium-plan-desc { color: #3D3D3D; opacity: 0.6; font-size: 1rem; line-height: 1.6; margin-bottom: 3rem; min-height: 3.2rem; }
              .premium-pricing-features { list-style: none; padding: 0; margin: 0 0 4rem; flex-grow: 1; }
              .premium-pricing-features li { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; font-weight: 600; color: #3D3D3D; }
              .premium-pricing-features li svg { color: #6366f1; }
              .premium-plan-btn { padding: 1.5rem; border-radius: 1.5rem; background: #f8fafc; color: #3D3D3D; border: 1px solid #3D3D3D; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; cursor: pointer; transition: all 0.3s; }
              .premium-pricing-card.featured .premium-plan-btn { background: #3D3D3D; color: white; border: none; box-shadow: 0 15px 30px -10px rgba(0,0,0,0.1); }
              .premium-plan-btn:hover { background: #6366f1; color: white; border-color: #6366f1; transform: scale(1.02); }
              @media (max-width: 1024px) { .premium-pricing-card.featured { transform: scale(1); } .premium-pricing-card.featured:hover { transform: translateY(-10px); } .premium-pricing-grid { gap: 3rem; } }
            </style>
            <div class="premium-pricing-header">
              <div class="premium-pricing-badge" data-gjs-editable="true" data-gjs-selectable="true">Planes de Inversión</div>
              <h2 class="premium-pricing-title" data-gjs-editable="true" data-gjs-selectable="true">Escala tu negocio con total transparencia.</h2>
              <p class="premium-pricing-desc" data-gjs-editable="true" data-gjs-selectable="true">Elige el plan que mejor se adapte a tus necesidades actuales. Siempre puedes escalar mañana.</p>
            </div>
            <div class="premium-pricing-grid">
              <div class="premium-pricing-card">
                <span class="premium-plan-name" data-gjs-editable="true" data-gjs-selectable="true">Starter</span>
                <div class="premium-plan-price" data-gjs-editable="true" data-gjs-selectable="true">
                  <span class="premium-price-currency" data-gjs-hoverable="false">$</span>49<span class="premium-price-period" data-gjs-hoverable="false">/mes</span>
                </div>
                <p class="premium-plan-desc" data-gjs-editable="true" data-gjs-selectable="true">Ideal para profesionales independientes y startups en etapa inicial.</p>
                <ul class="premium-pricing-features">
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> 5 CRM Leads / mes</li>
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Soporte básico</li>
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> 1 Dominio personalizado</li>
                </ul>
                <button class="premium-plan-btn" data-gjs-editable="true" data-gjs-selectable="true">Comenzar</button>
              </div>
              <div class="premium-pricing-card featured">
                <span class="premium-plan-name" data-gjs-editable="true" data-gjs-selectable="true">Professional</span>
                <div class="premium-plan-price" data-gjs-editable="true" data-gjs-selectable="true">
                  <span class="premium-price-currency" data-gjs-hoverable="false">$</span>129<span class="premium-price-period" data-gjs-hoverable="false">/mes</span>
                </div>
                <p class="premium-plan-desc" data-gjs-editable="true" data-gjs-selectable="true">Perfecto para equipos en crecimiento que necesitan automatización avanzada.</p>
                <ul class="premium-pricing-features">
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Leads Ilimitados</li>
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Soporte Prioritario 24/7</li>
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Agente IA Dedicado</li>
                </ul>
                <button class="premium-plan-btn" data-gjs-editable="true" data-gjs-selectable="true">Seleccionar</button>
              </div>
              <div class="premium-pricing-card">
                <span class="premium-plan-name" data-gjs-editable="true" data-gjs-selectable="true">Enterprise</span>
                <div class="premium-plan-price" data-gjs-editable="true" data-gjs-selectable="true">
                  <span class="premium-price-currency" data-gjs-hoverable="false">$</span>399<span class="premium-price-period" data-gjs-hoverable="false">/mes</span>
                </div>
                <p class="premium-plan-desc" data-gjs-editable="true" data-gjs-selectable="true">Solución completa para corporaciones con necesidades de alta escala.</p>
                <ul class="premium-pricing-features">
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Multi-tenant Enterprise</li>
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Integración API Legacy</li>
                  <li data-gjs-editable="true" data-gjs-selectable="true"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> SLA Garantizado</li>
                </ul>
                <button class="premium-plan-btn" data-gjs-editable="true" data-gjs-selectable="true">Contactar</button>
              </div>
            </div>
          </section>
        `
      }
    }
  });
};
