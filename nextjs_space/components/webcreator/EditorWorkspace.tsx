"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  X,
  Type,
  MousePointer2,
  Database,
  RotateCcw,
  Sparkles,
  Zap,
  Users,
  Download,
  History,
  Copy,
  Trash2 as LucideTrash2,
  Code2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import GrapesEditor, { GrapesEditorRef } from "./GrapesEditor";
import { saveTemplate, loadAllTemplates, loadTemplates, deleteTemplate, TemplateRecord, PaginatedTemplates } from "../../lib/webcreator/templateStorage";
import { TemplateGallery, getTemplateData } from "./templates";
import EditorToolbar from "./EditorToolbar";
import EditorControls from "./EditorControls";
import EditorSidebar from "./EditorSidebar";
import LeftPanelContent from "./LeftPanelContent";
import PropertiesPanel from "./PropertiesPanel";
import TemplateManagerModal from "./TemplateManagerModal";
import { AIGeneratorModal } from "./AIGeneratorModal";

interface EditorWorkspaceProps {
  initialData?: Record<string, unknown>;
  pageId?: string;
  pageTitle?: string;
  slug?: string;
  templateId?: string;
  backUrl?: string;
  previewUrl?: string;
  mode?: 'webpage' | 'email' | 'document';
  onSave?: (data: { projectData: Record<string, unknown>; html?: string; css?: string; estado?: string }) => void;
}

