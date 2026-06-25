'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Check, Zap, TrendingUp, Clock, AlertTriangle,
  FileText, Layers, ShieldCheck, Receipt, FileSignature,
} from 'lucide-react';

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
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-6 border border-green-500/20">
              <Receipt className="w-4 h-4" />
              Facturación
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
              Sin complicaciones. Sin Excels. Sin perder horas.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup?vertical=facturacion">
                <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-green-600/30 group">
                  Activar Volkern Factura
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

      {/* ═══ BLOQUE DE VALOR ═══ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-6 border border-green-500/20">Todo lo que reemplaza Volkern Factura</span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
              Reemplaza{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">esto</span>
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Herramienta</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Costo/mes</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Con Volkern</span>
              </div>
              {COMPETITOR_TOOLS.map((tool, i) => (
                <motion.div key={tool.name} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 transition-colors">
                  <span className="text-slate-300 font-medium">{tool.name}</span>
                  <span className="text-red-400 text-right font-mono font-semibold">{tool.price === 0 ? 'Gratis' : `€${tool.price}`}</span>
                  <span className="text-green-400 text-right font-mono font-semibold flex items-center justify-end gap-2"><Check className="w-4 h-4" /> Incluido</span>
                </motion.div>
              ))}
              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-green-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR}+</span>
                <span className="text-green-400 text-right font-bold text-lg font-mono">€25/mes</span>
              </div>
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
                Empieza a facturar{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">sin estrés</span>
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto">Tu primera factura en menos de 5 minutos.</p>
              <Link href="/auth/signup?vertical=facturacion">
                <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-green-600/30 group">
                  Activar Volkern Factura
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
            <Link href="/auth/signup?vertical=facturacion">
              <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-green-600/30 group">
                Activar Volkern Factura
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </Section>
    </>
  );
}
