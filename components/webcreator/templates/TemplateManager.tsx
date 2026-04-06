"use client";

import React, { useState, useEffect } from 'react';
import { WebCreatorTemplate, templateService, TEMPLATE_CATEGORIES } from './templateService';
import { Editor } from 'grapesjs';

interface TemplateManagerProps {
  editor: Editor | null;
  onTemplateApplied?: () => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ editor, onTemplateApplied }) => {
  const [templates, setTemplates] = useState<WebCreatorTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [newTemplateName, setNewTemplateName] = useState<string>('');
  const [newTemplateDescription, setNewTemplateDescription] = useState<string>('');
  const [newTemplateCategory, setNewTemplateCategory] = useState<string>(TEMPLATE_CATEGORIES[0].id);

  // Cargar plantillas al montar el componente
  useEffect(() => {
    loadTemplates();
  }, []);

  // Cargar todas las plantillas
  const loadTemplates = () => {
    setLoading(true);
    try {
      const allTemplates = templateService.getAllTemplates();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('Error al cargar plantillas:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar plantillas por categoría
  const filteredTemplates = selectedCategory === 'all' 
    ? templates 
    : templates.filter(template => template.category === selectedCategory);

  // Aplicar una plantilla al editor
  const handleApplyTemplate = async (templateId: string) => {
    if (!editor) return;
    
    setLoading(true);
    try {
      const success = await templateService.applyTemplateToEditor(editor, templateId);
      if (success && onTemplateApplied) {
        onTemplateApplied();
      }
    } catch (error) {
      console.error('Error al aplicar la plantilla:', error);
    } finally {
      setLoading(false);
    }
  };

  // Guardar el diseño actual como plantilla
  const handleSaveAsTemplate = async () => {
    if (!editor || !newTemplateName.trim()) return;
    
    setLoading(true);
    try {
      await templateService.createTemplateFromEditor(
        editor,
        newTemplateName,
        newTemplateDescription,
        newTemplateCategory
      );
      
      // Resetear formulario
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateCategory(TEMPLATE_CATEGORIES[0].id);
      
      // Recargar plantillas
      loadTemplates();
    } catch (error) {
      console.error('Error al guardar como plantilla:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="template-manager p-4">
      <h2 className="text-xl font-bold mb-4">Plantillas</h2>
      
      {/* Selector de categoría */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Categoría</label>
        <select 
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="all">Todas las categorías</option>
          {TEMPLATE_CATEGORIES.map(category => (
            <option key={category.id} value={category.id}>
              {category.icon} {category.name}
            </option>
          ))}
        </select>
      </div>
      
      {/* Guardar como plantilla */}
      <div className="mb-6 p-4 border rounded">
        <h3 className="font-medium mb-3">Guardar como plantilla</h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Nombre de la plantilla"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            className="w-full p-2 border rounded text-sm"
          />
          <textarea
            placeholder="Descripción (opcional)"
            value={newTemplateDescription}
            onChange={(e) => setNewTemplateDescription(e.target.value)}
            className="w-full p-2 border rounded text-sm"
            rows={2}
          />
          <select
            value={newTemplateCategory}
            onChange={(e) => setNewTemplateCategory(e.target.value)}
            className="w-full p-2 border rounded text-sm"
          >
            {TEMPLATE_CATEGORIES.map(category => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSaveAsTemplate}
            disabled={loading || !newTemplateName.trim()}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar como plantilla'}
          </button>
        </div>
      </div>
      
      {/* Lista de plantillas */}
      <div>
        <h3 className="font-medium mb-3">
          {selectedCategory === 'all' ? 'Todas las plantillas' : 
           TEMPLATE_CATEGORIES.find(c => c.id === selectedCategory)?.name || 'Plantillas'}
        </h3>
        
        {loading ? (
          <div className="text-center py-4">Cargando plantillas...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No hay plantillas disponibles
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredTemplates.map(template => (
              <div 
                key={template.id} 
                className="border rounded p-3 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleApplyTemplate(template.id)}
              >
                <div className="flex items-start space-x-3">
                  <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{template.name}</h4>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {template.description}
                    </p>
                    <div className="mt-2 text-xs text-gray-500">
                      {TEMPLATE_CATEGORIES.find(c => c.id === template.category)?.name}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateManager;