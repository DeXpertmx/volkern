'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Target, BarChart3, ListChecks, ShieldCheck } from 'lucide-react';

const steps = [
  { number: '01', icon: Target, title: 'Se registra una oportunidad de negocio', description: 'Cliente, requerimiento o cotización', accent: 'orange' },
  { number: '02', icon: BarChart3, title: 'Se gestiona en el pipeline', description: 'Seguimiento estructurado por etapas', accent: 'blue' },
  { number: '03', icon: ListChecks, title: 'Se automatizan tareas y recordatorios', description: 'Para el equipo comercial y operativo', accent: 'purple' },
  { number: '04', icon: ShieldCheck, title: 'Todo queda documentado y controlado', description: 'Historial, clientes, procesos y resultados', accent: 'emerald' },
];

const s: Record<string, { hoverBorder: string; bg: string; border: string; text: string }> = {
  orange:  { hoverBorder: 'hover:border-orange-500/40',  border: 'border-orange-500/20',  bg: 'bg-orange-500/10',  text: 'text-orange-400' },
  blue:    { hoverBorder: 'hover:border-blue-500/40',    border: 'border-blue-500/20',    bg: 'bg-blue-500/10',    text: 'text-blue-400' },
  purple:  { hoverBorder: 'hover:border-purple-500/40',  border: 'border-purple-500/20',  bg: 'bg-purple-500/10',  text: 'text-purple-400' },
  emerald: { hoverBorder: 'hover:border-emerald-500/40', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
};

export const IndustriaHowItWorks = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-orange-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-20">
          <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-4 border border-orange-500/20">Cómo Funciona</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Así funciona <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">Volkern en tu empresa</span></h2>
        </motion.div>
        <div className="max-w-5xl mx-auto">
          {steps.map((step, i) => { const Icon = step.icon; const st = s[step.accent];
            return (
              <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.7, delay: i * 0.2 }} className={`flex flex-col md:flex-row items-center gap-8 mb-12 last:mb-0 ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
                <div className={`flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-8 ${st.hoverBorder} transition-all duration-300 shadow-lg`}>
                  <div className="flex items-center gap-4 mb-4"><span className={`text-5xl font-black ${st.text} opacity-20`}>{step.number}</span><div className={`w-14 h-14 rounded-2xl ${st.bg} ${st.border} flex items-center justify-center border`}><Icon className={`w-7 h-7 ${st.text}`} /></div></div>
                  <h3 className="text-2xl font-bold text-white mb-2">{step.title}</h3><p className="text-lg text-slate-400">{step.description}</p>
                </div>
                {i < steps.length - 1 && (<div className="hidden md:flex flex-col items-center gap-2"><div className={`w-3 h-3 rounded-full ${st.bg} ${st.border} border`} /><div className="w-0.5 h-16 bg-gradient-to-b from-slate-700 to-slate-800" /><div className={`w-3 h-3 rounded-full ${st.bg} ${st.border} border`} /></div>)}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
