'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Factory, Monitor } from 'lucide-react';

const useCases = [
  { icon: TrendingUp, title: 'Empresas en crecimiento', desc: 'Escalan su equipo sin colapsar RRHH' },
  { icon: Users, title: 'Empresas con alta rotación', desc: 'Mejoran reclutamiento y retención' },
  { icon: Factory, title: 'Empresas operativas', desc: 'Automatizan comunicación con personal' },
  { icon: Monitor, title: 'Equipos remotos', desc: 'Centralizan procesos y cultura' },
];

export const RRHHUseCases = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-rose-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-rose-500/10 text-rose-400 text-sm font-medium mb-4 border border-rose-500/20">Casos de Uso</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">RRHH diseñado para <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">empresas reales</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {useCases.map((uc, i) => { const Icon = uc.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} whileHover={{ y: -4 }} className="group bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-rose-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-rose-500/20 transition-colors"><Icon className="w-6 h-6 text-rose-400" /></div>
                <h3 className="text-white font-bold text-lg mb-2">{uc.title}</h3><p className="text-sm text-slate-400 leading-relaxed">{uc.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
