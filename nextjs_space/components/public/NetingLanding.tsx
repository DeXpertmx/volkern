'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  CalendarClock,
  Rocket,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Settings,
  Layers,
  BadgeDollarSign,
  Briefcase,
} from 'lucide-react';
import { verticalLinks } from '@/lib/navigation';
import './landing-new.css';

/* ───────────────────────────────────────────────────────────────────────────
 *  Countdown — calcula tiempo restante hasta fin de mes (urgencia real)
 * ─────────────────────────────────────────────────────────────────────────── */
interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function getMonthEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
}

function useCountdown(): { time: TimeLeft; deadline: string } {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const time = useMemo<TimeLeft>(() => {
    const end = getMonthEnd().getTime();
    const diff = end - Date.now();
    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      expired: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const deadline = useMemo(() => {
    return getMonthEnd().toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { time, deadline };
}

/* ───────────────────────────────────────────────────────────────────────────
 *  Pricing constants — 20% OFF aplicado a anual y mensual
 * ─────────────────────────────────────────────────────────────────────────── */
const PRICING = {
  annual: {
    promo: 470,
    original: 588, // 470 / 0.80 ≈ 587.5
    setupPromo: 149,
    setupOriginal: 299,
    suffix: '/ año',
    monthlyEquivalentSuffix: '/mes facturado anual',
  },
  monthly: {
    promo: 39,
    original: 49, // 39 / 0.80 = 48.75 → redondeado
    setupPromo: 199,
    setupOriginal: 299,
    suffix: '/ mes',
    monthlyEquivalentSuffix: '/ mes',
  },
} as const;

/* ───────────────────────────────────────────────────────────────────────────
 *  Componente principal
 * ─────────────────────────────────────────────────────────────────────────── */
function CountdownTimer() {
  const { time, deadline } = useCountdown();
  const cells = [
    { label: 'Días', value: time.days },
    { label: 'Horas', value: time.hours },
    { label: 'Min', value: time.minutes },
    { label: 'Seg', value: time.seconds },
  ];
  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={`Cuenta regresiva: termina el ${deadline}`}
      className="flex flex-col items-center gap-3"
    >
      <div className="flex items-center gap-2 text-amber-400 text-sm font-bold tracking-[0.22em] uppercase">
        <Clock className="w-4 h-4 animate-pulse" aria-hidden="true" />
        Termina el {deadline}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3 vl-glass vl-ring-soft p-3 sm:p-4 rounded-2xl">
        {cells.map((c) => (
          <div
            key={c.label}
            className="flex flex-col items-center justify-center min-w-[68px] sm:min-w-[88px] bg-slate-950/50 border border-amber-500/15 rounded-xl px-3 py-2 sm:py-3"
          >
            <span className="font-mono text-2xl sm:text-4xl font-black text-white tabular-nums leading-none">
              {String(c.value).padStart(2, '0')}
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TwentyOffBadge({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = {
    sm: 'text-xs px-3 py-1',
    md: 'text-sm px-4 py-1.5',
    lg: 'text-base sm:text-lg px-5 py-2',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400 text-emerald-950 font-black uppercase tracking-wider rounded-full shadow-lg shadow-emerald-500/30 ${sizeMap[size]}`}
    >
      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
      20% OFF Aplicado
    </span>
  );
}

interface PlanCardProps {
  recommended?: boolean;
  badgeText?: string;
  title: string;
  pricePromo: number;
  priceOriginal: number;
  suffix: string;
  setupPromo: number;
  setupOriginal: number;
  ctaText: string;
  ctaHref: string;
  features: string[];
}

function PlanCard({
  recommended,
  badgeText,
  title,
  pricePromo,
  priceOriginal,
  suffix,
  setupPromo,
  setupOriginal,
  ctaText,
  ctaHref,
  features,
}: PlanCardProps) {
  return (
    <article
      className={`relative vl-glass vl-ring-soft rounded-[28px] p-6 sm:p-8 flex flex-col transition-all duration-300 ${
        recommended
          ? 'border-2 border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.6),0_25px_60px_-10px_rgba(59,130,246,0.5)] bg-blue-950/50 hover:-translate-y-1 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.8),0_30px_70px_-10px_rgba(59,130,246,0.6)]'
          : 'border border-white/10 hover:border-white/20 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30'
      }`}
    >
      {badgeText && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-block bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white font-black uppercase tracking-wider text-xs px-4 py-1.5 rounded-full shadow-lg shadow-orange-500/40">
            {badgeText}
          </span>
        </div>
      )}

      <header className="mb-4">
        <p
          className={`text-xs font-black uppercase tracking-[0.22em] mb-2 ${
            recommended ? 'text-blue-300' : 'text-slate-400'
          }`}
        >
          {title}
        </p>
        <TwentyOffBadge size={recommended ? 'md' : 'sm'} />
      </header>

      <div className="mb-6">
        <div className="flex items-end gap-3 flex-wrap">
          <span className="font-black text-white leading-none text-5xl sm:text-6xl">
            €{pricePromo}
          </span>
          <div className="flex flex-col mb-1.5">
            <span className="text-slate-400 line-through font-bold text-base sm:text-lg tabular-nums">
              €{priceOriginal}
            </span>
            <span className="text-slate-400 font-medium text-sm">{suffix}</span>
          </div>
        </div>
        <p className={`text-xs mt-2 font-medium ${recommended ? 'text-blue-300' : 'text-slate-400'}`}>
          Ahorras €{priceOriginal - pricePromo} con la promo Neting
        </p>
      </div>

      <hr
        className={`mb-6 ${recommended ? 'border-blue-500/30' : 'border-white/10'}`}
      />

      <div className="mb-6 bg-slate-950/40 border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <p className="text-white font-bold text-sm">Setup Asistido</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 line-through font-bold text-base tabular-nums">
            €{setupOriginal}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          <span className="text-emerald-400 font-black text-xl tabular-nums">
            €{setupPromo}
          </span>
          <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
            -{Math.round(((setupOriginal - setupPromo) / setupOriginal) * 100)}%
          </span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
            <CheckCircle2
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                recommended ? 'text-blue-400' : 'text-emerald-400'
              }`}
              aria-hidden="true"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`vl-btn ${
          recommended ? 'vl-btn-primary' : 'vl-btn-secondary'
        } w-full text-center justify-center text-base sm:text-lg`}
      >
        <Rocket className="w-4 h-4 mr-2" aria-hidden="true" />
        {ctaText}
      </Link>
    </article>
  );
}

export default function NetingLanding() {
  const promoCtaHref = '/signup?promo=neting&plan=crm-ventas';
  const { deadline } = useCountdown();

  return (
    <div
      className="vl-landing neting-slides"
      style={{
        background: '#020617',
      }}
    >
      <div className="vl-page">
        {/* ═══ SLIDE 1 · HERO ═══════════════════════════════════════════════ */}
        <section
          id="hero"
          aria-labelledby="hero-heading"
          className="relative min-h-screen flex items-center justify-center px-6 pt-28 pb-16 snap-start"
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-50"
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(circle at 20% 30%, rgba(124, 58, 237, 0.25) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(37, 99, 235, 0.20) 0%, transparent 45%)',
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative max-w-5xl w-full text-center"
          >
            <div className="vl-glass vl-ring-soft inline-flex items-center gap-2 rounded-full px-4 py-2 mb-8 border border-amber-500/30 bg-amber-500/10">
              <BadgeDollarSign className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span className="text-amber-200 text-sm font-bold tracking-wide">
                Promoción exclusiva Neting · 20% OFF
              </span>
            </div>

            <h1
              id="hero-heading"
              className="vl-h1 mb-6 text-white text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
            >
              Convierte más prospectos en clientes con un{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
                CRM automatizado
              </span>
            </h1>

            <p className="vl-hero-subtitle text-slate-300 text-lg sm:text-xl max-w-3xl mx-auto mb-10">
              Automatiza tu seguimiento, gestiona oportunidades y cierra más ventas
              desde un solo lugar. <span className="text-white font-bold">Activación exclusiva mediante recomendación en Neting.</span>
            </p>

            <div className="flex justify-center mb-10">
              <CountdownTimer />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={promoCtaHref}
                className="vl-btn vl-btn-primary text-base sm:text-lg px-8 sm:px-12 py-4 group"
              >
                <Rocket className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" aria-hidden="true" />
                Activar sistema
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </Link>
              <a
                href="#pricing"
                className="vl-btn vl-btn-secondary text-base sm:text-lg px-6 sm:px-8 py-4"
              >
                Ver precios
              </a>
            </div>

            <p className="text-xs text-slate-400 mt-6 font-medium">
              Acceso exclusivo · Promoción activa por tiempo limitado
            </p>
          </motion.div>
        </section>

        {/* ═══ SLIDE 2 · BENEFICIO NETING ═════════════════════════════════════ */}
        <section
          id="beneficios"
          aria-labelledby="beneficios-heading"
          className="relative min-h-screen flex items-center justify-center px-6 pt-16 pb-16 snap-start"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="max-w-6xl w-full"
          >
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 mb-4">
                <Sparkles
                  className="w-4 h-4 text-amber-300"
                  aria-hidden="true"
                />
                <span className="text-amber-200 text-xs sm:text-sm font-black uppercase tracking-widest">
                  El verdadero beneficio Neting
                </span>
              </div>
              <h2
                id="beneficios-heading"
                className="vl-h2 text-white text-3xl sm:text-4xl mb-3"
              >
                Tu beneficio como miembro de Neting
              </h2>
              <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
                Setup Asistido con descuento exclusivo + 20% OFF en tu plan
                recurrente. Esto es lo que te llevas solo por ser miembro.
              </p>
            </div>

            {/* ─── HERO BENEFIT · Setup con descuento ─────────────────────── */}
            <div className="vl-glass vl-ring-soft rounded-[32px] p-6 sm:p-10 border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-slate-950/60 to-slate-950/60 mb-6 relative overflow-hidden">
              <div
                className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl pointer-events-none"
                aria-hidden="true"
              />
              <div className="relative">
                <div className="text-center mb-7">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/25 border border-emerald-500/60 mb-3">
                    <BadgeDollarSign
                      className="w-4 h-4 text-emerald-200"
                      aria-hidden="true"
                    />
                    <span className="text-emerald-100 text-xs font-black uppercase tracking-widest">
                      Beneficio #1 · Setup con descuento
                    </span>
                  </div>
                  <h3 className="text-white text-2xl sm:text-3xl font-black leading-tight">
                    Hasta{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-emerald-300">
                      €150
                    </span>{' '}
                    menos en tu activación
                  </h3>
                  <p className="text-slate-400 text-sm sm:text-base mt-2 italic">
                    Compara: precio de lista vs. precio Neting
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-5 sm:gap-6">
                  {/* ANUAL · Máx ahorro */}
                  <div className="vl-ring-soft rounded-2xl p-6 sm:p-8 bg-blue-950/50 border-2 border-blue-500/50 relative shadow-2xl shadow-blue-500/20">
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white font-black uppercase tracking-wider text-xs px-4 py-1.5 rounded-full shadow-lg shadow-orange-500/40 whitespace-nowrap">
                      🔥 Máx. ahorro · Anual
                    </span>
                    <p className="text-blue-300 text-xs font-black uppercase tracking-widest mb-4 text-center mt-2">
                      Si eliges Plan Anual
                    </p>
                    <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4">
                      <span className="text-slate-400 line-through font-bold text-2xl sm:text-3xl tabular-nums">
                        €299
                      </span>
                      <ArrowRight
                        className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400"
                        aria-hidden="true"
                      />
                      <span className="font-black text-white text-5xl sm:text-7xl leading-none tabular-nums">
                        €149
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="inline-block bg-emerald-500 text-emerald-950 text-sm font-black uppercase tracking-wider px-4 py-1.5 rounded-full shadow-md">
                        Ahorras €150
                      </span>
                    </div>
                  </div>

                  {/* MENSUAL */}
                  <div className="vl-ring-soft rounded-2xl p-6 sm:p-8 bg-slate-950/50 border border-white/15">
                    <p className="text-slate-300 text-xs font-black uppercase tracking-widest mb-4 text-center mt-2">
                      Si eliges Plan Mensual
                    </p>
                    <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4">
                      <span className="text-slate-400 line-through font-bold text-2xl sm:text-3xl tabular-nums">
                        €299
                      </span>
                      <ArrowRight
                        className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400"
                        aria-hidden="true"
                      />
                      <span className="font-black text-white text-5xl sm:text-7xl leading-none tabular-nums">
                        €199
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="inline-block bg-emerald-500/30 text-emerald-200 text-sm font-black uppercase tracking-wider px-4 py-1.5 rounded-full border border-emerald-500/50">
                        Ahorras €100
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── SECONDARY BENEFIT · 20% OFF plan recurrente ───────────── */}
            <div className="vl-glass vl-ring-soft rounded-[28px] p-6 sm:p-8 border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-slate-950/60 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 mb-3">
                <Sparkles
                  className="w-3.5 h-3.5 text-emerald-300"
                  aria-hidden="true"
                />
                <span className="text-emerald-200 text-xs font-black uppercase tracking-widest">
                  Beneficio #2 · Plan recurrente
                </span>
              </div>
              <p className="text-white text-xl sm:text-2xl font-black mb-5">
                + 20% OFF en tu suscripción
              </p>
              <div className="flex items-center justify-center gap-4 sm:gap-8 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 line-through font-bold text-xl sm:text-2xl tabular-nums">
                    €49/mes
                  </span>
                  <ArrowRight
                    className="w-4 h-4 text-emerald-400"
                    aria-hidden="true"
                  />
                  <span className="text-emerald-400 font-black text-2xl sm:text-3xl tabular-nums">
                    €39/mes
                  </span>
                </div>
                <div
                  className="hidden sm:block w-px h-10 bg-white/15"
                  aria-hidden="true"
                />
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 line-through font-bold text-xl sm:text-2xl tabular-nums">
                    €588/año
                  </span>
                  <ArrowRight
                    className="w-4 h-4 text-emerald-400"
                    aria-hidden="true"
                  />
                  <span className="text-emerald-400 font-black text-2xl sm:text-3xl tabular-nums">
                    €470/año
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ═══ SLIDE 3 · ECOSISTEMA + CAPACIDADES ════════════════════════════ */}
        <section
          id="ecosistema"
          aria-labelledby="ecosistema-heading"
          className="relative min-h-screen flex items-center justify-center px-6 pt-16 pb-20 snap-start"
        >
          <div className="max-w-7xl w-full grid gap-6 lg:gap-8 lg:grid-cols-2">
            {/* Ecosistema */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6 }}
              className="vl-glass vl-ring-soft rounded-[28px] p-6 sm:p-10 border-l-4 border-l-blue-500"
            >
              <p className="vl-section-eyebrow mb-3">Ecosistema Volkern</p>
              <h2 id="ecosistema-heading" className="vl-h2 mb-5 text-white text-2xl sm:text-3xl">
                No es solo un CRM. Es un sistema completo.
              </h2>
              <p className="text-slate-300 text-base sm:text-lg mb-6 leading-relaxed">
                Una plataforma completa para digitalizar y automatizar tu negocio.
                Comienzas con CRM y Ventas, y escalas a otros módulos según crece
                tu operación.
              </p>
              <ul className="flex flex-wrap gap-2" aria-label="Módulos disponibles">
                {verticalLinks.map((vl) => {
                  const Icon = {
                    '/soluciones/real-estate': Briefcase,
                    '/soluciones/accounting': BadgeDollarSign,
                    '/soluciones/marketing': Sparkles,
                    '/soluciones/academy': Layers,
                    '/soluciones/industria': Settings,
                    '/soluciones/rrhh': ShieldCheck,
                    '/soluciones/crm-ventas': CheckCircle2,
                  }[vl.href];
                  return (
                    <li
                      key={vl.href}
                      className="vl-ring-soft flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/25 rounded-full"
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 text-blue-300" aria-hidden="true" />}
                      <span className="text-xs sm:text-sm font-bold text-blue-100">
                        {vl.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-slate-400 text-xs sm:text-sm mt-6 italic">
                Empieza con un módulo y desbloquea los demás según tu crecimiento.
              </p>
            </motion.div>

            {/* Capacidades */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="vl-glass vl-ring-soft rounded-[28px] p-6 sm:p-10"
            >
              <p className="vl-section-eyebrow mb-3">¿Qué puedes hacer?</p>
              <h2 className="vl-h2 mb-5 text-white text-2xl sm:text-3xl">
                Tu proceso comercial, sin fricciones
              </h2>
              <ul className="space-y-3 sm:space-y-4">
                {[
                  'Gestionar oportunidades con pipeline visual',
                  'Automatizar seguimiento a prospectos',
                  'Centralizar todos tus contactos en un solo lugar',
                  'No perder leads: cero fisuras en tu funnel',
                  'Dar seguimiento sin esfuerzo manual',
                  'Tener control total de tu proceso comercial',
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-slate-200 text-base sm:text-lg"
                  >
                    <CheckCircle2
                      className="w-5 h-5 mt-0.5 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </section>

        {/* ═══ SLIDE 4 · SETUP (ACTIVACIÓN) ═════════════════════════════════ */}
        <section
          id="setup"
          aria-labelledby="setup-heading"
          className="relative min-h-screen flex items-center justify-center px-6 pt-16 pb-16 snap-start"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="max-w-5xl w-full"
          >
            <div className="text-center mb-10">
              <p className="vl-section-eyebrow mb-3">Setup Asistido · Con descuento Neting</p>
              <h2 id="setup-heading" className="vl-h2 mb-4 text-white text-3xl sm:text-4xl">
                Activación inicial guiada
              </h2>
              <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
                Para garantizar resultados desde el día 1, todos los clientes de la
                promo Neting reciben el Setup Asistido con tarifa especial.
                <span className="block mt-1 font-bold text-emerald-300">
                  €299 → €199 (mensual) · €299 → €149 (anual)
                </span>
              </p>
            </div>

            <div className="vl-glass vl-ring-soft rounded-[28px] p-6 sm:p-10">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {[
                  { t: 'Configuración inicial del CRM', d: 'Ajustado a tu equipo y procesos' },
                  { t: 'Creación de pipeline estándar', d: 'Etapas listas para usar' },
                  { t: 'Carga de estructura base', d: 'Contactos y campos clave' },
                  { t: 'Activación de automatización básica', d: '1 workflow operativo' },
                  { t: 'Configuración de 1 canal de contacto', d: 'Email, WhatsApp o formulario' },
                  { t: 'Sesión de onboarding guiado', d: '1 sesión 1-on-1 con tu equipo' },
                ].map((step, i) => (
                  <div
                    key={i}
                    className="vl-ring-soft bg-slate-950/40 border border-white/5 rounded-xl p-4 sm:p-5 hover:border-blue-500/40 transition-colors"
                  >
                    <div className="text-blue-300 font-black text-xs tracking-widest mb-2">
                      PASO {String(i + 1).padStart(2, '0')}
                    </div>
                    <p className="text-white font-bold text-sm sm:text-base mb-1">
                      {step.t}
                    </p>
                    <p className="text-slate-400 text-xs sm:text-sm">{step.d}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 vl-ring-soft bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 sm:p-5 flex items-start gap-3">
                <AlertTriangle
                  className="w-5 h-5 text-rose-300 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-rose-100 text-sm">
                  <span className="font-bold">No incluye:</span> personalizaciones
                  avanzadas, integraciones a medida ni desarrollos exclusivos fuera
                  del alcance estándar.
                </p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ═══ SLIDE 5 · PRICING ════════════════════════════════════════════ */}
        <section
          id="pricing"
          aria-labelledby="pricing-heading"
          className="relative min-h-screen flex items-center justify-center px-6 pt-16 pb-16 snap-start"
        >
          <div className="max-w-6xl w-full">
            <div className="text-center mb-10">
              <TwentyOffBadge size="lg" />
              <h2 id="pricing-heading" className="vl-h2 mt-5 text-white text-3xl sm:text-4xl">
                Planes CRM Ventas · Neting
              </h2>
              <p className="vl-section-subtitle mt-3 max-w-2xl mx-auto">
                Acceso completo, automatización incluida, actualizaciones. Con
                Setup Asistido bonificado por tiempo limitado.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5 sm:gap-6 lg:gap-8 items-stretch">
              {/* MENSUAL — side-by-side con el recomendado. Sin scale para no romper layout. */}
              <PlanCard
                title="Mensual"
                pricePromo={PRICING.monthly.promo}
                priceOriginal={PRICING.monthly.original}
                suffix={PRICING.monthly.suffix}
                setupPromo={PRICING.monthly.setupPromo}
                setupOriginal={PRICING.monthly.setupOriginal}
                ctaText="Elegir Mensual"
                ctaHref={`${promoCtaHref}&cycle=monthly`}
                features={[
                  'Acceso completo al CRM y Ventas',
                  'Pipeline visual de oportunidades',
                  'Automatización de seguimiento',
                  'Contactos y leads centralizados',
                  'Reportes y analytics',
                  'Actualizaciones incluidas',
                ]}
              />

              {/* ANUAL · RECOMENDADO */}
              <PlanCard
                recommended
                badgeText="🔥 Más recomendado"
                title="Anual · Recomendado"
                pricePromo={PRICING.annual.promo}
                priceOriginal={PRICING.annual.original}
                suffix={PRICING.annual.monthlyEquivalentSuffix}
                setupPromo={PRICING.annual.setupPromo}
                setupOriginal={PRICING.annual.setupOriginal}
                ctaText="Activar Anual"
                ctaHref={`${promoCtaHref}&cycle=annual`}
                features={[
                  'Todo lo del plan Mensual',
                  'Equivale a €39/mes · 2 meses gratis',
                  'Ahorro extra vs pago mensual',
                  'Activación prioritaria del Setup',
                  'Soporte preferencial Neting',
                  'Acceso anticipado a nuevas funciones',
                ]}
              />
            </div>

            <p className="text-center text-slate-400 text-xs sm:text-sm mt-8 max-w-2xl mx-auto">
              IVA no incluido. Activación exclusiva mediante recomendación en Neting.
              Promoción válida hasta fin de mes.
            </p>
          </div>
        </section>

        {/* ═══ SLIDE 6 · CÓMO FUNCIONA + CTA FINAL + URGENCIA ═══════════════ */}
        <section
          id="activar"
          aria-labelledby="activar-heading"
          className="relative min-h-screen flex items-center justify-center px-6 pt-16 pb-28 snap-start"
        >
          <div className="max-w-5xl w-full">
            <div className="text-center mb-10">
              <p className="vl-section-eyebrow mb-3">Activación en 5 pasos</p>
              <h2 id="activar-heading" className="vl-h2 text-white text-3xl sm:text-4xl mb-3">
                ¿Cómo funciona?
              </h2>
              <p className="text-slate-300 max-w-2xl mx-auto">
                Activación exclusiva mediante recomendación en Neting.
              </p>
            </div>

            <ol className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-12">
              {[
                { t: 'Solicita la activación', d: 'Click en Activar sistema' },
                { t: 'Indica quién te recomendó', d: 'Tu sponsor Neting' },
                { t: 'Realizas el pago seguro', d: 'Stripe · 100% seguro' },
                { t: 'Configuramos tu sistema', d: 'Setup guiado incluido' },
                { t: 'Empiezas a usarlo', d: 'En pocos días operativos' },
              ].map((step, i) => (
                <li
                  key={i}
                  className="vl-glass vl-ring-soft relative rounded-2xl p-5 sm:p-6 bg-slate-950/40 border border-white/10 hover:border-blue-500/40 transition-colors"
                >
                  <div
                    className="absolute -top-4 -left-2 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-blue-500/40"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </div>
                  <div className="pt-3">
                    <p className="font-bold text-white text-sm sm:text-base mb-1">
                      {step.t}
                    </p>
                    <p className="text-slate-400 text-xs sm:text-sm">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* Urgencia Final */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5 }}
              className="vl-glass vl-ring-soft rounded-[28px] p-6 sm:p-10 border border-rose-500/30 bg-gradient-to-br from-rose-950/40 to-slate-950/60"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40">
                  <AlertTriangle className="w-4 h-4 text-rose-300" aria-hidden="true" />
                  <span className="text-rose-200 text-xs sm:text-sm font-black uppercase tracking-widest">
                    Urgencia · Esta oferta termina pronto
                  </span>
                </div>
                <p className="text-white text-lg sm:text-xl font-bold max-w-2xl">
                  Esta promoción es exclusiva para miembros de Neting y estará
                  disponible solo hasta:
                </p>
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm sm:text-base">
                  <CalendarClock className="w-4 h-4" aria-hidden="true" />
                  <span>{deadline}</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 w-full max-w-2xl mt-2">
                  <div className="vl-ring-soft bg-slate-950/50 border border-white/10 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
                      Cuando termine
                    </p>
                    <p className="text-white font-bold text-sm">
                      El setup vuelve a <span className="line-through text-slate-400">€299</span>{' '}
                      completo
                    </p>
                  </div>
                  <div className="vl-ring-soft bg-slate-950/50 border border-white/10 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
                      Cuando termine
                    </p>
                    <p className="text-white font-bold text-sm">
                      Se eliminan los 20% de descuento actuales
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
                  <Link
                    href={promoCtaHref}
                    className="vl-btn vl-btn-primary text-base sm:text-lg px-8 sm:px-12 py-4 group"
                  >
                    <Rocket
                      className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform"
                      aria-hidden="true"
                    />
                    Activar sistema
                  </Link>
                  <a
                    href="#pricing"
                    className="text-sm font-bold text-blue-300 hover:text-blue-200 transition-colors"
                  >
                    ↑ Revisar planes primero
                  </a>
                </div>

                <p className="text-slate-400 text-sm sm:text-base max-w-xl mt-4 leading-relaxed">
                  Empieza hoy a organizar, automatizar y escalar tu proceso comercial
                  con Volkern.
                </p>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  );
}
