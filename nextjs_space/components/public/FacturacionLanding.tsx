'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, Zap, TrendingUp, Clock, AlertTriangle,
  FileText, Layers, ShieldCheck, Receipt, FileSignature,
  Star, Quote, Store, Briefcase, Wrench,
} from 'lucide-react';

import { MONEDA_PLATAFORMA, formatearImporte } from '@/lib/moneda';
import { getVerticalPlanPrice } from '@/lib/vertical-plans';

/**
 * Precio mensual publicado de la vertical, en la divisa de la plataforma.
 *
 * Sale de `lib/vertical-plans.ts`, la misma fuente que usa el cobro: la portada
 * no puede anunciar un precio distinto del que se factura. Antes era un literal
 * `€NN/mes` repetido en cuatro sitios de la página.
 */
const PRECIO_MES = getVerticalPlanPrice('facturacion') ?? 0;
const PRECIO_MES_TEXTO = formatearImporte(PRECIO_MES, MONEDA_PLATAFORMA, 0);
const CON_VOLKERN = `${PRECIO_MES_TEXTO}/mes`;

const PAIN_POINTS = [
  { icon: Clock, text: 'Horas perdidas haciendo facturas' },
  { icon: AlertTriangle, text: 'Errores que cuestan dinero' },
  { icon: Layers, text: 'Clientes y cobros descontrolados' },
  { icon: TrendingUp, text: 'Falta de claridad en ingresos' },
];

const CAPABILITIES = [
  'Crear facturas en segundos',
  'Controlar cobros y pendientes',
  'Ver IVA e impuestos automáticamente',
  'Enviar facturas directamente al cliente',
  'Tener reportes claros de ingresos',
  'Todo integrado con tu CRM si algún día creces',
];

const FLOW_STEPS = [
  { number: '1', title: 'Seleccionas cliente y producto', description: 'Desde tu catálogo, en segundos', icon: Layers },
  { number: '2', title: 'Emitís la factura', description: 'IVA calculado, formato profesional, lista para enviar', icon: FileText },
  { number: '3', title: 'Controlas el cobro', description: 'Sabes quién pagó y quién no', icon: TrendingUp },
  { number: '4', title: 'Declaras sin estrés', description: 'Todo listo para tu gestor o la AEAT', icon: ShieldCheck },
];

const MODULES = [
  'Catálogo de productos/servicios',
  'Clientes y contactos',
  'Cotizaciones y presupuestos',
  'Factura electrónica',
  'Control de cobros',
  'IVA y retenciones automáticos',
  'Órdenes de venta',
  'Reportes de ingresos',
  'Firma digital',
];

const BENEFITS = [
  { icon: Zap, text: 'Facturas en 30 segundos' },
  { icon: ShieldCheck, text: 'Sin errores de cálculo' },
  { icon: TrendingUp, text: 'Control total de ingresos' },
  { icon: Clock, text: 'Ahorras horas cada mes' },
  { icon: Receipt, text: 'Todo listo para la AEAT' },
];

const USE_CASES = [
  { icon: Store, title: 'Autónomos y freelancers', desc: 'Factura a tus clientes sin depender de un gestor para cada factura. En 30 segundos tienes tu factura lista.' },
  { icon: Briefcase, title: 'Pequeños comercios', desc: 'Controla ventas, clientes y cobros desde un solo lugar. Sin Excels ni programas complicados.' },
  { icon: Wrench, title: 'Profesionales liberales', desc: 'Abogados, consultores, arquitectos — factura por proyecto y lleva el control de cada cliente.' },
];

const TESTIMONIALS = [
  { quote: 'De pasar 3 horas al mes facturando a hacerlo en 10 minutos. Volkern Factura cambió mi rutina por completo.', name: 'María López', role: 'Diseñadora freelance', avatar: 'ML' },
  { quote: `Antes usaba 3 herramientas. Ahora cliente, factura y cobro están en el mismo sitio. Por ${PRECIO_MES_TEXTO} al mes es un regalo.`, name: 'Carlos Ruiz', role: 'Tienda de informática', avatar: 'CR' },
  { quote: 'Mis clientes reciben la factura al instante y yo sé quién ha pagado y quién no. Sin perseguir a nadie.', name: 'Ana García', role: 'Consultora fiscal', avatar: 'AG' },
];

const COMPETITOR_TOOLS = [
  { name: 'Programa de facturación', price: 30 },
  { name: 'Excel / Google Sheets', price: 0 },
  { name: 'Gestoría (mes)', price: 80 },
];

const TOTAL_COMPETITOR = COMPETITOR_TOOLS.reduce((sum, t) => sum + t.price, 0);

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

