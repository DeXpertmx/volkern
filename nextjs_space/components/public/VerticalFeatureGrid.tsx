'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Globe, Network,  Calculator, Bot, BarChart3,
  FileSpreadsheet, ShieldCheck, FileCheck, Landmark, PieChart,
  Calendar, Receipt, Users, PenTool, MessageCircle, Workflow,
  Mail, GitBranch, BookOpen, GraduationCap, ShoppingCart,
  Factory, ClipboardCheck, Package, HardDrive, Truck, ScrollText,
  UserCheck, UserPlus, Clock, HeartHandshake, Award, FileText,
  TrendingUp, Target, DollarSign, LineChart, PhoneCall,
  LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Building2, Globe, Network, Calculator, Bot, BarChart3,
  FileSpreadsheet, ShieldCheck, FileCheck, Landmark, PieChart,
  Calendar, Receipt, Users, PenTool, MessageCircle, Workflow,
  Mail, GitBranch, BookOpen, GraduationCap, ShoppingCart,
  Factory, ClipboardCheck, Package, HardDrive, Truck, ScrollText,
  UserCheck, UserPlus, Clock, HeartHandshake, Award, FileText,
  TrendingUp, Target, DollarSign, LineChart, PhoneCall,
};

interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface VerticalFeatureGridProps {
  id?: string;
  title: string;
  subtitle: string;
  accentColor: 'emerald' | 'blue' | 'purple' | 'amber' | 'orange' | 'rose' | 'cyan';
  features: Feature[];
}

const accentStyles: Record<string, { glow: string; iconBg: string; iconBorder: string; iconColor: string }> = {
  emerald: {
    glow: 'shadow-emerald-900/10',
    iconBg: 'bg-emerald-500/10',
    iconBorder: 'border-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
  blue: {
    glow: 'shadow-blue-900/10',
    iconBg: 'bg-blue-500/10',
    iconBorder: 'border-blue-500/20',
    iconColor: 'text-blue-400',
  },
  purple: {
    glow: 'shadow-purple-900/10',
    iconBg: 'bg-purple-500/10',
    iconBorder: 'border-purple-500/20',
    iconColor: 'text-purple-400',
  },
  amber: {
    glow: 'shadow-amber-900/10',
    iconBg: 'bg-amber-500/10',
    iconBorder: 'border-amber-500/20',
    iconColor: 'text-amber-400',
  },
  orange: {
    glow: 'shadow-orange-900/10',
    iconBg: 'bg-orange-500/10',
    iconBorder: 'border-orange-500/20',
    iconColor: 'text-orange-400',
  },
  rose: {
    glow: 'shadow-[#F43F5E]/10',
    iconBg: 'bg-[#F43F5E]/10',
    iconBorder: 'border-[#F43F5E]/20',
    iconColor: 'text-[#F43F5E]',
  },
  cyan: {
    glow: 'shadow-[#20B9E8]/10',
    iconBg: 'bg-[#20B9E8]/10',
    iconBorder: 'border-[#20B9E8]/20',
    iconColor: 'text-[#20B9E8]',
  },
};

export const VerticalFeatureGrid = ({
  id,
  title,
  subtitle,
  accentColor,
  features,
}: VerticalFeatureGridProps) => {
  const s = accentStyles[accentColor];

  return (
    <section id={id} className="py-24 bg-slate-950 border-t border-slate-900">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">{title}</h2>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">{subtitle}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const IconComponent = iconMap[feature.icon] || ShieldCheck;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`group relative bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all duration-300 hover:shadow-lg ${s.glow}`}
              >
                <div className={`w-12 h-12 rounded-xl ${s.iconBg} border ${s.iconBorder} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <IconComponent className={`w-6 h-6 ${s.iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
