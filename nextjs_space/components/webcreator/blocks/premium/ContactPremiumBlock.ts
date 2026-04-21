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
            <div class="premium-contact-grid">
              <div class="premium-contact-info">
                <h2 data-gjs-editable="true" data-gjs-selectable="true">HABLEMOS DE<br>TU FUTURO.</h2>
                <p data-gjs-editable="true" data-gjs-selectable="true">¿Tienes un reto complejo? Nuestro equipo de expertos está listo para ayudarte a diseñar una solución que rompa moldes.</p>
                <div class="premium-contact-details">
                  <div class="premium-contact-item">
                    <div class="premium-contact-icon" data-gjs-hoverable="false"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>
                    <div>
                      <span class="premium-contact-label" data-gjs-editable="true" data-gjs-selectable="true">Email</span>
                      <span class="premium-contact-val" data-gjs-editable="true" data-gjs-selectable="true">hello@volkern.ai</span>
                    </div>
                  </div>
                  <div class="premium-contact-item">
                    <div class="premium-contact-icon" data-gjs-hoverable="false"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.81 12.81 0 00.63 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.63A2 2 0 0122 16.92z"></path></svg></div>
                    <div>
                      <span class="premium-contact-label" data-gjs-editable="true" data-gjs-selectable="true">Teléfono</span>
                      <span class="premium-contact-val" data-gjs-editable="true" data-gjs-selectable="true">+1 (555) 000-0000</span>
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
