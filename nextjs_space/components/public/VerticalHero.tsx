'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CTA {
  text: string;
  href: string;
}

interface VerticalHeroProps {
  badge: string;
  title: string;
  highlight: string;
  description: string;
  primaryCta: CTA;
  secondaryCta: CTA;
  accentColor: 'emerald' | 'blue' | 'purple' | 'amber' | 'orange' | 'rose' | 'cyan';
  /** Optional image to show instead of the placeholder dashboard */
  imageSrc?: string;
  /** Alt text for the dashboard image */
  imageAlt?: string;
}

const accentMap: Record<string, { text: string; border: string; bg: string; gradient: string; ring: string }> = {
  emerald: {
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/10',
    gradient: 'from-emerald-400 to-teal-500',
    ring: 'shadow-emerald-900/20',
  },
  blue: {
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/10',
    gradient: 'from-blue-400 to-indigo-500',
    ring: 'shadow-blue-900/20',
  },
  purple: {
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    bg: 'bg-purple-500/10',
    gradient: 'from-purple-400 to-pink-500',
    ring: 'shadow-purple-900/20',
  },
  amber: {
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/10',
    gradient: 'from-amber-400 to-orange-500',
    ring: 'shadow-amber-900/20',
  },
  orange: {
    text: 'text-orange-400',
    border: 'border-orange-500/20',
    bg: 'bg-orange-500/10',
    gradient: 'from-orange-400 to-red-500',
    ring: 'shadow-orange-900/20',
  },
  rose: {
    text: 'text-[#F43F5E]',
    border: 'border-[#F43F5E]/20',
    bg: 'bg-[#F43F5E]/10',
    gradient: 'from-[#F43F5E] to-[#E11D48]',
    ring: 'shadow-[#F43F5E]/20',
  },
  cyan: {
    text: 'text-[#20B9E8]',
    border: 'border-[#20B9E8]/20',
    bg: 'bg-[#20B9E8]/10',
    gradient: 'from-[#20B9E8] to-[#0891B2]',
    ring: 'shadow-[#20B9E8]/20',
  },
};

export const VerticalHero = ({
  badge,
  title,
  highlight,
  description,
  primaryCta,
  secondaryCta,
  accentColor,
  imageSrc,
  imageAlt,
}: VerticalHeroProps) => {
  const a = accentMap[accentColor];

  return (
    <section className={`relative min-h-[85vh] flex items-center justify-center pt-20 overflow-hidden bg-slate-950`}>
      {/* Background Glow with accent */}
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full pointer-events-none opacity-20`}
        style={{
          background: accentColor === 'emerald' ? 'radial-gradient(ellipse, #059669 0%, transparent 70%)' :
            accentColor === 'blue' ? 'radial-gradient(ellipse, #2563eb 0%, transparent 70%)' :
            accentColor === 'purple' ? 'radial-gradient(ellipse, #7c3aed 0%, transparent 70%)' :
            accentColor === 'orange' ? 'radial-gradient(ellipse, #ea580c 0%, transparent 70%)' :
            accentColor === 'rose' ? 'radial-gradient(ellipse, #F43F5E 0%, transparent 70%)' :
            accentColor === 'cyan' ? 'radial-gradient(ellipse, #20B9E8 0%, transparent 70%)' :
            'radial-gradient(ellipse, #d97706 0%, transparent 70%)'
        }}
      />
      
      <div className="container mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <span className={`inline-block py-1 px-3 rounded-full ${a.bg} ${a.text} text-sm font-medium mb-6 border ${a.border}`}>
            {badge}
          </span>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
            {title} <br />
            <span className={`text-transparent bg-clip-text bg-gradient-to-r ${a.gradient}`}>
              {highlight}
            </span>
          </h1>
          
          <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            {description}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href={primaryCta.href}>
              <Button size="lg" className={`bg-${accentColor}-600 hover:bg-${accentColor}-500 text-white px-8 py-6 text-lg rounded-xl group`}
                style={{
                  backgroundColor: accentColor === 'emerald' ? '#059669' :
                    accentColor === 'blue' ? '#2563eb' :
                    accentColor === 'purple' ? '#7c3aed' :
                    accentColor === 'orange' ? '#ea580c' :
                    accentColor === 'rose' ? '#F43F5E' :
                    accentColor === 'cyan' ? '#20B9E8' :
                    '#d97706'
                }}
              >
                {primaryCta.text}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            
            <a href={secondaryCta.href}>
              <Button variant="outline" size="lg" className="bg-transparent border-slate-700 text-slate-200 hover:bg-slate-800/80 px-8 py-6 text-lg rounded-xl">
                <PlayCircle className="mr-2 w-5 h-5" />
                {secondaryCta.text}
              </Button>
            </a>
          </div>
        </motion.div>

        {/* Dashboard Preview Mockup — real image or fallback placeholder */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 50 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="mt-12 relative mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/50 p-2 shadow-2xl overflow-hidden"
          style={{ boxShadow: accentColor === 'emerald' ? '0 25px 50px -12px rgba(5, 150, 105, 0.25)' :
            accentColor === 'blue' ? '0 25px 50px -12px rgba(37, 99, 235, 0.25)' :
            accentColor === 'purple' ? '0 25px 50px -12px rgba(124, 58, 237, 0.25)' :
            accentColor === 'orange' ? '0 25px 50px -12px rgba(234, 88, 12, 0.25)' :
            accentColor === 'rose' ? '0 25px 50px -12px rgba(244, 63, 94, 0.25)' :
            accentColor === 'cyan' ? '0 25px 50px -12px rgba(32, 185, 232, 0.25)' :
            '0 25px 50px -12px rgba(217, 119, 6, 0.25)'
          }}
        >
          {imageSrc ? (
            <div className="aspect-[16/9] bg-slate-900 rounded-lg overflow-hidden">
              <img
                src={imageSrc}
                alt={imageAlt || `Dashboard ${badge}`}
                className="w-full h-full object-cover object-top rounded-lg"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="aspect-[16/9] bg-slate-900 rounded-lg flex items-center justify-center">
              <div className="text-slate-700 flex flex-col items-center gap-4">
                <div className="w-24 h-24 rounded-2xl bg-slate-800 flex items-center justify-center">
                  <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-slate-600">Dashboard {badge}</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
};
