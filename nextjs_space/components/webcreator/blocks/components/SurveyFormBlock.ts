import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export type SurveyFormOption = { id: string; name: string };

export type SurveyFormDesign = {
  buttonColor: string;
  buttonTextColor: string;
};

/** Lee los colores guardados por el editor de Formularios con un fallback seguro. */
export function getSurveyFormDesign(config: Record<string, unknown> | null | undefined): SurveyFormDesign {
  const hexColor = (value: unknown, fallback: string) => {
    const color = String(value ?? '').trim();
    return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
  };

  return {
    buttonColor: hexColor(config?._buttonColor, '#6366f1'),
    buttonTextColor: hexColor(config?._buttonTextColor, '#ffffff'),
  };
}

/** Convierte los formularios del tenant en opciones para el trait del editor. */
export function buildSurveyFormOptions(
  forms: Array<{ id: string; name?: string | null }>,
  currentId = '',
): SurveyFormOption[] {
  const options: SurveyFormOption[] = [
    { id: '', name: 'Selecciona un formulario' },
    ...forms
      .filter((form) => form?.id)
      .map((form) => ({ id: form.id, name: form.name?.trim() || `Formulario ${form.id}` })),
  ];

  if (currentId && !options.some((option) => option.id === currentId)) {
    options.push({ id: currentId, name: `Formulario seleccionado (${currentId})` });
  }

  return options;
}

