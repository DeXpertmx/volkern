'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

export const RealEstateOffer = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-emerald-600/8 blur-[180px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-5 py-2 mb-8">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-300 text-sm font-medium">Oferta Especial</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Te configuramos tu inmobiliaria{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
              automatizada en 7 días
            </span>
          </h2>

          <p className="text-xl text-slate-400 mb-4 leading-relaxed">
            Sin configuraciones complejas. Nuestro equipo se encarga de todo.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-10 text-sm text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Catálogo configurado
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> WhatsApp conectado
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Portal listo
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> IA entrenada
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/#demo">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-7 text-lg rounded-xl group shadow-xl shadow-emerald-600/30">
                Quiero mi inmobiliaria automatizada
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
          </div>

          <p className="mt-6 text-sm text-slate-600">
            Sin compromiso. Te mostramos el resultado antes de decidir.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