const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  initialData,
  pageId,
  pageTitle,
  slug,
  templateId,
  backUrl,
  previewUrl,
  onSave,
  mode = 'webpage'
}) => {
  const [activePanel, setActivePanel] = useState<string>("blocks");
  const [activePropertyTab, setActivePropertyTab] = useState<string>("styles");
  const [device, setDevice] = useState<string>("desktop");
  const [preview, setPreview] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [templatesPage, setTemplatesPage] = useState<number>(1);
  const [templatesHasMore, setTemplatesHasMore] = useState<boolean>(true);
  const [templatesLoading, setTemplatesLoading] = useState<boolean>(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isPublishing, setIsPublishing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedComponentInfo, setSelectedComponentInfo] = useState<{type: string; classes: string[]; path: string[]} | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [historyItems, setHistoryItems] = useState<string[]>([]);
  const [versionHistory, setVersionHistory] = useState<Array<{id: string; timestamp: string; description: string}> | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(-1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; componentId: string } | null>(null);
  const [showCanvaModal, setShowCanvaModal] = useState(false);
  const [canvaTargetComponentId, setCanvaTargetComponentId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(mode === 'email' ? 'EMAIL' : 'CONTRATO');
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  const editorRef = useRef<GrapesEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const saveDropdownRef = React.useRef<HTMLDivElement>(null);
  const templateDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (theme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  const refreshTemplates = async () => {
    if (templatesLoading || !templatesHasMore) return;
    
    setTemplatesLoading(true);
    try {
      const result: PaginatedTemplates = await loadTemplates(templatesPage, 20);
      setTemplates(prev => [...prev, ...result.templates]);
      setTemplatesPage(prev => prev + 1);
      setTemplatesHasMore(result.hasMore);
    } catch (err) {
      console.error('[EditorWorkspace] Error loading templates:', err);
      toast.error("Error al cargar plantillas");
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Load initial templates
  useEffect(() => {
    setTemplates([]); // Reset templates
    setTemplatesPage(1);
    refreshTemplates();
  }, []);

  // Load more templates when scrolling near bottom (handled in TemplateManagerModal)

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

       const syncHistory = () => {
         try {
           const um = editorRef.current?.getUndoManager?.();
           if (um) {
             const stack = um.getStack ? um.getStack() : [];
             setHistoryItems(stack.map((_: any, i: number) => `Cambio ${i + 1}`).reverse().slice(0, 20));
           }
         } catch {}
       };
       
       const syncVersionHistory = () => {
         try {
           const versionInfo = editorRef.current?.getEditor()?.runCommand?.('get-version-history');
           if (versionInfo) {
             setVersionHistory(versionInfo.history || []);
             setCurrentVersionIndex(versionInfo.currentIndex || -1);
           }
         } catch {}
       };
       
       editor.on('component:update', syncHistory);
       editor.on('style:property:update', syncHistory);
       editor.on('component:update', syncVersionHistory);
       editor.on('style:property:update', syncVersionHistory);
       editor.on('stack:change', syncVersionHistory);
    };

    pollInterval = setInterval(() => {
      const editor = editorRef.current?.getEditor();
      if (editor) connectEditor();
    }, 500);

    return () => clearInterval(pollInterval);
  }, []);

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
    
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);

    return () => {
      window.removeEventListener('editor:open-canva', handleOpenCanva);
      window.removeEventListener('editor:contextmenu', handleContextMenu);
      window.removeEventListener('click', closeMenu);
    };
  }, []);

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
      const categories = container.querySelectorAll('.gjs-block-category');
      categories.forEach(cat => {
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

  useEffect(() => {
    const frame = document.querySelector('.gjs-cv-canvas') as HTMLElement;
    if (!frame) return;
    const scale = zoom / 100;
    frame.style.transform = zoom !== 100 ? `scale(${scale})` : '';
    frame.style.transformOrigin = 'top left';
  }, [zoom]);

  useEffect(() => {
    if (!showSaveDropdown && !showTemplatesDropdown) return;
    const handler = (e: MouseEvent) => {
      if (showSaveDropdown && saveDropdownRef.current && !saveDropdownRef.current.contains(e.target as Node)) {
        setShowSaveDropdown(false);
      }
      if (showTemplatesDropdown && templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
        setShowTemplatesDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSaveDropdown, showTemplatesDropdown]);

  const handleCanvaDesignPublished = (url: string) => {
    const editor = editorRef.current?.getEditor();
    if (editor && canvaTargetComponentId) {
      const component = editor.Components.getById(canvaTargetComponentId);
      if (component) {
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

  const handleSaveAsTemplate = async () => {
    const name = window.prompt("Nombre de la nueva plantilla:");
    if (name === null) return;
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
      category,
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
    toast.dismiss();
    
    const toastId = toast.loading(`Cargando plantilla: ${templateId}...`);
    setShowTemplateGallery(false);

    try {
      const templateData = getTemplateData(templateId);

      const editor = editorRef.current?.getEditor();
      if (!editor) {
        toast.error('Editor no disponible', { id: toastId });
        return;
      }

      if (templateData && templateData.loadProjectData) {
        const rawData = await templateData.loadProjectData();
        const projectData = rawData && rawData.default ? rawData.default : rawData;
        
        if (typeof projectData === 'object' && projectData !== null) {
          editor.loadProjectData(projectData);
          toast.success(`Plantilla "${templateId}" cargada correctamente`, { id: toastId });
        } else {
          throw new Error("El formato del JSON cargado no es un objeto válido");
        }
      } else if (templateData && templateData.projectData) {
        editor.loadProjectData(templateData.projectData);
        toast.success(`Plantilla "${templateId}" cargada correctamente`, { id: toastId });
      } else if (templateData && templateData.html) {
        editor.setComponents(templateData.html);
        if (templateData.css) {
          editor.Css.addRules(templateData.css);
        }
        toast.success(`Plantilla "${templateId}" cargada correctamente`, { id: toastId });
      } else {
        toast.error('No se encontró la plantilla', { id: toastId });
      }
    } catch (err) {
      console.error('[EditorWorkspace] Error loading template:', err);
      toast.error('Error al cargar la plantilla', { id: toastId });
    } finally {
      setShowTemplateGallery(false);
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

      const runtimeScript = `
<script>
document.addEventListener('click', function(e) {
  var el = e.target.closest('[href]');
  if (el && el.tagName !== 'A' && !el.closest('a')) {
    var url = el.getAttribute('href');
    var target = el.getAttribute('target');
    if (url) {
      if (target === '_blank') window.open(url);
      else window.location.href = url;
    }
  }
});
</script>`;

      const fullHtml = css ? `<style>${css}</style>${html}${runtimeScript}` : `${html}${runtimeScript}`;

      if (onSave) {
        await onSave({
          projectData: projectData || {},
          html: fullHtml,
          css,
          estado: "draft",
          category
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

      const runtimeScript = `
<script>
document.addEventListener('click', function(e) {
  var el = e.target.closest('[href]');
  if (el && el.tagName !== 'A' && !el.closest('a')) {
    var url = el.getAttribute('href');
    var target = el.getAttribute('target');
    if (url) {
      if (target === '_blank') window.open(url);
      else window.location.href = url;
    }
  }
});
</script>`;

      const fullHtml = css ? `<style>${css}</style>${html}${runtimeScript}` : `${html}${runtimeScript}`;

      if (onSave) {
        await onSave({
          projectData: projectData || {},
          html: fullHtml,
          css,
          estado: "published",
          category
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

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'auto';
      return 'light';
    });
  };

  const filteredTemplates = templates.filter(template => 
    template.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.idx.toLowerCase().includes(searchQuery.toLowerCase())
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

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-950 text-gray-900 dark:text-gray-100">
      <EditorToolbar
        isSaving={isSaving}
        isPublishing={isPublishing}
        lastSaved={lastSaved}
        mode={mode}
        showSaveDropdown={showSaveDropdown}
        showTemplatesDropdown={showTemplatesDropdown}
        autoSaveStatus={autoSaveStatus}
        preview={preview}
        onBack={() => router.push(backUrl || "/dashboard/webcreator")}
        onSave={handleManualSave}
        onPublish={handlePublish}
        onSaveAsTemplate={handleSaveAsTemplate}
        onDownloadProject={handleDownloadProject}
        onImportClick={handleImportClick}
        onToggleSaveDropdown={() => setShowSaveDropdown(prev => !prev)}
        onToggleTemplatesDropdown={() => setShowTemplatesDropdown(prev => !prev)}
        onOpenTemplateGallery={() => setShowTemplateGallery(true)}
        onOpenTemplateManager={() => setShowTemplateManager(true)}
        onUndo={() => editorRef.current?.runCommand('core:undo')}
        onRedo={() => editorRef.current?.runCommand('core:redo')}
        onTogglePreview={() => setPreview(prev => !prev)}
        onViewLive={() => {
          if (previewUrl) {
            window.open(previewUrl, '_blank');
            return;
          }
          if (!slug) {
            toast.info("Las plantillas no tienen una URL 'en vivo'. Crea una página basada en esta plantilla para verla publicada.");
            return;
          }
          const url = slug === 'home' ? '/' : `/${slug}`;
          window.open(url, '_blank');
        }}
        onOpenAIGenerator={() => setShowAIGenerator(true)}
        category={category}
        onCategoryChange={setCategory}
      />

      <div className="flex flex-1 overflow-hidden">
        {!preview && (
          <EditorSidebar
            activePanel={activePanel}
            onPanelChange={setActivePanel}
            onOpenCode={() => editorRef.current?.runCommand("open-code")}
            onExit={() => {
              if (confirm("¿Salir del editor?")) {
                router.push(backUrl || "/dashboard/webcreator");
              }
            }}
          />
        )}

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
              
              <LeftPanelContent
                activePanel={activePanel}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                historyItems={historyItems}
                onUndo={() => editorRef.current?.runCommand('core:undo')}
                versionHistory={versionHistory}
                currentVersionIndex={currentVersionIndex}
                onRestoreVersion={(index: number) => {
                  editorRef.current?.getEditor()?.runCommand?.('restore-version', { index });
                  setCurrentVersionIndex(index);
                }}
                onOpenAIGenerator={() => setShowAIGenerator(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>

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

        {!preview && (
          <PropertiesPanel
            activePropertyTab={activePropertyTab}
            onTabChange={setActivePropertyTab}
            selectedComponentInfo={selectedComponentInfo}
          />
        )}
      </div>

      <TemplateManagerModal
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
        templates={templates}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onLoadTemplate={handleLoadTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onExportTemplate={handleExportTemplate}
        onImportClick={handleImportClick}
        onSaveAsTemplate={handleSaveAsTemplate}
        hasMore={templatesHasMore}
        loading={templatesLoading}
        loadMore={refreshTemplates}
      />

      <TemplateGallery
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        onSelectTemplate={handleSelectSystemTemplate}
        selectedTemplateId={templateId}
        mode={mode}
      />

      <AIGeneratorModal 
        isOpen={showAIGenerator}
        onClose={() => setShowAIGenerator(false)}
        onGenerate={(data) => {
          if (editorRef.current && data) {
            editorRef.current.importProject(data);
          }
        }}
      />

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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 15-6-6-6 6"/>
                </svg>
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

      {/* Hidden file input for project import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportProject}
        style={{ display: "none" }}
        accept=".grapesjs,.json"
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #cbd5e1; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
        .dark .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #475569; }

        .gjs-cv-canvas {
          top: 0;
          width: 100%;
          height: 100%;
          background-color: #f8fafc;
          background-image: none;
        }
        .gjs-frame-wrapper {
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .gjs-block-category { 
          margin: 15px 0 8px 0;
        }
        .gjs-block-category .gjs-title {
          font-size: 10px; 
          font-weight: 800; 
          text-transform: uppercase; 
          letter-spacing: 1.2px; 
          color: #94a3b8;
          padding: 10px 0;
          border-bottom: 1px solid rgba(0,0,0,0.03);
        }
        .dark .gjs-block-category .gjs-title { color: #64748b; }

        .gjs-blocks-c {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          padding: 8px 0;
        }

        .gjs-block {
          width: 100%;
          min-width: 0;
          min-height: 90px;
          aspect-ratio: 1/1;
          padding: 12px;
          margin: 0;
          border-radius: 16px;
          background: #ffffff;
          border: 1.5px solid #f1f5f9;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        
        .dark .gjs-block {
          background: #1e293b;
          border-color: #334155;
          box-shadow: none;
        }

        .gjs-block:hover {
          border-color: #6366f1;
          background-color: #f5f3ff;
          transform: translateY(-2px);
          box-shadow: 0 8px 15px -4px rgba(99, 102, 241, 0.15);
        }
        
        .dark .gjs-block:hover {
          background-color: #1e1b4b;
          border-color: #818cf8;
        }

        .gjs-block__media {
          width: 32px;
          height: 32px;
          margin-bottom: 8px;
          opacity: 0.9;
          transition: transform 0.2s;
        }
        .gjs-block:hover .gjs-block__media { transform: scale(1.1); opacity: 1; }

        .gjs-block-label { 
          font-size: 10px; 
          font-weight: 600; 
          color: #475569;
          text-align: center; 
          line-height: 1.2;
        }
        .dark .gjs-block-label { color: #cbd5e1; }

        .gjs-sm-sectors, .gjs-sm-container, .gjs-sm-sector, .gjs-sm-sectors-container {
          background-color: white;
          color: #334155;
        }
        .dark .gjs-sm-sectors, .dark .gjs-sm-container, .dark .gjs-sm-sector {
          background-color: #0f172a;
          color: #f8fafc;
        }

        .gjs-sm-sector { 
          border-bottom: 1px solid rgba(0,0,0,0.05);
          padding: 0;
        }
        .dark .gjs-sm-sector { border-color: rgba(255,255,255,0.05); }

        .gjs-sm-sector-title { 
          padding: 14px 16px;
          background-color: white;
          color: #334155;
          display: flex;
          align-items: center;
          transition: background-color 0.2s;
          cursor: pointer;
        }
        .dark .gjs-sm-sector-title { 
          background-color: #0f172a;
          color: #f8fafc; 
        }
        
        .gjs-sm-sector-title:hover {
          background-color: #f8fafc;
        }
        .dark .gjs-sm-sector-title:hover { background-color: #1e293b; }

        .gjs-clm-selectors, .gjs-clm-tags, .gjs-clm-header, .gjs-clm-sel {
          background-color: white;
          color: #334155;
        }
        .dark .gjs-clm-selectors, .dark .gjs-clm-tags {
          background-color: #0f172a;
          color: #f8fafc;
        }

        .gjs-clm-tags {
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          padding: 8px;
          min-height: 45px;
        }
        .dark .gjs-clm-tags { border-color: #334155; }

        .gjs-clm-tag {
          background-color: #6366f1;
          color: white;
          border-radius: 8px;
          padding: 4px 10px;
          font-weight: 600;
          font-size: 11px;
        }
        
        .gjs-clm-select {
          background-color: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px;
          font-size: 12px;
          width: 100%;
          margin-top: 8px;
        }
        .dark .gjs-clm-select {
          background-color: #1e293b;
          border-color: #334155;
        }

        .gjs-sm-sector-label { 
          font-weight: 800; 
          text-transform: uppercase; 
          font-size: 10px; 
          letter-spacing: 1.5px; 
          color: #334155;
          flex: 1;
        }
        .dark .gjs-sm-sector-label { color: #f1f5f9; }

        #gjs-sm-container, .gjs-sm-container, 
        #gjs-sm-sectors, .gjs-sm-sectors,
        #gjs-tm-container, .gjs-trt-traits,
        .gjs-clm-selectors, .gjs-clm-tags,
        .grapesjs-styles-container, .grapesjs-traits-container, .grapesjs-selectors-container {
          background-color: white;
          color: #334155;
        }

        .dark #gjs-sm-container, .dark .gjs-sm-container, 
        .dark #gjs-sm-sectors, .dark .gjs-sm-sectors,
        .dark #gjs-tm-container, .dark .gjs-trt-traits,
        .dark .gjs-clm-selectors, .dark .gjs-clm-tags,
        .dark .grapesjs-styles-container, .dark .grapesjs-traits-container, .dark .grapesjs-selectors-container {
          background-color: #0f172a;
          color: #f1f5f9;
        }

        .gjs-sm-sector-title { 
          background-color: white;
          color: #334155;
        }
        .dark .gjs-sm-sector-title { 
          background-color: #0f172a;
          color: #f1f5f9;
        }
        
        .gjs-clm-header, .gjs-clm-sel-label, .gjs-clm-label {
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: transparent;
        }

        :root {
          --gjs-font-color: #000000;
          --gjs-main-dark-color: #ffffff;
          --gjs-main-light-color: #ffffff;
          --gjs-secondary-dark-color: #000000;
          --gjs-secondary-light-color: #000000;
          --gjs-soft-dark-color: #ffffff;
          --gjs-soft-light-color: #f1f5f9;
          --gjs-primary-color: #6366f1;
        }

        #gjs-sm-container .gjs-sm-label, 
        #gjs-tm-container .gjs-trt-label,
        .gjs-clm-label, 
        .gjs-clm-sel-label,
        .gjs-sm-sector-title,
        .gjs-color-main {
          color: #000000;
          fill: #000000;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .gjs-block {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: none;
          padding: 16px 8px;
          transition: all 0.2s ease;
        }
        .gjs-block:hover {
          border-color: #6366f1;
          transform: translateY(-2px);
        }

        .gjs-btn-prim { 
          background: #6366f1; 
          border: none; 
          border-radius: 12px; 
          font-weight: 700; 
          padding: 12px;
          width: 100%;
        }
        .gjs-btn-prim:hover { 
          background: #4f46e5;
          transform: translateY(-1px);
          box-shadow: 0 6px 15px rgba(99, 102, 241, 0.3);
        }

        .sp-container {
          z-index: 10001;
          border: 1px solid #000000;
          background-color: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
          border-radius: 12px;
          padding: 8px;
        }
      `}</style>
    </div>
  );
};

export default EditorWorkspace;