export const createSurveyFormBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  bm.add("volkern-survey-form", {
    label: `
      <div class="custom-block-layout">
        <div class="custom-block-icon">
          ${getIconSvg('contact')}
        </div>
        <div class="gjs-block-label">Formulario Survey</div>
      </div>
    `,
    category: "Volkern CRM",
    content: { type: 'volkern-survey-form' }
  });

  editor.DomComponents.addType("volkern-survey-form", {
    model: {
      defaults: {
        traits: [
          {
            type: 'select',
            label: 'Formulario de Volkern',
            name: 'data-form-id',
            options: [{ id: '', name: 'Cargando formularios...' }],
          },
          {
            type: 'button',
            text: 'Abrir Formularios',
            command: (editor: Editor) => {
              const url = `${window.location.origin}/dashboard/formularios`;
              window.open(url, '_blank');
            },
          },
        ],
        attributes: {
          'data-form-id': '',
          'data-survey-json': '{}',
        },
        components: `
          <style>
            .survey-form-placeholder { width:100%; background:#f8fafc; border-radius:12px; }
            .survey-placeholder-inner { display:flex; flex-direction:column; align-items:center; gap:12px; padding:32px 24px; }
            .survey-placeholder-icon { opacity:0.7; }
            .survey-placeholder-title { font-size:1.15rem; font-weight:700; color:#1e293b; margin:0; }
            .survey-placeholder-desc { font-size:0.8rem; color:#64748b; margin:0; text-align:center; }
            .survey-placeholder-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(99,102,241,0.1); color:#6366f1; font-size:0.7rem; font-weight:600; padding:5px 12px; border-radius:20px; margin-top:2px; }
            .survey-placeholder-fields { width:100%; max-width:360px; display:flex; flex-direction:column; gap:8px; padding:16px 0; }
            .survey-mock-field { width:100%; height:40px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; display:flex; align-items:center; padding:0 12px; position:relative; }
            .survey-mock-field.required::after { content:'*'; position:absolute; right:12px; color:#ef4444; font-size:0.8rem; }
            .survey-mock-field.short { width:60%; }
            .survey-mock-label { font-size:0.65rem; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; font-weight:500; }
            .survey-mock-btn { width:100%; max-width:360px; padding:11px 24px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border:none; border-radius:10px; font-weight:600; font-size:0.85rem; text-align:center; cursor:pointer; }
            .survey-mock-more { font-size:0.7rem; color:#6366f1; text-align:center; padding:4px 0; }
            .survey-form-error { display:none; padding:24px; text-align:center; }
            .survey-form-error-icon { color:#ef4444; margin-bottom:8px; }
            .survey-form-error-text { font-size:0.85rem; color:#dc2626; margin:0; }
          </style>
          <div class="survey-form-placeholder">
            <div class="survey-placeholder-inner" data-v-placeholder>
              <div class="survey-placeholder-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M17 2v4"/><path d="M7 2v4"/><path d="M2 10h20"/></svg>
              </div>
              <h3 class="survey-placeholder-title">Formulario Inteligente</h3>
              <p class="survey-placeholder-desc">Selecciona un formulario existente en el panel <strong>Propiedades (⚙️)</strong></p>
              <div class="survey-placeholder-badge">📋 Gestiona tus formularios desde el menú Formularios</div>
              <div class="survey-placeholder-fields" data-v-fields>
                <div class="survey-mock-field"></div>
                <div class="survey-mock-field short"></div>
                <div class="survey-mock-field"></div>
              </div>
              <button class="survey-mock-btn">Enviar</button>
            </div>
            <div class="survey-form-error" data-v-error>
              <div class="survey-form-error-icon">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
              </div>
              <p class="survey-form-error-text">Error al cargar el formulario. Verifica el ID.</p>
            </div>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const placeholderEl = el.querySelector('[data-v-placeholder]');
          const fieldsContainer = el.querySelector('[data-v-fields]');
          const errorEl = el.querySelector('[data-v-error]');
          const titleEl = el.querySelector('.survey-placeholder-title');
          const descEl = el.querySelector('.survey-placeholder-desc');
          const badgeEl = el.querySelector('.survey-placeholder-badge');
          const mockButtonEl = el.querySelector('.survey-mock-btn');

          const applyDesign = (config: Record<string, unknown> | null | undefined) => {
            const hexColor = (value: unknown, fallback: string) => {
              const color = String(value || '').trim();
              return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
            };
            if (!mockButtonEl) return;
            mockButtonEl.style.setProperty('background', hexColor(config && config._buttonColor, '#6366f1'), 'important');
            mockButtonEl.style.setProperty('color', hexColor(config && config._buttonTextColor, '#ffffff'), 'important');
          };

          const isAlreadyRendered = el.getAttribute('data-rendered');

          if (isAlreadyRendered === 'form') return;

          const renderForm = async (formId: string) => {
            if (!formId) {
              if (placeholderEl) placeholderEl.style.display = '';
              if (errorEl) errorEl.style.display = 'none';
              if (titleEl) titleEl.innerText = 'Formulario Inteligente';
              if (descEl) descEl.innerHTML = 'Selecciona un formulario existente en el panel <strong>Propiedades (⚙️)</strong>';
              if (badgeEl) badgeEl.style.display = '';
              applyDesign({});
              return;
            }

            if (titleEl) titleEl.innerText = 'Cargando...';
            if (descEl) descEl.innerText = 'Obteniendo formulario...';
            if (badgeEl) badgeEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'none';

            try {
              const res = await fetch('/api/formularios/' + formId, {
                credentials: 'include'
              });
              if (!res.ok) throw new Error('HTTP ' + res.status);

              const data = await res.json();
              const form = data.form || data;
              if (!form?.config?.pages) throw new Error('Sin configuración');

              el.setAttribute('data-survey-json', JSON.stringify(form.config));
              applyDesign(form.config);

              if (titleEl) titleEl.innerText = form.name || 'Formulario';
              if (descEl) descEl.innerText = 'Formulario configurado correctamente';

              if (fieldsContainer && form.config?.pages?.[0]?.elements) {
                fieldsContainer.innerHTML = '';
                const elements = form.config.pages[0].elements.slice(0, 5);
                elements.forEach((field: any) => {
                  const mockField = document.createElement('div');
                  mockField.className = 'survey-mock-field';
                  if (field.isRequired) mockField.classList.add('required');
                  const label = document.createElement('span');
                  label.className = 'survey-mock-label';
                  label.innerText = field.title || field.name || '';
                  mockField.appendChild(label);
                  fieldsContainer.appendChild(mockField);
                });
                if (form.config.pages[0].elements.length > 5) {
                  const more = document.createElement('div');
                  more.className = 'survey-mock-more';
                  more.innerText = '+' + (form.config.pages[0].elements.length - 5) + ' campos más';
                  fieldsContainer.appendChild(more);
                }
              }
            } catch (e) {
              console.warn('[SurveyFormBlock] Error loading form:', e);
              if (titleEl) titleEl.innerText = 'Error al cargar';
              if (descEl) descEl.innerText = 'Verifica que el formulario seleccionado exista y tengas acceso';
              if (errorEl) errorEl.style.display = '';
            }
          };

          const formId = el.getAttribute('data-form-id') || '';
          if (formId) renderForm(formId);

          if ((el as any).__observer) (el as any).__observer.disconnect();
          const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
              if (m.attributeName === 'data-form-id') {
                const newId = el.getAttribute('data-form-id') || '';
                renderForm(newId);
              }
            }
          });
          (el as any).__observer = observer;
          observer.observe(el, { attributes: true });
        },
        style: {
          'min-height': '100px',
          'background': '#f8fafc',
          'border': '1px solid #e2e8f0',
          'border-radius': '12px',
          'position': 'relative',
          'overflow': 'hidden',
        }
      },
    },
  });

  // Cargar los formularios del tenant en el selector del Trait Manager.
  // Se ejecuta en el editor autenticado; la página pública solo recibe el ID
  // seleccionado dentro del HTML guardado.
  let formOptions: SurveyFormOption[] = [{ id: '', name: 'Cargando formularios...' }];

  const applyFormOptions = (component: any, options: SurveyFormOption[]) => {
    const trait = component?.getTrait?.('data-form-id');
    if (trait) trait.set('options', options);
  };

  const applyFormOptionsToAll = (options: SurveyFormOption[]) => {
    const components = editor.getWrapper()?.find?.('[data-form-id]') || [];
    components.forEach((component: any) => applyFormOptions(component, options));
  };

  editor.on('component:add', (component: any) => {
    if (component?.get?.('type') === 'volkern-survey-form') {
      applyFormOptions(component, formOptions);
    }
  });
  fetch('/api/formularios', { credentials: 'include' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then((data) => {
      formOptions = buildSurveyFormOptions(Array.isArray(data?.forms) ? data.forms : []);
      applyFormOptionsToAll(formOptions);
    })
    .catch((error) => {
      console.warn('[SurveyFormBlock] No se pudieron cargar los formularios:', error);
      formOptions = [{ id: '', name: 'No se pudieron cargar' }];
      applyFormOptionsToAll(formOptions);
    });

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .survey-form-placeholder { width:100%; background:#f8fafc; border-radius:12px; }
    .survey-placeholder-inner { display:flex; flex-direction:column; align-items:center; gap:12px; padding:32px 24px; }
    .survey-placeholder-icon { opacity:0.7; }
    .survey-placeholder-title { font-size:1.15rem; font-weight:700; color:#1e293b; margin:0; }
    .survey-placeholder-desc { font-size:0.8rem; color:#64748b; margin:0; }
    .survey-placeholder-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(99,102,241,0.1); color:#6366f1; font-size:0.7rem; font-weight:600; padding:5px 12px; border-radius:20px; margin-top:2px; }
    .survey-placeholder-fields { width:100%; max-width:360px; display:flex; flex-direction:column; gap:8px; padding:16px 0; }
    .survey-mock-field { width:100%; height:40px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; display:flex; align-items:center; padding:0 12px; position:relative; }
    .survey-mock-field.required::after { content:'*'; position:absolute; right:12px; color:#ef4444; font-size:0.8rem; }
    .survey-mock-field.short { width:60%; }
    .survey-mock-label { font-size:0.65rem; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; font-weight:500; }
    .survey-mock-btn { width:100%; max-width:360px; padding:11px 24px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border:none; border-radius:10px; font-weight:600; font-size:0.85rem; text-align:center; cursor:pointer; }
    .survey-mock-more { font-size:0.7rem; color:#6366f1; text-align:center; padding:4px 0; }
  `;
  editor.Canvas.getDocument().head.appendChild(styleEl);
};
