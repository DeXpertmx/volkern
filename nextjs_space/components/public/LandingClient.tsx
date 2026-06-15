'use client'

import React from 'react';
import { Hero } from '@/components/public/Hero';
import { TrustBar } from '@/components/public/TrustBar';
import { Pricing } from '@/components/public/Pricing';
import { LeadForm } from '@/components/public/LeadForm';
import { VerticalShowcase } from '@/components/public/VerticalShowcase';
import { PublicLayout } from '@/components/public/PublicLayout';
import { PLANS, PLAN_PRICES, PLAN_LIMITS } from '@/lib/plans';

const plans = [
  {
    id: PLANS.ESENCIAL,
    nombre: 'Esencial',
    descripcion: 'Para autónomos y gestorías pequeñas que empiezan',
    slug: PLANS.ESENCIAL,
    precio: PLAN_PRICES[PLANS.ESENCIAL].monthly,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: PLAN_LIMITS[PLANS.ESENCIAL].users,
    limiteLeads: PLAN_LIMITS[PLANS.ESENCIAL].leads,
    whatsappHabilitado: false,
    whitelabelHabilitado: false,
    lmsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
  },
  {
    id: PLANS.PROFESIONAL,
    nombre: 'Profesional',
    descripcion: 'Para PYMES y gestorías en crecimiento',
    slug: PLANS.PROFESIONAL,
    precio: PLAN_PRICES[PLANS.PROFESIONAL].monthly,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: PLAN_LIMITS[PLANS.PROFESIONAL].users,
    limiteLeads: PLAN_LIMITS[PLANS.PROFESIONAL].leads,
    whatsappHabilitado: true,
    whitelabelHabilitado: false,
    lmsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
  },
  {
    id: PLANS.INFINITY,
    nombre: 'Infinity',
    descripcion: 'Para empresas y despachos grandes',
    slug: PLANS.INFINITY,
    precio: PLAN_PRICES[PLANS.INFINITY].monthly,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: PLAN_LIMITS[PLANS.INFINITY].users,
    limiteLeads: PLAN_LIMITS[PLANS.INFINITY].leads,
    whatsappHabilitado: true,
    whitelabelHabilitado: true,
    lmsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
  },
];

const clientLogos = [
  { name: 'Industrial Nexus', logo: '/assets/logos/client1.svg' },
  { name: 'Sovereign Lab', logo: '/assets/logos/client2.svg' },
  { name: 'Global Logistics', logo: '/assets/logos/client3.svg' },
];

export default function LandingClient() {
  return (
    <PublicLayout>
      <div className="flex flex-col">
        <div data-block="hero-machine">
          <Hero />
        </div>

        <div data-block="trust-protocol">
          <TrustBar logos={clientLogos} vaultCount={0} />
        </div>

        <div className="py-24 bg-slate-950 flex flex-col items-center">
          <div className="container mx-auto px-6 text-center">
              <h2 className="text-3xl font-bold mb-12">Nuestra Misión: Tu Soberanía</h2>
              <div className="grid md:grid-cols-3 gap-12 text-left">
                  {[
                      { title: "Independencia", desc: "No dependes de nubes propietarias. Tus datos, tu infraestructura." },
                      { title: "Automatización", desc: "Reduce la carga operativa con agentes de IA integrados nativamente." },
                      { title: "Escalabilidad", desc: "Diseñado para crecer de 1 a 1,000,000 de operaciones sin fricción." }
                  ].map((m, i) => (
                      <div key={i} className="p-8 bg-slate-900/30 border border-slate-800 rounded-2xl">
                          <h3 className="text-xl font-bold mb-4 text-blue-400">{m.title}</h3>
                          <p className="text-slate-400 leading-relaxed">{m.desc}</p>
                      </div>
                  ))}
              </div>
          </div>
        </div>

        <div data-block="pricing-engine">
          <Pricing plans={plans as any} />
        </div>

        <div data-block="vertical-showcase">
          <VerticalShowcase />
        </div>

        <div data-block="lead-closer">
          <LeadForm />
        </div>
      </div>
    </PublicLayout>
  );
}
