"use client";

import React from "react";
import {
  ArrowLeft,
  Save,
  RotateCcw,
  RotateCw,
  ChevronRight,
  Download,
  Upload,
  Zap,
  Layout,
  FolderOpen,
  Sparkles,
  Eye,
  ExternalLink,
} from "lucide-react";

interface EditorToolbarProps {
  isSaving: boolean;
  isPublishing: boolean;
  lastSaved: Date | null;
  mode: 'webpage' | 'email' | 'document';
  showSaveDropdown: boolean;
  showTemplatesDropdown: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'success' | 'error';
  preview: boolean;
  onBack: () => void;
  onSave: () => void;
  category: string;
  onCategoryChange: (category: string) => void;
  documentTitle?: string;
  onDocumentTitleChange?: (title: string) => void;
  onPublish: () => void;
  onSaveAsTemplate: () => void;
  onDownloadProject: () => void;
  onImportClick: () => void;
  onToggleSaveDropdown: () => void;
  onToggleTemplatesDropdown: () => void;
  onOpenTemplateGallery: () => void;
  onOpenTemplateManager: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePreview: () => void;
  onViewLive: () => void;
  onOpenAIGenerator: () => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  isSaving,
  isPublishing,
  lastSaved,
  mode,
  showSaveDropdown,
  showTemplatesDropdown,
  autoSaveStatus,
  preview,
  onBack,
  onSave,
  onPublish,
  onSaveAsTemplate,
  onDownloadProject,
  onImportClick,
  onToggleSaveDropdown,
  onToggleTemplatesDropdown,
  onOpenTemplateGallery,
  onOpenTemplateManager,
  onUndo,
  onRedo,
  onTogglePreview,
  onViewLive,
  category,
  onCategoryChange,
  documentTitle,
  onDocumentTitleChange,
  onOpenAIGenerator,
}) => {
  return (
    <header className="h-auto min-h-[56px] border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 flex items-center justify-between shadow-sm z-50 gap-y-2 gap-x-4 overflow-visible">
      {/* Left Section: Back, Brand, and Primary Save/Publish */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onBack}
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
            Volkern <span className="text-purple-600">Creator</span>
          </span>
        </div>

        <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />
        
        {/* AI Magic Button */}
        <button
          onClick={onOpenAIGenerator}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-black shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Sparkles size={14} className="animate-pulse" />
          <span className="hidden sm:inline">Magia con IA</span>
        </button>

        <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

        {/* Document Title Input (only shown in document/email mode) */}
        {mode !== 'webpage' && (
          <input
            type="text"
            value={documentTitle || ''}
            onChange={(e) => onDocumentTitleChange?.(e.target.value)}
            placeholder="Nombre del documento..."
            className="h-9 px-3 bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500 rounded-lg text-sm font-semibold text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none transition-all min-w-[160px] max-w-[280px]"
          />
        )}

        <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

        {/* Category Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="h-9 px-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
          >
            <option value="CONTRATO">CONTRATO</option>
            <option value="ORDEN_VENTA">ORDEN DE VENTA</option>
            <option value="ORDEN_COMPRA">ORDEN DE COMPRA</option>
            <option value="COTIZACION">COTIZACIÓN</option>
            <option value="FACTURA">FACTURA</option>
            <option value="NOMINA">NÓMINA / RECIBO DE SALARIOS</option>
            <option value="CERTIFICADO">CERTIFICADO ACADEMIA</option>
            <option value="EMAIL">PLANTILLA EMAIL</option>
            <option value="GENERAL">GENERAL</option>
          </select>
        </div>

        <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-stretch relative shrink-0">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-l-lg text-sm font-bold shadow transition-all disabled:opacity-70"
              title="Guardar cambios (Ctrl+S)"
            >
              {isSaving ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Save size={14} />}
              <span>Guardar</span>
            </button>
            <button
              onClick={onToggleSaveDropdown}
              className="flex items-center justify-center px-1.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-r-lg text-sm font-bold shadow transition-all border-l border-indigo-500"
            >
              <ChevronRight size={13} className="rotate-90" />
            </button>
            {showSaveDropdown && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-[100] overflow-hidden">
                <button
                  onClick={() => { onSaveAsTemplate(); onToggleSaveDropdown(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <Save size={14} className="text-purple-500" />
                  Guardar como plantilla
                </button>
                <button
                  onClick={() => { onDownloadProject(); onToggleSaveDropdown(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <Download size={14} className="text-blue-500" />
                  Exportar JSON
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onPublish}
            disabled={isPublishing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-500 rounded-lg text-sm font-bold shadow-sm hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all disabled:opacity-50"
          >
            {isPublishing ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Zap size={14} />}
            <span>Publicar</span>
          </button>
        </div>
      </div>

      {/* Middle Section: Undo, Redo, Preview, View Live */}
      <div className="hidden md:flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl">
        <button
          onClick={onUndo}
          className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
          title="Deshacer (Ctrl+Z)"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={onRedo}
          className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
          title="Rehacer (Ctrl+Shift+Z)"
        >
          <RotateCw size={16} />
        </button>
        
        <div className="w-px h-4 bg-gray-200 dark:bg-slate-700 mx-1" />

        <button
          onClick={onTogglePreview}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            preview 
            ? 'bg-purple-600 text-white' 
            : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-800'
          }`}
          title="Vista Previa"
        >
          <Eye size={14} />
          <span>Vista Previa</span>
        </button>

        <button
          onClick={onViewLive}
          className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 rounded-lg text-xs font-bold transition-all"
          title="Ver página publicada"
        >
          <ExternalLink size={14} />
          <span>Ir</span>
        </button>
      </div>

      {/* Right Section: Status and Plantillas */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex flex-col items-end mr-2">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${
              autoSaveStatus === 'saving' || isSaving ? 'bg-amber-500 animate-pulse' : 
              autoSaveStatus === 'success' ? 'bg-green-500' : 'bg-gray-300'
            }`} />
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
              {isSaving ? "Guardando..." : 
               autoSaveStatus === 'saving' ? "Autoguardado..." : 
               lastSaved ? `Al día ${lastSaved.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : "Borrador"}
            </span>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={onToggleTemplatesDropdown}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all border border-purple-200 dark:border-purple-800"
          >
            <Layout size={14} />
            <span className="hidden sm:inline">Plantillas</span>
            <ChevronRight size={12} className="rotate-90 opacity-60" />
          </button>
          {showTemplatesDropdown && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-[100] overflow-hidden">
              <button
                onClick={() => { onOpenTemplateGallery(); onToggleTemplatesDropdown(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <Sparkles size={15} className="text-purple-500" />
                Galería de plantillas
              </button>
              <button
                onClick={() => { onOpenTemplateManager(); onToggleTemplatesDropdown(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <FolderOpen size={15} className="text-blue-500" />
                Mis plantillas
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onImportClick}
          className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all"
          title="Importar proyecto"
        >
          <Upload size={18} />
        </button>
      </div>
    </header>
  );
};

export default EditorToolbar;
