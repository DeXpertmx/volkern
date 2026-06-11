'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Zap, Clock, BarChart3 } from 'lucide-react';

const results = [
  {
    icon: TrendingUp,
    title: 'Más respuestas',
    description: '= más oportunidades',
    color: 'emerald',
  },
  {
    icon: BarChart3,
    title: 'Mejor seguimiento',
    description: '= más cierres',
    color: 'blue',
  },
  {
    icon: Clock,
    title: 'Menos trabajo manual',
    description: '= más tiempo para vender',
    color: 'purple',
  },
];

const colorMap: Record<string, string> = {
  emerald: 'from-emerald-400 to-teal-400',
  blue: 'from-blue-400 to-indigo-400',
  purple: 'from-purple-400 to-fuchsia-400',
};

export const RealEstateResults = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-4 border border-emerald-500/20">
            <Zap className="w-3.5 h-3.5" />
            Resultados
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Lo que cambia cuando{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">
              usas Volkern
            </span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center hover:border-slate-700 transition-all duration-300"
              >
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-6">
                  <Icon className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-white font-bold text-xl mb-2">{result.title}</h3>
                <p className={`text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r ${colorMap[result.color]}`}>
                  {result.description}
                </p>
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
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-300 font-medium text-lg">
              👉 Más ventas, menos caos.
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
