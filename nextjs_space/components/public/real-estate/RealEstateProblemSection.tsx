'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, Thermometer, Database } from 'lucide-react';

const problems = [
  {
    icon: AlertTriangle,
    title: 'Leads que preguntan por propiedades',
    description: 'y nunca reciben respuesta',
  },
  {
    icon: Clock,
    title: 'Seguimiento manual',
    description: 'que se queda a medias',
  },
  {
    icon: Thermometer,
    title: 'Clientes interesados',
    description: 'que se enfrían',
  },
  {
    icon: Database,
    title: 'Información de propiedades',
    description: 'y clientes desorganizada',
  },
];

export const RealEstateProblemSection = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-600/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-4 border border-red-500/20">
            El Problema
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Estás perdiendo ventas todos los días…
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">
              y no lo sabes
            </span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {problems.map((problem, index) => {
            const Icon = problem.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="group relative bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center hover:border-red-500/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-red-500/20 transition-colors">
                  <Icon className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">{problem.title}</h3>
                <p className="text-slate-400 text-sm">{problem.description}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center mt-12"
        >
          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-6 py-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-300 font-medium">
              👉 En inmobiliaria, el primero que responde… gana.
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
