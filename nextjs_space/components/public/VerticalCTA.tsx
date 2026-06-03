'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VerticalCTAProps {
  title: string;
  description: string;
  buttonText: string;
  buttonHref: string;
  secondaryText: string;
  secondaryHref: string;
  accentColor: 'emerald' | 'blue' | 'purple' | 'amber' | 'orange' | 'rose' | 'cyan';
}

const accentMap: Record<string, { from: string; via: string; to: string; btn: string; hover: string }> = {
  emerald: {
    from: 'from-emerald-600',
    via: 'via-emerald-700',
    to: 'to-slate-950',
    btn: 'bg-emerald-600 hover:bg-emerald-500',
    hover: 'group-hover:text-emerald-400',
  },
  blue: {
    from: 'from-blue-600',
    via: 'via-blue-700',
    to: 'to-slate-950',
    btn: 'bg-blue-600 hover:bg-blue-500',
    hover: 'group-hover:text-blue-400',
  },
  purple: {
    from: 'from-purple-600',
    via: 'via-purple-700',
    to: 'to-slate-950',
    btn: 'bg-purple-600 hover:bg-purple-500',
    hover: 'group-hover:text-purple-400',
  },
  amber: {
    from: 'from-amber-600',
    via: 'via-amber-700',
    to: 'to-slate-950',
    btn: 'bg-amber-600 hover:bg-amber-500',
    hover: 'group-hover:text-amber-400',
  },
  orange: {
    from: 'from-orange-600',
    via: 'via-orange-700',
    to: 'to-slate-950',
    btn: 'bg-orange-600 hover:bg-orange-500',
    hover: 'group-hover:text-orange-400',
  },
  rose: {
    from: 'from-[#F43F5E]',
    via: 'via-[#E11D48]',
    to: 'to-slate-950',
    btn: 'bg-[#F43F5E] hover:bg-[#E11D48]',
    hover: 'group-hover:text-[#F43F5E]',
  },
  cyan: {
    from: 'from-[#20B9E8]',
    via: 'via-[#0891B2]',
    to: 'to-slate-950',
    btn: 'bg-[#20B9E8] hover:bg-[#0891B2]',
    hover: 'group-hover:text-[#20B9E8]',
  },
};

export const VerticalCTA = ({
  title,
  description,
  buttonText,
  buttonHref,
  secondaryText,
  secondaryHref,
  accentColor,
}: VerticalCTAProps) => {
  const a = accentMap[accentColor];

  return (
    <section className={`py-24 bg-gradient-to-b ${a.from} ${a.via} ${a.to} relative overflow-hidden`}>
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <Sparkles className="w-10 h-10 text-white/30 mx-auto mb-6" />
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">{title}</h2>
          <p className="text-xl text-white/70 mb-10 leading-relaxed">{description}</p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href={buttonHref}>
              <Button size="lg" className={`${a.btn} text-white px-10 py-6 text-lg rounded-xl group font-bold shadow-xl`}>
                {buttonText}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <a href={secondaryHref}>
              <Button variant="outline" size="lg" className="bg-transparent border-white/30 text-white hover:bg-white/15 px-10 py-6 text-lg rounded-xl">
                {secondaryText}
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
