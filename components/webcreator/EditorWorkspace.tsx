"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Layers,
  Search,
  Settings,
  Eye,
  Save,
  Undo,
  Redo,
  Monitor,
  Smartphone,
  Tablet,
  Package,
  ImageIcon,
  Palette,
  ChevronRight,
  ChevronLeft,
  X,
  Type,
  Layout,
  MousePointer2,
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Zap,
  MoreVertical,
  Globe,
  Lock,
  Users,
  Download,
  Upload,
  Moon,
  Sun,
  Laptop,
  ArrowLeft,
  ExternalLink,
  Grid,
  List,
  Filter,
  SortAsc,
  History,
  Share2,
  Copy,
  Trash2 as LucideTrash2,
  Code2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import GrapesEditor, { GrapesEditorRef } from "./GrapesEditor";
import { saveTemplate, loadAllTemplates, deleteTemplate, TemplateRecord } from "../../lib/webcreator/templateStorage";
import { TemplateGallery, getTemplateData } from "./templates";

interface EditorWorkspaceProps {
  initialData?: Record<string, unknown>;
  pageId?: string;
  pageTitle?: string;
  slug?: string;
  templateId?: string;
  backUrl?: string;
  mode?: 'webpage' | 'email' | 'document';
  onSave?: (data: { projectData: Record<string, unknown>; html?: string; css?: string; estado?: string }) => void;
}

