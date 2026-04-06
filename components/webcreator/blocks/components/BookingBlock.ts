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
             value: 'Confirmar Mi Cita'
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
          <section class="volkern-booking-section">
            <style>
              .volkern-booking-section { padding: 8rem 2rem; background: transparent; color: var(--v-text, white); font-family: 'Inter', sans-serif; position: relative; overflow: hidden; }
              .volkern-booking-card { max-width: 900px; margin: 0 auto; background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 4rem; padding: 4rem; min-height: 600px; display: flex; flex-direction: column; position: relative; box-shadow: 0 60px 150px -40px rgba(0,0,0,0.8); }
              .volkern-step { display: none; }
              .volkern-step.active { display: block; animation: fadeIn 0.6s ease; }
              @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
              .step-indicator { display: flex; gap: 1rem; margin-bottom: 4rem; }
              .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.1); transition: all 0.3s ease; }
              .dot.active { background: var(--v-accent, #6366f1); transform: scale(1.5); box-shadow: 0 0 15px var(--v-accent, #6366f1); }
              .volkern-step-title { font-size: 2.5rem; font-weight: 900; margin-bottom: 2rem; letter-spacing: -0.05em; font-style: italic; color: inherit; }
              .volkern-step-desc { font-size: 11px; font-weight: 900; text-transform: uppercase; color: var(--v-accent, #818cf8); letter-spacing: 0.3em; margin-bottom: 1rem; display: block; }
              .service-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 2rem; border-radius: 2rem; margin-bottom: 1.5rem; cursor: pointer; transition: all 0.3s ease; display: flex; justify-content: space-between; align-items: center; }
              .service-item:hover { background: rgba(255,255,255,0.08); transform: translateX(10px); border-color: var(--v-accent, #6366f1); }
              .service-name { font-weight: 900; font-size: 1.25rem; color: inherit; }
              .service-meta { color: var(--v-text, white); opacity: 0.4; font-size: 0.875rem; font-weight: 500; }
              .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.75rem; }
              .cal-day-header { font-size: 9px; font-weight: 900; text-transform: uppercase; color: var(--v-accent, #6366f1); text-align: center; margin-bottom: 1.5rem; }
              .cal-day { aspect-ratio: 1; background: rgba(255,255,255,0.03); border: none; border-radius: 1.25rem; color: var(--v-text, white); font-weight: 900; font-size: 0.875rem; cursor: pointer; transition: all 0.3s ease; }
              .cal-day:hover { background: var(--v-accent, rgba(99, 102, 241, 0.3)); transform: scale(1.1); color: white; }
              .cal-day.selected { background: var(--v-accent, #6366f1); box-shadow: 0 0 30px rgba(99, 102, 241, 0.4); color: white; }
              .slots-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; }
              .slot-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 1.5rem; text-align: center; font-weight: 900; cursor: pointer; transition: all 0.3s ease; color: inherit; }
              .slot-item:hover { background: var(--v-accent, #6366f1); transform: scale(1.05); color: white; }
              .volkern-input { width: 100%; padding: 1.25rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 1.25rem; color: white; margin-bottom: 1.5rem; outline: none; transition: border-color 0.3s; }
              .volkern-input:focus { border-color: var(--v-accent, #6366f1); }
              .back-btn { margin-top: auto; color: var(--v-text, white); opacity: 0.3; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; cursor: pointer; transition: all 0.3s; background: none; border: none; padding: 1rem 0; width: fit-content; text-align: left; }
              .back-btn:hover { color: var(--v-accent, #818cf8); opacity: 1; }
              .confirm-btn { width: 100%; padding: 1.5rem !important; background-color: var(--v-btn-bg, #ffffff) !important; color: var(--v-btn-text, #000000) !important; border-radius: 1.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; border: none !important; cursor: pointer; margin-top: 1rem; transition: all 0.3s; shadow: 0 10px 20px rgba(0,0,0,0.2); }
              .confirm-btn:hover { filter: brightness(0.9); transform: translateY(-3px); }
            </style>
            <div class="volkern-booking-card">
              <div class="step-indicator">
                <div class="dot active"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
              </div>
              <div class="volkern-step active" id="step1">
                <span class="volkern-step-desc">Paso 01</span>
                <h2 class="volkern-step-title">Selecciona el Servicio</h2>
                <div class="services-list">
                  <div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.2); font-weight: 900; text-transform: uppercase; letter-spacing: 0.2rem;">Cargando...</div>
                </div>
              </div>
              <div class="volkern-step" id="step2">
                <span class="volkern-step-desc">Paso 02</span>
                <h2 class="volkern-step-title">Elige el Día</h2>
                <div class="calendar-grid"></div>
                <button class="back-btn" data-back="1">← Volver a Servicios</button>
              </div>
              <div class="volkern-step" id="step3">
                <span class="volkern-step-desc">Paso 03</span>
                <h2 class="volkern-step-title">Define el Horario</h2>
                <p style="margin-bottom: 2rem; color: var(--v-text, white); opacity: 0.5; font-weight: 500;">Disponibilidad para el <span id="sel-date-label">...</span>:</p>
                <div class="slots-container"></div>
                <button class="back-btn" data-back="2">← Volver al Calendario</button>
              </div>
              <div class="volkern-step" id="step4">
                <span class="volkern-step-desc">Paso Final</span>
                <h2 class="volkern-step-title">Tus Datos</h2>
                <div style="margin-bottom: 3rem; background: rgba(129, 140, 248, 0.05); padding: 2rem; border-radius: 2rem; border: 1px solid rgba(129, 140, 248, 0.1);">
                  <p style="font-size: 0.875rem; font-weight: 900; text-transform: uppercase; color: var(--v-accent, #818cf8);">Resumen</p>
                  <p id="sum-desc" style="font-size: 1.125rem; font-weight: 700; margin-top: 0.5rem;"></p>
                </div>
                <input type="text" class="volkern-input" placeholder="Nombre completo" id="in-name">
                <input type="email" class="volkern-input" placeholder="Email corporativo" id="in-email">
                <button class="confirm-btn">Confirmar Mi Cita</button>
                <button class="back-btn" data-back="3">← Volver a Horarios</button>
              </div>
            </div>
          </section>
        `,
        script: function(this: any) {
          const el = this;
          const card = el.querySelector('.volkern-booking-card');
          const data = { service: '', serviceId: '', date: '', time: '' };
          const steps = el.querySelectorAll('.volkern-step');
          const dots = el.querySelectorAll('.dot');

          const applyConfig = () => {
             const textColor = el.getAttribute('data-color-text') || '#ffffff';
             const accentColor = el.getAttribute('data-color-accent') || '#6366f1';
             const btnTextColor = el.getAttribute('data-btn-color-text') || '#000000';
             const btnBgColor = el.getAttribute('data-btn-bg-color') || '#ffffff';
             const btnText = el.getAttribute('data-btn-text') || 'Confirmar Mi Cita';
             
             el.style.setProperty('--v-text', textColor);
             el.style.setProperty('--v-accent', accentColor);
             el.style.setProperty('--v-btn-text', btnTextColor);
             el.style.setProperty('--v-btn-bg', btnBgColor);

             const confirmBtn = el.querySelector('.confirm-btn');
             if (confirmBtn) confirmBtn.innerText = btnText;
          };

          const goToStep = (n: number) => {
            steps.forEach((s: any) => s.classList.remove('active'));
            dots.forEach((d: any) => d.classList.remove('active'));
            steps[n-1].classList.add('active');
            dots[n-1].classList.add('active');
          };

          el.querySelectorAll('.back-btn').forEach((btn: any) => {
            btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.back)));
          });

          const loadServices = async () => {
            const list = el.querySelector('.services-list');
            try {
              let apiUrl = '/api/volkern?path=servicios&activo=true';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }
              const res = await fetch(apiUrl);
              const result = await res.json();
              const svs = Array.isArray(result) ? result : (result.servicios || []);
              renderSvs(svs.length ? svs : null);
            } catch (e) { renderSvs(null); }
          };

          const renderSvs = (svs: any) => {
            const list = el.querySelector('.services-list');
            const items = svs || [
              { id: '1', nombre: 'Asesoría Estratégica', duracionMinutos: 60, precio: 150, moneda: 'USD' },
              { id: '2', nombre: 'Implementación CRM', duracionMinutos: 120, precio: 300, moneda: 'USD' }
            ];
            list.innerHTML = items.map((s: any) => `
              <div class="service-item" data-id="${s.id}" data-name="${s.nombre}">
                <div><div class="service-name">${s.nombre}</div><div class="service-meta">${s.duracionMinutos} MIN • ${s.moneda} ${s.precio}</div></div>
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="3"><path d="M9 5l7 7-7 7"/></svg>
              </div>
            `).join('');
            list.querySelectorAll('.service-item').forEach((i: any) => {
              i.addEventListener('click', () => { 
                data.service = i.dataset.name; 
                data.serviceId = i.dataset.id;
                goToStep(2); 
              });
            });
          };

          const cal = el.querySelector('.calendar-grid');
          const today = new Date();
          const days = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
          cal.innerHTML = days.map(d => `<div class="cal-day-header">${d}</div>`).join('') +
            Array.from({length:28}, (_,i) => {
              const d = new Date();
              d.setDate(today.getDate() + i);
              return `<button class="cal-day" data-date="${d.toISOString().split('T')[0]}">${d.getDate()}</button>`;
            }).join('');
          
          cal.querySelectorAll('.cal-day').forEach((btn: any) => {
            btn.addEventListener('click', () => {
              data.date = btn.dataset.date;
              el.querySelector('#sel-date-label').innerText = data.date;
              goToStep(3);
              loadSlots(data.date);
            });
          });

          const loadSlots = (date: string) => {
            const container = el.querySelector('.slots-container');
            const slots = ['09:00', '10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00'];
            container.innerHTML = slots.map(t => `<div class="slot-item" data-time="${t}">${t}</div>`).join('');
            container.querySelectorAll('.slot-item').forEach((i: any) => {
              i.addEventListener('click', () => {
                data.time = i.dataset.time;
                el.querySelector('#sum-desc').innerText = `${data.service} - ${data.date} @ ${data.time}`;
                goToStep(4);
              });
            });
          };

          el.querySelector('.confirm-btn').addEventListener('click', async () => {
            const btn = el.querySelector('.confirm-btn');
            const originalText = btn.innerText;
            btn.innerText = 'PROCESANDO...'; btn.disabled = true;
            try {
              let apiUrl = '/api/volkern?path=citas';
              let origin = '';
              try { origin = (window.parent && window.parent.location && window.parent.location.origin !== 'null') ? window.parent.location.origin : window.location.origin; } catch (e) { origin = window.location.origin; }
              if (origin && origin !== 'null' && !origin.startsWith('about')) { apiUrl = origin + apiUrl; }

              await fetch(apiUrl, { 
                method: 'POST', 
                headers: {'Content-Type':'application/json'}, 
                body: JSON.stringify({
                  nombre: el.querySelector('#in-name').value, 
                  email: el.querySelector('#in-email').value,
                  servicioId: data.serviceId,
                  fechaHora: `${data.date}T${data.time}:00Z`,
                  notas: `Cita agendada desde el Web Creator para ${data.service}`
                })
              });
              card.innerHTML = '<div style="text-align:center;padding:6rem 0;"><h2 style="color:var(--v-accent, #6366f1);font-size:3rem;">¡Listo!</h2><p>Cita agendada correctamente. Te hemos enviado un email de confirmación.</p></div>';
            } catch (e) { alert('Error al agendar.'); btn.innerText = originalText; btn.disabled = false; }
          });

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              const attr = mutation.attributeName;
              if (attr && attr.startsWith('data-')) {
                applyConfig();
              }
            });
          });
          observer.observe(el, { attributes: true });

          applyConfig();
          loadServices();
        }
      }
    }
  });
};