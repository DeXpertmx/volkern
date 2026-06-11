'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Package, Map, TrendingDown } from 'lucide-react';

const problems = [
  { icon: Map, title: 'Sin visibilidad real', description: 'de tu flota en ruta' },
  { icon: Package, title: 'Almacén desorganizado', description: 'con procesos manuales' },
  { icon: Clock, title: 'Entregas con retraso', description: 'por rutas ineficientes' },
  { icon: TrendingDown, title: 'Falta de trazabilidad', description: 'de punta a punta' },
];

export const LogisticaProblemSection = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-background to-muted dark:from-slate-950 dark:to-slate-900 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-4 border border-red-500/20">El Problema</span>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground dark:text-white mb-6">Tu logística depende de procesos <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-yellow-400">que no ves ni controlas</span></h2>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {problems.map((p, i) => { const Icon = p.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }} whileHover={{ y: -4 }} className="group relative bg-card/50 dark:bg-slate-900/50 border border-border dark:border-slate-800 rounded-2xl p-6 text-center hover:border-red-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-red-500/20 transition-colors"><Icon className="w-6 h-6 text-red-400" /></div>
                <h3 className="text-foreground dark:text-white font-semibold text-lg mb-1">{p.title}</h3><p className="text-muted-foreground dark:text-slate-400 text-sm">{p.description}</p>
              </motion.div>
            );
          })}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-6 py-3"><TrendingDown className="w-5 h-5 text-red-400" /><span className="text-red-300 font-medium">👉 Sin visibilidad logística, pierdes dinero cada día.</span></div>
        </motion.div>
      </div>
    </section>
  );
};
