"use client";

import React from "react";
import {
  Palette,
  Settings,
  Layers,
  MousePointer2,
} from "lucide-react";

interface PropertiesPanelProps {
  activePropertyTab: string;
  onTabChange: (tab: string) => void;
  selectedComponentInfo: { type: string; classes: string[]; path: string[] } | null;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  activePropertyTab,
  onTabChange,
  selectedComponentInfo,
}) => {
  return (
    <aside className="w-72 border-l border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950 z-40 flex flex-col shadow-lg">
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

      <div className="flex bg-white dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800 shadow-sm relative z-10">
        {[
          { id: "styles", label: "Estilos", icon: <Palette size={15} /> },
          { id: "traits", label: "Propiedades", icon: <Settings size={15} /> },
          { id: "classes", label: "Clases", icon: <Layers size={15} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
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

          <div id="gjs-tm-container" className={`grapesjs-traits-container p-4 ${activePropertyTab === "traits" ? "block" : "hidden"}`}>
            {!selectedComponentInfo && (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                <Settings className="mx-auto mb-4 opacity-20" size={48} />
              </div>
            )}
          </div>

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
  );
};

export default PropertiesPanel;