const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({ initialData, pageId, pageTitle, slug, templateId, backUrl, onSave, mode = 'webpage' }) => {
  const [activePanel, setActivePanel] = useState<string>("blocks");
  const [activePropertyTab, setActivePropertyTab] = useState<string>("styles");
  const [device, setDevice] = useState<string>("desktop");
  const [preview, setPreview] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedComponentInfo, setSelectedComponentInfo] = useState<{type: string; classes: string[]; path: string[]} | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [historyItems, setHistoryItems] = useState<string[]>([]);
  
  // New States for Features
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; componentId: string } | null>(null);
  const [showCanvaModal, setShowCanvaModal] = useState(false);
  const [canvaTargetComponentId, setCanvaTargetComponentId] = useState<string | null>(null);

  const editorRef = useRef<GrapesEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // System Theme Sync
  useEffect(() => {
    if (theme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  // Load Templates
  const refreshTemplates = async () => {
    const all = await loadAllTemplates();
    setTemplates(all.sort((a, b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    refreshTemplates();
  }, []);

  // Connect to GrapesJS events for component info and history
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    const connectEditor = () => {
      const editor = editorRef.current?.getEditor();
      if (!editor) return;
      clearInterval(pollInterval);

      editor.on('component:selected', (component: any) => {
        if (!component) { setSelectedComponentInfo(null); return; }
        const type = component.get('type') || component.get('tagName') || 'elemento';
        const classes = component.getClasses ? component.getClasses() : [];
        const path: string[] = [];
        let cur = component;
        let depth = 0;
        while (cur && depth < 5) {
          const t = cur.get('type') || cur.get('tagName') || '';
          if (t && t !== 'wrapper') path.unshift(t);
          cur = cur.parent ? cur.parent() : null;
          depth++;
        }
        setSelectedComponentInfo({ type, classes, path });
      });

      editor.on('component:deselected', () => setSelectedComponentInfo(null));

      // Track undo history for the history panel
      const syncHistory = () => {
        try {
          const um = editorRef.current?.getUndoManager?.();
          if (um) {
            const stack = um.getStack ? um.getStack() : [];
            setHistoryItems(stack.map((_: any, i: number) => `Cambio ${i + 1}`).reverse().slice(0, 20));
          }
        } catch {}
      };
      editor.on('component:update', syncHistory);
      editor.on('style:property:update', syncHistory);
    };

    pollInterval = setInterval(() => {
      const editor = editorRef.current?.getEditor();
      if (editor) connectEditor();
    }, 500);

    return () => clearInterval(pollInterval);
  }, []);

  // Features Event Listeners
  useEffect(() => {
    const handleOpenCanva = (e: any) => {
      setCanvaTargetComponentId(e.detail.componentId);
      setShowCanvaModal(true);
    };

    const handleContextMenu = (e: any) => {
      setContextMenu({ x: e.detail.x, y: e.detail.y, componentId: e.detail.componentId });
    };

    window.addEventListener('editor:open-canva', handleOpenCanva);
    window.addEventListener('editor:contextmenu', handleContextMenu);
    
    // Close context menu on click anywhere
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);

    return () => {
      window.removeEventListener('editor:open-canva', handleOpenCanva);
      window.removeEventListener('editor:contextmenu', handleContextMenu);
      window.removeEventListener('click', closeMenu);
    };
  }, []);

  const handleCanvaDesignPublished = (url: string) => {
    const editor = editorRef.current?.getEditor();
    if (editor && canvaTargetComponentId) {
      const component = editor.Components.getById(canvaTargetComponentId);
      if (component) {
        // If it's an image, update src. If it's a button/div, update background.
        const type = component.get('type');
        if (type === 'image') {
          component.set('attributes', { ...component.getAttributes(), src: url });
        } else {
          component.addStyle({ 'background-image': `url("${url}")`, 'background-size': 'cover', 'background-position': 'center' });
        }
        toast.success("Diseño de Canva aplicado correctamente");
      }
    }
    setShowCanvaModal(false);
  };

  // Block search DOM filter
  useEffect(() => {
    if (activePanel !== 'blocks') return;
    const timer = setTimeout(() => {
      const container = document.getElementById('blocks-container');
      if (!container) return;
      const blocks = container.querySelectorAll('.gjs-block');
      blocks.forEach(block => {
        const label = block.querySelector('.gjs-block-label')?.textContent?.toLowerCase() || '';
        const matches = searchQuery === '' || label.includes(searchQuery.toLowerCase());
        (block as HTMLElement).style.display = matches ? '' : 'none';
      });
      // Hide empty categories
      const categories = container.querySelectorAll('.gjs-block-category');
      categories.forEach(cat => {
        // Find sibling block wrappers after this category
        let next = cat.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains('gjs-block-category')) {
          if ((next as HTMLElement).style.display !== 'none') hasVisible = true;
          next = next.nextElementSibling;
        }
        (cat as HTMLElement).style.display = !hasVisible && searchQuery !== '' ? 'none' : '';
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, activePanel]);

  // Zoom control: apply canvas scale via CSS
  useEffect(() => {
    const frame = document.querySelector('.gjs-cv-canvas') as HTMLElement;
    if (!frame) return;
    const scale = zoom / 100;
    frame.style.transform = zoom !== 100 ? `scale(${scale})` : '';
    frame.style.transformOrigin = 'top left';
  }, [zoom]);


  const handleSaveAsTemplate = async () => {
    console.log('[EditorWorkspace] handleSaveAsTemplate triggered');
    const name = window.prompt("Nombre de la nueva plantilla:");
    if (name === null) {
      console.log('[EditorWorkspace] Template save cancelled by user');
      return;
    }
    if (name.trim() === "") {
      toast.error("El nombre de la plantilla no puede estar vacío");
      return;
    }
    
    if (!editorRef.current) {
      toast.error("El editor no está listo");
      return;
    }

    const toastId = toast.loading("Generando vista previa y guardando plantilla...");

    const editor = editorRef.current.getEditor();
    if (!editor) return;

    const projectData = editorRef.current.exportProject();
    if (!projectData) return;

    // Auto-generate thumbnail using html-to-image on the canvas iframe body
    let thumbnail = "";
    try {
      const iframe = document.querySelector('#gjs iframe') as HTMLIFrameElement;
      const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
      const wrapperEl = iframeDoc?.querySelector('#wrapper') || iframeDoc?.body;
      
      if (wrapperEl) {
        const htmlToImage = await import('html-to-image');
        thumbnail = await htmlToImage.toJpeg(wrapperEl as HTMLElement, { 
          quality: 0.8,
          width: 800,
          style: { transform: 'scale(1)', transformOrigin: 'top left' }
        });
      }
    } catch (e) {
      console.warn("Could not extract thumbnail:", e);
    }

    const record: TemplateRecord = {
      idx: Date.now().toString(),
      id: name || "Sin título",
      html: editor.getHtml(),
      css: editor.getCss() || "",
      projectData,
      thumbnail,
      createdAt: Date.now()
    };

    try {
      await saveTemplate(record);
      toast.success("¡Plantilla guardada con éxito!", { id: toastId });
      refreshTemplates();
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar la plantilla", { id: toastId });
    }
  };

  const handleLoadTemplate = (template: TemplateRecord) => {
    if (confirm(`¿Cargar la plantilla "${template.id}"? Se perderán los cambios no guardados.`)) {
      editorRef.current?.importProject(template.projectData);
      setShowTemplateManager(false);
    }
  };

  const handleSelectSystemTemplate = async (templateId: string) => {
    // Clear any previous toasts to avoid cumulative UI blocking
    toast.dismiss();
    
    console.log('[EditorWorkspace] Selecting template:', templateId);
    const toastId = toast.loading(`Cargando plantilla: ${templateId}...`);
    
    // Automatically close gallery to avoid blocking UI
    setShowTemplateGallery(false);

    try {
      console.log('[EditorWorkspace] Loading template data...');
      const templateData = getTemplateData(templateId);
      console.log('[EditorWorkspace] Template data:', templateData);

      const editor = editorRef.current?.getEditor();
      if (!editor) {
        console.error('[EditorWorkspace] Editor not available');
        toast.error('Editor no disponible', { id: toastId });
        return;
      }

      if (templateData && templateData.loadProjectData) {
        console.log('[EditorWorkspace] Loading template projectData dynamically');
        const rawData = await templateData.loadProjectData();
        console.log('[EditorWorkspace] rawData returned by import():', rawData);
        
        // Sometimes Webpack wraps JSON in default, sometimes it returns it directly
        const projectData = rawData && rawData.default ? rawData.default : rawData;
        console.log('[EditorWorkspace] Final projectData to load:', projectData);
        
        // Ensure it's a valid object
        if (typeof projectData === 'object' && projectData !== null) {
          editor.loadProjectData(projectData);
          toast.success(`Plantilla "${templateId}" cargada correctamente`, { id: toastId });
        } else {
          throw new Error("El formato del JSON cargado no es un objeto válido");
        }
      } else if (templateData && templateData.projectData) {
        console.log('[EditorWorkspace] Setting template projectData from JSON in memory');
        editor.loadProjectData(templateData.projectData);
        toast.success(`Plantilla "${templateId}" cargada correctamente`, { id: toastId });
      } else if (templateData && templateData.html) {
        console.log('[EditorWorkspace] Setting components...');
        editor.setComponents(templateData.html);
        if (templateData.css) {
          console.log('[EditorWorkspace] Adding CSS rules...');
          editor.Css.addRules(templateData.css);
        }
        toast.success(`Plantilla "${templateId}" cargada correctamente`, { id: toastId });
      } else {
        console.error('[EditorWorkspace] Template data not found for:', templateId);
        toast.error('No se encontró la plantilla', { id: toastId });
      }
    } catch (err) {
      console.error('[EditorWorkspace] Error loading template:', err);
      toast.error('Error al cargar la plantilla', { id: toastId });
    } finally {
      setShowTemplateGallery(false);
      console.log('[EditorWorkspace] Gallery closed');
    }
  };

  const handleDeleteTemplate = async (e: React.MouseEvent, idx: string) => {
    e.stopPropagation();
    if (confirm("¿Eliminar esta plantilla?")) {
      await deleteTemplate(idx);
      refreshTemplates();
    }
  };

  const handleDownloadProject = () => {
    const data = editorRef.current?.exportProject();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (pageTitle || 'proyecto').toLowerCase().replace(/[^a-z0-9]/g, '-');
    link.download = `volkern-${safeTitle}-${timestamp}.grapesjs`;
    link.click();
    toast.success("Proyecto exportado correctamente");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Toast informativo de inicio
    const toastId = toast.loading(`Leyendo archivo: ${file.name}...`);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        
        if (!result || typeof result !== 'string' || result.trim() === '') {
          throw new Error("El archivo seleccionado está vacío o no tiene un formato de texto válido.");
        }

        console.log(`[EditorWorkspace] Content read from ${file.name}, length: ${result.length}`);
        
        const data = JSON.parse(result);
        
        if (!editorRef.current) {
          throw new Error("El editor no está inicializado.");
        }

        editorRef.current.importProject(data);
        toast.success("Proyecto importado correctamente", { id: toastId });
      } catch (err) {
        console.error("[EditorWorkspace] Import Error:", err);
        const errorMessage = err instanceof SyntaxError 
          ? "El archivo no es un JSON válido. Por favor, verifica el contenido."
          : (err as any).message || "Error desconocido al importar";
        
        toast.error(errorMessage, { id: toastId });
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      toast.error("Error físico al leer el archivo desde el disco.", { id: toastId });
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    reader.readAsText(file);
  };

  const handleManualSave = async () => {
    if (!editorRef.current) {
      console.error('[EditorWorkspace] No editor reference available');
      toast.error("Editor no disponible");
      return;
    }

    setIsSaving(true);
    try {
      const projectData = editorRef.current.exportProject();
      const html = editorRef.current.getHtml() || "";
      const css = editorRef.current.getCss() || "";

      // Log para depuración
      console.log('[EditorWorkspace] Export data:', {
        hasProjectData: !!projectData,
        projectDataKeys: projectData ? Object.keys(projectData) : [],
        projectDataSize: projectData ? JSON.stringify(projectData).length : 0,
        htmlLength: html.length,
        cssLength: css.length,
      });

      // Combine HTML with CSS for better rendering in public pages
      const fullHtml = css ? `<style>${css}</style>${html}` : html;

      if (onSave) {
        await onSave({
          projectData: projectData || {},
          html: fullHtml,
          css,
          estado: "draft"
        });
      } else {
        console.warn('[EditorWorkspace] No onSave callback provided');
      }

      setLastSaved(new Date());
      toast.success("Cambios guardados");
    } catch (err) {
      console.error('[EditorWorkspace] Save error:', err);
      toast.error("Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!editorRef.current) return;

    setIsPublishing(true);
    try {
      const projectData = editorRef.current.exportProject();
      const html = editorRef.current.getHtml() || "";
      const css = editorRef.current.getCss() || "";

      // Combine HTML with CSS for better rendering in public pages
      const fullHtml = css ? `<style>${css}</style>${html}` : html;

      if (onSave) {
        await onSave({
          projectData: projectData || {},
          html: fullHtml,
          css,
          estado: "published"
        });
      }

      setLastSaved(new Date());
      toast.success("Página publicada con éxito");
    } catch (err) {
      console.error(err);
      toast.error("Error al publicar");
    } finally {
      setIsPublishing(false);
    }
  };

  const filteredTemplates = templates.filter(template => 
    template.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.idx.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle dark mode
  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'auto';
      return 'light';
    });
  };

  // Close save dropdown when clicking outside
  useEffect(() => {
    if (!showSaveDropdown) return;
    const handler = () => setShowSaveDropdown(false);
    document.addEventListener('click', handler, { capture: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, [showSaveDropdown]);

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-950 text-gray-900 dark:text-gray-100">
      {/* Top Toolbar */}
      <header className="h-auto min-h-[56px] border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 flex items-center justify-between shadow-sm z-50 gap-y-2 gap-x-4 overflow-hidden">
        {/* LEFT: Core Actions (Back, Saving, Templates) */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => router.push(backUrl || "/dashboard/webcreator")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-all shrink-0"
          >
            <ArrowLeft size={15} />
            <span className="hidden lg:inline">Volver</span>
          </button>

          <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-gradient-to-br from-purple-600 to-blue-600 rounded-md flex items-center justify-center shadow-[0_2px_8px_rgba(124,58,237,0.25)]">
              <Zap className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-gray-900 dark:text-white hidden xl:inline">
              {mode === 'webpage' ? 'Volkern Creator' : mode === 'email' ? 'Email Marketing' : 'Gestor de Documentos'}
            </span>
          </div>

          <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

          {/* Group: Save & Templates - PLACED LEFT FOR VISIBILITY */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Split Save Button */}
            <div className="flex items-stretch relative shrink-0">
              <button
                onClick={handleManualSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-l-lg text-sm font-bold shadow transition-all disabled:opacity-70"
                title="Guardar cambios (Ctrl+S)"
              >
                {isSaving ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Save size={14} />}
                <span>Guardar</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowSaveDropdown(prev => !prev)}
                  className="flex items-center justify-center px-1.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-r-lg text-sm font-bold shadow transition-all border-l border-indigo-500"
                  title="Más opciones"
                >
                  <ChevronRight size={13} className="rotate-90" />
                </button>
                {showSaveDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-[100] overflow-hidden">
                    <button
                      onClick={() => { handleSaveAsTemplate(); setShowSaveDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <Save size={14} className="text-purple-500" />
                      Guardar como plantilla
                    </button>
                    <button
                      onClick={() => { handleDownloadProject(); setShowSaveDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <Download size={14} className="text-blue-500" />
                      Exportar JSON
                    </button>
                    <div className="h-px bg-gray-100 dark:bg-slate-700 mx-3" />
                    <button
                      onClick={() => { handlePublish(); setShowSaveDropdown(false); }}
                      disabled={isPublishing}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 text-left"
                    >
                      <Zap size={14} className="text-amber-500" />
                      Publicar diseño
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Templates dropdown */}
            <div className="relative group">
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all border border-purple-200 dark:border-purple-800"
              >
                <Layout size={14} />
                <span className="hidden sm:inline">Plantillas</span>
                <ChevronRight size={12} className="rotate-90 opacity-60" />
              </button>
              <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] overflow-hidden">
                <button
                  onClick={() => setShowTemplateGallery(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <Sparkles size={15} className="text-purple-500" />
                  Galería de plantillas
                </button>
                <button
                  onClick={() => setShowTemplateManager(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <FolderOpen size={15} className="text-blue-500" />
                  Mis plantillas
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: Status Indicator (Moved from canvas to avoid obstruction) */}
        {!preview && (
          <div className="hidden lg:flex items-center gap-3 px-4 py-1.5 bg-gray-50/50 dark:bg-slate-900/50 border border-gray-100 dark:border-slate-800 rounded-xl transition-all">
            <div className="flex items-center gap-2">
              {isSaving ? (
                <span className="flex h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
              ) : (
                <span className="flex h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tight flex items-center gap-2">
                {isSaving ? "Guardando..." : lastSaved ? `Guardado ${lastSaved.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : "Lista para editar"}
                <span className="opacity-30">|</span>
                <span className="text-purple-600 dark:text-purple-400">
                  {mode === 'webpage' ? 'Página Web' : mode === 'email' ? 'Marketing Email' : 'Documento A4'}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* RIGHT: Secondary Actions (Undo, Zoom, Preview, Theme) */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === 'webpage' && (
            <div className="flex items-center gap-0.5 bg-gray-50 dark:bg-slate-900 p-0.5 rounded-lg border border-gray-100 dark:border-slate-700 shrink-0">
              {[
                { id: "desktop", icon: <Monitor size={14} />, title: "Escritorio" },
                { id: "tablet", icon: <Tablet size={14} />, title: "Tablet" },
                { id: "mobile", icon: <Smartphone size={14} />, title: "Móvil" },
              ].map(d => (
                <button
                  key={d.id}
                  onClick={() => setDevice(d.id)}
                  className={`p-1.5 rounded-md transition-all ${device === d.id ? "bg-white dark:bg-slate-800 shadow-sm text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"}`}
                  title={d.title}
                >
                  {d.icon}
                </button>
              ))}
            </div>
          )}

          <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => editorRef.current?.runCommand('core:undo')}
              className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
              title="Deshacer (Ctrl+Z)"
            >
              <Undo size={15} />
            </button>
            <button
              onClick={() => editorRef.current?.runCommand('core:redo')}
              className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
              title="Rehacer (Ctrl+Y)"
            >
              <Redo size={15} />
            </button>
          </div>

          <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

          {/* Zoom Control */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="text-xs font-semibold bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400"
              title="Zoom del canvas"
            >
              {[50, 75, 90, 100, 110, 125, 150].map(v => (
                <option key={v} value={v}>{v}%</option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

          {/* Preview toggle */}
          <button
            onClick={() => setPreview(!preview)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${preview ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"}`}
            title={preview ? "Salir de vista previa" : "Vista previa"}
          >
            <Eye size={15} />
            <span className="hidden lg:inline">{preview ? "Editar" : "Previa"}</span>
          </button>

          <button
            onClick={toggleTheme}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-all"
            title="Alternar tema"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Navigation Panels */}
        {!preview && (
          <nav className="w-16 bg-white dark:bg-slate-950 border-r border-gray-100 dark:border-slate-800 flex flex-col items-center py-4 gap-2 z-40">
            {[
              { id: "blocks", icon: <Layout size={20} />, label: "Bloques" },
              { id: "layers", icon: <Layers size={20} />, label: "Capas" },
              { id: "assets", icon: <ImageIcon size={20} />, label: "Media" },
              { id: "styles", icon: <Palette size={20} />, label: "Estilos" },
              { id: "cms", icon: <Database size={20} />, label: "CMS" },
              { id: "history", icon: <History size={20} />, label: "Historial" },
              { id: "code", icon: <Code2 size={20} />, label: "Código" },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === "code") {
                    editorRef.current?.runCommand("open-code");
                  } else {
                    setActivePanel(item.id);
                  }
                }}
                className={`p-3 rounded-xl transition-all group relative ${
                  activePanel === item.id 
                    ? "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" 
                    : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
                title={item.label}
              >
                {item.icon}
                <span className="absolute left-full ml-3 px-2 py-1 bg-gray-800 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                  {item.label}
                </span>
              </button>
            ))}

            <div className="flex-1" />

            <button
              onClick={() => {
                if (confirm("¿Salir del editor?")) {
                  router.push(backUrl || "/dashboard/webcreator");
                }
              }}
              className="p-3 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              title="Salir"
            >
              <X size={20} />
            </button>
          </nav>
        )}

        {/* Left Panel - Content based on active panel */}
        <AnimatePresence mode="wait">
          {activePanel && !preview && (
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-80 bg-white dark:bg-slate-950 border-r border-gray-100 dark:border-slate-800 flex flex-col z-30 shadow-lg"
            >
              <div className="h-16 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  {activePanel === "blocks" && <Layout size={18} className="text-purple-600 dark:text-purple-400" />}
                  {activePanel === "layers" && <Layers size={18} className="text-purple-600 dark:text-purple-400" />}
                  {activePanel === "assets" && <ImageIcon size={18} className="text-purple-600 dark:text-purple-400" />}
                  {activePanel === "styles" && <Palette size={18} className="text-purple-600 dark:text-purple-400" />}
                  {activePanel === "cms" && <Database size={18} className="text-purple-600 dark:text-purple-400" />}
                  {activePanel === "history" && <History size={18} className="text-purple-600 dark:text-purple-400" />}
                  <span className="font-bold text-sm">
                    {activePanel === "blocks" && "Bloques"}
                    {activePanel === "layers" && "Capas"}
                    {activePanel === "assets" && "Biblioteca de medios"}
                    {activePanel === "styles" && "Estilos"}
                    {activePanel === "cms" && "Content Management"}
                    {activePanel === "history" && "Historial de cambios"}
                  </span>
                </div>
                <button 
                  onClick={() => setActivePanel("")}
                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Blocks Panel */}
                <div className={`flex-1 flex flex-col ${activePanel === "blocks" ? "" : "hidden"}`}>
                  <div className="p-4 border-b border-gray-100 dark:border-slate-800">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Buscar bloques..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 outline-none transition-all dark:text-gray-200"
                      />
                    </div>
                  </div>
                  <div id="blocks-container" className="p-4" />
                </div>

                {/* History Panel */}
                <div className={`p-4 ${activePanel === "history" ? "" : "hidden"}`}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {historyItems.length > 0 ? `${historyItems.length} cambios registrados` : "Sin cambios registrados"}
                    </p>
                    <button
                      onClick={() => editorRef.current?.runCommand('core:undo')}
                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold"
                    >
                      Deshacer último
                    </button>
                  </div>
                  {historyItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <History className="mx-auto mb-3" size={28} />
                      <p className="text-sm">Comienza a editar para ver el historial</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {historyItems.map((item, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                            i === 0 ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-semibold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-purple-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                          <span className="truncate">{item}</span>
                          {i === 0 && <span className="ml-auto text-[10px] font-bold text-purple-500 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded-full">ACTUAL</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Layers Panel */}
                <div className={`p-4 ${activePanel === "layers" ? "" : "hidden"}`}>
                  <div id="layers-container" className="gjs-custom-layers" />
                </div>
                
                {/* Assets Panel */}
                <div className={`p-4 ${activePanel === "assets" ? "" : "hidden"}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Biblioteca de medios</h3>
                    <button className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-bold text-xs flex items-center gap-1">
                      <Plus size={14} />
                      <span>Subir</span>
                    </button>
                  </div>
                  <div id="assets-manager" />
                </div>
                
                {/* Styles Panel (Left Sidebar Version) */}
                <div className={`p-4 ${activePanel === "styles" ? "" : "hidden"}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Estilos personalizados</h3>
                    <button className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-bold text-xs flex items-center gap-1">
                      <Plus size={14} />
                      <span>Nuevo</span>
                    </button>
                  </div>
                  <div id="styles-manager" className="mt-4" />
                </div>
                
                {/* CMS Panel (Legacy/Custom React) */}
                {activePanel === "cms" && (
                  <div className="p-5 overflow-y-auto h-full">
                    <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-purple-50 dark:from-purple-900/30 dark:via-blue-900/30 dark:to-purple-900/30 rounded-2xl p-6 mb-6 border border-purple-100 dark:border-purple-900/50 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 text-purple-700 dark:text-purple-300 mb-4">
                         <div className="p-2 bg-purple-200/50 dark:bg-purple-900/50 rounded-lg">
                           <Sparkles size={18} className="fill-purple-700 dark:fill-purple-300" />
                         </div>
                         <span className="font-bold text-sm uppercase tracking-tight">AI Content Generation</span>
                      </div>
                      <p className="text-xs text-purple-600/85 dark:text-purple-300/85 leading-relaxed mb-5">Genera textos, imágenes y secciones completas usando el contexto de tu CRM.</p>
                      <button className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 dark:from-purple-600 dark:to-purple-700 dark:hover:from-purple-700 dark:hover:to-purple-800 text-white text-xs font-bold py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group">
                        <Zap size={14} className="fill-white group-hover:scale-110 transition-transform" />
                        Abrir Copiloto
                      </button>
                    </div>

                    <div className="space-y-5">
                       <div className="flex items-center justify-between px-1">
                         <div>
                           <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Tus Colecciones</h3>
                           <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Organiza y reutiliza contenido</p>
                         </div>
                         <button className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md">
                           <Plus size={14} />
                           <span>Nueva</span>
                         </button>
                       </div>
                       <div className="space-y-2.5">
                         {[
                           { name: "Blogs", count: 12, icon: <Type size={16} />, color: "text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" },
                           { name: "Servicios", count: 8, icon: <Database size={16} />, color: "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400" },
                           { name: "Testimonios", count: 24, icon: <Layout size={16} />, color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400" },
                           { name: "Equipo", count: 5, icon: <Users size={16} />, color: "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" },
                         ].map(collection => (
                           <div key={collection.name} className="flex items-center justify-between group cursor-pointer bg-white dark:bg-slate-800/50 hover:bg-gradient-to-r hover:from-gray-50 hover:to-transparent dark:hover:from-slate-800 dark:hover:to-transparent p-4 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-slate-700 shadow-sm hover:shadow-md">
                              <div className="flex items-center gap-4">
                                <div className={`p-2.5 rounded-xl ${collection.color} group-hover:scale-110 transition-transform`}>
                                  {collection.icon}
                                </div>
                              <span className="text-sm font-semibold text-gray-700">{collection.name}</span>
                            </div>
                            <span className="text-xs font-bold text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full">{collection.count}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Editor Main Canvas */}
        <main className={`flex-1 bg-gray-50/50 dark:bg-slate-950 flex flex-col relative overflow-auto custom-scrollbar ${mode === 'document' ? 'items-center pt-12 pb-24 bg-slate-200 dark:bg-slate-900' : ''}`}>

          <div 
            className={`transition-all duration-500 ${mode === 'document' ? 'shadow-2xl' : 'flex-1 overflow-hidden'}`}
            style={mode === 'document' ? { width: '210mm', minHeight: '297mm', backgroundColor: 'white' } : {}}
          >
             <GrapesEditor 
                ref={editorRef} 
                device={device} 
                preview={preview} 
                initialData={initialData} 
                templateId={templateId} 
                pageTitle={pageTitle}
                mode={mode} 
             />
          </div>
        </main>

        {/* Right Sidebar - Properties Panel */}
        {!preview && (
          <aside className="w-72 border-l border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950 z-40 flex flex-col shadow-lg">
            {/* Selected Component - Top Indicator */}
            <div className="px-4 py-3 bg-white dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                   <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                     Selección
                   </span>
                 </div>
                 {selectedComponentInfo && (
                   <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded-lg border border-purple-100 dark:border-purple-800/30">
                     <MousePointer2 size={10} />
                     {selectedComponentInfo.type}
                   </div>
                 )}
               </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-white dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800 shadow-sm relative z-10">
               {[
                 { id: "styles", label: "Estilos", icon: <Palette size={15} /> },
                 { id: "traits", label: "Propiedades", icon: <Settings size={15} /> },
                 { id: "classes", label: "Clases", icon: <Layers size={15} /> },
               ].map(tab => (
                 <button
                  key={tab.id}
                  onClick={() => setActivePropertyTab(tab.id)}
                  className={`flex-1 py-3.5 flex items-center justify-center gap-2 relative transition-all ${
                    activePropertyTab === tab.id ? "text-purple-600 dark:text-purple-400 font-bold" : "text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                  }`}
                 >
                   {tab.icon}
                   <span className="text-xs tracking-wide">{tab.label}</span>
                   {activePropertyTab === tab.id && (
                     <div className="absolute bottom-0 left-0 w-full h-[2px] bg-purple-600 dark:bg-purple-400" />
                   )}
                 </button>
               ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-950">
              <div id="properties-panel">
                {/* Style Manager Tab */}
                <div className={`${activePropertyTab === "styles" ? "block" : "hidden"}`}>
                  <div id="gjs-sm-container" className="grapesjs-styles-container p-0">
                    {!selectedComponentInfo && (
                      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                        <Palette className="mx-auto mb-4 opacity-20" size={48} />
                        <p className="text-sm font-semibold text-gray-400 dark:text-gray-600">No hay selección activa</p>
                        <p className="text-xs mt-1 px-8 text-gray-400/80">Selecciona un elemento en el lienzo para editar su estilo</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Trait Manager Tab */}
                <div id="gjs-tm-container" className={`grapesjs-traits-container p-4 ${activePropertyTab === "traits" ? "block" : "hidden"}`}>
                  {!selectedComponentInfo && (
                    <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                      <Settings className="mx-auto mb-4 opacity-20" size={48} />
                    </div>
                  )}
                </div>

                {/* Selector Manager Tab (Clases) */}
                <div className={`${activePropertyTab === "classes" ? "block" : "hidden"}`}>
                   <div className="p-4 bg-white dark:bg-slate-950">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-50 dark:border-slate-900">
                      <Layers size={14} className="text-purple-600" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gestión de Clases</span>
                    </div>
                    <div id="gjs-sm-selectors" className="grapesjs-selectors-container"></div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Template Manager Modal */}
      <AnimatePresence>
        {showTemplateManager && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gestor de Plantillas</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Guarda, carga y gestiona tus diseños</p>
                </div>
                <button
                  onClick={() => setShowTemplateManager(false)}
                  className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 border-b border-gray-100 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Buscar plantillas..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 outline-none transition-all dark:text-gray-200"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setViewMode("grid")}
                      className={`p-3 rounded-xl transition-all ${viewMode === "grid" ? "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700"}`}
                      title="Vista de cuadrícula"
                    >
                      <Grid size={18} />
                    </button>
                    <button 
                      onClick={() => setViewMode("list")}
                      className={`p-3 rounded-xl transition-all ${viewMode === "list" ? "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700"}`}
                      title="Vista de lista"
                    >
                      <List size={18} />
                    </button>
                    
                    <button
                      onClick={handleImportClick}
                      className="flex items-center gap-2 px-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-all font-medium text-sm"
                    >
                      <Upload size={18} />
                      <span className="hidden sm:inline">Importar</span>
                    </button>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImportProject}
                      accept=".grapesjs,.json"
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center mb-4">
                      <FolderOpen className="text-purple-600 dark:text-purple-400" size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No hay plantillas guardadas</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                      Comienza creando tu primer plantilla para reutilizar diseños en futuros proyectos.
                    </p>
                    <button
                      onClick={handleSaveAsTemplate}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all"
                    >
                      <Plus size={16} />
                      Crear primera plantilla
                    </button>
                  </div>
                ) : (
                  <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
                    {filteredTemplates.map(tmp => (
                      <div 
                        key={tmp.idx} 
                        className={`${viewMode === "grid" ? 
                          "bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group" : 
                          "flex items-center gap-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-sm transition-all cursor-pointer group"
                        }`}
                        onClick={() => handleLoadTemplate(tmp)}
                      >
                        {viewMode === "grid" ? (
                          <>
                            <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900 relative overflow-hidden">
                              {tmp.thumbnail ? (
                                <img 
                                  src={tmp.thumbnail} 
                                  alt={tmp.id} 
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    target.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><Layout className="text-gray-400" size={24} /></div>';
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Layout className="text-gray-400" size={32} />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                <button
                                  onClick={(e) => handleLoadTemplate(tmp)}
                                  className="w-full py-2 bg-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 hover:bg-gray-100 transition-colors"
                                >
                                  <ArrowRight size={12} />
                                  Cargar
                                </button>
                              </div>
                            </div>
                            <div className="p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{tmp.id}</h3>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {new Date(tmp.createdAt).toLocaleDateString('es-ES', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => handleDeleteTemplate(e, tmp.idx)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  title="Eliminar plantilla"
                                >
                                  <LucideTrash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {tmp.thumbnail ? (
                                <img 
                                  src={tmp.thumbnail} 
                                  alt={tmp.id} 
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    target.parentElement!.innerHTML = '<Layout className="text-gray-400" size={18} />';
                                  }}
                                />
                              ) : (
                                <Layout className="text-gray-400" size={18} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 dark:text-white truncate">{tmp.id}</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(tmp.createdAt).toLocaleDateString('es-ES', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadTemplate(tmp);
                                }}
                                className="p-2 text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-all"
                                title="Cargar plantilla"
                              >
                                <ArrowRight size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportTemplate(tmp);
                                }}
                                className="p-2 text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                                title="Exportar plantilla"
                              >
                                <Download size={16} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteTemplate(e, tmp.idx)}
                                className="p-2 text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                                title="Eliminar plantilla"
                              >
                                <LucideTrash2 size={16} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {filteredTemplates.length > 0 && (
                <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {filteredTemplates.length} plantilla{filteredTemplates.length !== 1 ? 's' : ''} encontrada{filteredTemplates.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Styles for standard components & GrapesJS Overrides */}
      <style jsx global>{`
        /* Scrollbar Modernization */
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #cbd5e1; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
        .dark .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #475569; }

        /* GrapesJS Canvas Overrides */
        .gjs-cv-canvas {
          top: 0 !important;
          width: 100% !important;
          height: 100% !important;
          background-color: #f8fafc !important;
          background-image: none !important;
        }
        .gjs-frame-wrapper {
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.1) !important;
          border-radius: 4px !important;
          overflow: hidden !important;
        }

        /* Block Manager Modernization */
        .gjs-block-category { 
          margin: 15px 0 8px 0 !important;
        }
        .gjs-block-category .gjs-title {
          font-size: 10px !important; 
          font-weight: 800 !important; 
          text-transform: uppercase !important; 
          letter-spacing: 1.2px !important; 
          color: #94a3b8 !important;
          padding: 10px 0 !important;
          border-bottom: 1px solid rgba(0,0,0,0.03) !important;
        }
        .dark .gjs-block-category .gjs-title { color: #64748b !important; }

        .gjs-blocks-c {
          display: grid !important;
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 12px !important;
          padding: 8px 0 !important;
        }

        .gjs-block {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 90px !important;
          aspect-ratio: 1/1 !important;
          padding: 12px !important;
          margin: 0 !important;
          border-radius: 16px !important;
          background: #ffffff !important;
          border: 1.5px solid #f1f5f9 !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02) !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
        }
        
        .dark .gjs-block {
          background: #1e293b !important;
          border-color: #334155 !important;
          box-shadow: none !important;
        }

        .gjs-block:hover {
          border-color: #6366f1 !important;
          background-color: #f5f3ff !important;
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 15px -4px rgba(99, 102, 241, 0.15) !important;
        }
        
        .dark .gjs-block:hover {
          background-color: #1e1b4b !important;
          border-color: #818cf8 !important;
        }

        .gjs-block__media {
          width: 32px !important;
          height: 32px !important;
          margin-bottom: 8px !important;
          opacity: 0.9 !important;
          transition: transform 0.2s !important;
        }
        .gjs-block:hover .gjs-block__media { transform: scale(1.1); opacity: 1 !important; }

        .gjs-block-label { 
          font-size: 10px !important; 
          font-weight: 600 !important; 
          color: #475569 !important;
          text-align: center !important; 
          line-height: 1.2 !important;
        }
        .dark .gjs-block-label { color: #cbd5e1 !important; }

        /* Block Manager Category Fix */
        .gjs-block-category .gjs-title {
          font-size: 11px !important; 
          font-weight: 800 !important; 
          text-transform: none !important; 
          letter-spacing: 1px !important; 
          color: #64748b !important;
          padding: 12px 16px !important;
          background-color: rgba(0,0,0,0.02) !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
        }
        .dark .gjs-block-category .gjs-title { 
          color: #94a3b8 !important; 
          background-color: rgba(255,255,255,0.05) !important;
        }

        /* Style Manager Modernization - PREMIUM REWORK */
        .gjs-sm-sectors, .gjs-sm-container, .gjs-sm-sector, .gjs-sm-sectors-container {
          background-color: white !important;
          color: #334155 !important;
        }
        .dark .gjs-sm-sectors, .dark .gjs-sm-container, .dark .gjs-sm-sector {
          background-color: #0f172a !important;
          color: #f8fafc !important;
        }

        .gjs-sm-sector { 
          border-bottom: 1px solid rgba(0,0,0,0.05) !important;
          padding: 0 !important;
        }
        .dark .gjs-sm-sector { border-color: rgba(255,255,255,0.05) !important; }

        .gjs-sm-sector-title { 
          padding: 14px 16px !important;
          background-color: white !important;
          color: #334155 !important;
          display: flex !important;
          align-items: center !important;
          transition: background-color 0.2s !important;
          cursor: pointer !important;
        }
        .dark .gjs-sm-sector-title { 
          background-color: #0f172a !important;
          color: #f8fafc !important; 
        }
        
        .gjs-sm-sector-title:hover {
          background-color: #f8fafc !important;
        }
        .dark .gjs-sm-sector-title:hover { background-color: #1e293b !important; }

        /* Selector Manager Style Fixes (White Theme) */
        .gjs-clm-selectors, .gjs-clm-tags, .gjs-clm-header, .gjs-clm-sel {
          background-color: white !important;
          color: #334155 !important;
        }
        .dark .gjs-clm-selectors, .dark .gjs-clm-tags {
          background-color: #0f172a !important;
          color: #f8fafc !important;
        }

        .gjs-clm-tags {
          border: 1.5px solid #e2e8f0 !important;
          border-radius: 12px !important;
          padding: 8px !important;
          min-height: 45px !important;
        }
        .dark .gjs-clm-tags { border-color: #334155 !important; }

        .gjs-clm-tag {
          background-color: #6366f1 !important;
          color: white !important;
          border-radius: 8px !important;
          padding: 4px 10px !important;
          font-weight: 600 !important;
          font-size: 11px !important;
        }
        
        .gjs-clm-select {
          background-color: #f1f5f9 !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 10px !important;
          padding: 8px !important;
          font-size: 12px !important;
          width: 100% !important;
          margin-top: 8px !important;
        }
        .dark .gjs-clm-select {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }

        .gjs-sm-sector-label { 
          font-weight: 800 !important; 
          text-transform: uppercase !important; 
          font-size: 10px !important; 
          letter-spacing: 1.5px !important; 
          color: #334155 !important;
          flex: 1 !important;
        }
        .dark .gjs-sm-sector-label { color: #f1f5f9 !important; }

        .gjs-sm-sector-title::before {
          content: '';
          display: inline-block;
          width: 14px;
          height: 14px;
          margin-right: 10px;
          background-repeat: no-repeat;
          background-position: center;
          background-size: contain;
          opacity: 0.8;
          filter: brightness(0) saturate(100%) invert(43%) sepia(85%) saturate(1243%) hue-rotate(212deg) brightness(96%) contrast(97%);
          z-index: 2;
        }

        /* HARD OVERRIDE FOR WHITE THEME */
        #gjs-sm-container, .gjs-sm-container, 
        #gjs-sm-sectors, .gjs-sm-sectors,
        #gjs-tm-container, .gjs-trt-traits,
        .gjs-clm-selectors, .gjs-clm-tags,
        .grapesjs-styles-container, .grapesjs-traits-container, .grapesjs-selectors-container {
          background-color: white !important;
          color: #334155 !important;
        }

        .dark #gjs-sm-container, .dark .gjs-sm-container, 
        .dark #gjs-sm-sectors, .dark .gjs-sm-sectors,
        .dark #gjs-tm-container, .dark .gjs-trt-traits,
        .dark .gjs-clm-selectors, .dark .gjs-clm-tags,
        .dark .grapesjs-styles-container, .dark .grapesjs-traits-container, .dark .grapesjs-selectors-container {
          background-color: #0f172a !important;
          color: #f1f5f9 !important;
        }

        .gjs-sm-sector-title { 
          background-color: white !important;
          color: #334155 !important;
        }
        .dark .gjs-sm-sector-title { 
          background-color: #0f172a !important;
          color: #f1f5f9 !important;
        }
        
        .gjs-clm-header, .gjs-clm-sel-label, .gjs-clm-label {
          color: #64748b !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          background: transparent !important;
        }

        /* Sector Icons Injection via data-sector or IDs */
        .gjs-sm-sector[data-sector="layout"] .gjs-sm-sector-title::before,
        .gjs-sm-sector[id="layout"] .gjs-sm-sector-title::before,
        .gjs-sm-sector#sm-layout .gjs-sm-sector-title::before { 
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z'/%3E%3C/svg%3E") !important;
        }
        .gjs-sm-sector[data-sector="size"] .gjs-sm-sector-title::before,
        .gjs-sm-sector[id="size"] .gjs-sm-sector-title::before,
        .gjs-sm-sector#sm-size .gjs-sm-sector-title::before { 
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7V5a2 2 0 0 1 2-2h2'/%3E%3Cpath d='M17 3h2a2 2 0 0 1 2 2v2'/%3E%3Cpath d='M21 17v2a2 2 0 0 1-2 2h-2'/%3E%3Cpath d='M7 21H5a2 2 0 0 1-2-2v-2'/%3E%3Crect width='10' height='8' x='7' y='8' rx='1'/%3E%3C/svg%3E") !important;
        }
        .gjs-sm-sector[data-sector="typography"] .gjs-sm-sector-title::before,
        .gjs-sm-sector[id="typography"] .gjs-sm-sector-title::before,
        .gjs-sm-sector#sm-typography .gjs-sm-sector-title::before { 
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 7V4h16v3'/%3E%3Cpath d='M9 20h6'/%3E%3Cpath d='M12 4v16'/%3E%3C/svg%3E") !important;
        }
        .gjs-sm-sector[data-sector="space"] .gjs-sm-sector-title::before,
        .gjs-sm-sector[id="space"] .gjs-sm-sector-title::before,
        .gjs-sm-sector#sm-space .gjs-sm-sector-title::before { 
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 12V2h10M22 12V22H12M12 2v10h10M12 22V12H2'/%3E%3C/svg%3E") !important;
        }
        .gjs-sm-sector[data-sector="extra"] .gjs-sm-sector-title::before,
        .gjs-sm-sector[id="extra"] .gjs-sm-sector-title::before,
        .gjs-sm-sector#sm-extra .gjs-sm-sector-title::before { 
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 8v8'/%3E%3Cpath d='M8 12h8'/%3E%3C/svg%3E") !important;
        }

        .gjs-sm-properties { 
          padding: 16px !important; 
          background-color: white !important;
        }
        .dark .gjs-sm-properties { background-color: #0f172a !important; }
        
        /* ============================================================
           GLOBAL GRAPESJS VARIABLE OVERRIDES (FORCE B&W THEME)
           ============================================================ */
        :root {
          --gjs-font-color: #000000 !important;
          --gjs-main-dark-color: #ffffff !important;
          --gjs-main-light-color: #ffffff !important;
          --gjs-secondary-dark-color: #000000 !important;
          --gjs-secondary-light-color: #000000 !important;
          --gjs-soft-dark-color: #ffffff !important;
          --gjs-soft-light-color: #f1f5f9 !important;
          --gjs-primary-color: #6366f1 !important;
        }

        /* CRITICAL UI OVERRIDES - FORCED BLACK & WHITE THEME */
        
        /* STYLE MANAGER: BLACK LABELS */
        #gjs-sm-container .gjs-sm-label, 
        #gjs-tm-container .gjs-trt-label,
        .gjs-clm-label, 
        .gjs-clm-sel-label,
        .gjs-sm-sector-title,
        .gjs-color-main {
          color: #000000 !important;
          fill: #000000 !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }

        /* STYLE MANAGER: CONSOLIDATED IN BLOCKSTYLES.CSS */

        /* BLOCK MANAGER: NAKED PREMIUM ICONS */
        .gjs-block {
          background: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important;
          box-shadow: none !important;
          padding: 16px 8px !important;
          transition: all 0.2s ease !important;
        }
        .gjs-block:hover {
          border-color: #6366f1 !important;
          transform: translateY(-2px) !important;
        }

        .custom-block-icon {
          background: transparent !important;
          border: none !important;
          width: 44px !important;
          height: 44px !important;
          margin-bottom: 8px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        .custom-block-icon svg {
          width: 32px !important;
          height: 32px !important;
          color: #2C3E50 !important;
        }

        .gjs-block-label {
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 11px !important;
        }

        /* ARROWS: DARK GRAY */
        .gjs-field-arrow-u, .gjs-sm-field-arrow-u { border-bottom-color: #4b5563 !important; }
        .gjs-field-arrow-d, .gjs-sm-field-arrow-d { border-top-color: #4b5563 !important; }

        /* CATEGORY HEADERS: WHITE */
        .gjs-sm-header, .gjs-sm-sector-title, .gjs-trt-header, .gjs-clm-header {
          background-color: #ffffff !important;
          color: #000000 !important;
          border-bottom: 1px solid #e2e8f0 !important;
        }

        /* BTN PRIMARY */
        .gjs-btn-prim { 
          background: #6366f1 !important; 
          border: none !important; 
          border-radius: 12px !important; 
          font-weight: 700 !important; 
          padding: 12px !important;
          width: 100% !important;
        }
        .gjs-btn-prim:hover { 
          background: #4f46e5 !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 6px 15px rgba(99, 102, 241, 0.3) !important;
        }

        /* COLOR PICKER (SPECTRUM) POSITIONING FIX */
        .sp-container {
          z-index: 10001 !important;
          border: 1px solid #000000 !important;
          background-color: #ffffff !important;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1) !important;
          border-radius: 12px !important;
          padding: 8px !important;
        }
        .sp-picker-container {
          border-left: none !important;
          padding: 10px !important;
        }
        .sp-palette-container {
          border-right: none !important;
        }
        .sp-input {
          background: #ffffff !important;
          border: 1px solid #000000 !important;
          border-radius: 4px !important;
          color: #000000 !important;
        }
        .sp-cancel, .sp-cancel:hover {
          color: #ef4444 !important;
          font-weight: 700 !important;
          text-decoration: none !important;
        }
        .sp-choose {
          background-image: none !important;
          background-color: #6366f1 !important;
          border: none !important;
          color: white !important;
          border-radius: 6px !important;
          font-weight: 700 !important;
          padding: 5px 12px !important;
          text-shadow: none !important;
        }
      `}</style>

      {/* Template Gallery Modal */}
      <TemplateGallery
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        onSelectTemplate={handleSelectSystemTemplate}
        selectedTemplateId={templateId}
        mode={mode}
      />
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[9999] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden w-56 animate-in fade-in zoom-in duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-1">
            <button 
              onClick={() => {
                const editor = editorRef.current?.getEditor();
                const comp = editor?.getSelected();
                if (comp && comp.parent()) {
                  editor?.select(comp.parent());
                }
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-100 dark:bg-slate-800">
                <ChevronLeft size={14} className="rotate-90" />
              </div>
              Seleccionar Padre
            </button>

            <button 
              onClick={() => {
                editorRef.current?.runCommand('core:component-duplicate');
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600">
                <Copy size={14} />
              </div>
              Duplicar
            </button>

            <button 
              onClick={() => {
                editorRef.current?.runCommand('open-canva');
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <Sparkles size={14} />
              </div>
              Editar en Canva
            </button>

            <div className="h-px bg-gray-100 dark:bg-slate-800 my-1 mx-2" />

            <button 
              onClick={() => {
                editorRef.current?.runCommand('core:component-delete');
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-left"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-red-100 dark:bg-red-900/30">
                <LucideTrash2 size={14} />
              </div>
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Canva Modal */}
      {showCanvaModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-950 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-slate-800"
          >
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-950">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <Sparkles className="text-white w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Diseñador con Canva</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Crea diseños profesionales y sincronízalos al instante</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCanvaModal(false)}
                className="p-2.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-2xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30 dark:bg-slate-900/10">
              <div className="max-w-2xl mx-auto">
                <React.Suspense fallback={<div className="flex items-center justify-center h-64"><RotateCcw className="animate-spin text-purple-600" /></div>}>
                  {/* We dynamically import CanvaDesigner if needed, or use it directly */}
                  {(() => {
                    const CanvaDesigner = require('@/components/canva-designer').default;
                    return <CanvaDesigner onDesignPublished={handleCanvaDesignPublished} />;
                  })()}
                </React.Suspense>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// Icon for trash in template manager (missing in main imports)
const Trash2 = ({ size, className }: { size: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
  </svg>
);

const handleExportTemplate = (template: TemplateRecord) => {
  const dataStr = JSON.stringify({
    idx: template.idx,
    id: template.id,
    html: template.html,
    css: template.css,
    projectData: template.projectData,
    thumbnail: template.thumbnail,
    createdAt: template.createdAt
  }, null, 2);
  
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${template.id.replace(/\s+/g, '_')}_template.grapesjs`;
  link.click();
  toast.success("Plantilla exportada correctamente");
};

export default EditorWorkspace;