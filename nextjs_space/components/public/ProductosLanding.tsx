'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Zap, Home, GraduationCap, Calculator,
  UserCheck, Factory, PenTool, Receipt,
  Building2, Users, TrendingUp, ShieldCheck, Sparkles,
} from 'lucide-react';

/* ─── Verticales ──────────────────────────────────────────────────────────── */

const VERTICALS = [
  {
    id: 'crm_ventas',
    slug: 'crm-ventas',
    title: 'CRM Ventas',
    subtitle: 'Pipeline, leads y cierres',
    description: 'Convierte más oportunidades en ventas con un proceso comercial estructurado.',
    target: 'Equipos comerciales B2B y pymes',
    icon: TrendingUp,
    price: '49',
    borderClass: 'border-cyan-500/30 hover:border-cyan-400',
    bgGlow: 'bg-cyan-600/10',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20',
    iconColor: 'text-cyan-400',
    buttonBg: 'bg-cyan-600 hover:bg-cyan-500',
    buttonShadow: 'shadow-cyan-600/30',
  },
  {
    id: 'agencia_marketing',
    slug: 'marketing',
    title: 'Agencia Marketing',
    subtitle: 'Campañas, leads y conversión',
    description: 'Lanza, automatiza y mide campañas sin cambiar de herramienta.',
    target: 'Agencias y equipos de marketing',
    icon: PenTool,
    price: '49',
    borderClass: 'border-purple-500/30 hover:border-purple-400',
    bgGlow: 'bg-purple-600/10',
    iconBg: 'bg-purple-500/10 border-purple-500/20',
    iconColor: 'text-purple-400',
    buttonBg: 'bg-purple-600 hover:bg-purple-500',
    buttonShadow: 'shadow-purple-600/30',
  },
  {
    id: 'academia',
    slug: 'academy',
    title: 'Academia',
    subtitle: 'Cursos, pagos y alumnos',
    description: 'Crea, vende y automatiza tu academia desde un solo sistema.',
    target: 'Creadores de cursos y escuelas',
    icon: GraduationCap,
    price: '49',
    borderClass: 'border-amber-500/30 hover:border-amber-400',
    bgGlow: 'bg-amber-600/10',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconColor: 'text-amber-400',
    buttonBg: 'bg-amber-600 hover:bg-amber-500',
    buttonShadow: 'shadow-amber-600/30',
  },
  {
    id: 'asesoria_contable',
    slug: 'accounting',
    title: 'Asesoría Contable',
    subtitle: 'Clientes, documentos y compliance',
    description: 'Centraliza tu despacho con trazabilidad total y control documental.',
    target: 'Despachos contables y asesorías',
    icon: Calculator,
    price: '59',
    borderClass: 'border-blue-500/30 hover:border-blue-400',
    bgGlow: 'bg-blue-600/10',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    iconColor: 'text-blue-400',
    buttonBg: 'bg-blue-600 hover:bg-blue-500',
    buttonShadow: 'shadow-blue-600/30',
  },
  {
    id: 'rrhh',
    slug: 'rrhh',
    title: 'RRHH',
    subtitle: 'Empleados, procesos y control',
    description: 'Gestiona tu equipo, documentos y procesos internos con orden.',
    target: 'Empresas con 10-200 empleados',
    icon: UserCheck,
    price: '39',
    borderClass: 'border-rose-500/30 hover:border-rose-400',
    bgGlow: 'bg-rose-600/10',
    iconBg: 'bg-rose-500/10 border-rose-500/20',
    iconColor: 'text-rose-400',
    buttonBg: 'bg-rose-600 hover:bg-rose-500',
    buttonShadow: 'shadow-rose-600/30',
  },
  {
    id: 'inmobiliaria',
    slug: 'real-estate',
    title: 'Inmobiliaria',
    subtitle: 'Propiedades, leads y cierres',
    description: 'Centraliza leads, propiedades y seguimiento para vender más.',
    target: 'Inmobiliarias y agentes',
    icon: Home,
    price: '59',
    borderClass: 'border-emerald-500/30 hover:border-emerald-400',
    bgGlow: 'bg-emerald-600/10',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconColor: 'text-emerald-400',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-500',
    buttonShadow: 'shadow-emerald-600/30',
  },
  {
    id: 'industria',
    slug: 'industria',
    title: 'Industria',
    subtitle: 'Procesos, tareas y trazabilidad',
    description: 'Controla tu operación industrial con procesos documentados.',
    target: 'Plantas, logística y manufactura',
    icon: Factory,
    price: '59',
    borderClass: 'border-orange-500/30 hover:border-orange-400',
    bgGlow: 'bg-orange-600/10',
    iconBg: 'bg-orange-500/10 border-orange-500/20',
    iconColor: 'text-orange-400',
    buttonBg: 'bg-orange-600 hover:bg-orange-500',
    buttonShadow: 'shadow-orange-600/30',
  },
  {
    id: 'facturacion',
    slug: 'facturacion',
    title: 'Facturación',
    subtitle: 'Facturas, cobros e IVA',
    description: 'Crea facturas en segundos y controla tus cobros sin complicaciones.',
    target: 'Autónomos y pequeños comercios',
    icon: Receipt,
    price: '19',
    borderClass: 'border-green-500/30 hover:border-green-400',
    bgGlow: 'bg-green-600/10',
    iconBg: 'bg-green-500/10 border-green-500/20',
    iconColor: 'text-green-400',
    buttonBg: 'bg-green-600 hover:bg-green-500',
    buttonShadow: 'shadow-green-600/30',
  },
];

