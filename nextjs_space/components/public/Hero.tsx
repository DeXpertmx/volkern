'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, PlayCircle } from 'lucide-react';

export const Hero = () => {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center pt-20 overflow-hidden bg-slate-950">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="container mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 border border-blue-500/20">
            Nexus OS: La Evolución del ERP
          </span>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-8 leading-tight tracking-tight">
            Vende, Opera y Automatiza <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
              desde un solo lugar.
            </span>
          </h1>
          
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            La infraestructura soberana que unifica Marketing, Ventas y Operaciones. 
            IA propia, datos protegidos y el control total de tu ecosistema digital.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-6 text-lg rounded-xl group">
              Solicitar Demo
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <Button variant="outline" size="lg" className="border-slate-800 text-slate-300 hover:bg-slate-900 px-8 py-6 text-lg rounded-xl">
              <PlayCircle className="mr-2 w-5 h-5" />
              Ver Ecosistema
            </Button>
          </div>
        </motion.div>

        {/* Dashboard Preview Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 50 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="mt-12 relative mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/50 p-2 shadow-2xl shadow-blue-900/20 overflow-hidden"
        >
          <div className="aspect-[16/9] bg-slate-900 rounded-lg flex items-center justify-center">
             <img 
               src="/assets/landing/laptop-volkern-1.png" 
               alt="Volkern Dashboard Preview" 
               className="w-full h-full object-contain rounded-lg"
               onError={(e) => {
                 (e.target as any).src = "https://images.unsplash.com/photo-1551288049-bbbda5366391?q=80&w=2070&auto=format&fit=crop";
               }}
             />
          </div>
        </motion.div>
      </div>
    </section>
  );
};
