'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Building2, BarChart3, ClipboardCheck, Users, TrendingUp, Target } from 'lucide-react';

const useCases = [
  { icon: Building2, title: 'Gestión de clientes empresariales', desc: 'CRM B2B con pipeline de ventas complejas' },
  { icon: BarChart3, title: 'Seguimiento de ventas B2B', desc: 'Pipeline estructurado por etapas con forecasting' },
  { icon: ClipboardCheck, title: 'Control de procesos internos', desc: 'Flujos de trabajo, aprobaciones y auditoría' },
  { icon: Users, title: 'Coordinación entre equipos', desc: 'Comercial, operaciones y dirección conectados' },
  { icon: Target, title: 'Optimización de operación', desc: 'KPIs, dashboards y mejora continua' },
  { icon: TrendingUp, title: 'Toma de decisiones basada en datos', desc: 'Reportes ejecutivos en tiempo real' },
];

export const IndustriaUseCases = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-orange-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-sm font-medium mb-4 border border-orange-500/20">Casos de Uso</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Aplicaciones reales <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">en industria</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {useCases.map((uc, i) => { const Icon = uc.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} whileHover={{ y: -4 }} className="group bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-orange-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4 group-hover:bg-orange-500/20 transition-colors"><Icon className="w-6 h-6 text-orange-400" /></div>
                <h3 className="text-white font-bold text-lg mb-2">{uc.title}</h3><p className="text-sm text-slate-400 leading-relaxed">{uc.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
