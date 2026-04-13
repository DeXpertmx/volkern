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
            <style>
              .premium-footer { padding: 8rem 2rem 4rem; background: #ffffff; color: #3D3D3D; font-family: 'Inter', sans-serif; border-top: 1px solid rgba(61, 61, 61, 0.05); }
              .premium-footer-grid { display: grid; grid-template-columns: 2fr repeat(3, 1fr); gap: 4rem; max-width: 1200px; margin: 0 auto 6rem; }
              .premium-footer-info { max-width: 320px; }
              .premium-footer-logo { font-size: 1.75rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 2rem; font-style: italic; color: #3D3D3D; text-transform: uppercase; }
              .premium-footer-logo span { color: #6366f1; }
              .premium-footer-tagline { font-size: 1rem; color: #3D3D3D; opacity: 0.6; line-height: 1.6; font-weight: 500; margin-bottom: 2.5rem; }
              .premium-footer-col-title { font-size: 0.875rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: #3D3D3D; margin-bottom: 2rem; }
              .premium-footer-links { list-style: none; padding: 0; margin: 0; }
              .premium-footer-links li { margin-bottom: 1.25rem; }
              .premium-footer-links a { color: #3D3D3D; opacity: 0.5; text-decoration: none; transition: all 0.3s; font-weight: 600; font-size: 0.9375rem; }
              .premium-footer-bottom { border-top: 1px solid rgba(61, 61, 61, 0.05); max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding-top: 4rem; }
              .premium-copyright { font-size: 0.875rem; color: #3D3D3D; opacity: 0.4; font-weight: 500; }
              @media (max-width: 768px) { .premium-footer-grid { grid-template-columns: 1fr; } .premium-footer-bottom { flex-direction: column; gap: 2rem; } }
            </style>
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
