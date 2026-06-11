'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Target, Zap } from 'lucide-react';

const results = [
  { icon: Users, title: 'Más alumnos sin', description: 'aumentar esfuerzo' },
  { icon: Target, title: 'Mejor', description: 'organización' },
  { icon: TrendingUp, title: 'Más', description: 'conversiones' },
  { icon: Zap, title: 'Procesos claros', description: 'y automatizados' },
];

export const AcademyResults = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-4 border border-amber-500/20"><Zap className="w-3.5 h-3.5" /> Resultados</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Lo que cambia en <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">tu academia</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {results.map((r, i) => { const Icon = r.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }} className="relative bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-amber-500/20 transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4"><Icon className="w-7 h-7 text-amber-400" /></div>
                <h3 className="text-white font-bold text-lg mb-1">{r.title}</h3><p className="text-slate-400">{r.description}</p>
              </motion.div>
            );
          })}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-6 py-3"><TrendingUp className="w-5 h-5 text-amber-400" /><span className="text-amber-300 font-medium text-lg">👉 Crece sin perder control.</span></div>
        </motion.div>
      </div>
    </section>
  );
};