/* ─── Section Wrappers ────────────────────────────────────────────────────── */

const Section = ({ id, className, children, dark }: { id?: string; className?: string; children: React.ReactNode; dark?: boolean }) => (
  <section id={id} className={`py-20 md:py-28 ${dark ? 'bg-slate-950' : 'bg-slate-900/50'} ${className ?? ''}`}>
    <div className="container mx-auto px-6">{children}</div>
  </section>
);

const FadeIn = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.6, delay, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function ProductosLanding() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[70vh] flex items-center justify-center pt-24 pb-10 overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/30 via-slate-950 to-slate-950" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/10 blur-[140px] rounded-full pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              <Sparkles className="w-4 h-4" />
              8 productos. Un solo sistema.
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Elige tu{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                producto
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-4 leading-relaxed">
              Cada producto es independiente y está listo para usar. Empieza con el que necesitas hoy y escala cuando quieras.
            </p>
            <p className="text-lg text-slate-500 max-w-xl mx-auto mb-10">
              Mismo login. Mismos datos. Sin fricción entre productos.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ═══ PRODUCT GRID ═══ */}
      <Section dark>
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {VERTICALS.map((v, i) => {
              const Icon = v.icon;
              return (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                  className={`group relative flex flex-col p-6 bg-slate-900/50 border rounded-2xl transition-all duration-300 ${v.borderClass} hover:-translate-y-1 hover:shadow-xl`}
                >
                  {/* Hover glow */}
                  <div className={`absolute inset-0 rounded-2xl ${v.bgGlow} opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none`} />

                  <div className="relative z-10 flex flex-col flex-1">
                    {/* Icon + badge */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl ${v.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className={`w-6 h-6 ${v.iconColor}`} />
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-800/50 px-2 py-1 rounded-md">
                        14 días gratis
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-white mb-1">{v.title}</h3>
                    <p className="text-sm text-slate-400 mb-3">{v.subtitle}</p>

                    {/* Description */}
                    <p className="text-sm text-slate-500 leading-relaxed mb-4 flex-1">{v.description}</p>

                    {/* Target */}
                    <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
                      <Building2 className="w-3.5 h-3.5 text-slate-600" />
                      <span>{v.target}</span>
                    </div>

                    {/* Price */}
                    <div className="mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-white">€{v.price}</span>
                        <span className="text-sm text-slate-500">/mes</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-0.5">Sin permanencia</p>
                    </div>

                    {/* CTAs */}
                    <div className="space-y-2">
                      <Link href={`/signup?vertical=${v.id}`}>
                        <Button
                          size="sm"
                          className={`w-full ${v.buttonBg} text-white py-5 text-sm rounded-xl font-bold ${v.buttonShadow} group/btn`}
                        >
                          Probar 14 días gratis
                          <ArrowRight className="ml-1.5 w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                      <Link href={`/soluciones/${v.slug}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 py-4 text-xs rounded-xl"
                        >
                          Ver producto
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ═══ INTEGRATION NOTE ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <Zap className="w-10 h-10 text-blue-400 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-white mb-4">
                Todos los productos comparten el mismo motor
              </h3>
              <p className="text-lg text-slate-300 leading-relaxed max-w-lg mx-auto mb-6">
                Empieza con un producto y añade más cuando crezcas. Tus datos, tu equipo y tu configuración viajan contigo.
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-sm text-slate-400">
                {['Mismo login', 'Mismos datos', 'Mismos contactos', 'Escalado instantáneo'].map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CTA FINAL ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-indigo-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Users className="w-12 h-12 text-blue-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                ¿No sabes cuál elegir?
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto">
                Prueba el que más se acerque a tu negocio. Todos incluyen 14 días gratis. Sin tarjeta. Sin compromiso.
              </p>
              <Link href="/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Empezar con Volkern
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ FOOTER PHRASE ═══ */}
      <div className="py-10 bg-slate-950 border-t border-slate-900">
        <div className="container mx-auto px-6 text-center">
          <p className="text-xl text-slate-400 font-medium">
            8 productos.{' '}
            <span className="text-slate-300">Un solo sistema para tu negocio.</span>
          </p>
        </div>
      </div>
    </>
  );
}
