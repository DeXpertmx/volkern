'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Building2, Calculator, PenTool, GraduationCap, Factory,
  ArrowRight, Home, Landmark, Sparkles, Globe, Users,
  ShieldCheck, BarChart3, UserCheck, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const verticals = [
  {
    id: 'crm-ventas',
    title: 'CRM Ventas',
    subtitle: 'Pipeline que convierte',
    description: 'Pipeline Kanban visual, cotizaciones inteligentes, automatización de tareas comerciales, forecasting con IA y omnicanal nativo (WhatsApp, email, llamadas).',
    href: '/soluciones/crm-ventas',
    accent: 'cyan',
    portada: '/ventas-portada.png',
    icon: Zap,
    features: [
      'Pipeline Kanban con drag & drop',
      'Cotizaciones profesionales con plantillas',
      'Seguimiento 360° de clientes',
      'Automatización de tareas comerciales',
      'Forecasting y pronósticos con IA',
      'Omnicanal nativo: WhatsApp, email, llamadas',
    ],
  },
  {
    id: 'marketing',
    title: 'Agencias de Marketing',
    subtitle: 'Automatización multicanal',
    description: 'Landing pages, email marketing, WhatsApp nativo, CRM con pipeline y automatizaciones. Todo potenciado con IA propia.',
    href: '/soluciones/marketing',
    accent: 'purple',
    portada: '/marketing-portada.png',
    icon: PenTool,
    features: [
      'Creador visual de landing pages (drag & drop)',
      'WhatsApp Business nativo con broadcast',
      'Email marketing transaccional (AWS SES)',
      'Automatización de campañas multicanal',
      'CRM con pipeline Kanban y scoring',
      'Chatbot con IA entrenada en tu negocio',
    ],
  },
  {
    id: 'academy',
    title: 'Academias (LMS)',
    subtitle: 'Educación que escala',
    description: 'Crea y vende cursos online, gestiona estudiantes, emite certificaciones y automatiza tu academia. White label con dominio propio.',
    href: '/soluciones/academy',
    accent: 'amber',
    portada: '/academia-portada.png',
    icon: GraduationCap,
    features: [
      'Creador de cursos multimedia',
      'Certificaciones digitales con QR',
      'Venta de cursos con Stripe integrado',
      'Portal estudiante white label',
      'Tutor IA 24/7 para estudiantes',
      'Analíticas de progreso y retención',
    ],
  },
  {
    id: 'accounting',
    title: 'Asesorías Contables',
    subtitle: 'Digitaliza y escala tu gestoría',
    description: 'Gestiona clientes de toda España desde una sola plataforma. CRM fiscal, automatización de modelos AEAT, portal del cliente 24/7 y un modelo de franquicia digital para escalar sin abrir oficinas.',
    href: '/soluciones/accounting',
    accent: 'blue',
    portada: '/fiscal-portada.png',
    icon: Calculator,
    features: [
      'CRM fiscal multi-cliente con expedientes',
      'Modelos 303, 111, 130, 347, 349, 390 automáticos',
      'Portal del cliente 24/7 con alertas',
      'Calendario de plazos AEAT inteligente',
      'Asistente IA para tu despacho',
      'Modelo de franquicia digital',
    ],
  },
  {
    id: 'rrhh',
    title: 'Recursos Humanos',
    subtitle: 'Capital humano inteligente',
    description: 'Gestiona personal, nóminas, asistencia, expedientes y reclutamiento. Portal del empleado 24/7, payroll sealing y automatización de procesos de RRHH con IA.',
    href: '/soluciones/rrhh',
    accent: 'rose',
    portada: '/rrhh-portada.png',
    icon: UserCheck,
    features: [
      'Gestión de personal con expedientes digitales',
      'Nóminas y payroll con trazabilidad blockchain',
      'Control de asistencia y vacaciones',
      'Reclutamiento y onboarding automatizado',
      'Evaluación de desempeño 360° con OKRs',
      'Portal del empleado 24/7',
    ],
  },
  {
    id: 'real-estate',
    title: 'Inmobiliarias',
    subtitle: 'El ERP inmobiliario más completo',
    description: 'Gestiona propiedades, franquicias, comisiones y captación. Portal público con filtros inteligentes, IA consultora y exportación a portales.',
    href: '/soluciones/real-estate',
    accent: 'emerald',
    portada: '/real-esatate-portada.png',
    icon: Building2,
    features: [
      'Catálogo extensible con campos por tipo de inmueble',
      'Portal público embebible con SEO optimizado',
      'Franquicias multi-agencia con jerarquía',
      'Cálculo automático de comisiones (splits)',
      'IA consultora en lenguaje natural',
      'Exportación a Idealista y Fotocasa',
    ],
  },
  {
    id: 'industria',
    title: 'Industria y Manufactura',
    subtitle: 'El ERP industrial completo',
    description: 'Producción, proyectos, inventario, calidad y contratos. Controla tu cadena de suministro con trazabilidad criptográfica e IA operacional.',
    href: '/soluciones/industria',
    accent: 'orange',
    portada: '/produccion-portada.png',
    icon: Factory,
    features: [
      'Órdenes de producción y planificación MRP',
      'Control de calidad con trazabilidad blockchain',
      'Inventario multi-almacén con lotes',
      'Gestión de proyectos industriales',
      'Contratos de suministro con firma digital',
      'Mantenimiento de activos programado',
    ],
  },
];

