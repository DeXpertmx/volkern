'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SetupBasico from '@/components/public/SetupBasico';
import { calcularPrecio, type PlanTipo } from '@/lib/pricing-engine';
import './landing-new.css';

/* ─── Types ───────────────────────────────────────────────────────────────── */
type Currency = 'EUR' | 'USD';
type Billing = 'monthly' | 'annual';

interface ModuleItem {
  title: string;
  description: string;
  icon: string;
  iconBg: string;
  borderColor: string;
}

/* ─── Constants ───────────────────────────────────────────────────────────── */
const MODULES: ModuleItem[] = [
  {
    title: 'Ventas & CRM',
    description:
      'Leads, pipelines, seguimiento comercial, historial de clientes y gestión de oportunidades en un solo flujo.',
    icon: 'https://api.iconify.design/lucide-badge-dollar-sign.svg?color=%23a7f3d0',
    iconBg: 'rgba(110, 231, 183, .12)',
    borderColor: 'rgba(110, 231, 183, .2)',
  },
  {
    title: 'Comunicación Omnicanal',
    description:
      'WhatsApp, email, formularios, tickets y conversaciones centralizadas para responder mejor y más rápido.',
    icon: 'https://api.iconify.design/lucide-messages-square.svg?color=%23bfdbfe',
    iconBg: 'rgba(147, 197, 253, .12)',
    borderColor: 'rgba(147, 197, 253, .2)',
  },
  {
    title: 'Marketing & Crecimiento',
    description:
      'Campañas, embudos, segmentación, captación y activación de usuarios conectados con tus datos reales.',
    icon: 'https://api.iconify.design/lucide-megaphone.svg?color=%23ddd6fe',
    iconBg: 'rgba(196, 181, 253, .12)',
    borderColor: 'rgba(196, 181, 253, .2)',
  },
  {
    title: 'Automatización & IA',
    description:
      'Workflows, reglas, asistentes y automatizaciones inteligentes para reducir tareas repetitivas y acelerar decisiones.',
    icon: 'https://api.iconify.design/lucide-bot.svg?color=%23fed7aa',
    iconBg: 'rgba(251, 191, 36, .12)',
    borderColor: 'rgba(251, 191, 36, .2)',
  },
  {
    title: 'Operación Empresarial',
    description:
      'Proyectos, procesos, tareas, equipos y seguimiento operativo para mantener el control sin fragmentación.',
    icon: 'https://api.iconify.design/lucide-building-2.svg?color=%23fde68a',
    iconBg: 'rgba(252, 211, 77, .12)',
    borderColor: 'rgba(252, 211, 77, .2)',
  },
  {
    title: 'Academia & Expansión',
    description:
      'Formación, onboarding, documentación y escalabilidad comercial para crecer con procesos repetibles.',
    icon: 'https://api.iconify.design/lucide-graduation-cap.svg?color=%23a5f3fc',
    iconBg: 'rgba(165, 243, 252, .12)',
    borderColor: 'rgba(165, 243, 252, .2)',
  },
];

function fmtPrecio(n: number) {
  return n.toLocaleString('es-ES')
}

function fmtUsuarios(n: number) {
  if (n >= 99) return '99+'
  return String(n)
}

function fmtContactos(n: number) {
  if (n >= 99000) return '99.000+'
  if (n >= 1000) return `${(n / 1000).toFixed(0)}.000`
  return n.toLocaleString('es-ES')
}

