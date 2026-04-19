'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

interface TrustBarProps {
  logos: Array<{ name: string; logo: string }>;
  vaultCount: number;
}

export const TrustBar = ({ logos, vaultCount }: TrustBarProps) => {
  return (
    <div className="bg-slate-950 border-y border-slate-900 py-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          {/* Real-time Proof */}
          <div className="flex items-center gap-4 bg-blue-500/5 border border-blue-500/10 px-6 py-3 rounded-full">
            <div className="relative">
               <ShieldCheck className="w-6 h-6 text-blue-400" />
               <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">The Vault Status</p>
              <p className="text-white font-mono font-medium">
                Operaciones protegidas: <span className="text-blue-400">{vaultCount.toLocaleString()}</span>
              </p>
            </div>
          </div>

          {/* Logos Carousel (Static but could be animated) */}
          <div className="flex-1 overflow-hidden">
            <p className="text-center md:text-left text-slate-500 text-sm mb-6 font-medium uppercase tracking-wider">
              Empresas que confían en Volkern
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-8 opacity-40 grayscale hover:grayscale-0 transition-all">
              {logos.map((client, i) => (
                <img 
                  key={i}
                  src={client.logo} 
                  alt={client.name} 
                  className="h-8 w-auto object-contain"
                  onError={(e) => {
                    (e.target as any).style.display = 'none';
                  }}
                />
              ))}
              {/* Fallback text logos if images missing */}
              {logos.length === 0 && (
                 <>
                  <span className="text-xl font-bold text-slate-600">INDUSTRIAL</span>
                  <span className="text-xl font-bold text-slate-600">LOGISTICS</span>
                  <span className="text-xl font-bold text-slate-600">NEXUS_CORE</span>
                 </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
