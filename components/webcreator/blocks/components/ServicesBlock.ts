import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createServicesBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-services", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('services')}
        </div>
        <div class="gjs-block-label">Servicios</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-services' }
  });

  editor.DomComponents.addType('volkern-services', {
    model: {
      defaults: {
        traits: [
          {
            type: 'color',
            label: 'Color de Texto (General)',
            name: 'data-color-text',
            value: '#ffffff'
          },
          {
            type: 'color',
            label: 'Color de Acento',
            name: 'data-color-accent',
            value: '#6366f1'
          },
          {
             type: 'text',
             label: 'Botón: Texto',
             name: 'data-btn-text',
             value: 'Reservar ahora'
          },
          {
            type: 'color',
            label: 'Botón: Fuente',
            name: 'data-btn-color-text',
            value: '#000000'
          },
          {
            type: 'color',
            label: 'Botón: Fondo',
            name: 'data-btn-bg-color',
            value: '#ffffff'
          },
        ],
        components: `
          <section class="volkern-services-section">
            <style>
              .volkern-services-section { padding: 8rem 2rem; background: transparent; color: var(--v-text, white); font-family: 'Inter', sans-serif; position: relative; overflow: hidden; }
              .volkern-services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2.5rem; max-width: 1200px; margin: 0 auto; position: relative; }
              .volkern-service-card { background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 2.5rem; padding: 3rem; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); display: flex; flex-direction: column; height: 100%; }
              .volkern-service-card:hover { transform: translateY(-15px); background: rgba(255, 255, 255, 0.04); border-color: var(--v-accent, #6366f1); box-shadow: 0 40px 100px -30px rgba(99, 102, 241, 0.2); }
              .volkern-service-icon { width: 64px; height: 64px; background: linear-gradient(135deg, var(--v-accent, #6366f1), #818cf8); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem; box-shadow: 0 10px 40px -10px rgba(99, 102, 241, 0.5); }
              .volkern-service-title { font-size: 1.75rem; font-weight: 900; margin-bottom: 1rem; letter-spacing: -0.05em; font-style: italic; color: inherit; }
              .volkern-service-desc { color: var(--v-text, white); opacity: 0.6; line-height: 1.7; margin-bottom: 2.5rem; font-weight: 500; }
              .volkern-service-footer { margin-top: auto; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 2rem; }
              .volkern-price-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; }
              .volkern-price-label { display: block; font-size: 10px; font-weight: 900; text-transform: uppercase; color: var(--v-accent, #818cf8); letter-spacing: 0.2em; margin-bottom: 0.5rem; }
              .volkern-price-val { font-size: 2.25rem; font-weight: 900; letter-spacing: -0.05em; color: inherit; }
              .volkern-price-currency { font-size: 1rem; color: var(--v-text, white); opacity: 0.3; margin-left: 0.5rem; }
              .volkern-reserve-btn { width: 100%; padding: 1.25rem !important; background-color: var(--v-btn-bg, #ffffff) !important; color: var(--v-btn-text, #000000) !important; border: none !important; border-radius: 1.25rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; cursor: pointer; transition: all 0.3s; }
              .volkern-reserve-btn:hover { filter: brightness(0.9); transform: scale(1.02); }
              .volkern-loading { padding: 4rem; text-align: center; color: rgba(255,255,255,0.2); font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; border: 1px dashed rgba(255,255,255,0.1); border-radius: 2rem; }
            </style>
            <div class="volkern-services-grid">
              <div class="volkern-loading">Cargando servicios optimizados...</div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const container = el.querySelector('.volkern-services-grid');
          if (!container) return;

          const applyConfig = () => {
             const textColor = el.getAttribute('data-color-text') || '#ffffff';
             const accentColor = el.getAttribute('data-color-accent') || '#6366f1';
             const btnTextColor = el.getAttribute('data-btn-color-text') || '#000000';
             const btnBgColor = el.getAttribute('data-btn-bg-color') || '#ffffff';
             
             el.style.setProperty('--v-text', textColor);
             el.style.setProperty('--v-accent', accentColor);
             el.style.setProperty('--v-btn-text', btnTextColor);
             el.style.setProperty('--v-btn-bg', btnBgColor);
          };
          
          const loadServices = async () => {
            let apiUrl = '/api/volkern?path=servicios&activo=true';
            try {
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }

              const res = await fetch(apiUrl);
              if (!res.ok) throw new Error('API Error');
              const data = await res.json();
              if (data && (Array.isArray(data) || data.servicios)) { 
                const services = Array.isArray(data) ? data : data.servicios;
                if (services.length > 0) render(services); else throw new Error('No services');
              } else { throw new Error('No services'); }
            } catch (err) {
              render([
                { id: '1', nombre: 'Asesoría Estratégica', precio: 150, moneda: 'USD', duracionMinutos: 60, descripcion: 'Diagnóstico profundo de tu modelo de negocio.' },
                { id: '2', nombre: 'Implementación CRM', precio: 300, moneda: 'USD', duracionMinutos: 120, descripcion: 'Configuración experta de tu ecosistema de ventas.' },
                { id: '3', nombre: 'Optimización de Leads', precio: 100, moneda: 'USD', duracionMinutos: 45, descripcion: 'Maximiza la conversión de tus prospectos.' }
              ]);
            }
          };

          const render = (services: any[]) => {
            const btnText = el.getAttribute('data-btn-text') || 'Reservar ahora';
            container.innerHTML = services.map(s => `
              <div class="volkern-service-card">
                <div class="volkern-service-icon">
                  <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <h3 class="volkern-service-title">${s.nombre}</h3>
                <p class="volkern-service-desc">${s.descripcion || 'Solución premium personalizada.'}</p>
                <div class="volkern-service-footer">
                  <div class="volkern-price-row">
                    <div>
                      <span class="volkern-price-label">Inversión</span>
                      <span class="volkern-price-val">${s.moneda === 'USD' ? '$' : ''}${s.precio}<span class="volkern-price-currency">${s.moneda}</span></span>
                    </div>
                    <div style="text-align: right;">
                      <span class="volkern-price-label">Sesión</span>
                      <span style="font-size: 0.875rem; font-weight: 900; color: rgba(255,255,255,0.5);">${s.duracionMinutos} MIN</span>
                    </div>
                  </div>
                  <button class="volkern-reserve-btn" data-service-id="${s.id}">${btnText}</button>
                </div>
              </div>
            `).join('');

            container.querySelectorAll('.volkern-reserve-btn').forEach((btn: any) => {
              btn.addEventListener('click', () => {
                const serviceId = btn.getAttribute('data-service-id');
                document.dispatchEvent(new CustomEvent('volkern:select-service', { 
                  detail: { serviceId } 
                }));
                const bookingSection = document.querySelector('.volkern-booking-section');
                if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
              });
            });
            applyConfig();
          };

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              const attr = mutation.attributeName;
              if (attr && attr.startsWith('data-')) {
                applyConfig();
                if (attr === 'data-btn-text') {
                  const newText = el.getAttribute('data-btn-text') || 'Reservar ahora';
                  el.querySelectorAll('.volkern-reserve-btn').forEach((btn: any) => btn.innerText = newText);
                }
              }
            });
          });
          observer.observe(el, { attributes: true });
          
          loadServices();
        }
      }
    }
  });
};