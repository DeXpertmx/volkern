import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createCommercePremiumBlocks = (editor: Editor) => {
  const bm = editor.BlockManager;

  // 1. Payment Button Block
  bm.add("payment-button-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('pricing')}</div>
        <div class="gjs-block-label">Botón de Pago</div>
      </div>
    `,
    category: "Comercio",
    content: { type: 'payment-button-premium' }
  });

  editor.DomComponents.addType('payment-button-premium', {
    model: {
      defaults: {
        traits: [
          { 
            type: 'select', 
            label: 'Pasarela', 
            name: 'data-provider',
            options: [
                { value: 'stripe', id: 'stripe', name: 'Stripe' },
                { value: 'square', id: 'square', name: 'Square' },
                { value: 'gocardless', id: 'gocardless', name: 'GoCardless' },
                { value: 'custom', id: 'custom', name: 'Personalizado' },
            ]
          },
          { type: 'text', label: 'Producto', name: 'data-product', value: 'Plan Premium' },
          { type: 'text', label: 'Precio', name: 'data-amount', value: '49.00' },
          { type: 'text', label: 'Moneda', name: 'data-currency', value: 'EUR' },
        ],
        components: `
          <div class="premium-payment-wrap">
            <button class="premium-payment-btn payment-stripe" data-v-btn>
              <span data-v-text>Pagar 49.00 EUR</span>
              <img class="payment-logo" data-v-logo src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg">
            </button>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const btn = el.querySelector('[data-v-btn]');
          const logo = el.querySelector('[data-v-logo]');
          const text = el.querySelector('[data-v-text]');

          const update = () => {
             const provider = el.getAttribute('data-provider') || 'stripe';
             const amount = el.getAttribute('data-amount') || '49.00';
             const currency = el.getAttribute('data-currency') || 'EUR';
             
             if (btn) {
                btn.className = 'premium-payment-btn payment-' + provider;
             }
             if (text) {
                text.innerText = `Pagar ${amount} ${currency}`;
             }
             
             if (logo) {
                if (provider === 'stripe') logo.src = 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg';
                if (provider === 'square') logo.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Square%2C_Inc._logo.svg/1200px-Square%2C_Inc._logo.svg.png';
                if (provider === 'gocardless') logo.src = 'https://gocardless.com/images/logos/gocardless-white.svg';
             }
          };
          
          const obs = new MutationObserver(() => update());
          obs.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
};
