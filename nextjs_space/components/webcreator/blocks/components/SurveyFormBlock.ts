import { Editor } from "grapesjs";
import { getIconSvg } from "../../icons/BlockIcons";

export const createSurveyFormBlock = (editor: Editor) => {
  const bm = editor.BlockManager;

  // ─── Register custom form-picker trait ────────────────────────
  editor.TraitManager.addType('form-picker', {
    noLabel: false,
    createInput({ trait, component }: { trait: any; component: any }) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;width:100%;';

      const select = document.createElement('select');
      select.setAttribute('data-trait-select', 'true');
      select.style.cssText = `
        width:100%;padding:8px 12px;border-radius:8px;font-size:13px;
        border:1px solid #e2e8f0;
        background:#fff;
        color:#0f172a;
        cursor:pointer;appearance:auto;
      `;

      // Loading state
      const loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = 'Cargando formularios...';
      loadingOpt.disabled = true;
      select.appendChild(loadingOpt);
      select.disabled = true;

      wrapper.appendChild(select);

      // Resolve origin for API call inside GrapesJS iframe
      const resolveOrigin = (): string => {
        try {
          const parentOrigin = window.parent?.location?.origin;
          if (parentOrigin && parentOrigin !== 'null' && !parentOrigin.startsWith('about')) {
            return parentOrigin;
          }
        } catch {}
        return window.location.origin;
      };

      const currentValue = component.getAttributes()['data-form-id'] || '';

      // Fetch available forms
      const fetchForms = async () => {
        try {
          const origin = resolveOrigin();
          if (!origin || origin.startsWith('about')) {
            select.innerHTML = '<option value="">No disponible en preview</option>';
            return;
          }

          const res = await fetch(`${origin}/api/formularios`);
          if (!res.ok) throw new Error('Failed to fetch');

          const data = await res.json();
          const forms: any[] = data.forms || [];

          select.innerHTML = '';
          select.disabled = false;

          const placeholderOpt = document.createElement('option');
          placeholderOpt.value = '';
          placeholderOpt.textContent = '— Seleccionar formulario —';
          select.appendChild(placeholderOpt);

          forms.forEach((form: any) => {
            const opt = document.createElement('option');
            opt.value = form.id;
            const subs = form._count?.submissions || 0;
            opt.textContent = `${form.name}${subs > 0 ? ` (${subs} subs)` : ''}`;
            if (form.id === currentValue) opt.selected = true;
            select.appendChild(opt);
          });

          if (forms.length === 0) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = 'No hay formularios — creá uno en Formularios';
            emptyOpt.disabled = true;
            select.appendChild(emptyOpt);
          }
        } catch (err) {
          console.warn('[SurveyFormBlock] Could not fetch forms:', err);
          select.innerHTML = '<option value="">Error al cargar</option>';
        }
      };

      fetchForms();

      // Handle selection change — update component attribute
      // The MutationObserver in the script detects this change and triggers preview fetch
      select.addEventListener('change', () => {
        const selectedId = select.value;
        component.addAttributes({ 'data-form-id': selectedId });
      });

      return wrapper;
    },
    // Sync select when component attribute changes externally (e.g. undo/redo)
    onEvent({ component, elInput }: { component: any; elInput: HTMLDivElement }) {
      const select = elInput.querySelector('select') as HTMLSelectElement | null;
      if (!select) return;
      const formId = component.getAttributes()['data-form-id'] || '';
      if (select.value !== formId) {
        for (const opt of Array.from(select.options)) {
          if ((opt as HTMLOptionElement).value === formId) {
            select.value = formId;
            break;
          }
        }
      }
    },
  });

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
            type: 'form-picker',
            label: 'Formulario',
            name: 'data-form-id',
          },
        ],
        attributes: {
          'data-form-id': '',
          'data-survey-json': '{}',
        },
        components: `
          <div class="survey-form-placeholder">
            <div class="survey-placeholder-inner">
              <div class="survey-placeholder-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M17 2v4"/><path d="M7 2v4"/><path d="M2 10h20"/></svg>
              </div>
              <h3 class="survey-placeholder-title">Formulario Inteligente</h3>
              <p class="survey-placeholder-desc">Selecciona un formulario en el panel de Propiedades (⚙️)</p>
              <div class="survey-placeholder-fields">
                <div class="survey-mock-field"></div>
                <div class="survey-mock-field short"></div>
                <div class="survey-mock-field"></div>
              </div>
              <button class="survey-mock-btn">Enviar</button>
            </div>
          </div>
        `,
        script: function(this: any) {
          const el = this;
          const isAlreadyRendered = !!el.getAttribute('data-rendered');

          if (!isAlreadyRendered) {
            // ─── PUBLISHED PAGE MODE: Render the actual SurveyJS form ────
            const surveyJson = el.getAttribute('data-survey-json');
            const formId = el.getAttribute('data-form-id');

            if (!surveyJson || surveyJson === '{}' || !surveyJson.includes('"pages"')) {
              // No valid survey data → show placeholder (editor preview will update it)
              el.setAttribute('data-rendered', 'editor-preview');
              const titleEl = el.querySelector('.survey-placeholder-title');
              if (titleEl) {
                if (formId) {
                  titleEl.innerText = 'Formulario #' + formId;
                }
              }
            } else {
              // Valid survey data → render the form
              el.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;font-family:system-ui">Cargando formulario...</div>';

              const loadScript = (src: string): Promise<void> => {
                return new Promise((resolve, reject) => {
                  const s = document.createElement('script');
                  s.src = src;
                  s.onload = () => resolve();
                  s.onerror = () => reject(new Error('Failed to load ' + src));
                  document.head.appendChild(s);
                });
              };

              const loadStylesheet = (href: string): Promise<void> => {
                return new Promise((resolve) => {
                  const link = document.createElement('link');
                  link.rel = 'stylesheet';
                  link.href = href;
                  link.onload = () => resolve();
                  document.head.appendChild(link);
                });
              };

              const initForm = async () => {
                try {
                  await loadStylesheet('https://unpkg.com/survey-core@1.12.44/defaultV2.min.css');
                  await loadScript('https://unpkg.com/survey-core@1.12.44/survey.core.min.js');

                  const SurveyJS = (window as any).Survey;
                  if (!SurveyJS?.Model) throw new Error('SurveyJS not loaded');

                  const model = new SurveyJS.Model(JSON.parse(surveyJson));
                  model.locale = 'es';

                  if (formId) {
                    const submitUrl = `${window.location.origin}/api/formularios/${formId}/submit`;
                    model.onComplete.add(async (sender: any) => {
                      try {
                        await fetch(submitUrl, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ payload: sender.data }),
                        });
                      } catch (e) { /* silent */ }
                    });
                  }

                  el.innerHTML = '';
                  el.style.background = 'transparent';
                  el.style.border = 'none';
                  el.style.padding = '16px';
                  el.style.minHeight = 'auto';

                  const container = document.createElement('div');
                  container.style.maxWidth = '640px';
                  container.style.margin = '0 auto';
                  el.appendChild(container);
                  model.render(container);
                  el.setAttribute('data-rendered', 'form');
                } catch (e) {
                  console.error('[SurveyFormBlock] Init error:', e);
                  el.innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444;font-family:system-ui">Error al cargar el formulario. Verifica el ID en el dashboard.</div>';
                }
              };

              initForm();
              return; // Don't run editor preview code
            }
          }

          // ─── EDITOR PREVIEW MODE ─────────────────────────────────────
          // This runs only when data-rendered is already set (= editor context)
          // or when the script first runs with empty survey data
          const formId = el.getAttribute('data-form-id');
          const titleEl = el.querySelector('.survey-placeholder-title');
          const descEl = el.querySelector('.survey-placeholder-desc');

          if (!titleEl) return;

          if (!formId) {
            titleEl.innerText = 'Formulario Inteligente';
            if (descEl) descEl.innerText = 'Pega el ID de tu formulario en el panel de traits (icono ⚙️)';
            return;
          }

          titleEl.innerText = 'Formulario #' + formId;
          if (descEl) descEl.innerText = 'El formulario se cargará al publicar la página';

          const fetchPreview = async () => {
            try {
              let origin = '';
              try {
                origin = (window.parent.location && window.parent.location.origin !== 'null')
                  ? window.parent.location.origin
                  : window.location.origin;
              } catch (e) { origin = window.location.origin; }
              if (!origin || origin.startsWith('about')) return;

              const res = await fetch(`${origin}/api/formularios/${formId}`, {
                headers: { 'x-tenant-id': 'preview' }
              });
              if (!res.ok) return;

              const { form } = await res.json();
              if (!form?.config) return;

              el.setAttribute('data-survey-json', JSON.stringify(form.config));
              titleEl.innerText = form.name || 'Formulario';

              const fieldsContainer = el.querySelector('.survey-placeholder-fields');
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
            } catch (e) { /* silent */ }
          };

          fetchPreview();

          // Disconnect previous observer if script re-runs
          if ((el as any).__observer) (el as any).__observer.disconnect();
          const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
              if (m.attributeName === 'data-form-id') fetchPreview();
            }
          });
          (el as any).__observer = observer;
          observer.observe(el, { attributes: true });
        },
        style: {
          'min-height': '200px',
          'background': 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
          'border': '1px solid rgba(99, 102, 241, 0.2)',
          'border-radius': '16px',
          'padding': '32px',
          'position': 'relative',
          'overflow': 'hidden',
        }
      },
    },
  });

  // Inject placeholder styles into the canvas
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .survey-form-placeholder { width: 100%; min-height: 200px; }
    .survey-placeholder-inner {
      display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px;
    }
    .survey-placeholder-icon { opacity: 0.6; }
    .survey-placeholder-title {
      font-size: 1.25rem; font-weight: 700; color: #e2e8f0; margin: 0;
    }
    .survey-placeholder-desc { font-size: 0.85rem; color: #64748b; margin: 0; }
    .survey-placeholder-fields {
      width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 8px; padding: 16px 0;
    }
    .survey-mock-field {
      width: 100%; height: 40px; background: rgba(30,41,59,0.6);
      border: 1px solid rgba(71,85,105,0.3); border-radius: 8px;
      display: flex; align-items: center; padding: 0 12px; position: relative;
    }
    .survey-mock-field.required::after {
      content: '*'; position: absolute; right: 12px; color: #ef4444; font-size: 0.8rem;
    }
    .survey-mock-field.short { width: 60%; }
    .survey-mock-label {
      font-size: 0.7rem; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .survey-mock-btn {
      width: 100%; max-width: 360px; padding: 12px 24px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;
      border: none; border-radius: 10px; font-weight: 600; font-size: 0.9rem;
      text-align: center;
    }
    .survey-mock-more { font-size: 0.75rem; color: #6366f1; text-align: center; padding: 4px 0; }
  `;
  editor.Canvas.getDocument().head.appendChild(styleEl);
};
