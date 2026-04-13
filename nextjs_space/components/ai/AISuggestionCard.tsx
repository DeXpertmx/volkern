'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';

interface AISuggestionCardProps {
  strategy?: string | null;
  riskLevel?: number;
  onAction?: () => void;
}

export const AISuggestionCard: React.FC<AISuggestionCardProps> = ({ strategy, riskLevel = 0, onAction }) => {
  if (!strategy) return null;

  const getRiskColor = (level: number) => {
    if (level > 70) return 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200';
    if (level > 30) return 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 border-amber-200';
    return 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200';
  };

  const riskStyles = getRiskColor(riskLevel);

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-xl overflow-hidden"
    >
      {/* Header con gradiente suave */}
      <div className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-4 flex items-center justify-between border-b border-blue-50 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 rounded-lg text-white">
            <Lightbulb className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">Consejo Estratégico AI</span>
        </div>
        
        {/* Indicador de riesgo */}
        <div className={`px-2 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 ${riskStyles}`}>
          <AlertTriangle className="w-3 h-3" />
          RIESGO: {riskLevel}%
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed italic">
          "{strategy}"
        </p>

        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
            <TrendingUp className="w-3 h-3" />
            +24% Probabilidad de Cierre
          </div>
          
          <button 
            onClick={onAction}
            className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors group"
          >
            Practicar ahora
            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
