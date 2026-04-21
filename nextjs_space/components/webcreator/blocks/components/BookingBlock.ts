import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createBookingBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-booking", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('booking')}
        </div>
        <div class="gjs-block-label">Citas</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-booking' }
  });

  editor.DomComponents.addType('volkern-booking', {
    model: {
      defaults: {
        components: `
          <section class="volkern-booking-section">
            <div class="v-booking-card">
              <div class="v-indicator">
                <div class="v-dot active"></div><div class="v-dot"></div><div class="v-dot"></div><div class="v-dot"></div>
              </div>
              
              <div class="v-step active" data-v-step="1">
                <span class="v-step-desc">Paso 01</span>
                <h2 class="v-step-title">Selecciona el Servicio</h2>
                <div class="v-services-container">
                   <div class="v-booking-item" data-v-template="service-item">
                     <div>
                       <div style="font-weight:900; font-size:1.25rem;" data-v-field="nombre">Nombre del Servicio</div>
                       <div style="opacity:0.4; font-size:0.875rem;" data-v-field="meta">60 MIN • USD 150</div>
                     </div>
                     <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="3"><path d="M9 5l7 7-7 7"/></svg>
                   </div>
                   <div class="v-booking-item v-editor-preview">
                     <div><div style="font-weight:900; font-size:1.25rem;">Servicio de Ejemplo</div><div style="opacity:0.4; font-size:0.875rem;">30 MIN • Gratis</div></div>
                     <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="3"><path d="M9 5l7 7-7 7"/></svg>
                   </div>
                </div>
              </div>
              
              <div class="v-step" data-v-step="2">
                <span class="v-step-desc">Paso 02</span><h2 class="v-step-title">Elige el Día</h2>
                <div class="v-cal-grid" data-v-field="calendar">
                   <div class="v-cal-header">Lun</div><div class="v-cal-header">Mar</div><div class="v-cal-header">Mie</div>
                   <div class="v-cal-day">1</div><div class="v-cal-day selected">2</div><div class="v-cal-day">3</div>
                </div>
                <button class="v-back-link">← Volver</button>
              </div>

              <div class="v-step" data-v-step="3">
                <span class="v-step-desc">Paso 03</span><h2 class="v-step-title">Elige el Horario</h2>
                <div class="v-slots-grid" data-v-field="slots">
                   <div class="v-slot-btn">09:00</div><div class="v-slot-btn selected">10:00</div><div class="v-slot-btn">11:00</div>
                </div>
              </div>
              
              <div class="v-step" data-v-step="4">
                <span class="v-step-desc">Paso Final</span><h2 class="v-step-title">Tus Datos</h2>
                <input type="text" class="v-book-input" data-v-field="in-name" placeholder="Nombre completo">
                <input type="email" class="v-book-input" data-v-field="in-email" placeholder="Email de contacto">
                <div class="v-confirm-btn">Confirmar Cita</div>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const data = { service: '', serviceId: '', date: '', time: '' };
          const steps = el.querySelectorAll('[data-v-step]');
          const dots = el.querySelectorAll('.v-dot');
          const serviceTemplate = el.querySelector('[data-v-template="service-item"]');
          
          const isEditor = window.location.href.includes('/webcreator/editor/') || (window.parent && (window.parent as any).editor);

          const goToStep = (n: number) => {
            steps.forEach((s: any) => s.classList.remove('active'));
            dots.forEach((d: any) => d.classList.remove('active'));
            const target = el.querySelector(`[data-v-step="${n}"]`);
            if (target) target.classList.add('active');
            if (dots[n-1]) dots[n-1].classList.add('active');
          };

          el.querySelectorAll('[data-v-back]').forEach((btn: any) => {
            btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.vBack)));
          });

          const loadServices = async () => {
            try {
              let apiUrl = '/api/volkern?path=servicios&activo=true';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }
              const res = await fetch(apiUrl);
              const result = await res.json();
              const svs = Array.isArray(result) ? result : (result.servicios || []);
              renderSvs(svs.length ? svs : getSvsDummies());
            } catch (e) { renderSvs(getSvsDummies()); }
          };

          const getSvsDummies = () => [
            { id: '1', nombre: 'Asesoría Estratégica', duracionMinutos: 60, precio: 150, moneda: 'USD' },
            { id: '2', nombre: 'Implementación CRM', duracionMinutos: 120, precio: 300, moneda: 'USD' }
          ];

          const renderSvs = (svs: any[]) => {
            const list = el.querySelector('.v-services-container');
            if (!list || !serviceTemplate) return;
            
            if (!isEditor) list.innerHTML = '';
            else {
              serviceTemplate.style.display = 'none';
              list.querySelectorAll('.v-clone').forEach((c: any) => c.remove());
            }

            svs.forEach(s => {
              const clone = serviceTemplate.cloneNode(true) as HTMLElement;
              clone.style.display = 'flex';
              clone.classList.add('v-clone');
              clone.removeAttribute('data-v-template');
              
              const fNombre = clone.querySelector('[data-v-field="nombre"]');
              if (fNombre) fNombre.innerText = s.nombre;
              const fMeta = clone.querySelector('[data-v-field="meta"]');
              if (fMeta) fMeta.innerText = `${s.duracionMinutos} MIN • ${s.moneda} ${s.precio}`;
              
              clone.addEventListener('click', () => {
                data.service = s.nombre;
                data.serviceId = s.id;
                goToStep(2);
                renderCalendar();
              });
              list.appendChild(clone);
            });
          };

          const renderCalendar = () => {
            const cal = el.querySelector('[data-v-field="calendar"]');
            if (!cal) return;
            const days = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
            const today = new Date();
            cal.innerHTML = days.map(d => `<div class="v-cal-header">${d}</div>`).join('') +
              Array.from({length:28}, (_,i) => {
                const d = new Date();
                d.setDate(today.getDate() + i);
                return `<button class="v-cal-day" data-date="${d.toISOString().split('T')[0]}">${d.getDate()}</button>`;
              }).join('');
            
            cal.querySelectorAll('.v-cal-day').forEach((btn: any) => {
              btn.addEventListener('click', () => {
                data.date = btn.dataset.date;
                const lbl = el.querySelector('[data-v-field="sel-date"]');
                if (lbl) lbl.innerText = data.date;
                goToStep(3);
                renderSlots();
              });
            });
          };

          const renderSlots = () => {
            const container = el.querySelector('[data-v-field="slots"]');
            if (!container) return;
            const slots = ['09:00', '10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00'];
            container.innerHTML = slots.map(t => `<div class="v-slot-btn" data-time="${t}">${t}</div>`).join('');
            container.querySelectorAll('.v-slot-btn').forEach((i: any) => {
              i.addEventListener('click', () => {
                data.time = i.dataset.time;
                const sum = el.querySelector('[data-v-field="summary"]');
                if (sum) sum.innerText = `${data.service} - ${data.date} @ ${data.time}`;
                goToStep(4);
              });
            });
          };

          el.querySelector('.v-confirm-btn')?.addEventListener('click', async () => {
            const btn = el.querySelector('.v-confirm-btn');
            const originalText = btn.innerText;
            btn.innerText = 'PROCESANDO...'; btn.disabled = true;
            try {
              let apiUrl = '/api/volkern?path=citas';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }

              const nameIn = el.querySelector('[data-v-field="in-name"]');
              const emailIn = el.querySelector('[data-v-field="in-email"]');

              await fetch(apiUrl, { 
                method: 'POST', 
                headers: {'Content-Type':'application/json'}, 
                body: JSON.stringify({
                  nombre: nameIn.value, 
                  email: emailIn.value,
                  servicioId: data.serviceId,
                  fechaHora: `${data.date}T${data.time}:00Z`,
                  notas: `Cita agendada desde el Web Creator para ${data.service}`
                })
              });
              el.querySelector('.v-booking-card').innerHTML = '<div style="text-align:center;padding:6rem 0;"><h2 style="color:#6366f1;font-size:3rem;font-weight:900;">¡Listo!</h2><p style="color:white;opacity:0.6;">Cita agendada correctamente.</p></div>';
            } catch (e) { alert('Error al agendar.'); btn.innerText = originalText; btn.disabled = false; }
          });

          loadServices();
          if (isEditor) renderCalendar(); // Mostrar algo en el editor
        }
      }
    }
  });
};