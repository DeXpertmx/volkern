'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Layers, Repeat, Users, TrendingUp } from 'lucide-react';

const items = [
  { icon: Layers, title: 'Crear tu propia plataforma SaaS' },
  { icon: Repeat, title: 'Vender suscripciones mensuales' },
  { icon: Users, title: 'Ofrecer automatización con IA' },
  { icon: TrendingUp, title: 'Diferenciarte de otras agencias' },
];

export const MarketingOpportunity = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-600/8 blur-[180px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-4 border border-purple-500/20">La Oportunidad</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Convierte tu agencia en <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">un negocio escalable</span></h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">Con Volkern puedes:</p>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }} whileHover={{ y: -4 }} className="group relative bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-purple-500/20 transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-purple-500/20 transition-colors"><Icon className="w-7 h-7 text-purple-400" /></div>
                <h3 className="text-white font-semibold text-lg">{item.title}</h3>
              </motion.div>
            );
          })}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-6 py-3"><TrendingUp className="w-5 h-5 text-purple-400" /><span className="text-purple-300 font-medium">👉 De servicios → a ingresos recurrentes.</span></div>
        </motion.div>
      </div>
    </section>
  );
};
