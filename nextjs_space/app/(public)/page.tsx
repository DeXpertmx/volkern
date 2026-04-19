import React from 'react';
import { Hero } from '@/components/public/Hero';
import { TrustBar } from '@/components/public/TrustBar';
import { Pricing } from '@/components/public/Pricing';
import { LeadForm } from '@/components/public/LeadForm';
import { WebSyncService } from '@/lib/marketing/web-sync-service';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Revalidar cada minuto para mantener los datos "frescos"

export default async function LandingPage() {
  // Fetch live data from the ERP ecosystem
  const [plans, vaultCount, clientLogos] = await Promise.all([
    WebSyncService.getActivePlans(),
    WebSyncService.getVaultProofCount(),
    WebSyncService.getClientLogos()
  ]);

  return (
    <div className="flex flex-col">
      {/* Componentes marcados con data-block para integración con WebCreator/GrapesJS */}
      
      <div data-block="hero-machine">
        <Hero />
      </div>

      <div data-block="trust-protocol">
        <TrustBar logos={clientLogos} vaultCount={vaultCount} />
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

      <div data-block="lead-closer">
        <LeadForm />
      </div>
    </div>
  );
}
