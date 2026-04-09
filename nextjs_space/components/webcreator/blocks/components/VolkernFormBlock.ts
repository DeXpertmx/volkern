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
            value: '#3D3D3D'
          },
          {
            type: 'text',
            label: 'Mensaje de Éxito',
            name: 'data-success-msg',
            value: '¡Datos recibidos correctamente!'
          }
        ],
        components: `
          <div class="volkern-adv-container">
            <style>
              .volkern-adv-container { 
                padding: 4rem 2rem; 
                background: transparent; 
                font-family: 'Inter', sans-serif; 
                display: flex; 
                justify-content: center;
              }
              .volkern-adv-card { 
                width: 100%;
                max-width: 550px; 
                background: #ffffff; 
                border: 1px solid rgba(61, 61, 61, 0.1); 
                border-radius: 2.5rem; 
                padding: 3.5rem; 
                box-shadow: 0 50px 100px -20px rgba(0,0,0,0.05); 
                color: #3D3D3D;
              }
              .volkern-adv-header { margin-bottom: 2.5rem; text-align: center; }
              .volkern-adv-title { 
                font-size: 2.25rem; 
                font-weight: 800; 
                letter-spacing: -0.04em; 
                margin-bottom: 0.5rem; 
                color: var(--v-title-color, #3D3D3D);
              }
              .volkern-adv-subtitle { font-size: 0.95rem; opacity: 0.6; font-weight: 500; }
              
              .v-field-group { position: relative; margin-bottom: 1.75rem; }
              .v-field-input { 
                width: 100%; 
                background: #f8fafc; 
                border: 1px solid #3D3D3D; 
                border-radius: 1.25rem; 
                padding: 1.25rem; 
                color: #3D3D3D; 
                font-size: 1rem; 
                transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                outline: none;
              }
              .v-field-input::placeholder { color: #3D3D3D; opacity: 0.3; }
              .v-field-input:focus { 
                background: #ffffff; 
                border-color: var(--v-accent, #6366f1);
              }
              .v-field-label { 
                position: absolute; 
                left: 1.25rem; 
                top: 1.25rem; 
                font-size: 0.85rem; 
                font-weight: 600; 
                color: #3D3D3D;
                opacity: 0.4;
                pointer-events: none; 
                transition: all 0.3s ease;
                text-transform: uppercase;
                letter-spacing: 0.05em;
              }
              .v-field-input:focus ~ .v-field-label,
              .v-field-input:not(:placeholder-shown) ~ .v-field-label {
                transform: translateY(-2.2rem) scale(0.85);
                color: var(--v-accent, #6366f1);
                opacity: 1;
              }
              
              .volkern-adv-btn { 
                width: 100%; 
                padding: 1.5rem; 
                background: #3D3D3D; 
                color: white; 
                border: none; 
                border-radius: 1.5rem; 
                font-weight: 800; 
                text-transform: uppercase; 
                letter-spacing: 0.2em; 
                cursor: pointer; 
                transition: all 0.4s;
                margin-top: 1rem;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
              }
              .volkern-adv-btn:hover { 
                transform: translateY(-4px); 
                background: var(--v-accent, #6366f1);
                box-shadow: 0 20px 40px -10px var(--v-accent, #6366f1);
              }
              .v-success-overlay { 
                text-align: center; 
                padding: 2rem 0; 
                display: none;
                animation: vFadeUp 0.6s ease forwards;
              }
              @keyframes vFadeUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .v-check-icon {
                width: 70px; height: 70px; 
                background: rgba(34, 197, 94, 0.1); 
                color: #22c55e; 
                border-radius: 50%; 
                margin: 0 auto 1.5rem; 
                display: flex; align-items: center; justify-content: center;
              }
            </style>
            
            <div class="volkern-adv-card">
              <div class="volkern-adv-header">
                <h2 class="volkern-adv-title" data-gjs-editable="true" data-gjs-selectable="true">Contáctanos</h2>
                <p class="volkern-adv-subtitle" data-gjs-editable="true" data-gjs-selectable="true">Localización y mapeo inteligente activado</p>
              </div>
              
              <form class="volkern-adv-form" data-gjs-droppable="true" data-gjs-custom-name="Contenedor de Formulario">
                <div class="v-field-group">
                  <input type="text" class="v-field-input" placeholder=" " data-volkern-map="nombre" required>
                  <label class="v-field-label">Nombre Completo</label>
                </div>
                
                <div class="v-field-group">
                  <input type="email" class="v-field-input" placeholder=" " data-volkern-map="email" required>
                  <label class="v-field-label">Correo Electrónico</label>
                </div>
                
                <div class="v-field-group">
                  <input type="tel" class="v-field-input" placeholder=" " data-volkern-map="telefono">
                  <label class="v-field-label">Teléfono / WhatsApp</label>
                </div>
                
                <div class="v-field-group">
                  <textarea class="v-field-input" placeholder=" " data-volkern-map="notas" rows="3" style="resize:none;"></textarea>
                  <label class="v-field-label">Mensaje o Notas</label>
                </div>
                
                <button type="submit" class="volkern-adv-btn">Enviar Información</button>
              </form>
              
              <div class="v-success-overlay">
                <div class="v-check-icon">
                  <svg width="35" height="35" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h3 style="font-size: 2rem; font-weight: 800;">¡Éxito!</h3>
                <p class="v-success-text" style="opacity:0.6; margin-top:0.5rem;">Tu solicitud ha sido procesada.</p>
              </div>
            </div>
          </div>
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
            if (form.querySelector('button')) form.querySelector('button').innerText = btnText;
            if (successText) successText.innerText = successMsg;
          };

          form.addEventListener('submit', async (e: any) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = 'PROCESANDO...';

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
              btn.innerText = originalText;
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
