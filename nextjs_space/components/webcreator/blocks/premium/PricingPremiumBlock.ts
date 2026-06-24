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
          <style>
.premium-pricing-section { padding: 80px 24px; background: #f8fafc; }
.premium-pricing-header { text-align: center; max-width: 700px; margin: 0 auto 48px; }
.premium-pricing-badge { display: inline-block; background: #eef2ff; color: #6366f1; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 8px 16px; border-radius: 9999px; margin-bottom: 16px; letter-spacing: 0.5px; }
.premium-pricing-title { font-size: 36px; font-weight: 800; color: #1e293b; margin: 0 0 12px; }
.premium-pricing-desc { font-size: 16px; color: #475569; line-height: 1.6; margin: 0; }
.premium-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1200px; margin: 0 auto; }
.premium-pricing-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; }
.premium-pricing-card.featured { border-color: #6366f1; border-width: 2px; position: relative; }
.premium-pricing-card.featured::before { content: 'MAS POPULAR'; position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #6366f1; color: white; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 16px; border-radius: 9999px; letter-spacing: 1px; }
.premium-plan-name { font-size: 14px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.premium-plan-price { font-size: 40px; font-weight: 800; color: #1e293b; margin-bottom: 24px; }
.premium-price-currency { font-size: 24px; vertical-align: super; }
.premium-price-period { font-size: 16px; font-weight: 400; color: #475569; }
.premium-pricing-features { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 12px; }
.premium-pricing-features li { display: flex; align-items: center; gap: 8px; font-size: 15px; color: #475569; }
.premium-plan-btn { width: 100%; background: #6366f1; color: white; font-weight: 700; font-size: 16px; padding: 14px; border: none; border-radius: 12px; cursor: pointer; margin-top: auto; transition: all 0.2s; }
.premium-plan-btn:hover { background: #4f46e5; }
.premium-pricing-card.featured .premium-plan-btn { background: #6366f1; }
</style>
           <section class="premium-pricing-section">
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
            const get = (a: string) => el.getAttribute(a);
            const set = (sel: string, val: string | null) => {
              if (!val) return;
              const target = el.querySelector(sel);
              if (target) target.innerText = val;
            };
            const currency = get('data-currency');
            if (currency) el.querySelectorAll('[data-v-curr]').forEach((c: any) => c.innerText = currency);
            
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
