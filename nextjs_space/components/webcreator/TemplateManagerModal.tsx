"use client";

import React from "react";
import {
  Search,
  Grid,
  List,
  Upload,
  Download,
  ArrowRight,
  Plus,
  Layout,
  Trash2 as LucideTrash2,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import { TemplateRecord } from "../../lib/webcreator/templateStorage";

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: TemplateRecord[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  onLoadTemplate: (template: TemplateRecord) => void;
  onDeleteTemplate: (e: React.MouseEvent, idx: string) => void;
  onExportTemplate: (template: TemplateRecord) => void;
  onImportClick: () => void;
  onSaveAsTemplate: () => void;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => void;
}

const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  isOpen,
  onClose,
  templates,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onLoadTemplate,
  onDeleteTemplate,
  onExportTemplate,
  onImportClick,
  onSaveAsTemplate,
  hasMore,
  loading,
  loadMore,
}) => {
  const filteredTemplates = templates.filter(template => 
    template.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.idx.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gestor de Plantillas</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Guarda, carga y gestiona tus diseños</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
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
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 outline-none transition-all dark:text-gray-200"
              />
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => onViewModeChange("grid")}
                className={`p-3 rounded-xl transition-all ${viewMode === "grid" ? "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700"}`}
                title="Vista de cuadrícula"
              >
                <Grid size={18} />
              </button>
              <button 
                onClick={() => onViewModeChange("list")}
                className={`p-3 rounded-xl transition-all ${viewMode === "list" ? "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700"}`}
                title="Vista de lista"
              >
                <List size={18} />
              </button>
              
              <button
                onClick={onImportClick}
                className="flex items-center gap-2 px-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-all font-medium text-sm"
              >
                <Upload size={18} />
                <span className="hidden sm:inline">Importar</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center mb-4">
                <Layout className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No hay plantillas guardadas</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Comienza creando tu primer plantilla para reutilizar diseños en futuros proyectos.
              </p>
              <button
                onClick={onSaveAsTemplate}
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
                  onClick={() => onLoadTemplate(tmp)}
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
                              target.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg></div>';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="text-gray-400">
                              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                              <line x1="3" x2="21" y1="9" y2="9"/>
                              <line x1="9" x2="9" y1="21" y2="9"/>
                            </svg>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadTemplate(tmp);
                            }}
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
                            onClick={(e) => onDeleteTemplate(e, tmp.idx)}
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
                              target.parentElement!.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>';
                            }}
                          />
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="text-gray-400">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                            <line x1="3" x2="21" y1="9" y2="9"/>
                            <line x1="9" x2="9" y1="21" y2="9"/>
                          </svg>
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
                            onLoadTemplate(tmp);
                          }}
                          className="p-2 text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-all"
                          title="Cargar plantilla"
                        >
                          <ArrowRight size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportTemplate(tmp);
                          }}
                          className="p-2 text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                          title="Exportar plantilla"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={(e) => onDeleteTemplate(e, tmp.idx)}
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
         {!loading && hasMore && (
           <div className="p-4 text-center">
             <button
               onClick={loadMore}
               className="w-full px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-all font-medium text-sm"
             >
               {loading ? "Cargando..." : "Cargar más plantillas"}
               {loading ? <RotateCcw className="w-3 h-3 inline-block animate-spin ml-2" /> : <ArrowDown size={16} className="inline-block ml-2" />}
             </button>
           </div>
         )}
       </div>
     </div>
   );
 };
 
export default TemplateManagerModal;
