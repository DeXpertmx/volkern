"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layout, Check } from 'lucide-react';
import { Template } from './types';
import { getAllTemplates } from './metadata/template-registry';

interface TemplateGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  selectedTemplateId?: string;
  mode?: 'webpage' | 'email' | 'document';
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  selectedTemplateId,
  mode = 'webpage',
}) => {
  const allTemplates = getAllTemplates();

  // Filter templates based on mode
  const templates = allTemplates.filter(template => {
    if (template.category === 'blank') return true;
    if (mode === 'email') return template.category === 'email';
    if (mode === 'document') return template.category === 'document';
    
    // For webpage mode, show everything except emails and documents
    return template.category !== 'email' && template.category !== 'document';
  });

  console.log('[TemplateGallery] Templates loaded:', templates.length, templates);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'landing':
        return 'bg-blue-500';
      case 'portfolio':
        return 'bg-purple-500';
      case 'ecommerce':
        return 'bg-green-500';
      case 'email':
        return 'bg-indigo-500';
      case 'document':
        return 'bg-amber-600';
      case 'blank':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'landing':
        return 'Landing Page';
      case 'portfolio':
        return 'Portafolio';
      case 'ecommerce':
        return 'E-commerce';
      case 'email':
        return 'Email Marketing';
      case 'document':
        return 'Documentos';
      case 'blank':
        return 'En Blanco';
      default:
        return category;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">
                  Galería de Plantillas
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Selecciona una plantilla para comenzar tu proyecto
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all shadow-sm"
              >
                <X size={24} />
              </button>
            </div>

            {/* Templates Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Layout size={48} className="mb-4 opacity-50" />
                  <p className="text-lg font-medium">No hay plantillas disponibles</p>
                  <p className="text-sm">Verifica que los archivos de plantillas existan en el directorio</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {templates.map((template) => (
                  <motion.div
                    key={template.id}
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onTap={() => onSelectTemplate(template.id)}
                    className={`group relative bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border-2 cursor-pointer transition-all shadow-sm hover:shadow-xl ${
                      selectedTemplateId === template.id
                        ? 'border-purple-500 ring-4 ring-purple-500/20'
                        : 'border-gray-100 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className={`h-48 ${getCategoryColor(template.category)} relative overflow-hidden`}>
                      {/* Preview Pattern */}
                      <div className="absolute inset-0 opacity-20">
                        <div className="absolute inset-0" style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                        }} />
                      </div>
                      
                      {/* Category Badge */}
                      <div className="absolute top-3 left-3">
                        <span className="px-3 py-1 bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full text-xs font-bold text-gray-700 dark:text-gray-300">
                          {getCategoryLabel(template.category)}
                        </span>
                      </div>

                      {/* Selected Indicator */}
                      {selectedTemplateId === template.id && (
                        <div className="absolute top-3 right-3">
                          <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                            <Check size={18} className="text-white" />
                          </div>
                        </div>
                      )}

                      {/* Template Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                          <Layout size={40} className="text-white" />
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">
                        {template.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {template.description}
                      </p>
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {template.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded-md text-xs text-gray-600 dark:text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Default Badge */}
                      {template.isDefault && (
                        <div className="mt-3">
                          <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-bold">
                            Por defecto
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {templates.length} plantillas disponibles
                </p>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
                >
                  Cerrar Galería
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
