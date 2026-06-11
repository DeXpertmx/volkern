'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Truck, Map, Package, Users, BarChart3, Globe } from 'lucide-react';

const useCases = [
  { icon: Truck, title: 'Gestión de flota', desc: 'Vehículos, mantenimiento y conductores' },
  { icon: Map, title: 'Tracking GPS en vivo', desc: 'Rutas, geocercas y alertas en tiempo real' },
  { icon: Package, title: 'WMS inteligente', desc: 'Recepción, ubicaciones y picking automatizado' },
  { icon: Globe, title: 'Optimización de rutas', desc: 'Planificación con IA y ventanas horarias' },
  { icon: BarChart3, title: 'KPIs en tiempo real', desc: 'OTIF, coste por envío, rotación de flota' },
  { icon: Users, title: 'APP conductores', desc: 'Firma digital POD y partes de trabajo' },
];

export const LogisticaUseCases = () => {
  return (
    <section className="py-24 bg-background dark:bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-yellow-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-sm font-medium mb-4 border border-yellow-500/20">Casos de Uso</span>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground dark:text-white mb-6">Controla tu cadena de suministro <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">de punta a punta</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {useCases.map((uc, i) => { const Icon = uc.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} whileHover={{ y: -4 }} className="group bg-card/50 dark:bg-slate-900/50 border border-border dark:border-slate-800 rounded-2xl p-6 hover:border-yellow-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mb-4 group-hover:bg-yellow-500/20 transition-colors"><Icon className="w-6 h-6 text-yellow-400" /></div>
                <h3 className="text-foreground dark:text-white font-bold text-lg mb-2">{uc.title}</h3><p className="text-sm text-muted-foreground dark:text-slate-400 leading-relaxed">{uc.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
