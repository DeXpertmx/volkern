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
import SetupBasico from '@/components/public/SetupBasico';
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

export default function NetingLanding() {
  const [billing, setBilling] = useState<'annual' | 'monthly'>('monthly');
  const { time, deadline } = useCountdown();

  const isAnnual = billing === 'annual';
  const planData = isAnnual ? PRICING.annual : PRICING.monthly;
  const checkoutInterval = billing === 'annual' ? 'yearly' : 'monthly';
  const checkoutPrecio = isAnnual ? PRICING.annual.promo : PRICING.monthly.promo;
  const checkoutSetup = isAnnual ? PRICING.annual.setupPromo : PRICING.monthly.setupPromo;
  const promoCtaHref = `/checkout?usuarios=3&contactos=2000&plan=scale&interval=${checkoutInterval}&precio=${checkoutPrecio}&setup=${checkoutSetup}&promo=neting`;

  /* ─── Modal de promoción expirada (solo si inició trial) ─────────────── */
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  useEffect(() => {
    if (!time.expired) return;
    try {
      const trialStarted = localStorage.getItem('neting_trial_started');
      const modalDismissed = localStorage.getItem('neting_expired_modal_dismissed');
      if (trialStarted === 'true' && modalDismissed !== 'true') {
        // Pequeño delay para que el contador llegue visualmente a 0
        const id = setTimeout(() => {
          setShowExpiredModal(true);
          // Trackear evento de analytics: usuario perdió la promo
          // sendBeacon es más fiable que fetch (no bloquea, garantiza entrega)
          try {
            navigator.sendBeacon(
              '/api/analytics/event',
              JSON.stringify({
                event: 'neting_promo_expired_modal_shown',
                metadata: { billing, page: 'neting' },
              })
            );
          } catch {}
        }, 1200);
        return () => clearTimeout(id);
      }
    } catch {}
  }, [time.expired]);

  const dismissExpiredModal = () => {
    try { localStorage.setItem('neting_expired_modal_dismissed', 'true'); } catch {}
    setShowExpiredModal(false);
  };

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

        {/* ═══ SLIDE 5 · PRICING (calco exacto del home) ══════════════════ */}
        <section
          id="pricing"
          aria-labelledby="pricing-heading"
          className="vl-pricing-section snap-start"
          style={{ minHeight: '100vh' }}
        >
          <div className="vl-glass vl-ring-soft vl-pricing-box">
              <div className="vl-pricing-grid">
                {/* ─── LEFT · Info + Price Display ─────────────────── */}
                <div className="vl-pricing-intro">
                  <div className="vl-pricing-intro-copy">
                    <p className="vl-pricing-eyebrow flex items-center gap-2 text-emerald-400">
                      <Sparkles className="w-4 h-4" aria-hidden="true" /> Exclusivo Neting
                    </p>
                    <h2 id="pricing-heading" className="vl-h2">
                      Planes CRM Ventas
                    </h2>
                    <p className="vl-pricing-text">
                      Acceso completo, automatización incluida, actualizaciones.
                      Con Setup Asistido bonificado por tiempo limitado.
                    </p>
                  </div>

                  <div className="vl-ring-soft vl-pricing-main-card relative">
                    {/* 20% OFF flotante (desktop) */}
                    <div className="absolute top-4 right-4 hidden sm:block z-10">
                      <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400 text-emerald-950 font-black uppercase tracking-wider rounded-full text-xs px-3 py-1 shadow-lg shadow-emerald-500/30">
                        20% OFF Aplicado
                      </span>
                    </div>

                    <div className="vl-price-label-row">
                      <span className="vl-price-label">
                        {isAnnual ? 'Suscripción Anual' : 'Suscripción Mensual'}
                      </span>
                      {isAnnual && (
                        <span className="vl-billing-badge bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold">
                          🔥 Máximo ahorro
                        </span>
                      )}
                    </div>

                    {/* Precio grande + tachado */}
                    <div className="vl-price-display">
                      <span className="vl-price-value">
                        €{planData.promo}
                      </span>
                      <span className="vl-price-suffix">
                        <span className="line-through text-slate-400 font-bold">Antes €{planData.original}</span>
                        {' '}{planData.monthlyEquivalentSuffix}
                      </span>
                    </div>

                    {/* Ahorro */}
                    <p className="vl-price-footnote text-emerald-400 font-medium">
                      Ahorras €{planData.original - planData.promo} con la promo Neting
                    </p>

                    {/* Setup + extras */}
                    <div className="vl-price-summary">
                      <div className="vl-summary-item border-emerald-500/40 bg-emerald-500/10">
                        <p className="vl-summary-label text-emerald-200 font-bold uppercase tracking-widest text-[10px]">
                          Setup Asistido
                        </p>
                        <p className="vl-summary-value text-emerald-300 flex items-center gap-2">
                          <span className="line-through text-slate-400 text-sm">
                            €{planData.setupOriginal}
                          </span>
                          <span className="font-black">€{planData.setupPromo}</span>
                        </p>
                      </div>
                      <div className="vl-summary-item">
                        <p className="vl-summary-label">Usuarios</p>
                        <p className="vl-summary-value">3 incluidos</p>
                      </div>
                      <div className="vl-summary-item">
                        <p className="vl-summary-label">Contactos</p>
                        <p className="vl-summary-value">2.000</p>
                      </div>
                    </div>

                    {/* Setup básico */}
                    <div className="mt-5">
                      <SetupBasico />
                    </div>
                  </div>
                </div>

                {/* ─── RIGHT · Controls + Features ────────────────── */}
                <div className="vl-pricing-controls">
                  {/* Toggle Mensual / Anual — segmentado visible */}
                  <div className="flex flex-col gap-3">
                    <span className="vl-field-label">Ciclo de facturación</span>
                    <div
                      role="radiogroup"
                      aria-label="Ciclo de facturación"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          setBilling((prev) => (prev === 'annual' ? 'monthly' : 'annual'));
                        }
                      }}
                      className="relative flex rounded-full bg-slate-800/80 border border-white/10 p-1 shadow-inner"
                    >
                      {/* Sliding background pill */}
                      <div
                        aria-hidden="true"
                        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 shadow-[0_0_18px_-3px_rgba(124,58,237,0.6)] transition-all duration-300 ease-out ${
                          isAnnual ? 'left-1' : 'left-1/2'
                        }`}
                      />
                      {/* Botón Anual */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isAnnual}
                        tabIndex={isAnnual ? 0 : -1}
                        onClick={() => setBilling('annual')}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                          isAnnual
                            ? 'text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        🔥 Anual
                        <span
                          aria-hidden={!isAnnual}
                          className={`absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-lg shadow-orange-500/40 transition-all duration-300 ${
                            isAnnual ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
                          }`}
                        >
                          Máx ahorro
                        </span>
                      </button>
                      {/* Botón Mensual */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!isAnnual}
                        tabIndex={!isAnnual ? 0 : -1}
                        onClick={() => setBilling('monthly')}
                        className={`relative z-10 flex-1 flex items-center justify-center rounded-full px-4 py-3 text-sm font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                          !isAnnual
                            ? 'text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Mensual
                      </button>
                    </div>
                    {/* Subtítulo dinámico según selección */}
                    <p className="text-xs text-slate-400 text-center">
                      {isAnnual
                        ? 'Setup por €149 · €470/año (ahorras €118)'
                        : 'Setup por €199 · €39/mes (ahorras €10/mes)'}
                    </p>
                  </div>

                  {/* Features checklist */}
                  <div className="vl-ring-soft vl-slider-field">
                    <span className="vl-field-label">
                      ¿Qué incluye el plan?
                    </span>
                    <ul className="space-y-3.5">
                      {[
                        'Acceso completo a CRM y Ventas',
                        'Pipeline visual de oportunidades',
                        'Automatización de seguimiento',
                        'Contactos y leads centralizados',
                        'Reportes y analytics',
                        isAnnual
                          ? 'Acceso anticipado a funciones'
                          : 'Actualizaciones periódicas',
                      ].map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-slate-200 text-sm"
                        >
                          <CheckCircle2
                            className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CTA final */}
                  <div className="vl-pricing-assurance">
                    <p className="vl-assurance-text">
                      Activa tu plan ahora con{' '}
                      <span className="vl-assurance-price">
                        {isAnnual ? '€149' : '€199'}
                      </span>{' '}
                      de setup y{' '}
                      <span className="vl-assurance-price">
                        €{planData.promo}{planData.suffix}
                      </span>{' '}
                      de suscripción.
                    </p>
                    <Link
                      href={promoCtaHref}
                      className="vl-btn vl-btn-primary w-full justify-center flex items-center text-lg shadow-[0_0_40px_-10px_rgba(124,58,237,0.5)] mt-5"
                    >
                      <Rocket
                        className="w-5 h-5 mr-3"
                        aria-hidden="true"
                      />
                      Activar Plan {isAnnual ? 'Anual' : 'Mensual'}
                    </Link>
                    <p className="text-center text-xs text-slate-400 mt-4 max-w-[280px] mx-auto">
                      IVA no incluido. Activación exclusiva cualificada en Neting.
                      Pago vía Stripe.
                    </p>
                  </div>
                </div>
              </div>
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

      {/* ═══ MODAL · Promoción expirada (solo si inició trial) ═══════════ */}
      {showExpiredModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expired-modal-title"
          onKeyDown={(e) => { if (e.key === 'Escape') dismissExpiredModal(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="vl-glass vl-ring-soft rounded-[28px] p-6 sm:p-10 max-w-lg w-full border border-rose-500/40 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl shadow-rose-500/20 my-auto"
          >
            {/* Icon + Title */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/40 mb-4">
                <AlertTriangle className="w-7 h-7 text-rose-300" aria-hidden="true" />
              </div>
              <h2 id="expired-modal-title" className="text-xl sm:text-2xl font-black text-white mb-2">
                La promoción Neting ha terminado
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                El plazo de la oferta con{' '}
                <span className="text-emerald-400 font-bold">20% OFF</span> y{' '}
                <span className="text-emerald-400 font-bold">Setup con descuento</span>{' '}
                venció mientras estabas en prueba. Estos son los precios estándar actuales:
              </p>
            </div>

            {/* Pricing cards — standard (no promo) */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {/* Mensual */}
              <div className="vl-ring-soft rounded-xl p-4 bg-slate-950/60 border border-white/10 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Mensual</p>
                <p className="text-2xl font-black text-white tabular-nums">€49</p>
                <p className="text-xs text-slate-500">/mes</p>
                <div className="mt-2 pt-2 border-t border-white/5">
                  <p className="text-[10px] text-slate-500">Setup</p>
                  <p className="text-sm font-bold text-slate-300">€299</p>
                </div>
              </div>
              {/* Anual */}
              <div className="vl-ring-soft rounded-xl p-4 bg-slate-950/60 border border-white/10 text-center relative">
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-amber-950 text-[9px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap">
                  -20% fact anual
                </span>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mt-1">Anual</p>
                <p className="text-2xl font-black text-white tabular-nums">€588</p>
                <p className="text-xs text-slate-500">/año (€49/mes)</p>
                <div className="mt-2 pt-2 border-t border-white/5">
                  <p className="text-[10px] text-slate-500">Setup</p>
                  <p className="text-sm font-bold text-slate-300">€299</p>
                </div>
              </div>
            </div>

            {/* Lo que pierdes */}
            <div className="vl-ring-soft rounded-xl p-4 bg-rose-500/10 border border-rose-500/25 mb-6">
              <p className="text-[10px] font-black text-rose-300 uppercase tracking-widest mb-2">
                Lo que perdiste por no activar a tiempo
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Mensual: </span>
                  <span className="text-rose-300 line-through">€39</span>
                  <span className="text-white font-bold"> → €49</span>
                  <span className="text-rose-400 ml-1">+€10/mes</span>
                </div>
                <div>
                  <span className="text-slate-400">Setup: </span>
                  <span className="text-rose-300 line-through">€149-199</span>
                  <span className="text-white font-bold"> → €299</span>
                </div>
              </div>
            </div>

            {/* CTA + Dismiss */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/checkout?usuarios=3&contactos=2000&plan=scale&interval=monthly"
                onClick={() => {
                  // Trackear conversión post-promo: usuario acepta precio estándar
                  try {
                    navigator.sendBeacon(
                      '/api/analytics/event',
                      JSON.stringify({
                        event: 'neting_promo_expired_standard_price_clicked',
                        metadata: { billing, page: 'neting', source: 'expired_modal' },
                      })
                    );
                  } catch {}
                  dismissExpiredModal();
                }}
                className="vl-btn vl-btn-primary flex-1 justify-center text-sm py-3 group"
              >
                Activar con precio estándar
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={dismissExpiredModal}
                className="vl-btn vl-btn-secondary flex-1 justify-center text-sm py-3"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
