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
                <div class="v-step-num active" data-v-step-num="1">1</div>
                <div class="v-step-line" data-v-step-line="1-2"></div>
                <div class="v-step-num" data-v-step-num="2">2</div>
                <div class="v-step-line" data-v-step-line="2-3"></div>
                <div class="v-step-num" data-v-step-num="3">3</div>
                <div class="v-step-line" data-v-step-line="3-4"></div>
                <div class="v-step-num" data-v-step-num="4">4</div>
              </div>
              
              <div class="v-step active" data-v-step="1">
                <span class="v-step-desc">Paso 01</span>
                <h2 class="v-step-title">Selecciona el Servicio</h2>
                <p class="v-step-sub">Elige el servicio que deseas contratar</p>
                <div class="v-services-container">
                   <div class="v-booking-item" data-v-template="service-item">
                     <div class="v-booking-item-left">
                       <div class="v-booking-icon">✦</div>
                       <div class="v-booking-info">
                         <div class="v-booking-name" data-v-field="nombre">Nombre del Servicio</div>
                         <div class="v-booking-meta" data-v-field="meta">60 MIN</div>
                       </div>
                     </div>
                     <div>
                       <span class="v-booking-price" data-v-field="precio">$150</span>
                       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                     </div>
                   </div>
                   <div class="v-booking-item v-editor-preview">
                     <div class="v-booking-item-left">
                       <div class="v-booking-icon">✦</div>
                       <div class="v-booking-info">
                         <div class="v-booking-name">Servicio de Ejemplo</div>
                         <div class="v-booking-meta">30 MIN</div>
                       </div>
                     </div>
                     <div>
                       <span class="v-booking-price">Gratis</span>
                       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                     </div>
                   </div>
                </div>
              </div>
              
              <div class="v-step" data-v-step="2">
                <span class="v-step-desc">Paso 02</span>
                <h2 class="v-step-title">Elige el Día</h2>
                <p class="v-step-sub">Selecciona una fecha disponible</p>
                <div class="v-cal-grid" data-v-field="calendar">
                   <div class="v-cal-header">Lun</div><div class="v-cal-header">Mar</div><div class="v-cal-header">Mié</div>
                   <div class="v-cal-header">Jue</div><div class="v-cal-header">Vie</div><div class="v-cal-header">Sáb</div>
                   <div class="v-cal-header">Dom</div>
                </div>
                <button class="v-back-link" data-v-back="1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                  Volver a servicios
                </button>
              </div>

              <div class="v-step" data-v-step="3">
                <span class="v-step-desc">Paso 03</span>
                <h2 class="v-step-title">Elige el Horario</h2>
                <p class="v-step-sub">Selecciona un horario disponible</p>
                <div class="v-slots-grid" data-v-field="slots">
                   <div class="v-slot-btn">09:00</div><div class="v-slot-btn selected">10:00</div><div class="v-slot-btn">11:00</div>
                </div>
                <button class="v-back-link" data-v-back="2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                  Volver a fechas
                </button>
              </div>
              
              <div class="v-step" data-v-step="4">
                <span class="v-step-desc">Paso Final</span>
                <h2 class="v-step-title">Tus Datos</h2>
                <p class="v-step-sub">Completa tus datos para confirmar la cita</p>
                <div class="v-booking-summary">
                  <div class="v-summary-row">
                    <span class="v-summary-label">Servicio</span>
                    <span class="v-summary-value" data-v-field="summary-service">—</span>
                  </div>
                  <div class="v-summary-row">
                    <span class="v-summary-label">Fecha</span>
                    <span class="v-summary-value" data-v-field="summary-date">—</span>
                  </div>
                  <div class="v-summary-row">
                    <span class="v-summary-label">Horario</span>
                    <span class="v-summary-value" data-v-field="summary-time">—</span>
                  </div>
                </div>
                <div class="v-form-group">
                  <label class="v-book-label">Nombre completo</label>
                  <input type="text" class="v-book-input" data-v-field="in-name" placeholder="Ej: Juan Pérez">
                </div>
                <div class="v-form-group">
                  <label class="v-book-label">Email de contacto</label>
                  <input type="email" class="v-book-input" data-v-field="in-email" placeholder="Ej: juan@email.com">
                </div>
                <div class="v-confirm-btn">Confirmar Cita</div>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const data = { service: '', serviceId: '', date: '', time: '' };
          const steps = el.querySelectorAll('[data-v-step]');
          const stepNums = el.querySelectorAll('[data-v-step-num]');
          const stepLines = el.querySelectorAll('[data-v-step-line]');
          const serviceTemplate = el.querySelector('[data-v-template="service-item"]');
          
          const isEditor = window.location.href.includes('/webcreator/editor/') || (window.parent && (window.parent as any).editor);

          const goToStep = (n: number) => {
            steps.forEach((s: any) => s.classList.remove('active'));
            const target = el.querySelector(`[data-v-step="${n}"]`);
            if (target) target.classList.add('active');

            stepNums.forEach((num: any) => {
              const idx = parseInt(num.dataset.vStepNum);
              num.classList.remove('active', 'completed');
              if (idx === n) num.classList.add('active');
              else if (idx < n) num.classList.add('completed');
            });
            stepLines.forEach((line: any) => {
              const [, end] = line.dataset.vStepLine.split('-').map(Number);
              line.classList.toggle('completed', end <= n);
            });
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
              if (fMeta) fMeta.innerText = `${s.duracionMinutos} MIN`;
              const fPrecio = clone.querySelector('[data-v-field="precio"]');
              if (fPrecio) fPrecio.innerText = `${s.moneda} ${s.precio}`;
              
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
            const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const startOffset = firstDay.getDay();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

            cal.innerHTML = days.map(d => `<div class="v-cal-header">${d}</div>`).join('') +
              Array.from({length: startOffset}, () => '<div></div>').join('') +
              Array.from({length: daysInMonth}, (_, i) => {
                const day = i + 1;
                const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isPast = new Date(dateStr) < new Date(today.toDateString());
                const isToday = dateStr === today.toISOString().split('T')[0];
                return `<button class="v-cal-day${isPast ? '' : ''}${isToday ? ' selected' : ''}" data-date="${dateStr}"${isPast ? ' disabled' : ''}>${day}</button>`;
              }).join('');
            
            cal.querySelectorAll('.v-cal-day:not([disabled])').forEach((btn: any) => {
              btn.addEventListener('click', () => {
                cal.querySelectorAll('.v-cal-day.selected').forEach((s: any) => s.classList.remove('selected'));
                btn.classList.add('selected');
                data.date = btn.dataset.date;
                goToStep(3);
                renderSlots();
              });
            });
          };

          const renderSlots = () => {
            const container = el.querySelector('[data-v-field="slots"]');
            if (!container) return;
            const slots = ['09:00', '10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00'];
            container.innerHTML = slots.map(t => `<button class="v-slot-btn" data-time="${t}">${t}</button>`).join('');
            container.querySelectorAll('.v-slot-btn').forEach((i: any) => {
              i.addEventListener('click', () => {
                container.querySelectorAll('.v-slot-btn.selected').forEach((s: any) => s.classList.remove('selected'));
                i.classList.add('selected');
                data.time = i.dataset.time;
                const sumService = el.querySelector('[data-v-field="summary-service"]');
                if (sumService) sumService.innerText = data.service;
                const sumDate = el.querySelector('[data-v-field="summary-date"]');
                if (sumDate) sumDate.innerText = data.date;
                const sumTime = el.querySelector('[data-v-field="summary-time"]');
                if (sumTime) sumTime.innerText = data.time;
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
              el.querySelector('.v-booking-card').innerHTML = '<div style="text-align:center;padding:5rem 2rem;"><div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;font-size:1.75rem;">✓</div><h2 style="color:#fff;font-size:2rem;font-weight:800;margin-bottom:0.5rem;">¡Cita Confirmada!</h2><p style="color:rgba(255,255,255,0.4);font-size:1rem;">Te enviaremos un recordatorio a tu email.</p></div>';
            } catch (e) { alert('Error al agendar.'); btn.innerText = originalText; btn.disabled = false; }
          });

          loadServices();
          if (isEditor) renderCalendar(); // Mostrar algo en el editor
        }
      }
    }
  });
};