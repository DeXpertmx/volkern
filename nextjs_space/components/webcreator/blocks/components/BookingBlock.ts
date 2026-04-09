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
            <style>
              .volkern-booking-section { padding: 8rem 2rem; background: transparent; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; }
              .v-booking-card { max-width: 900px; margin: 0 auto; background: #ffffff; border: 1px solid rgba(61, 61, 61, 0.1); border-radius: 4rem; padding: 4rem; min-height: 600px; display: flex; flex-direction: column; position: relative; box-shadow: 0 60px 150px -40px rgba(0,0,0,0.05); }
              
              .v-step { display: none; }
              .v-step.active { display: block; animation: vFadeIn 0.6s ease; }
              @keyframes vFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
              
              .v-indicator { display: flex; gap: 1rem; margin-bottom: 4rem; }
              .v-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(61, 61, 61, 0.1); transition: all 0.3s ease; }
              .v-dot.active { background: #6366f1; transform: scale(1.5); box-shadow: 0 0 15px #6366f1; }
              
              .v-step-title { font-size: 2.5rem; font-weight: 900; margin-bottom: 2rem; letter-spacing: -0.05em; font-style: italic; color: #3D3D3D; }
              .v-step-desc { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #6366f1; letter-spacing: 0.3em; margin-bottom: 1rem; display: block; }
              
              .v-booking-item { background: #f8fafc; border: 1px solid #3D3D3D; padding: 2rem; border-radius: 2rem; margin-bottom: 1.5rem; cursor: pointer; transition: all 0.3s ease; display: flex; justify-content: space-between; align-items: center; color: #3D3D3D; }
              .v-booking-item:hover { background: #ffffff; transform: translateX(10px); border-color: #6366f1; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
              
              .v-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.75rem; }
              .v-cal-header { font-size: 9px; font-weight: 900; text-transform: uppercase; color: #6366f1; text-align: center; margin-bottom: 1.5rem; }
              .v-cal-day { aspect-ratio: 1; background: #f8fafc; border: 1px solid rgba(61,61,61,0.05); border-radius: 1.25rem; color: #3D3D3D; font-weight: 900; font-size: 0.875rem; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; }
              .v-cal-day:hover { background: #6366f1; color: white; transform: scale(1.1); }
              .v-cal-day.selected { background: #3D3D3D; color: white; box-shadow: 0 0 30px rgba(61, 61, 61, 0.2); }
              
              .v-slots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; }
              .v-slot-btn { background: #f8fafc; border: 1px solid #3D3D3D; padding: 1.5rem; border-radius: 1.5rem; text-align: center; font-weight: 900; cursor: pointer; transition: all 0.3s ease; color: #3D3D3D; }
              .v-slot-btn:hover { background: #6366f1; color: white; transform: scale(1.05); }
              .v-slot-btn.selected { background: #3D3D3D; color: white; }
              
              .v-book-input { width: 100%; padding: 1.25rem; background: #f8fafc; border: 1px solid #3D3D3D; border-radius: 1.25rem; color: #3D3D3D; margin-bottom: 1.5rem; outline: none; transition: all 0.3s; }
              .v-book-input::placeholder { color: #3D3D3D; opacity: 0.4; }
              .v-book-input:focus { border-color: #6366f1; background: #ffffff; }
              .v-confirm-btn { width: 100%; padding: 1.5rem; background-color: #3D3D3D; color: #ffffff; border-radius: 1.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; border: none; cursor: pointer; margin-top: 1rem; text-align: center; transition: all 0.3s; }
              .v-back-link { margin-top: auto; color: #3D3D3D; opacity: 0.4; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; cursor: pointer; background: none; border: none; padding: 1rem 0; }
            </style>
            
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