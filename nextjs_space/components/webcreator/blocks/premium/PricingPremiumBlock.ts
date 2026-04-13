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
        traits: [
          { type: 'text', label: 'Plan 1: Nombre', name: 'data-p1-name' },
          { type: 'text', label: 'Plan 1: Precio', name: 'data-p1-price' },
          { type: 'text', label: 'Plan 2: Nombre', name: 'data-p2-name' },
          { type: 'text', label: 'Plan 2: Precio', name: 'data-p2-price' },
          { type: 'text', label: 'Plan 3: Nombre', name: 'data-p3-name' },
          { type: 'text', label: 'Plan 3: Precio', name: 'data-p3-price' },
          { type: 'text', label: 'Moneda', name: 'data-currency', value: '$' },
        ],
        components: `
          <section class="premium-pricing-section">
            <style>
              .premium-pricing-section { padding: 10rem 2rem; background: #ffffff; color: #3D3D3D; font-family: 'Inter', sans-serif; position: relative; }
              .premium-pricing-header { text-align: center; max-width: 800px; margin: 0 auto 6rem; }
              .premium-pricing-badge { display: inline-block; padding: 0.5rem 1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 100px; color: #6366f1; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
              .premium-pricing-title { font-size: 3.5rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 1.5rem; line-height: 1.1; color: #3D3D3D; }
              .premium-pricing-desc { font-size: 1.125rem; color: #3D3D3D; opacity: 0.6; line-height: 1.6; font-weight: 500; }
              .premium-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
              .premium-pricing-card { background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 3rem; padding: 4rem 3rem; display: flex; flex-direction: column; transition: all 0.5s; }
              .premium-pricing-card.featured { border-color: #6366f1; transform: scale(1.05); z-index: 10; box-shadow: 0 40px 100px -30px rgba(99, 102, 241, 0.15); }
              .premium-plan-name { font-size: 1.25rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #3D3D3D; opacity: 0.4; margin-bottom: 1rem; }
              .premium-plan-price { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 0.5rem; color: #3D3D3D; display: flex; align-items: baseline; }
              .premium-price-currency { font-size: 1.5rem; margin-right: 0.25rem; }
              .premium-price-period { font-size: 1rem; opacity: 0.3; margin-left: 0.5rem; }
              .premium-pricing-features { list-style: none; padding: 0; margin: 3rem 0; flex-grow: 1; }
              .premium-pricing-features li { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; font-weight: 600; font-size: 0.9rem; }
              .premium-plan-btn { padding: 1.25rem; border-radius: 1.25rem; background: #3D3D3D; color: white; border: none; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; cursor: pointer; transition: all 0.3s; }
              .premium-plan-btn:hover { background: #6366f1; transform: translateY(-3px); }
            </style>
            <div class="premium-pricing-header">
              <div class="premium-pricing-badge">Planes de Inversión</div>
              <h2 class="premium-pricing-title">Escala con total transparencia.</h2>
              <p class="premium-pricing-desc">Elige el plan que mejor se adapte a tus necesidades.</p>
            </div>
            <div class="premium-pricing-grid">
              <div class="premium-pricing-card">
                <span class="premium-plan-name" data-v-p1-n>Starter</span>
                <div class="premium-plan-price">
                  <span class="premium-price-currency" data-v-curr>$</span><span data-v-p1-p>49</span><span class="premium-price-period">/mes</span>
                </div>
                <ul class="premium-pricing-features">
                  <li><svg width="18" height="18" fill="none" stroke="#6366f1" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Acceso Básico</li>
                  <li><svg width="18" height="18" fill="none" stroke="#6366f1" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Soporte por Email</li>
                </ul>
                <button class="premium-plan-btn">Comenzar</button>
              </div>
              <div class="premium-pricing-card featured">
                <span class="premium-plan-name" data-v-p2-n>Professional</span>
                <div class="premium-plan-price">
                   <span class="premium-price-currency" data-v-curr>$</span><span data-v-p2-p>129</span><span class="premium-price-period">/mes</span>
                </div>
                <ul class="premium-pricing-features">
                  <li><svg width="18" height="18" fill="none" stroke="#6366f1" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Automatización Avanzada</li>
                  <li><svg width="18" height="18" fill="none" stroke="#6366f1" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Soporte 24/7</li>
                </ul>
                <button class="premium-plan-btn">Seleccionar Professional</button>
              </div>
              <div class="premium-pricing-card">
                <span class="premium-plan-name" data-v-p3-n>Enterprise</span>
                <div class="premium-plan-price">
                   <span class="premium-price-currency" data-v-curr>$</span><span data-v-p3-p>399</span><span class="premium-price-period">/mes</span>
                </div>
                <ul class="premium-pricing-features">
                  <li><svg width="18" height="18" fill="none" stroke="#6366f1" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Todo Ilimitado</li>
                  <li><svg width="18" height="18" fill="none" stroke="#6366f1" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg> Consultoría Dedicada</li>
                </ul>
                <button class="premium-plan-btn">Contactar Ventas</button>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
            const get = (a) => el.getAttribute(a);
            const set = (sel, val) => {
              if (!val) return;
              const target = el.querySelector(sel);
              if (target) target.innerText = val;
            };
            const currency = get('data-currency');
            if (currency) el.querySelectorAll('[data-v-curr]').forEach((c) => c.innerText = currency);
            
            set('[data-v-p1-n]', get('data-p1-name'));
            set('[data-v-p1-p]', get('data-p1-price'));
            set('[data-v-p2-n]', get('data-p2-name'));
            set('[data-v-p2-p]', get('data-p2-price'));
            set('[data-v-p3-n]', get('data-p3-name'));
            set('[data-v-p3-p]', get('data-p3-price'));
          };
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
};
