'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MousePointerClick, MessageCircle, TrendingUp } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: MousePointerClick,
    title: 'Captura leads automáticamente',
    description: 'Desde formularios, WhatsApp o redes sociales',
    accent: 'blue',
  },
  {
    number: '02',
    icon: MessageCircle,
    title: 'Automatiza el seguimiento',
    description: 'Mensajes, recordatorios y calificación sin intervención',
    accent: 'purple',
  },
  {
    number: '03',
    icon: TrendingUp,
    title: 'Convierte más clientes',
    description: 'Con procesos definidos y automatizados',
    accent: 'emerald',
  },
];

const accentStyles: Record<string, { glow: string; hoverBorder: string; bg: string; border: string; text: string }> = {
  blue: {
    glow: 'shadow-blue-500/10',
    border: 'border-blue-500/20',
    hoverBorder: 'hover:border-blue-500/40',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
  },
  purple: {
    glow: 'shadow-purple-500/10',
    border: 'border-purple-500/20',
    hoverBorder: 'hover:border-purple-500/40',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
  },
  emerald: {
    glow: 'shadow-emerald-500/10',
    border: 'border-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
  },
};

export const HowItWorks = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-blue-600/5 blur-[150px] rounded-full pointer-events-none" />
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-medium mb-4 border border-indigo-500/20">
            Así funciona
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Así funciona{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">
              Volkern
            </span>
          </h2>
        </motion.div>

        <div className="max-w-5xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const styles = accentStyles[step.accent];
            
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.7, delay: index * 0.2 }}
                className={`flex flex-col md:flex-row items-center gap-8 mb-16 last:mb-0 ${
                  index % 2 === 1 ? 'md:flex-row-reverse' : ''
                }`}
              >
                {/* Step card */}
                <div className={`flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-8 ${styles.hoverBorder} transition-all duration-300 ${styles.glow} shadow-lg`}>
                  <div className="flex items-center gap-4 mb-4">
                    <span className={`text-5xl font-black ${styles.text} opacity-20`}>
                      {step.number}
                    </span>
                    <div className={`w-14 h-14 rounded-2xl ${styles.bg} ${styles.border} flex items-center justify-center border`}>
                      <Icon className={`w-7 h-7 ${styles.text}`} />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-lg text-slate-400">{step.description}</p>
                </div>

                {/* Connector */}
                {index < steps.length - 1 && (
                  <div className="hidden md:flex flex-col items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${styles.bg} ${styles.border} border`} />
                    <div className="w-0.5 h-24 bg-gradient-to-b from-slate-700 to-slate-800" />
                    <div className={`w-3 h-3 rounded-full ${styles.bg} ${styles.border} border`} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
