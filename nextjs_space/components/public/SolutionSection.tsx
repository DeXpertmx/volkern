'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bot, Workflow, MessageSquare, Timer, ShieldCheck } from 'lucide-react';

const solutions = [
  {
    icon: Bot,
    title: 'CRM inteligente',
    description: 'para gestionar clientes',
  },
  {
    icon: Workflow,
    title: 'Automatización de ventas',
    description: 'y seguimiento',
  },
  {
    icon: MessageSquare,
    title: 'Chatbots con IA',
    description: 'que responden y califican leads',
  },
  {
    icon: Timer,
    title: 'Flujos automáticos',
    description: 'que trabajan por ti 24/7',
  },
];

export const SolutionSection = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none" />
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-4 border border-emerald-500/20">
            La Solución
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Volkern convierte tu negocio en{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">
              un sistema automatizado
            </span>
          </h2>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Centraliza, automatiza y escala tu operación desde un solo lugar:
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {solutions.map((solution, index) => {
            const Icon = solution.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="group relative bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-emerald-500/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <Icon className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">{solution.title}</h3>
                <p className="text-slate-400 text-sm">{solution.description}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center mt-12"
        >
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-6 py-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-300 font-medium">Todo conectado. Todo automatizado.</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
