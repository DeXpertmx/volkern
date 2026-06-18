'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Building2,
  Calculator,
  PenTool,
  GraduationCap,
  Factory,
  UserCheck,
  Zap,
  Sparkles,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import { SOLUTION_MODULES, COLOR_MAP } from '@/lib/soluciones';

/* ─── Icon mapping ────────────────────────────────────────────────────────── */

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Zap,
  PenTool,
  Building2,
  Calculator,
  UserCheck,
  Factory,
  GraduationCap,
};

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function SolucionesIndex() {
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
         HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[50vh] flex items-center justify-center pt-24 pb-16 overflow-hidden bg-slate-950">
        {/* Background orbs */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-blue-600/12 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-purple-600/8 blur-[100px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
              <Layers className="w-4 h-4" />
              Soluciones verticales
            </span>

            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight tracking-tight">
              Cada industria tiene{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-500">
                su solución
              </span>
            </h1>

            <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
              Explora las soluciones verticales de Volkern. Comienza con lo que
              necesitas hoy y escala sin cambiar de sistema.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         SOLUTIONS GRID
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-24 bg-slate-900/50">
        <div className="container mx-auto px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {SOLUTION_MODULES.map((mod, i) => {
              const Icon = ICON_MAP[mod.iconKey];
              const c = COLOR_MAP[mod.color];
              const isLarge = i === 0;

              return (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className={`group relative block p-6 rounded-3xl border bg-slate-900/40 hover:bg-slate-900/80 transition-all duration-300 ${
                    c.border
                  } ${isLarge ? 'lg:col-span-2' : ''}`}
                >
                  {/* Glow on hover */}
                  <div
                    className={`absolute inset-0 rounded-3xl ${c.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                  />

                  <div className="relative z-10 flex flex-col h-full">
                    <div
                      className={`w-14 h-14 rounded-2xl ${c.bg} border ${c.border} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}
                    >
                      {Icon && <Icon className={`w-7 h-7 ${c.icon}`} />}
                    </div>

                    <h2 className="text-xl font-bold text-white mb-2 group-hover:text-blue-100 transition-colors">
                      {mod.name}
                    </h2>

                    <p className="text-sm text-slate-400 leading-relaxed mb-6 flex-1">
                      {mod.description}
                    </p>

                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest ${c.icon} group-hover:underline underline-offset-4`}
                    >
                      Conocer más
                      <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
         CTA
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-24 bg-slate-950">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-indigo-900/40 border border-slate-800 rounded-3xl p-10 md:p-14 relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[150px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

              <div className="relative z-10">
                <Sparkles className="w-10 h-10 text-blue-400 mx-auto mb-5" />

                <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
                  ¿No encuentras tu industria?
                </h2>

                <p className="text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
                  Volkern se adapta a cualquier vertical. Cuéntanos tu caso y te
                  mostramos cómo.
                </p>

                <Link href="/#demo">
                  <Button
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-6 text-base rounded-xl font-bold shadow-xl shadow-blue-600/30 group"
                  >
                    Solicitar demo
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
