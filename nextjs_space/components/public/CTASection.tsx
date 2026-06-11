'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react';

export const CTASection = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-600/12 blur-[180px] rounded-full pointer-events-none" />
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-5 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-blue-300 text-sm font-medium">Sin código. Sin complicaciones.</span>
          </div>

          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Empieza a automatizar{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              tu negocio hoy
            </span>
          </h2>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            No necesitas más herramientas.
            <br />
            Necesitas un sistema que funcione.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/auth/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-7 text-lg rounded-xl group shadow-xl shadow-blue-600/30">
                Empieza gratis
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            
            <a href="#demo">
              <Button variant="outline" size="lg" className="border-slate-700 text-slate-300 hover:bg-slate-900 hover:border-slate-600 px-10 py-7 text-lg rounded-xl group">
                <PlayCircle className="mr-2 w-5 h-5" />
                Agenda tu demo
              </Button>
            </a>
          </div>

          {/* Trust markers */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500"
          >
            <span>✓ Sin tarjeta de crédito</span>
            <span>✓ Configuración en minutos</span>
            <span>✓ Cancelas cuando quieras</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
