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
          <style>
.premium-contact-section { padding: 80px 24px; background: #f8fafc; }
.premium-contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; max-width: 1200px; margin: 0 auto; }
.premium-contact-info { }
.premium-contact-info h2 { font-size: 36px; font-weight: 800; color: #1e293b; line-height: 1.2; margin: 0 0 16px; }
.premium-contact-info > p { font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 32px; }
.premium-contact-details { display: flex; flex-direction: column; gap: 20px; }
.premium-contact-item { display: flex; align-items: center; gap: 16px; }
.premium-contact-icon { width: 48px; height: 48px; background: #eef2ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #6366f1; flex-shrink: 0; }
.premium-contact-label { display: block; font-size: 13px; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
.premium-contact-val { display: block; font-size: 16px; color: #1e293b; font-weight: 600; }
.premium-contact-form { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.premium-form-group { margin-bottom: 20px; }
.premium-form-label { display: block; font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
.premium-input { width: 100%; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 15px; color: #1e293b; background: white; box-sizing: border-box; }
.premium-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.premium-submit-btn { width: 100%; background: #6366f1; color: white; font-weight: 700; font-size: 16px; padding: 14px; border: none; border-radius: 12px; cursor: pointer; transition: all 0.2s; }
.premium-submit-btn:hover { background: #4f46e5; }
</style>
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
