'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Plan {
  id: string;
  nombre: string;
  descripcion: string;
  slug: string;
  precio: number;
  moneda: string;
  intervalo: string;
  limiteUsuarios: number;
  limiteLeads: number;
  whatsappHabilitado: boolean;
  whitelabelHabilitado: boolean;
  lmsHabilitado: boolean;
  automationsHabilitado: boolean;
  campaignsHabilitado: boolean;
}

interface PricingProps {
  plans: Plan[];
}

export const Pricing = ({ plans }: PricingProps) => {
  return (
    <section id="pricing" className="py-24 bg-slate-950">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Planes de Inversión Soberana</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Selecciona la infraestructura que mejor se adapte a tu escala. Sin sorpresas, 
            sin límites ocultos. Control total de tus costos.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <motion.div
              key={plan.id}
              whileHover={{ y: -10 }}
              className={`relative rounded-3xl p-8 border ${
                plan.slug === 'pro' 
                  ? 'bg-gradient-to-b from-blue-900/40 to-slate-900 border-blue-500 shadow-xl shadow-blue-900/20' 
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {plan.slug === 'pro' && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                  Más Popular
                </div>
              )}

              <h3 className="text-2xl font-bold text-white mb-2">{plan.nombre}</h3>
              <p className="text-slate-400 text-sm mb-6 min-h-[40px]">{plan.descripcion}</p>
              
              <div className="mb-8">
                <span className="text-4xl font-bold text-white">${plan.precio}</span>
                <span className="text-slate-500 ml-2">/ {plan.intervalo === 'mensual' ? 'mes' : 'año'}</span>
                <p className="text-xs text-slate-600 mt-1">Por usuario en el ecosistema</p>
              </div>

              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <Check className="w-5 h-5 text-blue-500" />
                  {plan.limiteUsuarios} Usuarios incluidos
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <Check className="w-5 h-5 text-blue-500" />
                  {plan.limiteLeads.toLocaleString()} Leads / mes
                </li>
                {plan.whatsappHabilitado && (
                  <li className="flex items-center gap-3 text-sm text-slate-300">
                    <Check className="w-5 h-5 text-blue-500" />
                    WhatsApp Marketing Native
                  </li>
                )}
                {plan.automationsHabilitado && (
                  <li className="flex items-center gap-3 text-sm text-slate-300">
                    <Check className="w-5 h-5 text-blue-500" />
                    Marketing Automation Engine
                  </li>
                )}
                {plan.whitelabelHabilitado && (
                  <li className="flex items-center gap-3 text-sm text-slate-300">
                    <Check className="w-5 h-5 text-blue-500" />
                    White Label / Dominio Propio
                  </li>
                )}
              </ul>

              <Button 
                variant={plan.slug === 'pro' ? 'default' : 'outline'}
                className={`w-full py-6 rounded-xl font-bold ${
                  plan.slug === 'pro' ? 'bg-blue-600 hover:bg-blue-500' : 'border-slate-800 text-slate-300'
                }`}
                onClick={() => window.location.href = `/auth/signup?plan=${plan.slug}`}
              >
                Comenzar ahora
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