export default function FacturacionLanding() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/80 to-slate-950/95" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-green-600/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-4 border border-green-500/20">
              <Receipt className="w-4 h-4" />
              Ideal para autónomos y pymes
            </span>
            <span className="block mb-6">
              <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
                ⚡ 14 días gratis · Sin tarjeta
              </span>
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Facturas en segundos,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                cobros bajo control
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-4 leading-relaxed">
              Crea facturas profesionales, controla cobros y ten tus impuestos listos.
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
              Desde <span className="text-white font-bold">{CON_VOLKERN}</span>. Sin complicaciones. Sin Excels. Sin perder horas.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup?vertical=facturacion">
                <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-green-600/30 group">
                  Probar 14 días gratis
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#flow">
                <Button variant="outline" size="lg" className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white px-10 py-7 text-lg rounded-xl">
                  Ver cómo funciona
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ PROBLEMA ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-6 border border-red-500/20">El problema</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Pasar horas facturando{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">no te hace ganar más</span>
            </h2>
            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {PAIN_POINTS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }}
                    className="flex items-center gap-4 p-5 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-red-500/20 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-red-400" />
                    </div>
                    <span className="text-slate-300 font-medium">{p.text}</span>
                  </motion.div>
                );
              })}
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-6 py-3">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-red-300 font-medium">Tu tiempo vale más que rehacer facturas.</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ SOLUCIÓN ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-6 border border-green-500/20">La solución</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Facturación simple{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">para profesionales</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">Con Volkern Factura puedes:</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAPABILITIES.map((cap, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-green-500/30 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 transition-colors">
                    <Check className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-slate-300 font-medium">{cap}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ FLUJO ═══ */}
      <Section id="flow">
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-6 border border-green-500/20">Cómo funciona</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Así facturas{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">con Volkern</span>
            </h2>
            <div className="relative">
              {FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="flex items-start gap-6 mb-10 last:mb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-green-400">{step.number}</span>
                      </div>
                      {i < FLOW_STEPS.length - 1 && <div className="w-0.5 h-10 bg-gradient-to-b from-green-500/30 to-slate-800 mt-2" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <h3 className="text-xl font-bold text-white mb-1">{step.title}</h3>
                      <p className="text-slate-400">{step.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ MÓDULOS ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-6 border border-green-500/20">Valor percibido</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Todo lo que <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">incluye Volkern Factura</span></h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((mod, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-green-500/20 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 transition-colors">
                    <Layers className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-slate-300">{mod}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ BENEFICIOS ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-6 border border-amber-500/20">Beneficios</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Diseñado para autónomos <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">que facturan</span></h2>
            <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-4xl mx-auto">
              {BENEFITS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }}
                    className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-amber-500/20 transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-amber-500/20 transition-colors">
                      <Icon className="w-6 h-6 text-amber-400" />
                    </div>
                    <p className="text-white font-semibold">{b.text}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CASOS DE USO ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">¿Para quién es?</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-10">
              Hecho para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">los que facturan de verdad</span>
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {USE_CASES.map((uc, i) => {
                const Icon = uc.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                    className="p-8 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-blue-500/20 transition-colors group text-center">
                    <div className="w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/20 transition-colors">
                      <Icon className="w-7 h-7 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{uc.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{uc.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ BLOQUE DE VALOR ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-6 border border-green-500/20">Comparación de costos</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
              Reemplaza{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">esto</span>
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Alternativa</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Coste/mes</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Con Volkern</span>
              </div>
              {COMPETITOR_TOOLS.map((tool, i) => (
                <motion.div key={tool.name} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 transition-colors">
                  <span className="text-slate-300 font-medium">{tool.name}</span>
                  <span className="text-red-400 text-right font-mono font-semibold">{tool.price === 0 ? 'Gratis' : formatearImporte(tool.price, MONEDA_PLATAFORMA, 0)}</span>
                  <span className="text-green-400 text-right font-mono font-semibold flex items-center justify-end gap-2"><Check className="w-4 h-4" /> Incluido</span>
                </motion.div>
              ))}
              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-green-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">{formatearImporte(TOTAL_COMPETITOR, MONEDA_PLATAFORMA, 0)}+</span>
                <span className="text-green-400 text-right font-bold text-lg font-mono">{CON_VOLKERN}</span>
              </div>
            </div>
            <p className="text-center text-slate-500 text-sm mt-4">14 días de prueba gratis. Sin compromiso. Cancela cuando quieras.</p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ TESTIMONIOS ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">Lo que dicen</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-10 text-center">
              Profesionales como tú{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">ya facturan con Volkern</span>
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="p-8 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-purple-500/20 transition-colors flex flex-col">
                  <Quote className="w-8 h-8 text-purple-500/30 mb-4 flex-shrink-0" />
                  <p className="text-slate-300 leading-relaxed mb-6 flex-1 italic">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-1 mb-1">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-sm font-bold text-purple-400 flex-shrink-0">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{t.name}</p>
                      <p className="text-slate-500 text-xs">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CONFIANZA ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <FileSignature className="w-10 h-10 text-green-400 mx-auto mb-6" />
              <h3 className="text-3xl font-bold text-white mb-4">Si emites facturas, necesitas un sistema</h3>
              <div className="space-y-2 text-lg text-slate-300">
                <p>Los profesionales que facturan con control:</p>
                <ul className="inline-block text-left space-y-1">
                  {['cobran más rápido', 'pagan menos en gestoría', 'duermen más tranquilos'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CTA ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-green-900/40 via-slate-900 to-emerald-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Receipt className="w-12 h-12 text-green-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Tu primera factura{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">en menos de 5 minutos</span>
              </h2>
              <p className="text-lg text-slate-400 mb-4 max-w-xl mx-auto">
                Empieza hoy con <span className="text-white font-bold">14 días gratis</span>. Sin tarjeta. Sin compromiso.
              </p>
              <p className="text-slate-500 text-sm mb-10">Luego {CON_VOLKERN}. Cancela cuando quieras.</p>
              <Link href="/signup?vertical=facturacion">
                <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-green-600/30 group">
                  Probar 14 días gratis
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══ CIERRE ═══ */}
      <Section>
        <FadeIn>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Menos horas facturando.</p>
            <p className="text-2xl text-slate-300 font-medium leading-relaxed mb-2">Más tiempo para tu negocio.</p>
            <p className="text-lg text-green-400 font-medium mb-8">Volkern Factura. Simple. Rápido. Sin errores.</p>
            <Link href="/signup?vertical=facturacion">
              <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-green-600/30 group">
                Probar 14 días gratis
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </Section>
    </>
  );
}
