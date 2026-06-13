"use client"

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react"
import grapesjs, { Editor } from "grapesjs"
import "grapesjs/dist/css/grapes.min.css"
import { toast } from "sonner"

import "./styles/BlockStyles.css"

import gjsBlocksBasic from "grapesjs-blocks-basic"
import gjsPluginForms from "grapesjs-plugin-forms"
import gjsComponentCountdown from "grapesjs-component-countdown"
import gjsCustomCode from "grapesjs-custom-code"
import gjsNavbar from "grapesjs-navbar"
import gjsTyped from "grapesjs-typed"
import gjsTooltip from "grapesjs-tooltip"
import gjsMaterialIcons from "grapesjs-google-material-icons"
// @ts-expect-error - grapesjs-style-easing doesn't have types
import gjsStyleEasing from "grapesjs-style-easing"
import { setupVolkernBlocksAsync } from "./blocks/dynamicBlocks"
import { setupDocumentBlocks } from "./blocks/DocumentBlocks"
import { getTemplateData } from "./templates"

export interface GrapesEditorRef {
  exportProject: () => Record<string, unknown> | undefined;
  importProject: (data: Record<string, unknown>) => void;
  runCommand: (command: string, options?: Record<string, unknown>) => void;
  stopCommand: (command: string, options?: Record<string, unknown>) => void;
  getEditor: () => Editor | null;
  getHtml: () => string | undefined;
  getCss: () => string | undefined;
  getUndoManager: () => any;
}

interface GrapesEditorProps {
  initialData?: Record<string, unknown>
  onSave?: (data: Record<string, unknown>) => void
  device?: string
  preview?: boolean
  templateId?: string
  pageTitle?: string
  mode?: 'webpage' | 'email' | 'document'
  forwardedRef?: React.Ref<GrapesEditorRef>
}

