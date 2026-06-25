'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Zap, Home, GraduationCap, Calculator,
  UserCheck, Factory, PenTool, Receipt, TrendingUp,
  Check, Sparkles, HelpCircle, ChevronDown, ShieldCheck,
  Users,
} from 'lucide-react';
import { PublicLayout } from '@/components/public/PublicLayout';

/* ─── Vertical definitions ─────────────────────────────────────────────── */

const VERTICALS = [
  {
    id: 'crm_ventas',
    slug: 'crm-ventas',
    title: 'CRM & Ventas',
    subtitle: 'Pipeline, leads y cierres',
    icon: TrendingUp,
    price: '49',
    target: 'Equipos comerciales B2B',
    color: 'cyan',
    modules: ['CRM de ventas', 'Pipeline personalizable', 'Automatización de seguimiento', 'Email integrado', 'Telefonía', 'Dashboard de ventas', 'Reportes y analítica', 'Scoring de leads', 'Pronósticos'],
  },
  {
    id: 'agencia_marketing',
    slug: 'marketing',
    title: 'Agencia Marketing',
    subtitle: 'Campañas, leads y conversión',
    icon: PenTool,
    price: '49',
    target: 'Agencias y equipos de growth',
    color: 'purple',
    modules: ['Campañas multicanal', 'Email marketing', 'Constructor web', 'Hub social', 'Formularios inteligentes', 'Chatbot IA', 'Automatización', 'CRM integrado'],
  },
  {
    id: 'academia',
    slug: 'academy',
    title: 'Academia',
    subtitle: 'Cursos, pagos y alumnos',
    icon: GraduationCap,
    price: '49',
    target: 'Creadores de cursos y escuelas',
    color: 'yellow',
    modules: ['LMS con cursos', 'Gestión de estudiantes', 'Cuestionarios', 'Comunidad', 'Pagos integrados', 'Email marketing', 'Landing pages', 'Automatización'],
  },
  {
    id: 'asesoria_contable',
    slug: 'accounting',
    title: 'Asesoría Contable',
    subtitle: 'Clientes, documentos y compliance',
    icon: Calculator,
    price: '59',
    target: 'Despachos y asesorías fiscales',
    color: 'blue',
    modules: ['Gestión de clientes', 'Documentos y contratos', 'Conciliación bancaria', 'Impuestos AEAT', 'Calendario fiscal', 'Firma digital', 'CRM integrado', 'Chatbot IA'],
  },
  {
    id: 'rrhh',
    slug: 'rrhh',
    title: 'Recursos Humanos',
    subtitle: 'Empleados, procesos y control',
    icon: UserCheck,
    price: '39',
    target: 'Empresas con 10-200 empleados',
    color: 'rose',
    modules: ['Gestión de plantilla', 'Nóminas (Vault)', 'Vacaciones y ausencias', 'Documentos y contratos', 'Firma digital', 'Cursos', 'Chatbot IA', 'Formularios'],
  },
  {
    id: 'inmobiliaria',
    slug: 'real-estate',
    title: 'Inmobiliaria',
    subtitle: 'Propiedades, leads y cierres',
    icon: Home,
    price: '59',
    target: 'Inmobiliarias y agentes',
    color: 'emerald',
    modules: ['Gestión de propiedades', 'CRM inmobiliario', 'Pipeline de ventas', 'Automatización', 'Landing pages', 'Email marketing', 'Firma digital', 'Chatbot IA'],
  },
  {
    id: 'industria',
    slug: 'industria',
    title: 'Industria',
    subtitle: 'Procesos, tareas y trazabilidad',
    icon: Factory,
    price: '59',
    target: 'Plantas, logística y manufactura',
    color: 'orange',
    modules: ['Producción y BoM', 'Control de calidad', 'Inventario', 'Proyectos', 'Activos', 'Logística', 'Finanzas', 'Chatbot IA'],
  },
  {
    id: 'facturacion',
    slug: 'facturacion',
    title: 'Facturación',
    subtitle: 'Facturas, cobros e IVA',
    icon: Receipt,
    price: '19',
    target: 'Autónomos y pequeños comercios',
    color: 'green',
    modules: ['Facturación electrónica', 'Control de cobros', 'Catálogo de productos', 'Envío a AEAT', 'Cotizaciones', 'CRM básico', 'Mensajes', 'Citas'],
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; btn: string; btnShadow: string; bgGlow: string; iconBg: string; iconText: string }> = {
  cyan:     { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30 hover:border-cyan-400',    text: 'text-cyan-400',    btn: 'bg-cyan-600 hover:bg-cyan-500',       btnShadow: 'shadow-cyan-600/30',    bgGlow: 'bg-cyan-600/10',    iconBg: 'bg-cyan-500/10 border-cyan-500/20',    iconText: 'text-cyan-400' },
  purple:   { bg: 'bg-purple-500/10',  border: 'border-purple-500/30 hover:border-purple-400', text: 'text-purple-400',  btn: 'bg-purple-600 hover:bg-purple-500',   btnShadow: 'shadow-purple-600/30',  bgGlow: 'bg-purple-600/10',  iconBg: 'bg-purple-500/10 border-purple-500/20',  iconText: 'text-purple-400' },
  yellow:   { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30 hover:border-yellow-400', text: 'text-yellow-400',  btn: 'bg-yellow-600 hover:bg-yellow-500',   btnShadow: 'shadow-yellow-600/30',  bgGlow: 'bg-yellow-600/10',  iconBg: 'bg-yellow-500/10 border-yellow-500/20',  iconText: 'text-yellow-400' },
  blue:     { bg: 'bg-blue-500/10',    border: 'border-blue-500/30 hover:border-blue-400',    text: 'text-blue-400',    btn: 'bg-blue-600 hover:bg-blue-500',       btnShadow: 'shadow-blue-600/30',    bgGlow: 'bg-blue-600/10',    iconBg: 'bg-blue-500/10 border-blue-500/20',    iconText: 'text-blue-400' },
  rose:     { bg: 'bg-rose-500/10',    border: 'border-rose-500/30 hover:border-rose-400',    text: 'text-rose-400',    btn: 'bg-rose-600 hover:bg-rose-500',       btnShadow: 'shadow-rose-600/30',    bgGlow: 'bg-rose-600/10',    iconBg: 'bg-rose-500/10 border-rose-500/20',    iconText: 'text-rose-400' },
  emerald:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30 hover:border-emerald-400', text: 'text-emerald-400', btn: 'bg-emerald-600 hover:bg-emerald-500', btnShadow: 'shadow-emerald-600/30', bgGlow: 'bg-emerald-600/10', iconBg: 'bg-emerald-500/10 border-emerald-500/20', iconText: 'text-emerald-400' },
  orange:   { bg: 'bg-orange-500/10',  border: 'border-orange-500/30 hover:border-orange-400', text: 'text-orange-400',  btn: 'bg-orange-600 hover:bg-orange-500',   btnShadow: 'shadow-orange-600/30',  bgGlow: 'bg-orange-600/10',  iconBg: 'bg-orange-500/10 border-orange-500/20',  iconText: 'text-orange-400' },
  green:    { bg: 'bg-green-500/10',   border: 'border-green-500/30 hover:border-green-400',  text: 'text-green-400',   btn: 'bg-green-600 hover:bg-green-500',     btnShadow: 'shadow-green-600/30',   bgGlow: 'bg-green-600/10',   iconBg: 'bg-green-500/10 border-green-500/20',   iconText: 'text-green-400' },
};

/* ─── FAQ ────────────────────────────────────────────────────────────────── */

const FAQ_ITEMS = [
  { q: '¿Qué incluye cada vertical?', a: 'Cada vertical incluye todos los módulos listados en su tarjeta, más los módulos core: leads, contactos, pipeline, tareas, analytics, mensajes y citas.' },
  { q: '¿Puedo combinar verticales?', a: 'Sí. Todos los productos comparten el mismo motor. Empieza con uno y añade más desde Configuración > Módulos sin perder datos ni configuración.' },
  { q: '¿Hay permanencia?', a: 'No. Plans mensuales sin compromiso. Puedes cancelar en cualquier momento.' },
  { q: '¿Qué pasa si mi negocio crece?', a: 'Escalas añadiendo más verticales o subiendo de plan sin migrar. Tus datos viajan contigo.' },
  { q: '¿Hay plan gratuito?', a: 'No, pero todos los productos tienen 14 días de prueba gratis. Sin tarjeta. Sin compromiso.' },
];

/* ─── Componente ───────────────────────────────────────────────────────── */

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout>
      <div className="min-h-screen bg-slate-950">

        {/* ═══ HERO ═══ */}
        <section className="relative pt-28 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950" />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/8 blur-[130px] rounded-full pointer-events-none" />
          <div className="container mx-auto px-6 relative z-10 text-center">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
              <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
                <Zap className="w-4 h-4" />
                Desde €19/mes · 14 días gratis
              </span>
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight tracking-tight">
                Precios claros.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                  Sin sorpresas.
                </span>
              </h1>
              <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
                Cada vertical es independiente. Elige la que necesitas hoy. Todos los módulos incluidos en el precio.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ═══ PRICING GRID ═══ */}
        <section className="pb-20">
          <div className="container mx-auto px-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {VERTICALS.map((v, i) => {
                const Icon = v.icon;
                const c = COLOR_MAP[v.color];
                return (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className={`group relative flex flex-col p-6 bg-slate-900/40 border rounded-2xl transition-all duration-300 ${c.border} hover:-translate-y-1 hover:shadow-xl`}
                  >
                    {/* Hover glow */}
                    <div className={`absolute inset-0 rounded-2xl ${c.bgGlow} opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none`} />

                    <div className="relative z-10 flex flex-col flex-1">
                      {/* Icon + badge */}
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl ${c.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className={`w-6 h-6 ${c.iconText}`} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-800/50 px-2 py-1 rounded-md">
                          {v.target}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-xl font-bold text-white mb-0.5">{v.title}</h3>
                      <p className="text-sm text-slate-400 mb-4">{v.subtitle}</p>

                      {/* Price */}
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-white">€{v.price}</span>
                          <span className="text-sm text-slate-500">/mes</span>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-0.5">14 días gratis · Sin permanencia</p>
                      </div>

                      {/* Module list */}
                      <div className="space-y-2 mb-6 flex-1">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Incluye</p>
                        {v.modules.map((mod, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">{mod}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA */}
                      <Link href={`/auth/signup?vertical=${v.id}`}>
                        <Button
                          size="sm"
                          className={`w-full ${c.btn} text-white py-5 text-sm rounded-xl font-bold ${c.btnShadow} group/btn`}
                        >
                          Probar 14 días gratis
                          <ArrowRight className="ml-1.5 w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                      <Link href={`/soluciones/${v.slug}`} className="mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-slate-500 hover:text-white py-3 text-xs rounded-xl"
                        >
                          Ver detalle del producto
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ COMMON FEATURES ═══ */}
        <section className="py-16 border-t border-slate-900">
          <div className="container mx-auto px-6 max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Sparkles className="w-8 h-8 text-blue-400 mx-auto mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Todos los productos incluyen
              </h2>
              <p className="text-slate-400 mb-8">
                Independientemente de la vertical que elijas, siempre tienes:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: ShieldCheck, label: '14 días gratis' },
                  { icon: Users, label: 'Equipo ilimitado' },
                  { icon: Zap, label: 'Sin permanencia' },
                  { icon: ShieldCheck, label: 'Datos protegidos' },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-900/40 border border-slate-800">
                    <item.icon className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs text-slate-300 font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section className="py-16 border-t border-slate-900">
          <div className="container mx-auto px-6 max-w-2xl">
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-slate-800/50 text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 border border-slate-700">
                <HelpCircle className="w-3.5 h-3.5" />
                FAQ
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-white">Preguntas frecuentes</h2>
            </div>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <div key={i} className="rounded-2xl bg-slate-900/40 border border-slate-800 overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/30 transition-colors"
                    >
                      <span className="text-sm font-bold text-white pr-4">{item.q}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5">
                        <p className="text-sm text-slate-400 leading-relaxed">{item.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ CTA FINAL ═══ */}
        <section className="py-20 border-t border-slate-900">
          <div className="container mx-auto px-6 max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-purple-900/40 border border-slate-800 rounded-3xl p-12 md:p-16"
            >
              <Users className="w-12 h-12 text-blue-400 mx-auto mb-6" />
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                ¿No sabes cuál elegir?
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-md mx-auto leading-relaxed">
                Todos incluyen 14 días gratis. Sin tarjeta. Sin compromiso. Prueba el que más se acerque a tu negocio.
              </p>
              <Link href="/auth/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Empezar ahora
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ═══ FOOTER PHRASE ═══ */}
        <div className="py-10 bg-slate-950 border-t border-slate-900">
          <div className="container mx-auto px-6 text-center">
            <p className="text-lg text-slate-400 font-medium">
              8 verticales.{' '}
              <span className="text-slate-300">Un precio claro. 14 días gratis.</span>
            </p>
          </div>
        </div>

      </div>
    </PublicLayout>
  );
}
