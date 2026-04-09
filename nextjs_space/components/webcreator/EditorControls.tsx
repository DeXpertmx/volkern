"use client";

import React from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo,
  Redo,
  Eye,
  Moon,
  Sun,
} from "lucide-react";

interface EditorControlsProps {
  device: string;
  preview: boolean;
  zoom: number;
  theme: 'light' | 'dark' | 'auto';
  mode: 'webpage' | 'email' | 'document';
  onDeviceChange: (device: string) => void;
  onTogglePreview: () => void;
  onZoomChange: (zoom: number) => void;
  onToggleTheme: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const EditorControls: React.FC<EditorControlsProps> = ({
  device,
  preview,
  zoom,
  theme,
  mode,
  onDeviceChange,
  onTogglePreview,
  onZoomChange,
  onToggleTheme,
  onUndo,
  onRedo,
}) => {
  return (
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
              onClick={() => onDeviceChange(d.id)}
              className={`p-1.5 rounded-md transition-all ${device === d.id ? "bg-white dark:bg-slate-800 shadow-sm text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"}`}
              title={d.title}
            >
              {d.icon}
            </button>
          ))}
        </div>
      )}

      <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onUndo}
          className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          title="Deshacer (Ctrl+Z)"
        >
          <Undo size={15} />
        </button>
        <button
          onClick={onRedo}
          className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          title="Rehacer (Ctrl+Y)"
        >
          <Redo size={15} />
        </button>
      </div>

      <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

      <div className="flex items-center gap-1 shrink-0">
        <select
          value={zoom}
          onChange={e => onZoomChange(Number(e.target.value))}
          className="text-xs font-semibold bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400"
          title="Zoom del canvas"
        >
          {[50, 75, 90, 100, 110, 125, 150].map(v => (
            <option key={v} value={v}>{v}%</option>
          ))}
        </select>
      </div>

      <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

      <button
        onClick={onTogglePreview}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${preview ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"}`}
        title={preview ? "Salir de vista previa" : "Vista previa"}
      >
        <Eye size={15} />
        <span className="hidden lg:inline">{preview ? "Editar" : "Previa"}</span>
      </button>

      <button
        onClick={onToggleTheme}
        className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-all"
        title="Alternar tema"
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </div>
  );
};

export default EditorControls;
