'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Bot, Workflow, Users, MessageCircle, Globe } from 'lucide-react';

const products = [
  { icon: BarChart3, title: 'CRM para ventas' },
  { icon: Bot, title: 'Chatbots con IA' },
  { icon: Workflow, title: 'Automatización de marketing' },
  { icon: Users, title: 'Gestión de clientes' },
  { icon: MessageCircle, title: 'Seguimiento por WhatsApp' },
  { icon: Globe, title: 'Landing pages profesionales' },
];

export const MarketingUseCases = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-purple-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-4 border border-purple-500/20">Qué Puedes Vender</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Una plataforma, <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">múltiples oportunidades</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {products.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} whileHover={{ y: -4 }} className="group bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-purple-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors"><Icon className="w-6 h-6 text-purple-400" /></div>
                <h3 className="text-white font-bold text-lg">{p.title}</h3>
              </motion.div>
            );
          })}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-6 py-3"><Globe className="w-5 h-5 text-purple-400" /><span className="text-purple-300 font-medium">👉 Todo bajo tu marca.</span></div>
        </motion.div>
      </div>
    </section>
  );
};
