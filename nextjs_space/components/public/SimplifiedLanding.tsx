'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Minus, Monitor, Zap, MessageCircle, FileSignature, Users, BarChart3, TrendingUp, Clock, AlertTriangle, Layers, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react';

const BASE_PRICE = 50;
const USER_INCREMENT = 20;
const CONTACT_INCREMENT = 5;
const BASE_USERS = 1;
const BASE_CONTACTS = 1000;

/* ─── Data ────────────────────────────────────────────────────────────────── */

const COMPETITOR_TOOLS = [
  { name: 'CRM', price: 50 },
  { name: 'Email marketing', price: 30 },
  { name: 'Chat en vivo', price: 20 },
  { name: 'Telefonía', price: 25 },
  { name: 'Automatización', price: 40 },
  { name: 'Firma digital', price: 15 },
  { name: 'Gestión interna', price: 30 },
];

const TOTAL_COMPETITOR = COMPETITOR_TOOLS.reduce((sum, t) => sum + t.price, 0);

const PROBLEMS = [
  { icon: Clock, title: 'Pierdes tiempo', desc: 'cambiando entre plataformas' },
  { icon: AlertTriangle, title: 'Información fragmentada', desc: 'tus datos están dispersos' },
  { icon: TrendingUp, title: 'Sin control total', desc: 'del negocio en tiempo real' },
  { icon: Minus, title: 'Pagas más', desc: 'por menos funcionalidad' },
];

const CAPABILITIES = [
  'Gestionar clientes y ventas',
  'Automatizar procesos',
  'Comunicarte con clientes',
  'Firmar documentos',
  'Gestionar pagos',
  'Controlar operaciones',
];

const MODULES = [
  'CRM y gestión de clientes',
  'Automatización de procesos',
  'Email marketing',
  'Chat en vivo',
  'Telefonía integrada',
  'Firma digital',
  'Gestión de tareas',
  'Academia y formación',
  'Integraciones (Stripe, Google, etc.)',
  'Dashboard y reportes',
];

const BENEFITS = [
  { icon: Zap, text: 'No pierdes oportunidades' },
  { icon: MessageCircle, text: 'Respondes más rápido' },
  { icon: ShieldCheck, text: 'Reduces errores' },
  { icon: Clock, text: 'Ahorras tiempo' },
  { icon: BarChart3, text: 'Tomas mejores decisiones' },
];

const TARGETS = [
  'Inmobiliarias',
  'Agencias de marketing',
  'Despachos contables',
  'Academias',
  'Equipos comerciales',
  'Empresas en crecimiento',
];

/* ─── PricingSlider (interactivo) ──────────────────────────────────────────── */

