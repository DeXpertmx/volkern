'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Globe } from 'lucide-react';

interface Portal {
  name: string;
  url: string;
  country: string;
  color: string;
}

interface CountryGroup {
  country: string;
  flag: string;
  portals: Portal[];
}

const portalGroups: CountryGroup[] = [
  {
    country: 'España',
    flag: '🇪🇸',
    portals: [
      { name: 'Idealista', url: 'https://www.idealista.com', country: 'ES', color: '#e74c3c' },
      { name: 'Fotocasa', url: 'https://www.fotocasa.es', country: 'ES', color: '#0066cc' },
      { name: 'Habitaclia', url: 'https://www.habitaclia.com', country: 'ES', color: '#00a86b' },
      { name: 'Pisos.com', url: 'https://www.pisos.com', country: 'ES', color: '#ff6600' },
      { name: 'Yaencontre', url: 'https://www.yaencontre.com', country: 'ES', color: '#9b59b6' },
      { name: 'Kyero', url: 'https://www.kyero.com', country: 'ES', color: '#2c3e50' },
      { name: 'Housell', url: 'https://www.housell.com', country: 'ES', color: '#1abc9c' },
      { name: 'Inmobiliaria.net', url: 'https://www.inmobiliaria.net', country: 'ES', color: '#3498db' },
      { name: 'Milanuncios', url: 'https://www.milanuncios.com', country: 'ES', color: '#e67e22' },
      { name: 'Trovimap', url: 'https://www.trovimap.com', country: 'ES', color: '#e91e63' },
    ],
  },
  {
    country: 'Internacional',
    flag: '🌍',
    portals: [
      { name: 'RE/MAX', url: '#', country: 'INT', color: '#c0392b' },
      { name: 'Century 21', url: '#', country: 'INT', color: '#2980b9' },
      { name: 'Coldwell Banker', url: '#', country: 'INT', color: '#8e44ad' },
      { name: 'Engel & Völkers', url: '#', country: 'INT', color: '#d4af37' },
      { name: 'Sotheby\'s', url: '#', country: 'INT', color: '#7f8c8d' },
      { name: 'LuxuryEstate', url: '#', country: 'INT', color: '#2c3e50' },
      { name: 'JamesEdition', url: '#', country: 'INT', color: '#1a1a2e' },
      { name: 'Rightmove (UK)', url: '#', country: 'INT', color: '#e74c3c' },
      { name: 'Zillow (USA)', url: '#', country: 'INT', color: '#0078d4' },
      { name: 'Realtor.com (USA)', url: '#', country: 'INT', color: '#d42020' },
    ],
  },
];

function PortalBadge({ portal, index }: { portal: Portal; index: number }) {
  return (
    <motion.a
      href={portal.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      whileHover={{ y: -4, scale: 1.05 }}
      className="group flex items-center gap-3 px-5 py-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-600 transition-all duration-300"
      style={{
        borderLeftColor: portal.color,
        borderLeftWidth: 3,
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black uppercase shrink-0"
        style={{ backgroundColor: `${portal.color}20`, color: portal.color }}
      >
        {portal.name.substring(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">
          {portal.name}
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
          {portal.country === 'ES' ? 'España' : portal.country === 'INT' ? 'Global' : portal.country}
        </p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 ml-auto shrink-0 transition-colors" />
    </motion.a>
  );
}

export function PortalLogosSection() {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-emerald-950/10 to-slate-950 pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-4 border border-emerald-500/20">
            Exportación Directa a Portales
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Publica en{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">
              +80 Portales Inmobiliarios
            </span>
          </h2>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Desde <strong className="text-white">Volkern</strong> exportas tus propiedades directamente a los principales portales 
            de España, Europa y América en los formatos que ellos requieren. 
            Una sola plataforma, <strong className="text-emerald-400">múltiples canales de venta</strong>.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-8 mt-10">
            {[
              { label: 'Portales España', value: '10+' },
              { label: 'Portales Internacionales', value: '70+' },
              { label: 'Países', value: '15+' },
              { label: 'Formatos', value: 'XML / JSON / CSV' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                className="text-center px-6 py-4 rounded-2xl bg-slate-900/50 border border-slate-800 min-w-[140px]"
              >
                <p className="text-2xl font-black text-emerald-400">{stat.value}</p>
                <p className="text-xs text-slate-500 uppercase tracking-wider mt-1 font-medium">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Portal Groups */}
        <div className="space-y-16">
          {portalGroups.map((group) => (
            <div key={group.country}>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="flex items-center gap-3 mb-6"
              >
                <span className="text-2xl">{group.flag}</span>
                <h3 className="text-xl font-bold text-white">{group.country}</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent" />
              </motion.div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {group.portals.map((portal, index) => (
                  <PortalBadge key={portal.name} portal={portal} index={index} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom callout */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-emerald-900/20 via-slate-900 to-teal-900/20 border border-emerald-800/30 text-center max-w-3xl mx-auto"
        >
          <Globe className="w-8 h-8 text-emerald-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-3">
            ¿Tienes un portal específico?
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Volkern puede generar feeds en cualquier formato que tu portal requiera. 
            Si tu portal no está en la lista, podemos integrarlo 
            mediante XML, JSON, CSV o API REST personalizada.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {['XML Feed', 'JSON Feed', 'API REST', 'Webhooks', 'Sincronización Programada'].map((tag) => (
              <span
                key={tag}
                className="px-3 py-1.5 rounded-full bg-slate-800 text-xs font-medium text-slate-300 border border-slate-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