const GrapesEditor = forwardRef<GrapesEditorRef, GrapesEditorProps>((props, ref): React.ReactElement => {
  const { initialData, onSave, device = "desktop", preview = false, templateId = "blank", pageTitle = 'Página sin título', mode = 'webpage', forwardedRef } = props;
  
  const activeRef = ref || forwardedRef;
  const editorRef = useRef<Editor | null>(null)
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null)
  const initialDataRef = useRef<Record<string, unknown> | undefined>(initialData)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  useImperativeHandle(activeRef, () => ({
    exportProject: () => (editorRef.current || (window as any).editor)?.getProjectData() as Record<string, unknown>,
    importProject: (data) => (editorRef.current || (window as any).editor)?.loadProjectData(data),
    runCommand: (cmd, opt) => (editorRef.current || (window as any).editor)?.runCommand(cmd, opt),
    stopCommand: (cmd, opt) => (editorRef.current || (window as any).editor)?.stopCommand(cmd, opt),
    getEditor: () => {
      if (editorRef.current) return editorRef.current;
      if (typeof window !== 'undefined' && (window as any).editor) {
        const recovered = (window as any).editor as Editor;
        if (typeof recovered.getHtml === 'function') {
          editorRef.current = recovered; // Restore the ref for future calls
          return recovered;
        }
      }
      return null;
    },
    getUndoManager: () => {
      const e = editorRef.current || (window as any).editor;
      return (e as any)?.UndoManager ?? null;
    },
    getHtml: () => {
      const e = editorRef.current || (window as any).editor;
      return e?.getHtml({ cleanId: false, addScripts: true });
    },
    getCss: () => {
      const e = editorRef.current || (window as any).editor;
      if (!e) return '';
      let css = e.getCss() || '';
      try {
        const allCss = (e as any).CSS?.getCode?.() || css;
        if (allCss && allCss.length > css.length) css = allCss;
      } catch {}
      return css;
    },
    getAutoSaveStatus: () => autoSaveStatus,
  }));

  useEffect(() => {
    if (editorRef.current) editorRef.current.setDevice(device)
  }, [device])

  useEffect(() => {
    if (editorRef.current) {
      if (preview) editorRef.current.runCommand("preview")
      else editorRef.current.stopCommand("preview")
    }
  }, [preview])

  useEffect(() => {
    if (editorRef.current) return;

    let editor: Editor;
    try {
      editor = grapesjs.init({
      container: "#gjs",
      height: "100%",
      width: "100%",
      storageManager: false,
      avoidInlineStyle: false,
      panels: { defaults: [] },
      i18n: {
        locale: 'es',
        detectLocale: false,
        messages: {
          es: {
            blockManager: {
              labels: {
                'Basic': 'Básico 📐',
                'Forms': 'Formularios 📝',
                'Premium': 'Premium ✨',
                'Volkern CRM': 'Volkern CRM 🚀'
              },
              categories: {
                'Basic': 'Básico 📐',
                'Forms': 'Formularios 📝',
                'Premium': 'Premium ✨',
                'Volkern CRM': 'Volkern CRM 🚀',
                'forms': 'Formularios 📝',
                'basic': 'Básico 📐'
              },
            },
            styleManager: {
              sectors: {
                'general': 'Layout',
                'dimension': 'Size',
                'typography': 'Typography',
                'decorations': 'Space',
                'extra': 'Extra',
                'flex': 'Flex'
              }
            },
            traitManager: {
              label: 'Propiedades',
              empty: 'Selecciona un elemento para ver sus atributos',
            }
          }
        }
      },
      blockManager: { appendTo: "#blocks-container" },
      styleManager: { appendTo: "#gjs-sm-container" },
      traitManager: { appendTo: "#gjs-tm-container" },
      layerManager: { appendTo: "#layers-container" },
      selectorManager: { appendTo: "#gjs-sm-selectors" },
      plugins: [gjsBlocksBasic, gjsPluginForms, gjsComponentCountdown, gjsCustomCode, gjsNavbar, gjsTyped, gjsTooltip, gjsMaterialIcons, gjsStyleEasing],
      pluginsOpts: {
        [gjsBlocksBasic.toString()]: {
          blocks: ['column1', 'column2', 'column3', 'column3-7', 'text', 'heading', 'link', 'image', 'video', 'map'],
          category: 'Basic',
          flexGrid: true,
          padding: 10
        },
        'gjs-plugin-forms': {
          category: 'Forms'
        },
        'gjs-google-material-icons': {
          icon_fonts: [
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
          ]
        }
      },
      canvas: {
        scripts: [],
        styles: [
          "https://unpkg.com/tailwindcss@3.4.1/dist/tailwind.min.css",
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap",
          "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
          "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
          "https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        ],
      },
    })
      console.log('[GrapesEditor] Editor initialized successfully');
    } catch (initError) {
      console.error('[GrapesEditor] grapesjs.init() FAILED:', initError);
      return; // No editor ref, which will show 'Editor no disponible'
    }

    editorRef.current = editor;

    editor.on('load', () => {
      if (mode === 'webpage') {
        setupVolkernBlocksAsync(editor);
      } else if (mode === 'document') {
        setupDocumentBlocks(editor);
      } else if (mode === 'email') {
        // We'll add email-specific blocks later
        setupDocumentBlocks(editor);
      }

      // Load initialData here (inside 'load' event) to avoid the race condition
      // where the editor isn't ready when the useEffect fires
      const dataToLoad = initialDataRef.current;
      if (dataToLoad) {
        const d = dataToLoad as any;
        const hasData = (d.pages && d.pages.length > 0) || (d.components && d.components.length > 0);
        if (hasData) {
          try {
            editor.loadProjectData(d);
          } catch (e) {
            console.warn('[GrapesEditor] initialData load failed on editor load event:', e);
          }
        }
      }
      
      // Inyectar CSS y scripts en el canvas (evita errores MIME al ponerlos en canvas.styles/scripts)
      try {
        const canvasDoc = editor.Canvas.getDocument();
        if (canvasDoc) {
          // Smooth scroll
          const smoothStyle = canvasDoc.createElement('style');
          smoothStyle.textContent = 'html { scroll-behavior: smooth; }';
          canvasDoc.head.appendChild(smoothStyle);

          // Click handler para enlaces (reemplaza function() en canvas.scripts que causaba errores)
          const navScript = canvasDoc.createElement('script');
          navScript.innerHTML = `
            document.addEventListener('click', function(e) {
              var el = e.target.closest('[href]');
              if (el) {
                var url = el.getAttribute('href');
                if (url && url.startsWith('#')) {
                  var targetEl = document.getElementById(url.substr(1));
                  if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth' });
                    e.preventDefault();
                    e.stopPropagation();
                  }
                } else if (el.tagName !== 'A' && !el.closest('a') && url) {
                  var target = el.getAttribute('target');
                  if (target === '_blank') window.open(url);
                  else window.location.href = url;
                }
              }
            }, true);
          `;
          canvasDoc.body.appendChild(navScript);

          // CSS específico para modo documento (simulación A4)
          if (mode === 'document') {
            const docStyle = canvasDoc.createElement('style');
            docStyle.textContent = `
              body {
                background-color: #f1f5f9;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 40px;
              }
              .gjs-pn-views-container { background: white; }
              #wrapper {
                width: 210mm;
                min-height: 297mm;
                background: white;
                box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
                margin: 0 auto;
                padding: 1in;
                box-sizing: border-box;
              }
            `;
            canvasDoc.head.appendChild(docStyle);
          }

          // Estilos para componentes nativos del plugin de formularios (grapesjs-plugin-forms)
          // El plugin genera HTML sin clases CSS, solo etiquetas HTML
          const formStyle = canvasDoc.createElement('style');
          formStyle.textContent = `
            form { font-family:system-ui,-apple-system,sans-serif; background:#fff; border-radius:12px; padding:20px; border:1px solid #e2e8f0; }
            input:not([type=checkbox]):not([type=radio]),
            textarea,
            select {
              width:100%; padding:10px 14px; font-size:0.9rem;
              border:1.5px solid #e2e8f0; border-radius:10px; outline:none;
              background:#fafbfc; transition:border-color 0.2s,box-shadow 0.2s;
              box-sizing:border-box; font-family:inherit; color:#0f172a;
              margin-bottom:12px;
            }
            input:not([type=checkbox]):not([type=radio]):focus,
            textarea:focus,
            select:focus {
              border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); background:#fff;
            }
            textarea { resize:vertical; min-height:80px; }
            label { display:block; font-size:0.85rem; font-weight:500; color:#1e293b; margin-bottom:4px; margin-top:8px; }
            label:first-child { margin-top:0; }
            button { padding:11px 24px; background:#6366f1; color:#fff; border:none; border-radius:10px; font-weight:600; font-size:0.9rem; cursor:pointer; transition:background 0.2s,transform 0.15s; font-family:inherit; display:inline-flex; align-items:center; gap:6px; }
            button:hover { background:#4f46e5; transform:translateY(-1px); }
            input[type=checkbox] { accent-color:#6366f1; width:16px; height:16px; margin-right:6px; }
            input[type=radio] { accent-color:#6366f1; width:16px; height:16px; margin-right:6px; }
          `;
          canvasDoc.head.appendChild(formStyle);

          // Estilos para el componente Navbar (grapesjs-navbar)
          const navStyle = canvasDoc.createElement('style');
          navStyle.textContent = `
            .navbar { background:#fff; border-bottom:1px solid #e2e8f0; font-family:system-ui,-apple-system,sans-serif; width:100%; }
            .navbar-container { max-width:1200px; margin:0 auto; width:95%; display:flex; align-items:center; justify-content:space-between; padding:0 16px; min-height:64px; }
            .navbar-brand { vertical-align:middle; display:flex; align-items:center; padding:6px 10px; min-height:44px; min-width:100px; color:#1e293b; text-decoration:none; font-weight:700; font-size:1.1rem; background:rgba(99,102,241,0.06); border:1.5px dashed #c7d2fe; border-radius:8px; gap:8px; }
            .navbar-brand img { max-height:32px; width:auto; display:block; }
            .navbar-brand[href="/"] { color:#1e293b; }
            .navbar-items-c { display:flex; align-items:center; }
            .navbar-menu { display:flex; gap:4px; padding:0; margin:0; list-style:none; }
            .navbar-menu-link { margin:0; color:#475569; text-decoration:none; display:inline-block; padding:8px 16px; border-radius:8px; font-size:0.9rem; font-weight:500; transition:background 0.2s,color 0.2s; }
            .navbar-menu-link:hover { background:rgba(99,102,241,0.08); color:#6366f1; }
            .navbar-burger { display:none; float:right; cursor:pointer; padding:8px; }
            .navbar-burger-line { width:24px; height:2px; background:#475569; margin:5px 0; border-radius:2px; }
            @media (max-width:768px) {
              .navbar-items-c { display:none; width:100%; position:absolute; top:64px; left:0; background:#fff; border-bottom:1px solid #e2e8f0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); }
              .navbar-burger { display:block; }
              .navbar-menu { flex-direction:column; width:100%; padding:8px; }
              .navbar-menu-link { display:block; width:100%; }
              .navbar-container { flex-wrap:wrap; }
            }
          `;
          canvasDoc.head.appendChild(navStyle);
        }
      } catch (err) {
        console.error('[GrapesEditor] Error injecting canvas styles/scripts:', err);
      }
      
      // Fix for category labels and IDs to match CSS
      const bm = editor.BlockManager;
      
      // Ensure 'Forms' category is renamed
      const formsCat = bm.getCategories().get('Forms');
      if (formsCat) formsCat.set('label', 'Formularios 📝');

      // Override navbar-container para que el brand tenga una imagen de logo por defecto
      editor.DomComponents.addType('navbar-container', {
        model: {
          defaults: {
            components: [
              {
                type: 'link',
                attributes: { class: 'navbar-brand', href: '/' },
                components: [
                  {
                    type: 'image',
                    src: 'https://placehold.co/120x40/f8fafc/6366f1?text=Logo',
                    style: { height: '32px', width: 'auto', display: 'block' }
                  }
                ]
              },
              { type: 'navbar-burger-menu' },
              {
                attributes: { class: 'navbar-items-c', 'data-gjs': 'navbar-items' },
                components: { type: 'navbar-nav-menu' }
              }
            ]
          }
        }
      });

      // Global fix for Headings and Text components to ensure they are ALWAYS editable
      editor.DomComponents.addType('text', {
        model: {
          defaults: {
            editable: true,
            selectable: true,
          }
        }
      });

      // Template compatibility fix: Ensure any component with major text/structure tags is editable
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'label', 'strong', 'em', 'b', 'i', 'small', 'section', 'div', 'details', 'summary'].forEach(tag => {
        editor.DomComponents.addType(tag, {
          model: {
            defaults: {
              ...(tag !== 'section' && tag !== 'div' && tag !== 'details' ? { type: 'text' } : {}),
              tagName: tag,
              editable: true,
              selectable: true,
              hoverable: true,
            }
          }
        });
      });

      // Special Types for CRM Cards and Signature Fields
      ['v-service-card', 'v-testi-card', 'v-catalog-card', 'v-booking-item', 'v-field-group', 'v-doc-header', 'v-doc-clause', 'v-doc-signatures', 'volkern-blog-section', 'volkern-team-section', 'v-signer-field'].forEach(type => {
        editor.DomComponents.addType(type, {
          model: {
            defaults: {
              tagName: 'div',
              editable: true,
              selectable: true,
              hoverable: true,
              draggable: true,
              droppable: true,
              attributes: { class: type },
              traits: type === 'v-signer-field' ? [
                {
                  name: 'data-signer-id',
                  label: 'ID del Firmante (VolkernSign)',
                  placeholder: 'ej: cliente_1, representante_legal',
                },
                {
                  name: 'data-signer-role',
                  label: 'Rol Publico',
                  placeholder: 'ej: Arrendatario, Fiador',
                },
                {
                  type: 'checkbox',
                  name: 'data-signer-required',
                  label: 'Firma Obligatoria',
                  valueTrue: 'true',
                  valueFalse: 'false',
                }
              ] : []
            }
          }
        });
      });

      // Force any component explicitly typed as 'Heading' to be editable
      editor.DomComponents.addType('heading', {
        extend: 'text',
        model: {
          defaults: {
            tagName: 'h2',
            editable: true,
            selectable: true,
          }
        }
      });

      // Global fix for Buttons and Links to ensure their text is ALWAYS editable
      // Global fix for Buttons and Links to ensure their text is ALWAYS editable and have URL traits
      const urlTraits = [
        {
          name: 'href',
          label: 'Enlace (URL)',
          placeholder: 'ej: /contacto o https://google.com',
        },
        {
          type: 'select',
          name: 'target',
          label: 'Abrir en',
          options: [
            { value: '', name: 'Misma ventana' },
            { value: '_blank', name: 'Nueva pestaña' },
          ]
        }
      ];

      ['button', 'a', 'link'].forEach(tag => {
        const type = editor.DomComponents.getType(tag);
        const existingTraits = type?.model.prototype.defaults.traits || [];
        
        editor.DomComponents.addType(tag, {
          model: {
            defaults: {
              editable: true,
              selectable: true,
              // If it's a link, we don't want to follow it in the editor
              ...(tag === 'a' || tag === 'link' ? { 'data-gjs-clickable': false } : {}),
              traits: [...existingTraits, ...urlTraits.filter(t => !existingTraits.some((et: any) => (et.name || et) === t.name))]
            }
          }
        });
      });

      // Global fix for Input buttons (Submit/Button)
      ['input', 'textarea'].forEach(tag => {
        const type = editor.DomComponents.getType(tag);
        const existingTraits = type?.model.prototype.defaults.traits || [];
        
        const inputTraits = [
          {
            name: 'data-volkern-map',
            label: 'Vincular con CRM',
            placeholder: 'ej: nombre, email, telefono',
          },
          ...urlTraits,
          {
            name: 'value',
            label: 'Texto del Botón / Valor',
          },
          {
            name: 'placeholder',
            label: 'Placeholder',
          },
          {
            type: 'select',
            name: 'name', // Using name as type select for mapping
            label: 'Tipo Campo',
            options: [
              { value: 'text', name: 'Texto' },
              { value: 'email', name: 'Email' },
              { value: 'tel', name: 'Teléfono' },
              { value: 'submit', name: 'Botón Enviar' },
            ]
          }
        ];

        editor.DomComponents.addType(tag, {
          model: {
            defaults: {
              traits: [...existingTraits, ...inputTraits.filter(t => !existingTraits.some((et: any) => (et.name || et) === t.name))]
            }
          }
        });
      });

      // Ensure Style Manager sectors have consistent IDs and data attributes for CSS
      const sm = editor.StyleManager;
      sm.getSectors().each((sector: any) => {
        const name = sector.get('name').toLowerCase();
        let sectorId = sector.get('id');

        if (name === 'layout' || sectorId === 'general') {
          sector.set('id', 'layout');
          sectorId = 'layout';
        } else if (name === 'size' || sectorId === 'dimension') {
          sector.set('id', 'size');
          sectorId = 'size';
        } else if (name === 'typography' || sectorId === 'typography') {
          sector.set('id', 'typography');
          sectorId = 'typography';
        } else if (name === 'space' || sectorId === 'decorations') {
          sector.set('id', 'space');
          sectorId = 'space';
        } else if (name === 'extra' || sectorId === 'extra') {
          sector.set('id', 'extra');
          sectorId = 'extra';
        }
        
        // Inject data attribute for CSS targeting
        const el = sector.view?.el;
        if (el) el.setAttribute('data-sector', sectorId);
      });
    });

    // Add open-canva command
    editor.Commands.add('open-canva', {
      run: (editor) => {
        const component = editor.getSelected();
        if (component) {
          // Dispatch custom event to React parent
          const event = new CustomEvent('editor:open-canva', { 
            detail: { componentId: component.getId() } 
          });
          window.dispatchEvent(event);
        }
      }
    });

    // Add version save command
    editor.Commands.add('save-version', {
      run: (editor: any, options: any = {}) => {
        const description = options.description || `Version ${editor.Versions.history.length + 1}`;
        const projectData = editor.getProjectData();
        
        // Limit history size
        if (editor.Versions.history.length >= editor.Versions.maxHistory) {
          editor.Versions.history.shift(); // Remove oldest
          editor.Versions.currentIndex--;
        }
        
        // Add new version
        editor.Versions.history.push({
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          description,
          projectData
        });
        
        editor.Versions.currentIndex = editor.Versions.history.length - 1;
        
        console.log(`Version saved: ${description}`);
      }
    });

    // Add version restore command
    editor.Commands.add('restore-version', {
      run: (editor: any, options: any = {}) => {
        const index = options.index !== undefined ? options.index : editor.Versions.currentIndex;
        if (index < 0 || index >= editor.Versions.history.length) {
          console.warn('Invalid version index:', index);
          return;
        }
        
        const version = editor.Versions.history[index];
        if (version && version.projectData) {
          editor.loadProjectData(version.projectData);
          editor.Versions.currentIndex = index;
          console.log(`Version restored: ${version.description}`);
        }
      }
    });

    // Add version history command
    editor.Commands.add('get-version-history', {
      run: (editor: any) => {
        return {
          history: editor.Versions.history,
          currentIndex: editor.Versions.currentIndex
        };
      }
    });

    // Add open-code command manually (in case grapesjs-custom-code doesn't register it)
    editor.Commands.add('open-code', {
      run: (editor: any) => {
        const html = editor.getHtml({ cleanId: false });
        let css = editor.getCss() || '';
        try {
          const allCss = (editor as any).CSS?.getCode?.() || css;
          if (allCss && allCss.length > css.length) css = allCss;
        } catch {}
        
        const container = document.createElement('div');
        container.style.cssText = 'display:flex;height:70vh;gap:0;resize:vertical;overflow:auto;';
        
        const htmlPanel = document.createElement('div');
        htmlPanel.style.cssText = 'flex:1;padding:15px;border-right:2px solid #205CB0;display:flex;flex-direction:column;';
        const htmlLabel = document.createElement('div');
        htmlLabel.style.cssText = 'font-weight:bold;margin-bottom:10px;color:#205CB0;font-size:14px;';
        htmlLabel.textContent = 'HTML';
        const htmlTextarea = document.createElement('textarea');
        htmlTextarea.style.cssText = 'flex:1;width:100%;font-family:monospace;font-size:14px;border:none;resize:none;outline:none;background:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;box-sizing:border-box;line-height:1.5;';
        htmlTextarea.value = html;
        htmlPanel.appendChild(htmlLabel);
        htmlPanel.appendChild(htmlTextarea);
        
        const cssPanel = document.createElement('div');
        cssPanel.style.cssText = 'flex:1;padding:15px;display:flex;flex-direction:column;';
        const cssLabel = document.createElement('div');
        cssLabel.style.cssText = 'font-weight:bold;margin-bottom:10px;color:#205CB0;font-size:14px;';
        cssLabel.textContent = 'CSS';
        const cssTextarea = document.createElement('textarea');
        cssTextarea.style.cssText = 'flex:1;width:100%;font-family:monospace;font-size:14px;border:none;resize:none;outline:none;background:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;box-sizing:border-box;line-height:1.5;';
        cssTextarea.value = css;
        cssPanel.appendChild(cssLabel);
        cssPanel.appendChild(cssTextarea);
        
        container.appendChild(htmlPanel);
        container.appendChild(cssPanel);
        
        editor.Modal.setTitle('Código Fuente');
        editor.Modal.setContent(container);
        editor.Modal.open();
        
        // Aumentar tamaño del modal
        const modalEl = editor.Modal.getModal();
        if (modalEl) {
          modalEl.style.maxWidth = '90vw';
          modalEl.style.width = '90vw';
          modalEl.style.height = '80vh';
        }
        
        htmlTextarea.addEventListener('input', () => {
          editor.setComponents(htmlTextarea.value);
        });
        cssTextarea.addEventListener('input', () => {
          editor.setStyle(cssTextarea.value);
        });
      }
    });

      // Handle Context Menu (Right Click)
      editor.on('canvas:contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        const component = editor.getSelected();
        if (component) {
          // Dispatch custom event to React parent for context menu
          const event = new CustomEvent('editor:contextmenu', {
            detail: { 
              x: e.clientX, 
              y: e.clientY,
              componentId: component.getId()
            }
          });
          window.dispatchEvent(event);
        }
      });

      // Auto-save version on significant changes
      const handleVersionSave = () => {
        const ed = editor as any;
        // Debounce version saves to avoid too many versions
        if (ed.Versions._saveTimeout) {
          clearTimeout(ed.Versions._saveTimeout);
        }
        ed.Versions._saveTimeout = setTimeout(() => {
          editor.runCommand('save-version', {
            description: `Auto-save ${new Date().toLocaleTimeString()}`
          });
        }, 5000); // Save version every 5 seconds max
      };

      // Listen for changes that should trigger version saves
      editor.on('style:property:update', handleVersionSave);
      editor.on('stack:change', handleVersionSave);

      // Listener para bloques generados por IA (DeepSeek con GrapesJS nativo)
      const handleAiBlock = (e: any) => {
        const { html, css, traits, description } = e.detail;
        if (editorRef.current) {
          const editor = editorRef.current;
          if (css) editor.Css.addRules(css);

          if (traits && traits.length > 0) {
            // Crear type ID único para este componente
            const typeId = `ai-block-${Date.now()}`;
            const traitNames = traits.map((t: any) => t.name);

            // Generar script genérico que sincroniza data-* attributes con el DOM
            const scriptFn = function (this: HTMLElement) {
              const el = this;
              const update = () => {
                traitNames.forEach((name: string) => {
                  const value = el.getAttribute(name);
                  if (!value) return;
                  const attrName = name.replace('data-', '');
                  const targets = el.querySelectorAll<HTMLElement>(`[data-bind="${attrName}"]`);
                  targets.forEach(t => t.textContent = value);
                });
              };
              const obs = new MutationObserver(() => update());
              obs.observe(el, { attributes: true, attributeFilter: traitNames });
              update();
            };

            // Registrar type dinámico con traits + script
            try {
              editor.DomComponents.addType(typeId, {
                model: {
                  defaults: {
                    traits: traits.map((t: any) => ({
                      type: t.type || 'text',
                      label: t.label,
                      name: t.name,
                      placeholder: t.placeholder || ''
                    })),
                    components: html,
                    script: scriptFn,
                    draggable: true,
                    editable: true
                  }
                }
              });
            } catch (e) {
              console.warn('[AI] Error registrando type, fallback a HTML plano:', e);
            }

            const selected = editor.getSelected();
            if (selected) {
              selected.append({ type: typeId });
            } else {
              editor.addComponents({ type: typeId });
            }
            toast.success(`IA: "${description || 'Bloque'}" añadido con traits editables.`);
          } else {
            // Fallback: HTML plano
            const selected = editor.getSelected();
            if (selected) {
              selected.append(html);
            } else {
              editor.addComponents(html);
            }
            toast.success("IA: Bloque inyectado con éxito.");
          }
        }
      };
      window.addEventListener('editor:add-block', handleAiBlock);

      // Fix image sources on project load to ensure they're preserved
      editor.on('load', () => {
        const fixImageSources = () => {
          const components = editor.DomComponents.getAll();
          components.forEach((comp: any) => {
            const tagName = comp.get('tagName');
            if (tagName?.toLowerCase() === 'img') {
              const attrs = comp.get('attributes') || {};
              if (attrs.src && (attrs.src.startsWith('data:') || attrs.src.startsWith('/'))) {
                // Ensure image src is preserved
                comp.set('attributes', { ...attrs });
              }
            }
            // Also fix background images
            const style = comp.getStyle();
            if (style && style['background-image'] && style['background-image'].startsWith('url(')) {
              comp.setStyle({ ...style });
            }
          });
        };
        setTimeout(fixImageSources, 500);
      });

      // Configure asset manager upload
      editor.on('load', () => {
        const am = editor.AssetManager;
        if (am) {
          (am as any).config.upload = 1;
          (am as any).config.uploadName = 'file';
          (am as any).config.multiUpload = false;
          
          (am as any).config.uploadFile = async (e: any) => {
            const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
            if (!files || files.length === 0) return;
            
            const file = files[0];
            const isSmallFile = file.size < 4 * 1024 * 1024; // < 4MB

            try {
              let finalUrl = '';

              if (isSmallFile) {
                // Flujo A: Archivo pequeño (<4MB), subir vía servidor para evitar problemas de CORS
                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch('/api/upload/catalogo', {
                  method: 'POST',
                  body: formData,
                });

                if (!res.ok) {
                  const errorData = await res.json().catch(() => ({}));
                  throw new Error(errorData.error || `Error ${res.status}: ${res.statusText}`);
                }

                const data = await res.json();
                if (!data.url) {
                  throw new Error('No se recibió la URL de la imagen');
                }
                finalUrl = data.url;
              } else {
                // Flujo B: Archivo grande (>=4MB, como GIFs animados pesados). Subir directo usando URL firmada
                const presignedRes = await fetch('/api/upload/catalogo/presigned', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type || 'image/png',
                  }),
                });

                if (!presignedRes.ok) {
                  const errorData = await presignedRes.json().catch(() => ({}));
                  throw new Error(errorData.error || `Error al autorizar subida pesada: ${presignedRes.statusText}`);
                }

                const { uploadUrl, publicUrl } = await presignedRes.json();

                // Determinar Content-Type mapeado
                let contentType = file.type || 'image/png';
                const ext = file.name.split('.').pop()?.toLowerCase();
                if (ext === 'gif') {
                  contentType = 'image/gif';
                } else if (ext === 'png') {
                  contentType = 'image/png';
                } else if (ext === 'jpg' || ext === 'jpeg') {
                  contentType = 'image/jpeg';
                } else if (ext === 'webp') {
                  contentType = 'image/webp';
                } else if (ext === 'svg') {
                  contentType = 'image/svg+xml';
                }

                const uploadRes = await fetch(uploadUrl, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': contentType,
                  },
                  body: file,
                });

                if (!uploadRes.ok) {
                  throw new Error(`Error en la carga directa al almacenamiento (${uploadRes.status}). Verifica la configuración CORS de tu bucket S3/R2.`);
                }

                finalUrl = publicUrl;
              }

              // Registrar el recurso y asociarlo
              am.add(finalUrl);
              
              const selected = editor.getSelected();
              if (selected && selected.is('image')) {
                selected.set('src', finalUrl);
                am.close();
              }
              
              toast.success('Imagen subida con éxito');
              return;
            } catch (err: any) {
              console.error('[AssetManager] Upload error:', err);
              toast.error(`Error de subida: ${err.message}`);
            }
          };
          
          // Configure the asset manager to render to our container
          am.render();
        }
      });

      (window as any).editor = editor;

    // Inject global B&W style overrides
    const styleId = 'gjs-style-overrides';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    
    if (style) {
      style.innerHTML = `
      :root {
        --gjs-font-color: #000000;
        --gjs-main-color: #ffffff;
        --gjs-primary-color: #6366f1;
        --gjs-secondary-color: #ffffff;
      }
    `;
    }

    const ed = editor as any;
    // Initialize version tracking if not exists
    if (!ed.Versions) {
      ed.Versions = {
        history: [],
        currentIndex: -1,
        maxHistory: 50
      };
    }

    // Ensure all styles are properly serialized
    const normalizeStyles = () => {
      ed.getAllStyles().forEach((rule: any) => {
        const selectors = rule.getSelectors();
        selectors.forEach((sel: any) => {
          const selStr = typeof sel === 'string' ? sel : sel.toString();
          if (selStr && !selStr.startsWith('.gjs-') && !selStr.startsWith('*')) {
            const style = rule.getStyle();
            // Ensure negative margins and positioning are preserved
            if (style.margin || style.marginTop || style.marginBottom) {
              const str = JSON.stringify(style);
              if (str.includes('-')) {
                // Style contains negative values - keep as is
              }
            }
          }
        });
      });
    };

    editor.on('style:applied', normalizeStyles);

      return () => {
        if (editorRef.current) {
          editorRef.current.destroy();
          editorRef.current = null;
        }
        // Clear the global ref so we don't return a stale/destroyed editor
        if (typeof window !== 'undefined' && (window as any).editor) {
          (window as any).editor = null;
        }
        if (style) style.remove();
        if (autoSaveTimeout.current) {
          clearTimeout(autoSaveTimeout.current);
        }
        const ed = editor as any;
        if (ed.Versions._saveTimeout) {
          clearTimeout(ed.Versions._saveTimeout);
        }
        editor.off('component:update', handleVersionSave);
        editor.off('style:property:update', handleVersionSave);
        editor.off('stack:change', handleVersionSave);
        editor.off('style:applied', normalizeStyles);
        window.removeEventListener('editor:add-block', handleAiBlock);
      };
   }, []);

   // Auto-save with debounce
   useEffect(() => {
     if (!editorRef.current) return;

     const handleAutoSave = () => {
       if (autoSaveTimeout.current) {
         clearTimeout(autoSaveTimeout.current);
       }
       autoSaveTimeout.current = setTimeout(async () => {
         setAutoSaveStatus('saving');
         try {
           const projectData = editorRef.current?.getProjectData();
           const html = editorRef.current?.getHtml({ cleanId: false }) || "";
           const css = editorRef.current?.getCss() || '';
           
           if (onSave) {
             await onSave({
               projectData: projectData || {},
               html,
               css,
               estado: "auto-save"
             });
             setAutoSaveStatus('success');
           }
         } catch (err) {
           console.error('[GrapesEditor] Auto-save error:', err);
           setAutoSaveStatus('error');
         }
       }, 3000); // 3 segundos de debounce
     };

     const editor = editorRef.current;
     editor.on('component:update', handleAutoSave);
     editor.on('style:property:update', handleAutoSave);
     editor.on('stack:change', handleAutoSave); // Para undo/redo
     
     return () => {
       editor.off('component:update', handleAutoSave);
       editor.off('style:property:update', handleAutoSave);
       editor.off('stack:change', handleAutoSave);
       if (autoSaveTimeout.current) {
         clearTimeout(autoSaveTimeout.current);
       }
     };
   }, [editorRef, onSave]);

  // Keep the ref in sync with the prop so the 'load' event handler always has fresh data
  useEffect(() => {
    initialDataRef.current = initialData;
    // If the editor is already initialized (e.g. hot-reload or prop change after mount),
    // load the data directly — no race condition possible here since we know it's ready.
    if (editorRef.current && initialData) {
      const data = initialData as any;
      const hasData = (data.pages && data.pages.length > 0) || (data.components && data.components.length > 0);
      if (hasData) {
        try {
          editorRef.current.loadProjectData(data);
        } catch (e) {
          console.warn('[GrapesEditor] initialData load failed on prop update:', e);
        }
      }
    }
  }, [initialData]);

  return <div id="gjs" style={{ height: "100%", width: "100%" }} />
});

GrapesEditor.displayName = "GrapesEditor";
export default GrapesEditor;