function PricingSlider() {
  const [users, setUsers] = useState(1);
  const [contacts, setContacts] = useState(1000);

  const total = useMemo(() => {
    const additionalUsers = Math.max(0, users - BASE_USERS);
    const additionalContacts = Math.max(0, (contacts - BASE_CONTACTS) / 1000);
    return BASE_PRICE + additionalUsers * USER_INCREMENT + additionalContacts * CONTACT_INCREMENT;
  }, [users, contacts]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-10 text-center relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-600/10 blur-[80px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        {/* Price Display */}
        <div className="text-6xl md:text-7xl font-bold text-white mb-1">
          €{total}<span className="text-2xl text-slate-500 font-normal">/mes</span>
        </div>
        <p className="text-slate-500 text-sm mb-8">
          {users} {users === 1 ? 'usuario' : 'usuarios'} · {contacts.toLocaleString()} contactos
        </p>

        {/* Sliders */}
        <div className="space-y-6 mb-8 text-left">
          {/* Users */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400 font-medium">Usuarios</label>
              <span className="text-lg font-bold text-white">{users}</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={users}
              onChange={(e) => setUsers(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-500/30 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>1</span>
              <span>50</span>
            </div>
          </div>

          {/* Contacts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400 font-medium">Contactos</label>
              <span className="text-lg font-bold text-white">{contacts.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={1000}
              max={100000}
              step={1000}
              value={contacts}
              onChange={(e) => setContacts(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-500/30 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>1.000</span>
              <span>100.000</span>
            </div>
          </div>
        </div>

        {/* Included checkmarks */}
        <div className="space-y-3 mb-8 text-left max-w-xs mx-auto">
          {[
            `${users} ${users === 1 ? 'usuario' : 'usuarios'} incluido${users > 1 ? 's' : ''}`,
            `${contacts.toLocaleString()} contactos incluidos`,
            'Todos los módulos activos',
            'Sin costos ocultos',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-300">{item}</span>
            </div>
          ))}
        </div>

        <Link href="/auth/signup">
          <Button size="lg" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
            Activar mi sistema
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>

        <p className="text-xs text-slate-600 mt-4">Sin tarjeta de crédito. Cancela cuando quieras.</p>
      </div>
    </div>
  );
}

/* ─── Section Wrapper ──────────────────────────────────────────────────────── */

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

export default function SimplifiedLanding() {
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
         HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-24 overflow-hidden bg-slate-950">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/assets/landing/laptop-volkern-1.png"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950/95" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/15 blur-[140px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              <Zap className="w-4 h-4" />
              Tu Hub Operativo
            </span>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
              Centraliza todo tu negocio{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                en un solo lugar
              </span>
            </h1>

            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              Gestiona clientes, ventas, comunicación, pagos y operaciones sin cambiar de herramienta.
            </p>

            <p className="text-2xl md:text-3xl font-bold text-white mb-10">
              Todo lo que necesitas para operar y crecer, desde <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">€50/mes</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Activar mi sistema
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#como-funciona">
                <Button variant="outline" size="lg" className="border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white px-10 py-7 text-lg rounded-xl">
                  <Monitor className="mr-2 w-5 h-5" />
                  Ver cómo funciona
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         PRUEBA RÁPIDA — Comparación de costos
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark id="como-funciona">
        <FadeIn>
          <div className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
              Prueba rápida
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
              Todo lo que dejas de pagar
            </h2>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Herramienta</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Costo/mes</span>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider text-right">Con Volkern</span>
              </div>

              {/* Rows */}
              {COMPETITOR_TOOLS.map((tool, i) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 transition-colors"
                >
                  <span className="text-slate-300 font-medium">{tool.name}</span>
                  <span className="text-red-400 text-right font-mono font-semibold">€{tool.price}</span>
                  <span className="text-emerald-400 text-right font-mono font-semibold flex items-center justify-end gap-2">
                    <Check className="w-4 h-4" /> Incluido
                  </span>
                </motion.div>
              ))}

              {/* Total Row */}
              <div className="grid grid-cols-3 gap-4 px-6 py-5 bg-slate-800/50 border-t-2 border-emerald-500/30">
                <span className="text-white font-bold text-lg">Total</span>
                <span className="text-red-400 text-right font-bold text-lg font-mono">€{TOTAL_COMPETITOR}+</span>
                <span className="text-emerald-400 text-right font-bold text-lg font-mono">€50/mes</span>
              </div>
            </div>

            <p className="text-center text-slate-400 mt-6 text-sm">
              Reemplaza más de <span className="text-white font-semibold">{COMPETITOR_TOOLS.length} herramientas</span> por una sola plataforma
            </p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         PROBLEMA
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 text-red-400 text-sm font-medium mb-6 border border-red-500/20">
              El problema
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Estás usando <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">demasiadas herramientas</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">
              Cada herramienta que añades promete solucionar un problema… pero añade tres más.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {PROBLEMS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                    className="flex items-start gap-4 p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-red-500/20 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg mb-1">{p.title}</h3>
                      <p className="text-slate-400">{p.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         SOLUCIÓN
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              La solución
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Un sistema para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">todo tu negocio</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">
              Con Volkern puedes:
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAPABILITIES.map((cap, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="flex items-center gap-3 p-5 bg-slate-950 border border-slate-800 rounded-xl hover:border-blue-500/30 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                    <Check className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-slate-300 font-medium">{cap}</span>
                </motion.div>
              ))}
            </div>

            <p className="text-center text-slate-400 mt-8 text-sm">
              Todo en un solo lugar. Sin integraciones complejas. Sin duplicar datos.
            </p>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         MÓDULOS (Volumen = Valor)
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium mb-6 border border-purple-500/20">
              Volumen = Valor
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Todo lo que incluye{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">Volkern</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mb-12 leading-relaxed">
              No vendemos módulos por separado. Todo está incluido desde el primer día.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              {MODULES.map((mod, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-purple-500/20 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                    <Layers className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-slate-300">{mod}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         BENEFICIOS
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block py-1 px-3 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-6 border border-amber-500/20">
              Beneficios reales
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Diseñado para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">operar mejor</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
              No es un CRM, no es un ERP. Es la forma de operar tu negocio.
            </p>

            <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {BENEFITS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                    className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-amber-500/20 transition-all duration-300 group"
                  >
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

      {/* ═══════════════════════════════════════════════════════════════════
         PARA QUIÉN ES
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-4xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6 border border-emerald-500/20">
              Para quién es
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-12">
              Diseñado para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">distintos negocios</span>
            </h2>

            <div className="flex flex-wrap justify-center gap-3">
              {TARGETS.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                  className="px-6 py-3 bg-slate-900/50 border border-slate-800 rounded-full text-slate-300 font-medium hover:border-emerald-500/30 hover:text-emerald-300 transition-all duration-300"
                >
                  {t}
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CTA INTERMEDIO
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-900/30 via-slate-900 to-purple-900/30 border border-slate-800 rounded-3xl p-12 md:p-16">
              <Sparkles className="w-12 h-12 text-blue-400 mx-auto mb-6" />
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Empieza a centralizar tu negocio hoy
              </h2>
              <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
                Todo en un solo sistema. Sin complicaciones.
              </p>
              <Link href="/auth/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-7 text-lg rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Empezar con Volkern
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         PRICING SIMPLIFICADO (con sliders interactivos)
      ════════════════════════════════════════════════════════════════════ */}
      <Section id="pricing">
        <FadeIn>
          <div className="max-w-lg mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              Pricing
            </span>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Un solo plan.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Todo incluido.</span>
            </h2>

            <PricingSlider />
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CONFIANZA
      ════════════════════════════════════════════════════════════════════ */}
      <Section dark>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-3xl">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-6" />
              <p className="text-lg text-slate-300 leading-relaxed mb-4">
                Empresas están comenzando a reemplazar múltiples herramientas por Volkern.
              </p>
              <p className="text-slate-500 text-sm max-w-lg mx-auto">
                Centralizar ya no es una opción, es una ventaja competitiva.
              </p>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         CTA FINAL
      ════════════════════════════════════════════════════════════════════ */}
      <Section>
        <FadeIn>
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-indigo-900/40 border border-slate-800 rounded-3xl p-12 md:p-16">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Deja de usar{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">múltiples herramientas</span>
              </h2>
              <p className="text-xl text-slate-400 mb-10">
                Empieza a operar con un solo sistema
              </p>
              <Link href="/auth/signup">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-14 py-8 text-xl rounded-xl font-bold shadow-xl shadow-blue-600/30 group">
                  Activar mi sistema
                  <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
         FOOTER PHRASE
      ════════════════════════════════════════════════════════════════════ */}
      <div className="py-10 bg-slate-950 border-t border-slate-900">
        <div className="container mx-auto px-6 text-center">
          <p className="text-xl text-slate-500 font-medium">
            Volkern no es otro software.{' '}
            <span className="text-slate-300">Es la forma de operar tu negocio.</span>
          </p>
        </div>
      </div>
    </>
  );
}
