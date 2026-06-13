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
          <style>
.premium-footer { background: #1e293b; padding: 64px 24px 32px; }
.premium-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 40px; max-width: 1200px; margin: 0 auto; }
.premium-footer-info { }
.premium-footer-logo { font-size: 24px; font-weight: 800; color: white; margin-bottom: 12px; }
.premium-footer-logo span { color: #6366f1; }
.premium-footer-tagline { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0; }
.premium-footer-col-title { font-size: 14px; font-weight: 700; color: white; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px; }
.premium-footer-links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.premium-footer-links a { color: #94a3b8; text-decoration: none; font-size: 14px; transition: color 0.2s; }
.premium-footer-links a:hover { color: white; }
.premium-footer-bottom { max-width: 1200px; margin: 40px auto 0; padding-top: 24px; border-top: 1px solid #334155; text-align: center; }
.premium-copyright { font-size: 13px; color: #64748b; }
</style>
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
