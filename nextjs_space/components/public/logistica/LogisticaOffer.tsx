'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

export const LogisticaOffer = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-background to-muted dark:from-slate-950 dark:to-slate-900 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-yellow-600/8 blur-[180px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-5 py-2 mb-8"><Zap className="w-4 h-4 text-yellow-400" /><span className="text-yellow-300 text-sm font-medium">Oferta Especial</span></div>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground dark:text-white mb-6">Te ayudamos a digitalizar tu logística <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400">en 14 días</span></h2>
          <p className="text-xl text-muted-foreground dark:text-slate-400 mb-4 leading-relaxed">Sin interrumpir tu operación. Nuestro equipo configura todo.</p>
          <div className="flex flex-wrap items-center justify-center gap-4 mb-10 text-sm text-muted-foreground dark:text-slate-400">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-yellow-400" /> WMS configurado</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-yellow-400" /> GPS integrado</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-yellow-400" /> Rutas optimizadas</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-yellow-400" /> APP conductores</span>
          </div>
          <a href="/#demo"><Button size="lg" className="bg-yellow-600 hover:bg-yellow-500 text-slate-900 px-10 py-7 text-lg rounded-xl group shadow-xl shadow-yellow-600/30 font-bold">Quiero digitalizar mi logística<ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" /></Button></a>
          <p className="mt-6 text-sm text-muted-foreground/60 dark:text-slate-600">Sin compromiso. Te mostramos el resultado antes de decidir.</p>
        </motion.div>
      </div>
    </section>
  );
};
