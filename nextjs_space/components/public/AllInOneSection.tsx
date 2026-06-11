'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, Check, Layers } from 'lucide-react';

const withoutVolkern = [
  'CRM',
  'WhatsApp',
  'Automatización',
  'Formularios',
  'Seguimiento',
];

export const AllInOneSection = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/30 to-slate-950 pointer-events-none" />
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-4 border border-orange-500/20">
            Todo en Uno
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Deja de pagar{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">
              múltiples herramientas
            </span>
          </h2>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Without Volkern */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <X className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-400">Sin Volkern</h3>
              </div>
              <div className="space-y-3">
                {withoutVolkern.map((tool, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: 0.1 * index }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800"
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500/50 flex-shrink-0" />
                    <span className="text-slate-400">{tool}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* With Volkern */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative bg-gradient-to-br from-blue-900/40 to-slate-900 border border-blue-500/30 rounded-2xl p-8 overflow-hidden"
            >
              {/* Glow */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 blur-3xl rounded-full" />
              
              <div className="relative">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Con Volkern</h3>
                </div>
                
                <motion.div
                  initial={{ scale: 0.9 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="bg-gradient-to-r from-blue-500/20 to-emerald-500/10 border border-blue-500/20 rounded-2xl p-6 text-center"
                >
                  <Layers className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                  <p className="text-xl font-bold text-white mb-2">
                    👉 Todo en una sola plataforma
                  </p>
                  <p className="text-slate-400 text-sm">
                    CRM, WhatsApp, automatización, formularios y seguimiento integrados nativamente
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
