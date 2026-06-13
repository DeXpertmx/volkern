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
          <style>
            .volkern-adv-section { width:100%; display:flex; justify-content:center; padding:20px 16px; background:#f8fafc; font-family:system-ui,-apple-system,sans-serif; }
            .volkern-adv-card { width:100%; max-width:520px; background:#fff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04); overflow:hidden; }
            .volkern-adv-header { background:linear-gradient(135deg,#6366f1,#8b5cf6); padding:28px 28px 24px; text-align:center; }
            .volkern-adv-icon { width:48px; height:48px; margin:0 auto 12px; background:rgba(255,255,255,0.2); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:22px; }
            .volkern-adv-title { margin:0 0 4px; font-size:1.35rem; font-weight:700; color:var(--v-title-color,#fff); }
            .volkern-adv-subtitle { margin:0; font-size:0.85rem; color:rgba(255,255,255,0.8); }
            .volkern-adv-form { padding:24px 28px 28px; display:flex; flex-direction:column; gap:20px; background:#fff; }
            .v-field-group { position:relative; }
            .v-field-input { width:100%; padding:14px 14px 10px; font-size:0.9rem; border:1.5px solid #e2e8f0; border-radius:10px; outline:none; background:#fafbfc; transition:border-color 0.2s,box-shadow 0.2s; box-sizing:border-box; font-family:inherit; color:#0f172a; }
            .v-field-input:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); background:#fff; }
            .v-field-input::placeholder { color:transparent; }
            .v-field-textarea { resize:vertical; min-height:72px; font-family:inherit; }
            .v-field-label { position:absolute; left:14px; top:14px; font-size:0.9rem; color:#64748b; pointer-events:none; transition:all 0.2s; background:transparent; padding:0 4px; }
            .v-field-input:focus + .v-field-label,
            .v-field-input:not(:placeholder-shown) + .v-field-label { top:-8px; left:10px; font-size:0.7rem; color:#6366f1; background:#fff; font-weight:500; }
            .v-field-input:not(:focus):not(:placeholder-shown) + .v-field-label { color:#64748b; }
            .v-field-focus { display:none; }
            .volkern-adv-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:13px 28px; background:var(--v-accent,#6366f1); color:#fff; border:none; border-radius:10px; font-size:0.95rem; font-weight:600; cursor:pointer; transition:opacity 0.2s,transform 0.15s; font-family:inherit; width:100%; }
            .volkern-adv-btn:hover { opacity:0.92; transform:translateY(-1px); }
            .volkern-adv-btn:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
            .volkern-adv-btn-icon { flex-shrink:0; }
            .v-success-overlay { display:none; padding:40px 28px; text-align:center; background:#f0fdf4; }
            .v-check-icon { width:52px; height:52px; margin:0 auto 14px; background:#22c55e; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; }
            .v-success-title { margin:0 0 6px; font-size:1.2rem; font-weight:700; color:#166534; }
            .v-success-text { margin:0; font-size:0.85rem; color:#16a34a; }
          </style>
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
