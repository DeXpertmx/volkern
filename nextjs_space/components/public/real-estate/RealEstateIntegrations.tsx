'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Globe, FileText, Link2, Smartphone, Mail } from 'lucide-react';

const integrations = [
  { icon: MessageCircle, name: 'WhatsApp Business', desc: 'Respuesta automática' },
  { icon: Globe, name: 'Portales Inmobiliarios', desc: 'Idealista, Fotocasa, +80' },
  { icon: FileText, name: 'Formularios Web', desc: 'Captación automatizada' },
  { icon: Smartphone, name: 'Redes Sociales', desc: 'Facebook, Instagram' },
  { icon: Mail, name: 'Email Marketing', desc: 'Campañas automatizadas' },
  { icon: Link2, name: 'Webhooks / API', desc: 'Conecta tus herramientas' },
];

export const RealEstateIntegrations = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-600/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-4 border border-emerald-500/20">
            Integraciones Clave
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Conectado con{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
              todas tus herramientas
            </span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Volkern se integra nativamente con las plataformas que ya usas en tu día a día inmobiliario.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {integrations.map((integration, index) => {
            const Icon = integration.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                whileHover={{ y: -4 }}
                className="group bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex items-center gap-4 hover:border-emerald-500/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                  <Icon className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">{integration.name}</h3>
                  <p className="text-sm text-slate-400">{integration.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
