'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, Check, Sparkles } from 'lucide-react';

const vs = [
  { bad: 'Sistemas de RRHH tradicionales', good: 'Plataforma de automatización + IA' },
  { bad: 'Ejecutas procesos manualmente', good: 'Ejecuta procesos automáticamente' },
  { bad: 'Empleado espera respuestas', good: 'Mejora la experiencia del empleado' },
  { bad: 'RRHH atrapado en tareas operativas', good: 'Libera al equipo de RRHH' },
  { bad: 'Datos sin analizar', good: 'Convierte datos en decisiones' },
];

export const RRHHCompare = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-rose-500/10 text-rose-400 text-sm font-medium mb-4 border border-rose-500/20"><Sparkles className="w-3.5 h-3.5" /> Diferenciador</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">No somos un <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">sistema de RRHH tradicional</span></h2>
        </motion.div>
        <div className="max-w-4xl mx-auto space-y-3">
          {vs.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} className="flex flex-col sm:flex-row items-stretch gap-3">
              <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4 text-red-400" /></div>
                <span className="text-slate-400 text-sm">{item.bad}</span>
              </div>
              <div className="hidden sm:flex items-center text-slate-600"><ArrowRight className="w-5 h-5 rotate-0 sm:rotate-0" /></div>
              <div className="flex-1 bg-gradient-to-r from-rose-900/30 to-slate-900 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center flex-shrink-0"><Check className="w-4 h-4 text-rose-400" /></div>
                <span className="text-white text-sm font-medium">{item.good}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Small helper icon
function ArrowRight({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>;
}
