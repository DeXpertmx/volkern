import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createContactPremiumBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("contact-premium", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">${getIconSvg('contact')}</div>
        <div class="gjs-block-label">Contacto</div>
      </div>
    `,
    category: "Premium",
    content: { type: 'contact-premium' }
  });

  editor.DomComponents.addType('contact-premium', {
    model: {
      defaults: {
        components: `
          <section class="premium-contact-section">
            <style>
              .premium-contact-section { padding: 10rem 2rem; background: #050505; color: white; font-family: 'Inter', sans-serif; }
              .premium-contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6rem; max-width: 1200px; margin: 0 auto; align-items: center; }
              .premium-contact-info h2 { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 2rem; line-height: 1.1; font-style: italic; }
              .premium-contact-info p { font-size: 1.125rem; color: rgba(255, 255, 255, 0.4); line-height: 1.6; margin-bottom: 4rem; font-weight: 500; }
              .premium-contact-details { list-style: none; padding: 0; margin: 0; }
              .premium-contact-item { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2.5rem; }
              .premium-contact-icon { width: 56px; height: 56px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 1.25rem; display: flex; align-items: center; justify-content: center; color: #818cf8; }
              .premium-contact-label { display: block; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.3); margin-bottom: 0.25rem; }
              .premium-contact-val { font-size: 1.125rem; font-weight: 700; }
              .premium-contact-form { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 3.5rem; padding: 4rem; }
              .premium-form-group { margin-bottom: 2rem; }
              .premium-form-label { display: block; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(255,255,255,0.4); margin-bottom: 1rem; }
              .premium-input { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 1.25rem; padding: 1.25rem; color: white; font-family: inherit; font-size: 1rem; transition: all 0.3s; }
              .premium-input:focus { outline: none; border-color: #6366f1; background: rgba(255,255,255,0.05); }
              .premium-submit-btn { width: 100%; padding: 1.5rem; background: white; color: black; border: none; border-radius: 1.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em; cursor: pointer; transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1); box-shadow: 0 15px 30px -10px rgba(255,255,255,0.2); }
              .premium-submit-btn:hover { background: #6366f1; color: white; transform: translateY(-5px); box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.5); }
              @media (max-width: 1024px) { .premium-contact-grid { grid-template-columns: 1fr; gap: 4rem; } .premium-contact-info { text-align: center; } .premium-contact-item { justify-content: center; } .premium-contact-info h2 { font-size: 3rem; } }
              @media (max-width: 768px) { .premium-contact-form { padding: 2rem; border-radius: 2.5rem; } }
            </style>
            <div class="premium-contact-grid">
              <div class="premium-contact-info">
                <h2>HABLEMOS DE<br>TU FUTURO.</h2>
                <p>¿Tienes un reto complejo? Nuestro equipo de expertos está listo para ayudarte a diseñar una solución que rompa moldes.</p>
                <div class="premium-contact-details">
                  <div class="premium-contact-item">
                    <div class="premium-contact-icon"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>
                    <div>
                      <span class="premium-contact-label">Email</span>
                      <span class="premium-contact-val">hello@volkern.ai</span>
                    </div>
                  </div>
                  <div class="premium-contact-item">
                    <div class="premium-contact-icon"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.81 12.81 0 00.63 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.63A2 2 0 0122 16.92z"></path></svg></div>
                    <div>
                      <span class="premium-contact-label">Teléfono</span>
                      <span class="premium-contact-val">+1 (555) 000-0000</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="premium-contact-form">
                <div class="premium-form-group">
                  <label class="premium-form-label">Nombre Completo</label>
                  <input type="text" class="premium-input" placeholder="Tu nombre...">
                </div>
                <div class="premium-form-group">
                  <label class="premium-form-label">Email Corporativo</label>
                  <input type="email" class="premium-input" placeholder="nombre@empresa.com">
                </div>
                <div class="premium-form-group">
                  <label class="premium-form-label">Mensaje</label>
                  <textarea class="premium-input" rows="4" placeholder="¿En qué podemos ayudarte?"></textarea>
                </div>
                <button class="premium-submit-btn">ENVIAR MENSAJE</button>
              </div>
            </div>
          </section>
        `
      }
    }
  });
};
