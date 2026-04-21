"use client"

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react"
import grapesjs, { Editor } from "grapesjs"
import "grapesjs/dist/css/grapes.min.css"

import "./styles/BlockStyles.css"

import gjsBlocksBasic from "grapesjs-blocks-basic"
import gjsPluginForms from "grapesjs-plugin-forms"
import gjsComponentCountdown from "grapesjs-component-countdown"
import gjsCustomCode from "grapesjs-custom-code"
import gjsNavbar from "grapesjs-navbar"
import gjsTyped from "grapesjs-typed"
import gjsTooltip from "grapesjs-tooltip"
import gjsMaterialIcons from "grapesjs-google-material-icons"
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
}

const GrapesEditor = forwardRef<GrapesEditorRef, GrapesEditorProps>(({ initialData, onSave, device = "desktop", preview = false, templateId = "blank", pageTitle = 'Página sin título', mode = 'webpage' }, ref): React.ReactElement => {
  const editorRef = useRef<Editor | null>(null)
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  useImperativeHandle(ref, () => ({
    exportProject: () => editorRef.current?.getProjectData() as Record<string, unknown>,
    importProject: (data) => editorRef.current?.loadProjectData(data),
    runCommand: (cmd, opt) => editorRef.current?.runCommand(cmd, opt),
    stopCommand: (cmd, opt) => editorRef.current?.stopCommand(cmd, opt),
    getEditor: () => editorRef.current,
    getUndoManager: () => editorRef.current?.UndoManager ?? null,
    getHtml: () => editorRef.current?.getHtml({ cleanId: false, addScripts: true }),
    getCss: () => editorRef.current?.getCss() || '',
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

    const editor = grapesjs.init({
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
      plugins: [gjsBlocksBasic, gjsPluginForms, gjsComponentCountdown, gjsCustomCode, gjsNavbar, gjsTyped, gjsTooltip, gjsMaterialIcons],
      pluginsOpts: {
        [gjsBlocksBasic.toString()]: {
          blocks: ['column1', 'column2', 'column3', 'column3-7', 'text', 'heading', 'link', 'image', 'video', 'map'],
          category: 'Basic'
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
        scripts: [
          "https://cdn.jsdelivr.net/npm/tailwindcss@3.4.1/dist/tailwind.min.css",
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap",
          "data:text/javascript;base64,ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbihlKSB7CiAgdmFyIGVsID0gZS50YXJnZXQuY2xvc2VzdCgnW2hyZWZdJyk7CiAgaWYgKGVsICYmIGVsLnRhZ05hbWUgIT09ICdBJyAmJiAhZWwuY2xvc2VzdCgnYScpKSB7CiAgICB2YXIgdXJsID0gZWwuZ2V0QXR0cmlidXRlKCdocmVmJyk7CiAgICB2YXIgdGFyZ2V0ID0gZWwuZ2V0QXR0cmlidXRlKCd0YXJnZXQnKTsKICAgIGlmICh1cmwpIHsKICAgICAgaWYgKHRhcmdldCA9PT0gJ19ibGFuaycpIHdpbmRvdy5vcGVuKHVybCk7CiAgICAgIGVsc2Ugd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7CiAgICB9CiAgfQp9KTs="
        ],
        styles: [
          "https://cdn.jsdelivr.net/npm/tailwindcss@3.4.1/dist/tailwind.min.css",
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap",
          "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
          "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
          "https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
            ...(mode === 'document' ? [
                `
                body { 
                  background-color: #f1f5f9; 
                  display: flex; 
                  flex-direction: column; 
                  align-items: center; 
                  padding: 40px;
                }
                .gjs-pn-views-container { background: white; }
                /* A4 Page Simulation */
                #wrapper {
                  width: 210mm;
                  min-height: 297mm;
                  background: white;
                  box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
                  margin: 0 auto;
                  padding: 1in;
                  box-sizing: border-box;
                }
                `
              ] : [])
        ],
      },
    })

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
      
      // Fix for category labels and IDs to match CSS
      const bm = editor.BlockManager;
      
      // Ensure 'Forms' category is renamed
      const formsCat = bm.getCategories().get('Forms');
      if (formsCat) formsCat.set('label', 'Formularios 📝');

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

      // Listener para bloques generados por IA
      const handleAiBlock = (e: any) => {
        const { html, css } = e.detail;
        if (editorRef.current) {
          const editor = editorRef.current;
          // Añadir CSS globalmente
          if (css) editor.Css.addRules(css);
          
          // Añadir HTML al componente seleccionado o al final del body
          const selected = editor.getSelected();
          if (selected) {
            selected.append(html);
          } else {
            editor.addComponents(html);
          }
          
          toast.success("IA: Bloque inyectado con éxito.");
        }
      };
      window.addEventListener('editor:add-block', handleAiBlock);

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

      return () => {
        if (editorRef.current) {
          editorRef.current.destroy();
          editorRef.current = null;
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

  useEffect(() => {
    if (editorRef.current && initialData) {
      const data = initialData as any;
      const hasData = (data.pages && data.pages.length > 0) || (data.components && data.components.length > 0);
      if (hasData) {
        setTimeout(() => editorRef.current?.loadProjectData(data), 100);
      }
    }
  }, [initialData]);

  return <div id="gjs" style={{ height: "100%", width: "100%" }} />
});

GrapesEditor.displayName = "GrapesEditor";
export default GrapesEditor;