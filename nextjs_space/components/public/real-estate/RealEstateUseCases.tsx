'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Building2, MessageCircle, CalendarCheck, TrendingUp, DollarSign, Target } from 'lucide-react';

const useCases = [
  { icon: Building2, title: 'Captación de propiedades', desc: 'Recibe y organiza nuevas propiedades automáticamente' },
  { icon: MessageCircle, title: 'Respuesta automática a interesados', desc: 'Chatbot y WhatsApp responden al instante' },
  { icon: CalendarCheck, title: 'Agendamiento de visitas', desc: 'Visitas programadas sin intervención manual' },
  { icon: Target, title: 'Seguimiento de clientes', desc: 'Pipeline inteligente que prioriza tus leads' },
  { icon: DollarSign, title: 'Cierre de ventas', desc: 'Proceso definido desde la oferta hasta la firma' },
  { icon: TrendingUp, title: 'Análisis y reportes', desc: 'Métricas en tiempo real de tu agencia' },
];

export const RealEstateUseCases = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-600/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-4 border border-emerald-500/20">
            Casos de Uso
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Hecho para el{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
              día a día inmobiliario
            </span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {useCases.map((uc, index) => {
            const Icon = uc.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                whileHover={{ y: -4 }}
                className="group bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <Icon className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{uc.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{uc.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
