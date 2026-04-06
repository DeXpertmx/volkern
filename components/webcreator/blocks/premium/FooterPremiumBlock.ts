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
        components: `
          <footer class="premium-footer">
            <style>
              .premium-footer { padding: 8rem 2rem 4rem; background: #050505; color: white; font-family: 'Inter', sans-serif; border-top: 1px solid rgba(255, 255, 255, 0.05); }
              .premium-footer-grid { display: grid; grid-template-columns: 2fr repeat(3, 1fr); gap: 4rem; max-width: 1200px; margin: 0 auto 6rem; }
              .premium-footer-info { max-width: 320px; }
              .premium-footer-logo { font-size: 1.75rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 2rem; font-style: italic; }
              .premium-footer-logo span { color: #6366f1; }
              .premium-footer-tagline { font-size: 1rem; color: rgba(255, 255, 255, 0.4); line-height: 1.6; font-weight: 500; margin-bottom: 2.5rem; }
              .premium-footer-social { display: flex; gap: 1rem; }
              .premium-footer-col-title { font-size: 0.875rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: white; margin-bottom: 2rem; }
              .premium-footer-links { list-style: none; padding: 0; margin: 0; }
              .premium-footer-links li { margin-bottom: 1.25rem; }
              .premium-footer-links a { color: rgba(255, 255, 255, 0.4); text-decoration: none; transition: all 0.3s; font-weight: 600; font-size: 0.9375rem; }
              .premium-footer-links a:hover { color: #6366f1; transform: translateX(5px); display: inline-block; }
              .premium-footer-bottom { border-top: 1px solid rgba(255, 255, 255, 0.05); pt: 4rem; max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding-top: 4rem; }
              .premium-copyright { font-size: 0.875rem; color: rgba(255, 255, 255, 0.3); font-weight: 500; }
              @media (max-width: 1024px) { .premium-footer-grid { grid-template-columns: 1fr 1fr; gap: 4rem; } }
              @media (max-width: 768px) { .premium-footer-grid { grid-template-columns: 1fr; gap: 3rem; } .premium-footer-bottom { flex-direction: column; gap: 2rem; text-align: center; } }
            </style>
            <div class="premium-footer-grid">
              <div class="premium-footer-info">
                <div class="premium-footer-logo">VOLKERN<span>.</span></div>
                <p class="premium-footer-tagline">Construyendo el futuro de la automatización empresarial con inteligencia artificial de vanguardia.</p>
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
              <div class="premium-copyright">© 2026 Volkern Business Solutions. Todos los derechos reservados.</div>
              <div class="premium-footer-social">
                <a href="#" class="premium-social-link"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg></a>
              </div>
            </div>
          </footer>
        `
      }
    }
  });
};
