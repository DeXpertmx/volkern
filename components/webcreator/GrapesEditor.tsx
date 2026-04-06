"use client"

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react"
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

  useImperativeHandle(ref, () => ({
    exportProject: () => editorRef.current?.getProjectData() as Record<string, unknown>,
    importProject: (data) => editorRef.current?.loadProjectData(data),
    runCommand: (cmd, opt) => editorRef.current?.runCommand(cmd, opt),
    stopCommand: (cmd, opt) => editorRef.current?.stopCommand(cmd, opt),
    getEditor: () => editorRef.current,
    getUndoManager: () => editorRef.current?.UndoManager ?? null,
    getHtml: () => editorRef.current?.getHtml({ cleanId: false }),
    getCss: () => editorRef.current?.getCss() || '',
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
      plugins: [gjsBlocksBasic, gjsPluginForms, gjsComponentCountdown, gjsCustomCode, gjsNavbar, gjsTyped, gjsTooltip],
      pluginsOpts: {
        [gjsBlocksBasic.toString()]: {
          blocks: ['column1', 'column2', 'column3', 'column3-7', 'text', 'link', 'image', 'video', 'map'],
          category: 'Basic'
        },
        'gjs-plugin-forms': {
          category: 'Forms'
        }
      },
      canvas: {
        styles: [
          "https://cdn.jsdelivr.net/npm/tailwindcss@3.4.1/dist/tailwind.min.css",
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap",
          ...(mode === 'document' ? [
            `
            body { 
              background-color: #f1f5f9 !important; 
              display: flex !important; 
              flex-direction: column !important; 
              align-items: center !important; 
              padding: 40px !important;
            }
            .gjs-pn-views-container { background: white !important; }
            /* A4 Page Simulation */
            #wrapper {
              width: 210mm !important;
              min-height: 297mm !important;
              background: white !important;
              box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
              margin: 0 auto !important;
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

    (window as any).editor = editor;

    // Inject global B&W style overrides
    const styleId = 'gjs-style-overrides';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.innerHTML = `
      :root {
        --gjs-font-color: #000000 !important;
        --gjs-main-color: #ffffff !important;
        --gjs-primary-color: #6366f1 !important;
        --gjs-secondary-color: #ffffff !important;
      }
    `;

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
      if (style) style.remove();
    };
  }, []);

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