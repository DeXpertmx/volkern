"use client";

import React, { useState, useRef } from 'react';
import { Editor } from 'grapesjs';
import { exportImportService, ExportOptions, ImportOptions } from './exportImportService';

interface ExportImportManagerProps {
  editor: Editor | null;
}

const ExportImportManager: React.FC<ExportImportManagerProps> = ({ editor }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'html' | 'zip'>('json');
  const [includeAssets, setIncludeAssets] = useState<boolean>(true);
  const [includeStyles, setIncludeStyles] = useState<boolean>(true);
  const [includeScripts, setIncludeScripts] = useState<boolean>(true);
  const [minify, setMinify] = useState<boolean>(false);
  const [templateName, setTemplateName] = useState<string>('Mi Proyecto');
  const [templateDescription, setTemplateDescription] = useState<string>('');
  
  const [importFormat, setImportFormat] = useState<'json' | 'html'>('json');
  const [mergeMode, setMergeMode] = useState<'replace' | 'append' | 'merge'>('replace');
  const [preserveStyles, setPreserveStyles] = useState<boolean>(true);
  const [preserveAssets, setPreserveAssets] = useState<boolean>(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manejar exportación
  const handleExport = async () => {
    if (!editor) return;
    
    setLoading(true);
    try {
      const options: ExportOptions = {
        format: exportFormat,
        includeAssets,
        includeStyles,
        includeScripts,
        minify,
        templateName,
        templateDescription
      };
      
      const result = await exportImportService.exportProject(editor, options);
      
      // Crear y descargar archivo
      let blob: Blob;
      let filename: string;
      
      if (typeof result === 'string') {
        blob = new Blob([result], { type: 'application/json' });
        filename = `${templateName || 'proyecto'}.json`;
      } else {
        blob = result;
        switch (exportFormat) {
          case 'json':
            filename = `${templateName || 'proyecto'}.json`;
            break;
          case 'html':
            filename = `${templateName || 'proyecto'}.html`;
            break;
          case 'zip':
            filename = `${templateName || 'proyecto'}.zip`;
            break;
          default:
            filename = 'proyecto.json';
        }
      }
      
      // Descargar archivo
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error al exportar:', error);
      alert('Error al exportar el proyecto');
    } finally {
      setLoading(false);
    }
  };

  // Manejar selección de archivo para importación
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Manejar importación
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor || !event.target.files || event.target.files.length === 0) return;
    
    const file = event.target.files[0];
    event.target.value = ''; // Resetear input
    
    setLoading(true);
    try {
      const options: ImportOptions = {
        format: importFormat,
        mergeMode,
        preserveStyles,
        preserveAssets
      };
      
      const success = await exportImportService.importProject(editor, file, options);
      
      if (success) {
        alert('Proyecto importado exitosamente');
      } else {
        alert('Error al importar el proyecto');
      }
    } catch (error) {
      console.error('Error al importar:', error);
      alert('Error al importar el proyecto');
    } finally {
      setLoading(false);
    }
  };

  // Generar vista previa
  const handlePreview = () => {
    if (!editor) return;
    
    try {
      const previewHTML = exportImportService.generatePreview(editor);
      
      // Abrir vista previa en nueva ventana
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(previewHTML);
        newWindow.document.close();
      }
    } catch (error) {
      console.error('Error al generar vista previa:', error);
      alert('Error al generar vista previa');
    }
  };

  return (
    <div className="export-import-manager p-4">
      <h2 className="text-xl font-bold mb-4">Exportar/Importar</h2>
      
      {/* Sección de Exportación */}
      <div className="mb-8 p-4 border rounded">
        <h3 className="font-medium mb-3">Exportar Proyecto</h3>
        
        <div className="space-y-4">
          {/* Nombre y descripción */}
          <div>
            <label className="block text-sm font-medium mb-1">Nombre del Proyecto</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full p-2 border rounded text-sm"
              placeholder="Nombre descriptivo para el proyecto"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Descripción</label>
            <textarea
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              className="w-full p-2 border rounded text-sm"
              placeholder="Descripción opcional del proyecto"
              rows={2}
            />
          </div>
          
          {/* Formato de exportación */}
          <div>
            <label className="block text-sm font-medium mb-1">Formato</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'json' | 'html' | 'zip')}
              className="w-full p-2 border rounded"
            >
              <option value="json">JSON (Proyecto completo)</option>
              <option value="html">HTML (Página completa)</option>
              <option value="zip">ZIP (Todo empaquetado)</option>
            </select>
          </div>
          
          {/* Opciones de exportación */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={includeAssets}
                onChange={(e) => setIncludeAssets(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Incluir Assets</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={includeStyles}
                onChange={(e) => setIncludeStyles(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Incluir Estilos</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={includeScripts}
                onChange={(e) => setIncludeScripts(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Incluir Scripts</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={minify}
                onChange={(e) => setMinify(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Minificar</span>
            </label>
          </div>
          
          {/* Botones */}
          <div className="flex space-x-3">
            <button
              onClick={handleExport}
              disabled={loading || !editor}
              className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Exportando...' : 'Exportar'}
            </button>
            
            <button
              onClick={handlePreview}
              disabled={loading || !editor}
              className="flex-1 bg-gray-600 text-white py-2 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              Vista Previa
            </button>
          </div>
        </div>
      </div>
      
      {/* Sección de Importación */}
      <div className="p-4 border rounded">
        <h3 className="font-medium mb-3">Importar Proyecto</h3>
        
        <div className="space-y-4">
          {/* Formato de importación */}
          <div>
            <label className="block text-sm font-medium mb-1">Formato</label>
            <select
              value={importFormat}
              onChange={(e) => setImportFormat(e.target.value as 'json' | 'html')}
              className="w-full p-2 border rounded"
            >
              <option value="json">JSON</option>
              <option value="html">HTML</option>
            </select>
          </div>
          
          {/* Modo de merge */}
          <div>
            <label className="block text-sm font-medium mb-1">Modo de Importación</label>
            <select
              value={mergeMode}
              onChange={(e) => setMergeMode(e.target.value as 'replace' | 'append' | 'merge')}
              className="w-full p-2 border rounded"
            >
              <option value="replace">Reemplazar todo</option>
              <option value="append">Agregar al final</option>
              <option value="merge">Fusionar contenido</option>
            </select>
          </div>
          
          {/* Opciones de importación */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={preserveStyles}
                onChange={(e) => setPreserveStyles(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Preservar Estilos</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={preserveAssets}
                onChange={(e) => setPreserveAssets(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Preservar Assets</span>
            </label>
          </div>
          
          {/* Botón de importación */}
          <button
            onClick={handleImportClick}
            disabled={loading || !editor}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            Seleccionar Archivo para Importar
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".json,.html"
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

export default ExportImportManager;