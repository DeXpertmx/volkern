'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, Check, Layers } from 'lucide-react';

const without = ['Pipeline en Excel', 'WhatsApp separado del CRM', 'Cotizaciones manuales', 'Sin scoring de leads'];

export const CRMVentasCompare = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-4 border border-orange-500/20">Todo en Uno</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Deja de usar <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-cyan-400">múltiples herramientas</span></h2>
        </motion.div>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center"><X className="w-5 h-5 text-red-400" /></div><h3 className="text-xl font-bold text-slate-400">Sin Volkern</h3></div>
            <div className="space-y-3">{without.map((t, i) => (<motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: 0.1 * i }} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800"><div className="w-2 h-2 rounded-full bg-red-500/50 flex-shrink-0" /><span className="text-slate-400">{t}</span></motion.div>))}</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="relative bg-gradient-to-br from-cyan-900/40 to-slate-900 border border-cyan-500/30 rounded-2xl p-8 overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 blur-3xl rounded-full" />
            <div className="relative"><div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center"><Check className="w-5 h-5 text-cyan-400" /></div><h3 className="text-xl font-bold text-white">Con Volkern</h3></div>
              <motion.div initial={{ scale: 0.9 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }} className="bg-gradient-to-r from-cyan-500/20 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-6 text-center"><Layers className="w-10 h-10 text-cyan-400 mx-auto mb-3" /><p className="text-xl font-bold text-white mb-2">👉 Todo integrado en un solo CRM</p><p className="text-slate-400 text-sm">Pipeline, WhatsApp, cotizaciones y scoring nativos en una plataforma</p></motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
