"use client";

import React from "react";
import {
  Layout,
  Layers,
  ImageIcon,
  Palette,
  Database,
  History,
  Code2,
  X,
  RefreshCw,
  Tags,
  Sparkles,
} from "lucide-react";

interface EditorSidebarProps {
  activePanel: string;
  onPanelChange: (panel: string) => void;
  onOpenCode: () => void;
  onExit: () => void;
}

const EditorSidebar: React.FC<EditorSidebarProps> = ({
  activePanel,
  onPanelChange,
  onOpenCode,
  onExit,
}) => {
  return (
    <nav className="w-16 bg-white dark:bg-slate-950 border-r border-gray-100 dark:border-slate-800 flex flex-col items-center py-4 gap-2 z-40">
      {[
        { id: "blocks", icon: <Layout size={20} />, label: "Bloques" },
        { id: "layers", icon: <Layers size={20} />, label: "Capas" },
        { id: "assets", icon: <ImageIcon size={20} />, label: "Media" },
        { id: "styles", icon: <Palette size={20} />, label: "Estilos" },
        { id: "cms", icon: <Database size={20} />, label: "CMS" },
        { id: "history", icon: <History size={20} />, label: "Historial" },
        { id: "versions", icon: <RefreshCw size={20} />, label: "Versiones" },
        { id: "variables", icon: <Tags size={20} />, label: "Guía de Variables" },
        { id: "ai", icon: <Sparkles size={20} />, label: "Gemma 4 AI" },
        { id: "code", icon: <Code2 size={20} />, label: "Código" },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => {
            if (item.id === "code") {
              onOpenCode();
            } else {
              onPanelChange(item.id);
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
        onClick={onExit}
        className="p-3 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
        title="Salir"
      >
        <X size={20} />
      </button>
    </nav>
  );
};

export default EditorSidebar;
