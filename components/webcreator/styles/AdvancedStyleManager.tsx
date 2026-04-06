"use client";

import React, { useState, useEffect } from 'react';
import { Editor, Component } from 'grapesjs';
import { 
  styleCustomizationService, 
  StylePreset, 
  CustomStyle, 
  STYLE_CATEGORIES 
} from './styleCustomizationService';

interface StyleManagerProps {
  editor: Editor | null;
  selectedComponent: Component | null;
}

const AdvancedStyleManager: React.FC<StyleManagerProps> = ({ editor, selectedComponent }) => {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  
  // Estados para crear nuevo preset
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [newPresetDescription, setNewPresetDescription] = useState<string>('');
  const [newPresetCategory, setNewPresetCategory] = useState<string>(STYLE_CATEGORIES[0].id);
  const [newPresetStyles, setNewPresetStyles] = useState<Record<string, string>>({});
  
  // Estados para propiedades de estilo
  const [newProperty, setNewProperty] = useState<{key: string, value: string}>({key: '', value: ''});

  // Cargar presets y estilos al montar el componente
  useEffect(() => {
    loadStyleData();
  }, []);

  // Cargar datos de estilos
  const loadStyleData = () => {
    setLoading(true);
    try {
      const allPresets = styleCustomizationService.getAllStylePresets();
      const allCustomStyles = styleCustomizationService.getAllCustomStyles();
      setPresets(allPresets);
      setCustomStyles(allCustomStyles);
    } catch (error) {
      console.error('Error al cargar datos de estilos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar presets por categoría
  const filteredPresets = selectedCategory === 'all' 
    ? presets 
    : presets.filter(preset => preset.category === selectedCategory);

  // Aplicar un preset al editor
  const handleApplyPreset = (presetId: string) => {
    if (!editor) return;
    
    setLoading(true);
    try {
      styleCustomizationService.applyStylePreset(editor, presetId);
    } catch (error) {
      console.error('Error al aplicar el preset:', error);
    } finally {
      setLoading(false);
    }
  };

  // Agregar una propiedad al nuevo preset
  const addPropertyToPreset = () => {
    if (!newProperty.key.trim() || !newProperty.value.trim()) return;
    
    setNewPresetStyles(prev => ({
      ...prev,
      [newProperty.key]: newProperty.value
    }));
    
    setNewProperty({key: '', value: ''});
  };

  // Remover una propiedad del nuevo preset
  const removePropertyFromPreset = (key: string) => {
    const {[key]: _, ...rest} = newPresetStyles;
    setNewPresetStyles(rest);
  };

  // Guardar un nuevo preset
  const handleSavePreset = () => {
    if (!newPresetName.trim() || Object.keys(newPresetStyles).length === 0) return;
    
    setLoading(true);
    try {
      const preset = styleCustomizationService.createStylePreset({
        name: newPresetName,
        description: newPresetDescription,
        category: newPresetCategory,
        styles: newPresetStyles
      });
      
      // Agregar el nuevo preset a la lista
      setPresets(prev => [...prev, preset]);
      
      // Resetear formulario
      setNewPresetName('');
      setNewPresetDescription('');
      setNewPresetCategory(STYLE_CATEGORIES[0].id);
      setNewPresetStyles({});
    } catch (error) {
      console.error('Error al guardar el preset:', error);
    } finally {
      setLoading(false);
    }
  };

  // Aplicar un estilo personalizado
  const handleApplyCustomStyle = (styleId: string) => {
    if (!editor) return;
    
    setLoading(true);
    try {
      styleCustomizationService.applyCustomStyle(editor, styleId);
    } catch (error) {
      console.error('Error al aplicar el estilo personalizado:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="advanced-style-manager p-4">
      <h2 className="text-xl font-bold mb-4">Personalización de Estilos</h2>
      
      {/* Selector de categoría */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Categoría</label>
        <select 
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="all">Todas las categorías</option>
          {STYLE_CATEGORIES.map(category => (
            <option key={category.id} value={category.id}>
              {category.icon} {category.name}
            </option>
          ))}
        </select>
      </div>
      
      {/* Crear nuevo preset */}
      <div className="mb-6 p-4 border rounded">
        <h3 className="font-medium mb-3">Crear Nuevo Preset</h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Nombre del preset"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            className="w-full p-2 border rounded text-sm"
          />
          <textarea
            placeholder="Descripción (opcional)"
            value={newPresetDescription}
            onChange={(e) => setNewPresetDescription(e.target.value)}
            className="w-full p-2 border rounded text-sm"
            rows={2}
          />
          <select
            value={newPresetCategory}
            onChange={(e) => setNewPresetCategory(e.target.value)}
            className="w-full p-2 border rounded text-sm"
          >
            {STYLE_CATEGORIES.map(category => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
          
          {/* Agregar propiedades */}
          <div className="border-t pt-3">
            <h4 className="text-sm font-medium mb-2">Propiedades CSS</h4>
            <div className="flex space-x-2 mb-2">
              <input
                type="text"
                placeholder="Propiedad"
                value={newProperty.key}
                onChange={(e) => setNewProperty({...newProperty, key: e.target.value})}
                className="flex-1 p-2 border rounded text-sm"
              />
              <input
                type="text"
                placeholder="Valor"
                value={newProperty.value}
                onChange={(e) => setNewProperty({...newProperty, value: e.target.value})}
                className="flex-1 p-2 border rounded text-sm"
              />
              <button
                onClick={addPropertyToPreset}
                className="bg-gray-200 px-3 rounded"
              >
                +
              </button>
            </div>
            
            {/* Lista de propiedades agregadas */}
            {Object.keys(newPresetStyles).length > 0 && (
              <div className="mt-2">
                {Object.entries(newPresetStyles).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center bg-gray-50 p-2 rounded mb-1">
                    <span className="text-sm">{key}: {value}</span>
                    <button 
                      onClick={() => removePropertyFromPreset(key)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={handleSavePreset}
            disabled={loading || !newPresetName.trim() || Object.keys(newPresetStyles).length === 0}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar Preset'}
          </button>
        </div>
      </div>
      
      {/* Lista de presets */}
      <div className="mb-8">
        <h3 className="font-medium mb-3">
          {selectedCategory === 'all' ? 'Todos los Presets' : 
           STYLE_CATEGORIES.find(c => c.id === selectedCategory)?.name || 'Presets'}
        </h3>
        
        {loading ? (
          <div className="text-center py-4">Cargando presets...</div>
        ) : filteredPresets.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No hay presets disponibles
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredPresets.map(preset => (
              <div 
                key={preset.id} 
                className="border rounded p-3 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{preset.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {preset.description}
                    </p>
                    <div className="mt-2">
                      <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                        {STYLE_CATEGORIES.find(c => c.id === preset.category)?.name}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleApplyPreset(preset.id)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                  >
                    Aplicar
                  </button>
                </div>
                
                {/* Vista previa de estilos */}
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs text-gray-500 mb-1">Propiedades:</div>
                  <div className="text-xs bg-gray-50 p-2 rounded max-h-20 overflow-y-auto">
                    {Object.entries(preset.styles).map(([prop, value]) => (
                      <div key={prop} className="font-mono">
                        <span className="text-blue-600">{prop}</span>: {value}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Estilos personalizados */}
      <div>
        <h3 className="font-medium mb-3">Estilos Personalizados</h3>
        
        {customStyles.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No hay estilos personalizados
          </div>
        ) : (
          <div className="space-y-3">
            {customStyles.map(style => (
              <div 
                key={style.id} 
                className="border rounded p-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{style.name}</h4>
                    <div className="text-sm text-gray-600 mt-1">
                      Selector: <code className="bg-gray-100 px-1 rounded">{style.selector}</code>
                    </div>
                  </div>
                  <button
                    onClick={() => handleApplyCustomStyle(style.id)}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Aplicar
                  </button>
                </div>
                
                {/* Propiedades del estilo */}
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs bg-gray-50 p-2 rounded max-h-20 overflow-y-auto">
                    {Object.entries(style.properties).map(([prop, value]) => (
                      <div key={prop} className="font-mono text-xs">
                        <span className="text-blue-600">{prop}</span>: {value}
                      </div>
                    ))}
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

export default AdvancedStyleManager;