'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, Lightbulb, RefreshCcw, Zap, Target, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/components/ui/use-toast";

interface Suggestion {
  name: string;
  triggerType: string;
  logic: string;
  action: string;
  reason: string;
}

export const GemmaMarketingAdvisor = () => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAdvice = async () => {
    setIsLoading(true);
    try {
      // Simulamos la llamada al skill a través de un endpoint API
      const res = await fetch('/api/marketing/ai/advise');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error("Error fetching AI advice:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdvice();
  }, []);

  const createRuleFromSuggestion = async (suggestion: Suggestion) => {
    try {
      const res = await fetch('/api/marketing/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: suggestion.name,
          triggerType: suggestion.triggerType,
          conditions: { logic: suggestion.logic },
          actions: [{ type: 'START_NURTURING', details: suggestion.action }],
          isActive: false // Se crea desactivada para revisión
        })
      });

      if (res.ok) {
        toast({
          title: "Sugerencia aplicada",
          description: "La regla ha sido creada en borrador. Revísala en Automatización.",
        });
      }
    } catch (error) {
      toast({ title: "Error", description: "No se pudo crear la regla.", variant: "destructive" });
    }
  };

  return (
    <Card className="border-none shadow-xl bg-gradient-to-br from-indigo-900 via-slate-900 to-black text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 p-8 opacity-10">
        <Sparkles className="w-32 h-32 text-indigo-400" />
      </div>

      <CardHeader className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">Gemma 4 Advisor</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchAdvice} 
            disabled={isLoading}
            className="text-indigo-300 hover:text-white hover:bg-white/10"
          >
            <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
        <CardDescription className="text-indigo-200/70">
          Inteligencia Artificial analizando tus datos en tiempo real para optimizar el crecimiento.
        </CardDescription>
      </CardHeader>

      <CardContent className="relative z-10 space-y-4">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center space-y-4"
            >
              <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-sm text-indigo-200 animate-pulse">Analizando comportamiento del tenant...</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {suggestions.map((suggestion, idx) => (
                <motion.div
                  key={idx}
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 transition-colors group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-indigo-500/30 rounded text-indigo-300">
                        <Zap className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-sm text-indigo-100">{suggestion.name}</h4>
                    </div>
                    <Badge className="bg-indigo-500/20 text-indigo-300 border-none text-[10px]">
                      {suggestion.triggerType}
                    </Badge>
                  </div>
                  
                  <p className="text-xs text-indigo-200/80 mb-4 italic line-clamp-2">
                    "{suggestion.reason}"
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center space-x-4 text-[10px] text-indigo-300/60 uppercase font-bold tracking-widest">
                      <div className="flex items-center">
                        <Target className="w-3 h-3 mr-1" /> {suggestion.logic.split(' ')[0]}
                      </div>
                      <div className="flex items-center">
                        <TrendingUp className="w-3 h-3 mr-1" /> +15% Conv.
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => createRuleFromSuggestion(suggestion)}
                      className="h-8 text-xs text-white hover:bg-indigo-600 group-hover:bg-indigo-600 transition-all"
                    >
                      Aplicar <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        <div className="pt-4 border-t border-white/10">
          <div className="flex items-start space-x-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <Lightbulb className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-100/80 leading-relaxed">
              <strong>Sugerencia Global:</strong> Tus campañas de email tienen un open-rate 20% superior los jueves por la tarde. Considera reprogramar tus secuencias activas.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
