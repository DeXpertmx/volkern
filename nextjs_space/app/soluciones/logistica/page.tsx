import React from 'react';
import dynamicImport from 'next/dynamic';
import { Building2 } from 'lucide-react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';
import { LogisticaProblemSection } from '@/components/public/logistica/LogisticaProblemSection';
import { LogisticaHowItWorks } from '@/components/public/logistica/LogisticaHowItWorks';
import { LogisticaUseCases } from '@/components/public/logistica/LogisticaUseCases';
import { LogisticaCompare } from '@/components/public/logistica/LogisticaCompare';
import { LogisticaResults } from '@/components/public/logistica/LogisticaResults';
import { LogisticaOffer } from '@/components/public/logistica/LogisticaOffer';

const VerticalHero = dynamicImport(
  () => import('@/components/public/VerticalHero').then(m => ({ default: m.VerticalHero })),
  { ssr: false, loading: () => <HeroSkeleton /> },
);

function HeroSkeleton() {
  return (
    <section className="relative min-h-[85vh] flex items-center justify-center pt-20 overflow-hidden bg-background dark:bg-slate-950">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(ellipse, #EAB308 0%, transparent 70%)' }}
      />
      <div className="container mx-auto px-6 relative z-10 text-center">
        <span className="inline-block py-1 px-3 rounded-full bg-yellow-500/10 text-yellow-400 text-sm font-medium mb-6 border border-yellow-500/20">Módulo de Logística</span>
        <h1 className="text-5xl md:text-7xl font-bold text-foreground dark:text-white mb-6 leading-tight tracking-tight">
          Controla tu cadena de suministro<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">de punta a punta</span>
        </h1>
        <p className="text-xl text-muted-foreground dark:text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
          Flota, almacenes, rutas y tracking GPS en una sola plataforma con WMS inteligente y planificación de rutas con IA.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="bg-yellow-600 text-slate-900 px-8 py-6 text-lg rounded-xl inline-flex items-center gap-2 font-bold">Agenda una demo</div>
          <div className="border border-border text-foreground/80 dark:border-slate-700 dark:text-slate-300 px-8 py-6 text-lg rounded-xl inline-flex items-center gap-2">Ver características</div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground/60 dark:text-slate-600">Optimiza tu logística sin cambiar tu operación actual.</p>
        <div className="mt-12 mx-auto max-w-5xl rounded-2xl border border-border dark:border-slate-800 bg-muted/50 dark:bg-slate-900/50 p-2 shadow-2xl overflow-hidden"
          style={{ boxShadow: '0 25px 50px -12px rgba(234, 179, 8, 0.25)' }}>
          <div className="aspect-[16/9] bg-muted dark:bg-slate-900 rounded-lg flex items-center justify-center">
            <div className="text-muted-foreground/50 dark:text-slate-700 flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-2xl bg-muted dark:bg-slate-800 flex items-center justify-center"><Building2 className="w-12 h-12 text-muted-foreground/40 dark:text-slate-600" /></div>
              <span className="text-sm font-medium text-muted-foreground/60 dark:text-slate-600">Dashboard Logística</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const metadata = {
  title: 'Volkern para Logística | Controla tu Cadena de Suministro de Punta a Punta',
  description: 'Flota, almacenes, rutas y tracking GPS en una sola plataforma con WMS inteligente, planificación de rutas con IA y trazabilidad end-to-end.',
};

export default function LogisticaPage() {
  return (
    <PublicLayout>
      {/* 1. HERO */}
      <VerticalHero
        badge="Módulo de Logística"
        title="Controla tu cadena de suministro"
        highlight="de punta a punta"
        description="Flota, almacenes, rutas y tracking GPS en una sola plataforma con WMS inteligente y planificación de rutas con IA."
        primaryCta={{ text: 'Agenda una demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver características', href: '#features' }}
        accentColor="yellow"
      />

      {/* 2. EL PROBLEMA */}
      <LogisticaProblemSection />

      {/* 3. FUNCIONALIDADES CLAVE */}
      <VerticalFeatureGrid
        id="features"
        title="Todo lo que necesitas para tu Operación Logística"
        subtitle="Desde la recepción en almacén hasta la entrega al cliente final. WMS, GPS, rutas y trazabilidad en un solo sistema."
        accentColor="yellow"
        features={[
          { icon: 'Truck', title: 'Gestión de Flota', description: 'Registro de vehículos, control de ITV, seguros, mantenimiento programado y asignación de conductores.' },
          { icon: 'MapPin', title: 'Tracking GPS en Tiempo Real', description: 'Localización en mapa interactivo con historial de rutas, geocercas y alertas automáticas.' },
          { icon: 'Package', title: 'WMS — Gestión de Almacén', description: 'Recepción con QR, ubicaciones inteligentes, picking optimizado, cross-docking e inventario cíclico.' },
          { icon: 'GitBranch', title: 'Trazabilidad End-to-End', description: 'Desde la orden de compra hasta la entrega. Auditoría completa con blockchain.' },
          { icon: 'Globe', title: 'Planificación de Rutas', description: 'Optimización con IA, consolidación de pedidos, ventanas horarias y cálculo de costes.' },
          { icon: 'Users', title: 'Conductores y Flotilla', description: 'APP móvil con firma digital POD, reportes de incidencias y partes de trabajo.' },
          { icon: 'BarChart3', title: 'KPIs Logísticos', description: 'OTIF, coste por envío, rotación de flota, ocupación de almacén y rentabilidad por ruta.' },
          { icon: 'Bot', title: 'IA Logística', description: 'Optimización de rutas, alertas de vehículos, previsión de retrasos y reorganización de almacén.' },
        ]}
      />

      {/* 4. CÓMO FUNCIONA */}
      <LogisticaHowItWorks />

      {/* 5. CASOS DE USO */}
      <LogisticaUseCases />

      {/* 6. TODO EN UNO */}
      <LogisticaCompare />

      {/* 7. RESULTADOS */}
      <LogisticaResults />

      {/* 8. OFERTA ESPECIAL */}
      <LogisticaOffer />

      {/* 9. CTA FINAL */}
      <VerticalCTA
        title="Digitaliza tu Cadena de Suministro"
        description="Automatiza tu logística, elimina papel, optimiza rutas y ofrece visibilidad total a tus clientes. Todo con trazabilidad criptográfica y soberanía de datos."
        buttonText="Agenda tu demo"
        buttonHref="/#demo"
        secondaryText="Empieza gratis"
        secondaryHref="/auth/signup"
        accentColor="yellow"
      />
    </PublicLayout>
  );
}