/* ─── Component ───────────────────────────────────────────────────────────── */
export function NewLanding() {
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [billing, setBilling] = useState<Billing>('monthly');
  const [users, setUsers] = useState(1);
  const [contacts, setContacts] = useState(1000);
  const [plan, setPlan] = useState<PlanTipo>('scale');

  /* ─── Pricing calculations ──────────────────────────────────────────────── */
  const result = useMemo(
    () => calcularPrecio({ usuarios: users, contactos: contacts, plan }),
    [users, contacts, plan]
  )

  const pricing = useMemo(() => {
    const precioMostrar = billing === 'annual'
      ? Math.round(result.precio * 0.8)
      : result.precio

    const symbol = currency === 'USD' ? '$' : '€';

    return {
      symbol,
      total: result.precio,
      mostrar: precioMostrar,
      nivel: result.nivel,
      mensaje: result.mensaje,
      features: result.features,
      esMaximo: result.esMaximo,
      billingLabel: billing === 'annual' ? 'Anual -20%' : 'Mensual',
      suffix: billing === 'annual' ? '/mes facturado anual' : '/mes',
      usersLabel: fmtUsuarios(users) + (users === 1 ? ' usuario' : ' usuarios'),
      contactsLabel: fmtContactos(contacts) + ' contactos',
      planLabel: plan === 'compliance' ? 'Compliance Pro' : 'Scale',
    };
  }, [result, billing, currency, users, contacts, plan]);

  return (
    <div className="vl-landing">
      <div className="vl-page">
        {/* ═══ HERO ══════════════════════════════════════════════════════════ */}
        <header className="vl-hero-section">
          <div className="vl-hero-container">
            {/* Top Bar */}
            <div className="vl-glass vl-ring-soft vl-topbar">
              <Link href="/" className="vl-brand">
                <span className="vl-brand-mark">V</span>
                <span className="vl-brand-name">Volkern</span>
              </Link>
              <nav className="vl-topnav">
                <a href="#modulos" className="vl-link vl-toplink">
                  Módulos
                </a>
                <a href="#pricing" className="vl-link vl-toplink">
                  Pricing
                </a>
              </nav>
            </div>

            {/* Hero Content */}
            <section className="vl-glass vl-ring-soft vl-hero-content">
              <div className="vl-hero-badge-row">
                <span className="vl-hero-badge-dot" />
                <span>Una sola plataforma para reemplazar múltiples herramientas</span>
              </div>

              <div className="vl-hero-text-group">
                <h1 className="vl-h1">El sistema operativo de tu negocio</h1>
                <p className="vl-hero-subtitle">
                  CRM, marketing, comunicación, automatización e IA en una sola plataforma.
                </p>
              </div>

              <div className="vl-hero-actions">
                <a href="#pricing" className="vl-btn vl-btn-primary">
                  Comenzar
                </a>
                <a href="#modulos" className="vl-btn vl-btn-secondary">
                  Ver plataforma
                </a>
              </div>

              <div className="vl-hero-highlights">
                <div className="vl-ring-soft vl-highlight-card">
                  <p className="vl-highlight-label">Menos fricción</p>
                  <p className="vl-highlight-text">
                    Centraliza procesos, equipos y datos sin depender de herramientas desconectadas.
                  </p>
                </div>
                <div className="vl-ring-soft vl-highlight-card">
                  <p className="vl-highlight-label">Más velocidad</p>
                  <p className="vl-highlight-text">
                    Automatiza ventas, soporte y operaciones para escalar con menos esfuerzo manual.
                  </p>
                </div>
                <div className="vl-ring-soft vl-highlight-card">
                  <p className="vl-highlight-label">Visión total</p>
                  <p className="vl-highlight-text">
                    Conecta CRM, marketing, comunicación, operación e IA en un único sistema.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </header>

        <main>
          {/* ═══ MODULES ═══════════════════════════════════════════════════════ */}
          <section id="modulos" className="vl-modules-section">
            <div className="vl-section-heading">
              <p className="vl-section-eyebrow">Plataforma unificada</p>
              <h2 className="vl-h2">Más de 50 módulos incluidos</h2>
              <p className="vl-section-subtitle">
                Todo lo que necesitas para operar tu negocio ya está integrado
              </p>
            </div>

            <div className="vl-modules-grid">
              {MODULES.map((mod) => (
                <article
                  key={mod.title}
                  className="vl-module-card vl-ring-soft"
                  style={{ borderColor: mod.borderColor }}
                >
                  <div className="vl-module-icon-wrap vl-ring-soft" style={{ backgroundColor: mod.iconBg }}>
                    <img src={mod.icon} alt={mod.title} className="vl-module-icon" />
                  </div>
                  <div className="vl-module-content">
                    <h3 className="vl-module-title">{mod.title}</h3>
                    <p className="vl-module-desc">{mod.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ═══ PRICING ═══════════════════════════════════════════════════════ */}
          <section id="pricing" className="vl-pricing-section">
            <div className="vl-glass vl-ring-soft vl-pricing-box">
              <div className="vl-pricing-grid">
                {/* Left: Info + Price Display */}
                <div className="vl-pricing-intro">
                  <div className="vl-pricing-intro-copy">
                    <p className="vl-pricing-eyebrow">Pricing dinámico</p>
                    <h2 className="vl-h2">Un precio que hace obvio el cambio</h2>
                    <p className="vl-pricing-text">
                      Configura usuarios, contactos, moneda y facturación. Verás en tiempo real
                      cuánto cuesta operar con Volkern frente a seguir pagando varias herramientas
                      separadas.
                    </p>
                  </div>

                  <div className="vl-ring-soft vl-pricing-main-card">
                    <div className="vl-price-label-row">
                      <div className="flex items-center gap-2">
                        <span className="vl-price-label">Precio estimado</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          plan === 'compliance'
                            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                            : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        }`}>{pricing.planLabel}</span>
                      </div>
                      <span className="vl-billing-badge">{pricing.billingLabel}</span>
                    </div>
                    <div className="vl-price-display">
                      <span className="vl-price-value">
                        {pricing.symbol + pricing.mostrar}
                      </span>
                      <span className="vl-price-suffix">{pricing.suffix}</span>
                    </div>
                    <p className="vl-price-footnote">
                      {pricing.mensaje}
                    </p>
                    <div className="vl-price-summary">
                      <div className="vl-summary-item border-emerald-500/40 bg-emerald-500/10">
                        <p className="vl-summary-label">Capacidad</p>
                        <p className="vl-summary-value">{pricing.usersLabel} · {pricing.contactsLabel}</p>
                      </div>
                    </div>

                    {/* Setup básico */}
                    <div className="mt-5">
                      <SetupBasico />
                    </div>

                    {/* Usuarios adicionales footnote */}
                    <p className="text-[10px] text-slate-500 text-center mt-4">
                      Usuarios adicionales desde €10/mes c/u
                    </p>

                    {/* CTA → Checkout */}
                    <a
                      href={`/checkout?usuarios=${users}&contactos=${contacts}&plan=${plan}&interval=${billing === 'annual' ? 'yearly' : 'monthly'}&precio=${pricing.mostrar}`}
                      className="vl-btn vl-btn-primary w-full mt-5 text-center"
                    >
                      Ir a activar →
                    </a>
                  </div>
                </div>

                {/* Right: Controls */}
                <div className="vl-pricing-controls">
                  <div className="vl-selectors-grid">
                    <label className="vl-selector-field">
                      <span className="vl-field-label">Moneda</span>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as Currency)}
                        className="vl-field-select"
                      >
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                      </select>
                    </label>

                    <label className="vl-selector-field">
                      <span className="vl-field-label">Facturación</span>
                      <select
                        value={billing}
                        onChange={(e) => setBilling(e.target.value as Billing)}
                        className="vl-field-select"
                      >
                        <option value="monthly">Mensual</option>
                        <option value="annual">Anual -40%</option>
                      </select>
                    </label>
                  </div>

                  {/* Users Slider */}
                  <div className="vl-ring-soft vl-slider-field">
                    <div className="vl-slider-header">
                      <div className="vl-slider-title-group">
                        <span className="vl-slider-label">Usuarios</span>
                        <span className="vl-slider-help">
                          Base incluye 1 usuario. Cada usuario adicional suma 20.
                        </span>
                      </div>
                      <span className="vl-slider-value-badge">{pricing.usersLabel}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={99}
                      step={1}
                      value={users}
                      onChange={(e) => setUsers(Number(e.target.value))}
                      className="vl-pricing-range"
                    />
                    <div className="vl-slider-ends">
                      <span>1</span>
                      <span>99</span>
                    </div>
                  </div>

                  {/* Contacts Slider */}
                  <div className="vl-ring-soft vl-slider-field">
                    <div className="vl-slider-header">
                      <div className="vl-slider-title-group">
                        <span className="vl-slider-label">Contactos</span>
                        <span className="vl-slider-help">
                          Base incluye 1.000 contactos. Cada 1.000 adicionales suma 5.
                        </span>
                      </div>
                      <span className="vl-slider-value-badge">{pricing.contactsLabel}</span>
                    </div>
                    <input
                      type="range"
                      min={1000}
                      max={99000}
                      step={1000}
                      value={contacts}
                      onChange={(e) => setContacts(Number(e.target.value))}
                      className="vl-pricing-range"
                    />
                    <div className="vl-slider-ends">
                      <span>1.000</span>
                      <span>99.000</span>
                    </div>
                  </div>

                  {/* Plan toggle */}
                  <div className="vl-ring-soft vl-slider-field">
                    <div className="vl-slider-header">
                      <span className="vl-slider-label">Modalidad</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPlan('scale')}
                        className={`flex-1 p-3 rounded-xl border transition-all text-left ${
                          plan === 'scale'
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                        }`}
                        aria-pressed={plan === 'scale'}
                      >
                        <p className={`text-xs font-black uppercase ${plan === 'scale' ? 'text-white' : 'text-slate-400'}`}>Scale</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Funcionalidades base</p>
                      </button>
                      <button
                        onClick={() => setPlan('compliance')}
                        className={`flex-1 p-3 rounded-xl border transition-all text-left ${
                          plan === 'compliance'
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                        }`}
                        aria-pressed={plan === 'compliance'}
                      >
                        <p className={`text-xs font-black uppercase ${plan === 'compliance' ? 'text-white' : 'text-slate-400'}`}>Compliance</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">+25% control</p>
                      </button>
                    </div>
                  </div>

                  <div className="vl-pricing-assurance">
                    <p className="vl-assurance-text">
                      Volkern no es una herramienta más. Es la capa operativa que unifica
                      ventas, marketing, comunicación, automatización e IA para que pagar{' '}
                      <span className="vl-assurance-price">
                        {pricing.symbol + pricing.mostrar}
                      </span>{' '}
                      se sienta ridículamente rentable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ DIFFERENTIAL ══════════════════════════════════════════════════ */}
          <section className="vl-differential-section">
            <p className="vl-differential-eyebrow">La diferencia Volkern</p>
            <h2 className="vl-h2">
              No estás comprando herramientas.
              <br />
              Estás activando un sistema completo.
            </h2>
            <p className="vl-differential-subtitle">
              CRM + Marketing + Comunicación + Operación + IA. Todo conectado.
            </p>
          </section>

          {/* ═══ FINAL CTA ═════════════════════════════════════════════════════ */}
          <section className="vl-final-cta-section">
            <div className="vl-ring-soft vl-final-cta-card">
              <div className="vl-final-cta-content">
                <p className="vl-final-cta-eyebrow">Cambio de categoría</p>
                <h2 className="vl-h2">Menos herramientas. Más control.</h2>
                <p className="vl-final-cta-subtitle">
                  Reduce complejidad, baja costos y opera con una única plataforma pensada para
                  crecer contigo.
                </p>
                <Link
                  href={`/checkout?usuarios=${users}&contactos=${contacts}&plan=${plan}&interval=${billing === 'annual' ? 'yearly' : 'monthly'}&precio=${pricing.mostrar}`}
                  className="vl-final-cta-btn vl-btn"
                >
                  Activar Volkern
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
