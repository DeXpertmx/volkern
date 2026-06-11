'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { UserPlus, FileText, CalendarCheck, CreditCard, MessageCircle, Bot } from 'lucide-react';

const useCases = [
  { icon: UserPlus, title: 'Captación de leads', desc: 'Formularios, WhatsApp, web y QR' },
  { icon: FileText, title: 'Cotizaciones profesionales', desc: 'Con firma digital y envío al cliente' },
  { icon: CalendarCheck, title: 'Booking de citas', desc: 'Link de agendamiento automatizado' },
  { icon: CreditCard, title: 'Tarjeta digital', desc: 'Comparte tu contacto con QR único' },
  { icon: MessageCircle, title: 'Omnicanal unificado', desc: 'WhatsApp, email y web en el CRM' },
  { icon: Bot, title: 'IA comercial', desc: 'Forecasting, scoring y siguientes pasos' },
];

export const CRMVentasUseCases = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-cyan-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-cyan-500/10 text-cyan-400 text-sm font-medium mb-4 border border-cyan-500/20">Casos de Uso</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Tu ciclo comercial <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">completo en un solo lugar</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {useCases.map((uc, i) => { const Icon = uc.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} whileHover={{ y: -4 }} className="group bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors"><Icon className="w-6 h-6 text-cyan-400" /></div>
                <h3 className="text-white font-bold text-lg mb-2">{uc.title}</h3><p className="text-sm text-slate-400 leading-relaxed">{uc.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
