import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createVolkernFormBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-form-advanced", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('contact')}
        </div>
        <div class="gjs-block-label">Formulario Avanzado</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-form-advanced' }
  });

  editor.DomComponents.addType("volkern-form-advanced", {
    model: {
      defaults: {
        traits: [
          {
            type: 'select',
            label: 'Destino de Datos',
            name: 'data-volkern-target',
            options: [
              { id: 'leads', name: 'Prospectos (Leads)' },
              { id: 'productos', name: 'Catálogo de Productos' },
              { id: 'servicios', name: 'Servicios' },
            ],
            value: 'leads'
          },
          {
            type: 'text',
            label: 'Título del Formulario',
            name: 'data-form-title',
            value: 'Contáctanos'
          },
          {
            type: 'color',
            label: 'Color de Acento',
            name: 'data-color-accent',
            value: '#6366f1'
          },
          {
            type: 'text',
            label: 'Texto del Botón',
            name: 'data-btn-text',
            value: 'Enviar Info'
          },
          {
            type: 'color',
            label: 'Color del Título',
            name: 'data-title-color',
            value: '#ffffff'
          },
          {
            type: 'text',
            label: 'Mensaje de Éxito',
            name: 'data-success-msg',
            value: '¡Datos recibidos correctamente!'
          }
        ],
        components: `
          <section class="volkern-adv-section">
            <div class="volkern-adv-card">
              <div class="volkern-adv-header">
                <div class="volkern-adv-icon">✉</div>
                <h2 class="volkern-adv-title" data-gjs-editable="true" data-gjs-selectable="true">Contáctanos</h2>
                <p class="volkern-adv-subtitle" data-gjs-editable="true" data-gjs-selectable="true">Déjanos tus datos y te contactaremos</p>
              </div>
              
              <form class="volkern-adv-form" data-gjs-droppable="true" data-gjs-custom-name="Contenedor de Formulario">
                <div class="v-field-group">
                  <input type="text" class="v-field-input" placeholder=" " data-volkern-map="nombre" required>
                  <label class="v-field-label">Nombre Completo</label>
                  <span class="v-field-focus"></span>
                </div>
                
                <div class="v-field-group">
                  <input type="email" class="v-field-input" placeholder=" " data-volkern-map="email" required>
                  <label class="v-field-label">Correo Electrónico</label>
                  <span class="v-field-focus"></span>
                </div>
                
                <div class="v-field-group">
                  <input type="tel" class="v-field-input" placeholder=" " data-volkern-map="telefono">
                  <label class="v-field-label">Teléfono / WhatsApp</label>
                  <span class="v-field-focus"></span>
                </div>
                
                <div class="v-field-group">
                  <textarea class="v-field-input v-field-textarea" placeholder=" " data-volkern-map="notas" rows="3"></textarea>
                  <label class="v-field-label">Mensaje o Notas</label>
                  <span class="v-field-focus"></span>
                </div>
                
                <button type="submit" class="volkern-adv-btn">
                  <span class="volkern-adv-btn-text">Enviar Información</span>
                  <svg class="volkern-adv-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                </button>
              </form>
              
              <div class="v-success-overlay">
                <div class="v-check-icon">
                  <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h3 class="v-success-title">¡Información Recibida!</h3>
                <p class="v-success-text">Gracias, nos pondremos en contacto contigo pronto.</p>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const form = el.querySelector('form');
          const header = el.querySelector('.volkern-adv-header');
          const successOverlay = el.querySelector('.v-success-overlay');
          const successText = el.querySelector('.v-success-text');
          
          if (!form) return;

          const applyStyles = () => {
            const accent = el.getAttribute('data-color-accent') || '#6366f1';
            const title = el.getAttribute('data-form-title') || 'Contáctanos';
            const titleColor = el.getAttribute('data-title-color') || '#ffffff';
            const btnText = el.getAttribute('data-btn-text') || 'Enviar Información';
            const successMsg = el.getAttribute('data-success-msg') || '¡Datos recibidos correctamente!';
            
            el.style.setProperty('--v-accent', accent);
            el.style.setProperty('--v-title-color', titleColor);
            
            if (header.querySelector('h2') && !header.querySelector('h2').hasAttribute('data-gjs-type')) {
               header.querySelector('h2').innerText = title;
            }
            const btnTextEl = form.querySelector('.volkern-adv-btn-text');
            if (btnTextEl) btnTextEl.innerText = btnText;
            if (successText) successText.innerText = successMsg;
          };

          form.addEventListener('submit', async (e: any) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            const btnTextEl = form.querySelector('.volkern-adv-btn-text');
            const originalText = btnTextEl ? btnTextEl.innerText : btn.innerText;
            btn.disabled = true;
            if (btnTextEl) btnTextEl.innerText = 'PROCESANDO...';

            const target = el.getAttribute('data-volkern-target') || 'leads';
            const formData: Record<string, any> = {};
            
            // Recolectar datos basados en el atributo de mapeo (priorizar data-volkern-map)
            form.querySelectorAll('[data-volkern-map], [data-map]').forEach((input: any) => {
              const mapId = input.getAttribute('data-volkern-map') || input.getAttribute('data-map');
              if (mapId) formData[mapId] = input.value;
            });

            try {
              let apiUrl = `/api/volkern?path=captacion/${target}`;
              // Intentar resolver el origen para evitar fallos en el preview del editor
              let origin = '';
              try { 
                origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') 
                    ? window.parent.location.origin 
                    : window.location.origin; 
              } catch (e) { origin = window.location.origin; }
              
              if (origin && !origin.startsWith('about')) {
                apiUrl = origin + apiUrl;
              }

              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...formData,
                  fuente: 'Formulario Avanzado Volkern'
                })
              });

              if (response.ok) {
                form.style.display = 'none';
                header.style.display = 'none';
                successOverlay.style.display = 'block';
              } else {
                throw new Error('Server Error');
              }
            } catch (err) {
              alert('Error al enviar el formulario. Por favor, revisa tu conexión.');
              btn.disabled = false;
              if (btnTextEl) btnTextEl.innerText = originalText;
            }
          });

          // Reactividad en tiempo real para el editor
          const observer = new MutationObserver(() => applyStyles());
          observer.observe(el, { attributes: true });
          applyStyles();
        }
      }
    }
  });
};
