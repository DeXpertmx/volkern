'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Users, Zap, BarChart3, Heart } from 'lucide-react';

const benefits = [
  { icon: Clock, title: 'Reduce hasta 70% del tiempo', description: 'en reclutamiento' },
  { icon: Users, title: 'Menor rotación', description: 'de personal' },
  { icon: Zap, title: 'Onboarding más rápido', description: 'y estructurado' },
  { icon: BarChart3, title: 'Mejores decisiones', description: 'con datos' },
  { icon: Heart, title: 'Mejor experiencia', description: 'del empleado' },
];

export const RRHHBenefits = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-rose-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-rose-500/10 text-rose-400 text-sm font-medium mb-4 border border-rose-500/20"><Zap className="w-3.5 h-3.5" /> Beneficios Clave</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Resultados reales <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">en tu equipo</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
          {benefits.map((b, i) => { const Icon = b.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }} className="relative bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-rose-500/20 transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4"><Icon className="w-7 h-7 text-rose-400" /></div>
                <h3 className="text-white font-bold text-lg mb-1">{b.title}</h3><p className="text-slate-400 text-sm">{b.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
