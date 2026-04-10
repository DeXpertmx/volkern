"use client";

import React from "react";
import { Search, Plus, Type, Database, Layout as LayoutIcon, Users, History } from "lucide-react";

interface LeftPanelContentProps {
  activePanel: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  historyItems: string[];
  onUndo: () => void;
  versionHistory: Array<{id: string; timestamp: string; description: string}> | null;
  currentVersionIndex: number;
  onRestoreVersion: (index: number) => void;
}

const LeftPanelContent: React.FC<LeftPanelContentProps> = ({
  activePanel,
  searchQuery,
  onSearchChange,
  historyItems,
  onUndo,
  versionHistory,
  currentVersionIndex,
  onRestoreVersion,
}) => {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {activePanel === "blocks" && (
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Buscar bloques..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 outline-none transition-all dark:text-gray-200"
              />
            </div>
          </div>
          <div id="blocks-container" className="p-4" />
        </div>
      )}

      {activePanel === "history" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {historyItems.length > 0 ? `${historyItems.length} cambios registrados` : "Sin cambios registrados"}
            </p>
            <button
              onClick={onUndo}
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
                  <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-purple-500' : 'bg-gray-300 dark:bg-sale-600'}`} />
                  <span className="truncate">{item}</span>
                  {i === 0 && <span className="ml-auto text-[10px] font-bold text-purple-500 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded-full">ACTUAL</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activePanel === "versions" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {versionHistory?.length || 0} versiones guardadas
            </p>
            <button
              onClick={() => {
                if (currentVersionIndex >= 0 && versionHistory && versionHistory.length > 0) {
                  onRestoreVersion(currentVersionIndex);
                }
              }}
              className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold disabled:opacity-50"
              disabled={currentVersionIndex < 0 || !versionHistory || versionHistory.length === 0}
            >
              Restaurar versión actual
            </button>
          </div>
          {(!versionHistory || versionHistory.length === 0) ? (
            <div className="text-center py-8 text-gray-400">
              <History className="mx-auto mb-3" size={28} />
              <p className="text-sm">No hay versiones guardadas todavía</p>
              <p className="text-xs mt-2">Las versiones se guardan automáticamente cada 5 segundos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versionHistory.map((version, i) => (
                <div
                  key={version.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 ${
                    i === currentVersionIndex 
                      ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200' 
                      : 'bg-white dark:bg-slate-950 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                      {version.description}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(version.timestamp).toLocaleString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => onRestoreVersion(i)}
                    className="p-1.5 text-purple-600 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-all"
                    title="Restaurar esta versión"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 16 12 10 8 14"></polyline>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activePanel === "layers" && (
        <div className="p-4">
          <div id="layers-container" className="gjs-custom-layers" />
        </div>
      )}

      {activePanel === "assets" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Biblioteca de medios</h3>
            <button className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-bold text-xs flex items-center gap-1">
              <Plus size={14} />
              <span>Subir</span>
            </button>
          </div>
          <div id="assets-manager" />
        </div>
      )}

      {activePanel === "styles" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Estilos personalizados</h3>
            <button className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-bold text-xs flex items-center gap-1">
              <Plus size={14} />
              <span>Nuevo</span>
            </button>
          </div>
          <div id="styles-manager" className="mt-4" />
        </div>
      )}

      {activePanel === "cms" && (
        <div className="p-5 overflow-y-auto h-full">
          <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-purple-50 dark:from-purple-900/30 dark:via-blue-900/30 dark:to-purple-900/30 rounded-2xl p-6 mb-6 border border-purple-100 dark:border-purple-900/50 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 text-purple-700 dark:text-purple-300 mb-4">
              <div className="p-2 bg-purple-200/50 dark:bg-purple-900/50 rounded-lg">
                <Type size={18} className="fill-purple-700 dark:fill-purple-300" />
              </div>
              <span className="font-bold text-sm uppercase tracking-tight">AI Content Generation</span>
            </div>
            <p className="text-xs text-purple-600/85 dark:text-purple-300/85 leading-relaxed mb-5">Genera textos, imágenes y secciones completas usando el contexto de tu CRM.</p>
            <button className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 dark:from-purple-600 dark:to-purple-700 dark:hover:from-purple-700 dark:hover:to-purple-800 text-white text-xs font-bold py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group">
              <Type size={14} className="fill-white group-hover:scale-110 transition-transform" />
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
                { name: "Testimonios", count: 24, icon: <LayoutIcon size={16} />, color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400" },
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

      {activePanel === "variables" && (
        <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950">
           {/* Lazy loading VariableDocumentationPanel */}
           {(() => {
              const { VariableDocumentationPanel } = require("./VariableDocumentationPanel");
              return <VariableDocumentationPanel />;
           })()}
        </div>
      )}
    </div>
  );
};

export default LeftPanelContent;