const accentColorMap: Record<string, string> = {
  emerald: '#059669',
  blue: '#2563eb',
  purple: '#7c3aed',
  amber: '#d97706',
  orange: '#ea580c',
  rose: '#F43F5E',
  cyan: '#20B9E8',
};

const accentTextMap: Record<string, string> = {
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  amber: 'text-amber-400',
  orange: 'text-orange-400',
  rose: 'text-[#F43F5E]',
  cyan: 'text-[#20B9E8]',
};

const accentBgMap: Record<string, string> = {
  emerald: 'bg-emerald-500/10 border-emerald-500/20',
  blue: 'bg-blue-500/10 border-blue-500/20',
  purple: 'bg-purple-500/10 border-purple-500/20',
  amber: 'bg-amber-500/10 border-amber-500/20',
  orange: 'bg-orange-500/10 border-orange-500/20',
  rose: 'bg-[#F43F5E]/10 border-[#F43F5E]/20',
  cyan: 'bg-[#20B9E8]/10 border-[#20B9E8]/20',
};

export const VerticalShowcase = () => {
  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      {/* Background gradient decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 pointer-events-none" />
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-4 border border-blue-500/20">
            7 Soluciones en 1 Plataforma
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            El Sistema Operativo{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
              para tu Industria
            </span>
          </h2>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
            No importa si gestionas propiedades, llevas la contabilidad, diriges una planta de producción, 
            ejecutas campañas de marketing o administras una academia. Volkern se adapta a tu 
            industria con módulos especializados que comparten una base de datos única.
          </p>
        </motion.div>

        <div className="space-y-20">
          {verticals.map((vertical, index) => {
            const Icon = vertical.icon;
            const isReversed = index % 2 === 1;

            return (
              <motion.div
                key={vertical.id}
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.7, delay: index * 0.15 }}
                id={vertical.id}
              >
                <div className={`flex flex-col ${isReversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12 lg:gap-16`}>
                  
                  {/* ─── Features List ─── */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-xl ${accentBgMap[vertical.accent]} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${accentTextMap[vertical.accent]}`} />
                      </div>
                      <span className={`text-sm font-bold uppercase tracking-widest ${accentTextMap[vertical.accent]}`}>
                        {vertical.subtitle}
                      </span>
                    </div>

                    <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                      {vertical.title}
                    </h3>

                    <p className="text-lg text-slate-400 mb-8 leading-relaxed">
                      {vertical.description}
                    </p>

                    <div className="grid sm:grid-cols-2 gap-3 mb-8">
                      {vertical.features.map((feature, fi) => (
                        <div key={fi} className="flex items-start gap-3">
                          <ShieldCheck className={`w-5 h-5 mt-0.5 flex-shrink-0 ${accentTextMap[vertical.accent]}`} />
                          <span className="text-sm text-slate-300">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <Link href={vertical.href}>
                      <Button
                        size="lg"
                        className="text-white px-8 py-6 text-base rounded-xl font-bold group shadow-lg"
                        style={{ backgroundColor: accentColorMap[vertical.accent] }}
                      >
                        Explorar {vertical.title}
                        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>

                  {/* ─── Visual Card (portada image or mock) ─── */}
                  <div className="flex-1 w-full max-w-lg">
                    <div className="relative">
                      {/* Glow */}
                      <div
                        className="absolute -inset-4 rounded-3xl blur-2xl opacity-20"
                        style={{ backgroundColor: accentColorMap[vertical.accent] }}
                      />
                      
                      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-2 overflow-hidden">
                        {vertical.portada ? (
                          <div className="aspect-[4/3] rounded-lg overflow-hidden">
                            <img
                              src={vertical.portada}
                              alt={`${vertical.title} - Dashboard`}
                              className="w-full h-full object-cover object-top rounded-lg"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="p-6">
                            {/* Decorative gradient */}
                            <div
                              className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10"
                              style={{ backgroundColor: accentColorMap[vertical.accent] }}
                            />
                            
                            <div className="relative">
                              <div className="flex items-center justify-between mb-6">
                                <div className={`w-14 h-14 rounded-2xl ${accentBgMap[vertical.accent]} flex items-center justify-center`}>
                                  <Icon className={`w-7 h-7 ${accentTextMap[vertical.accent]}`} />
                                </div>
                                <div className="flex gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-red-500/50" />
                                  <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                                  <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                </div>
                              </div>

                              {/* Mock content */}
                              <div className="space-y-4">
                                <div className="h-4 bg-slate-800 rounded-full w-3/4" />
                                <div className="h-4 bg-slate-800 rounded-full w-1/2" />
                                <div className="grid grid-cols-3 gap-3 mt-6">
                                  <div className="h-20 bg-slate-800 rounded-xl" />
                                  <div className="h-20 bg-slate-800 rounded-xl" />
                                  <div className="h-20 bg-slate-800 rounded-xl" />
                                </div>
                                <div className="h-3 bg-slate-800 rounded-full w-1/3 mt-2" />
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="h-12 bg-slate-800 rounded-lg" />
                                  <div className="h-12 bg-slate-800 rounded-lg" />
                                </div>
                              </div>

                              {/* Stats bar */}
                              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: accentColorMap[vertical.accent] }} />
                                  <span className="text-xs text-slate-500">Live</span>
                                </div>
                                <div className="flex gap-4">
                                  <Globe className="w-4 h-4 text-slate-600" />
                                  <BarChart3 className="w-4 h-4 text-slate-600" />
                                  <Users className="w-4 h-4 text-slate-600" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mt-20"
        >
          <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-purple-900/40 border border-slate-800 rounded-3xl p-12 max-w-4xl mx-auto">
            <Sparkles className="w-10 h-10 text-blue-400 mx-auto mb-4" />
            <h3 className="text-3xl font-bold text-white mb-4">
              ¿No encuentras tu industria?
            </h3>
            <p className="text-slate-400 mb-8 max-w-2xl mx-auto">
              Volkern es modular y extensible. Contáctanos para explorar cómo podemos 
              adaptar la plataforma a las necesidades específicas de tu negocio.
            </p>
            <a href="/#demo">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-6 text-lg rounded-xl font-bold shadow-xl">
                Solicitar Demo Personalizada
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
