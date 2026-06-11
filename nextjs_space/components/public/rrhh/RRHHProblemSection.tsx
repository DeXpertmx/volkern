'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, UserX, FolderOpen, TrendingDown, MessageCircle, AlertTriangle, BarChart3 } from 'lucide-react';

const problems = [
  { icon: Clock, title: 'Reclutamiento lento', description: 'y manual' },
  { icon: UserX, title: 'Pérdida de candidatos', description: 'por mala comunicación' },
  { icon: FolderOpen, title: 'Onboarding', description: 'desorganizado' },
  { icon: TrendingDown, title: 'Falta de seguimiento', description: 'al desempeño' },
  { icon: MessageCircle, title: 'Comunicación interna', description: 'fragmentada' },
  { icon: AlertTriangle, title: 'RRHH saturado', description: 'con tareas operativas' },
  { icon: BarChart3, title: 'Falta de datos para', description: 'tomar decisiones' },
];

export const RRHHProblemSection = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-4 border border-red-500/20">El Problema</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Procesos de RRHH que <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">frenan tu crecimiento</span></h2>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {problems.map((p, i) => { const Icon = p.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }} whileHover={{ y: -4 }} className="group relative bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-center hover:border-rose-500/20 transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-3 group-hover:bg-rose-500/20 transition-colors"><Icon className="w-5 h-5 text-rose-400" /></div>
                <h3 className="text-white font-semibold text-sm mb-0.5">{p.title}</h3><p className="text-slate-400 text-xs">{p.description}</p>
              </motion.div>
            );
          })}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-full px-6 py-3"><AlertTriangle className="w-5 h-5 text-rose-400" /><span className="text-rose-300 font-medium">👉 RRHH pierde horas en tareas repetitivas. Volkern las elimina.</span></div>
        </motion.div>
      </div>
    </section>
  );
};
