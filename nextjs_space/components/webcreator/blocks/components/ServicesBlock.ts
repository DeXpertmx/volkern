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
            value: '#3D3D3D'
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
            value: '#ffffff'
          },
          {
            type: 'color',
            label: 'Botón: Fondo',
            name: 'data-btn-bg-color',
            value: '#3D3D3D'
          },
        ],
        components: `
          <section class="volkern-services-section">
            <div class="volkern-services-grid">
              <div class="v-service-card" data-v-template="service">
                <div class="v-icon-box">
                  <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <h3 class="v-service-title" data-v-field="nombre">Asesoría Estratégica</h3>
                <p class="v-service-desc" data-v-field="descripcion">Diagnóstico profundo de tu modelo de negocio para escalar resultados.</p>
                <div class="v-service-price">
                  <span data-v-field="precio">150</span> <span data-v-field="moneda">USD</span>
                </div>
                <div class="v-service-btn">Reservar</div>
              </div>

              <!-- Tarjetas adicionales para visualización en el editor -->
              <div class="v-service-card v-editor-preview">
                <div class="v-icon-box">
                  <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20m10-10H2"/></svg>
                </div>
                <h3 class="v-service-title">Configuración CRM</h3>
                <p class="v-service-desc">Personalización total de tu embudo de ventas y automatización.</p>
                <div class="v-service-price">300 <span>USD</span></div>
                <div class="v-service-btn">Reservar</div>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const container = el.querySelector('.volkern-services-grid');
          const template = el.querySelector('[data-v-template="service"]');
          if (!container || !template) return;

          const isEditor = window.location.href.includes('/webcreator/editor/') || (window.parent && (window.parent as any).editor);

          const load = async () => {
            try {
              let apiUrl = '/api/volkern?path=servicios&activo=true';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }
              const res = await fetch(apiUrl);
              const data = await res.json();
              const services = Array.isArray(data) ? data : (data.servicios || []);
              if (services.length) render(services);
            } catch (e) {
              // En producción usamos dummies si falla, en editor no tocamos nada para permitir estilos
              if (!isEditor) render(getDummies());
            }
          };

          const getDummies = () => [
            { nombre: 'Servicio A', precio: '100', moneda: 'USD', descripcion: 'Descripción del servicio A' },
            { nombre: 'Servicio B', precio: '200', moneda: 'USD', descripcion: 'Descripción del servicio B' }
          ];

          const render = (list: any[]) => {
            // En el editor, ocultamos las de preview estáticas
            if (isEditor) {
               el.querySelectorAll('.v-editor-preview').forEach((p: any) => p.style.display = 'none');
            } else {
               container.innerHTML = '';
            }

            list.forEach((s: any) => {
              const clone = template.cloneNode(true) as HTMLElement;
              clone.style.display = 'flex';
              clone.removeAttribute('data-v-template');

              const btn = clone.querySelector('.v-reserve-btn');
              if (btn) {
                btn.setAttribute('data-service-id', s.id);
                btn.addEventListener('click', () => {
                  const serviceId = btn.getAttribute('data-service-id');
                  document.dispatchEvent(new CustomEvent('volkern:select-service', { detail: { serviceId } }));
                  const bookingSection = document.querySelector('.volkern-booking-section');
                  if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
                });
              }

              container.appendChild(clone);
            });
          };

          loadServices();
        }
      }
    }
  });
};