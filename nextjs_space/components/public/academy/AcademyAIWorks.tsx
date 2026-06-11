'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bot, MessageSquare, Target, CalendarCheck } from 'lucide-react';

const capabilities = [
  { icon: MessageSquare, title: 'Responde preguntas', description: 'frecuentes' },
  { icon: Target, title: 'Explica programas', description: 'y precios' },
  { icon: CalendarCheck, title: 'Da seguimiento', description: 'automático' },
  { icon: Bot, title: 'Detecta intención', description: 'de compra' },
];

export const AcademyAIWorks = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-purple-600/8 blur-[180px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-600/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-4 border border-purple-500/20"><Bot className="w-3.5 h-3.5" /> Inteligencia Artificial</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Un asistente que vende <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-amber-400">tus cursos 24/7</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {capabilities.map((cap, i) => { const Icon = cap.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }} whileHover={{ y: -6, scale: 1.02 }} className="group relative bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-purple-500/30 transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all duration-300"><Icon className="w-7 h-7 text-purple-400" /></div>
                <h3 className="text-white font-semibold text-lg mb-1">{cap.title}</h3><p className="text-slate-400 text-sm">{cap.description}</p>
              </motion.div>
            );
          })}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-6 py-3"><Bot className="w-5 h-5 text-purple-400" /><span className="text-purple-300 font-medium">👉 Nunca dejas un lead sin atención.</span></div>
        </motion.div>
      </div>
    </section>
  );
};
