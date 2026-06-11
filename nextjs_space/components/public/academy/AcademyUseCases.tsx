'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Building2, BookOpen, Mic } from 'lucide-react';

const useCases = [
  { icon: GraduationCap, title: 'Venta de cursos online', desc: 'Catálogo público con pasarela de pago' },
  { icon: Building2, title: 'Academias presenciales', desc: 'Gestión de alumnos, asistencias y pagos' },
  { icon: BookOpen, title: 'Programas de formación', desc: 'Cohortes, progreso y certificaciones' },
  { icon: Mic, title: 'Coaches y consultores', desc: 'Sesiones 1:1, contenido y comunidad' },
];

export const AcademyUseCases = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-amber-600/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-4 border border-amber-500/20">Casos de Uso</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Hecho para <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">negocios educativos</span></h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {useCases.map((uc, i) => { const Icon = uc.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }} whileHover={{ y: -4 }} className="group bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-amber-500/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-amber-500/20 transition-colors"><Icon className="w-6 h-6 text-amber-400" /></div>
                <h3 className="text-white font-bold text-lg mb-2">{uc.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{uc.desc}</p>
              </motion.div>
            );
          })}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center mt-12">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-6 py-3"><GraduationCap className="w-5 h-5 text-amber-400" /><span className="text-amber-300 font-medium">👉 Si vendes conocimiento, Volkern es para ti.</span></div>
        </motion.div>
      </div>
    </section>
  );
};
