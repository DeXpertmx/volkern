import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createFooterPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("footer-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('footer')}</div>
        <div class="gjs-block-label">Footer</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'footer-premium' }
  });

  editor.DomComponents.addType('footer-premium', {
    model: {
      defaults: {
        traits: [
          { type: 'text', label: 'Nombre Empresa', name: 'data-company' },
          { type: 'text', label: 'Eslogan', name: 'data-tagline' },
        ],
        components: `
          <footer class="premium-footer">
            <div class="premium-footer-grid">
              <div class="premium-footer-info">
                <div class="premium-footer-logo" data-v-logo>VOLKERN<span>.</span></div>
                <p class="premium-footer-tagline" data-v-tagline>Construyendo el futuro de la automatización empresarial.</p>
              </div>
              <div>
                <h4 class="premium-footer-col-title">Producto</h4>
                <ul class="premium-footer-links">
                  <li><a href="#">Características</a></li>
                  <li><a href="#">Seguridad</a></li>
                  <li><a href="#">Team</a></li>
                </ul>
              </div>
              <div>
                <h4 class="premium-footer-col-title">Compañía</h4>
                <ul class="premium-footer-links">
                  <li><a href="#">Sobre Nosotros</a></li>
                  <li><a href="#">Blog</a></li>
                </ul>
              </div>
              <div>
                <h4 class="premium-footer-col-title">Legal</h4>
                <ul class="premium-footer-links">
                  <li><a href="#">Privacidad</a></li>
                  <li><a href="#">Términos</a></li>
                </ul>
              </div>
            </div>
            <div class="premium-footer-bottom">
              <div class="premium-copyright" data-v-copy>© 2026 Volkern Business Solutions.</div>
            </div>
          </footer>
        `,
        script: function(this: any) {
          const el = this;
          const update = () => {
            const company = el.getAttribute('data-company');
            const tagline = el.getAttribute('data-tagline');
            if (company) {
                el.querySelector('[data-v-logo]').innerHTML = `${company}<span>.</span>`;
                el.querySelector('[data-v-copy]').innerText = `© ${new Date().getFullYear()} ${company}. Todos los derechos reservados.`;
            }
            if (tagline) el.querySelector('[data-v-tagline]').innerText = tagline;
          };
          const observer = new MutationObserver(() => update());
          observer.observe(el, { attributes: true });
          update();
        }
      }
    }
  });
};
