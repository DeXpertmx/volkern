'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Sun, 
  Rocket, 
  AlertCircle, 
  Zap, 
  ArrowRight,
  TrendingUp,
  Brain,
  ListTodo
} from 'lucide-react';
import { BriefingData } from '@/lib/sales/morning-briefing-service';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function MorningBriefingModal() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Solo mostrar una vez al día (simulado con localStorage)
    const lastShow = localStorage.getItem('last_morning_briefing');
    const today = new Date().toDateString();

    if (lastShow !== today) {
      fetchBriefing();
    }
  }, []);

  const fetchBriefing = async () => {
    try {
      const res = await fetch('/api/sales/morning-briefing');
      if (res.ok) {
        const briefing = await res.json();
        // Preferencia del perfil desactivada: no mostrar el modal hoy (misma
        // semántica de una-vez-al-día, sin volver a consultar en cada navegación).
        if (briefing.disabled) {
          localStorage.setItem('last_morning_briefing', new Date().toDateString());
          return;
        }
        setData(briefing);
        setOpen(true);
        localStorage.setItem('last_morning_briefing', new Date().toDateString());
      }
    } catch (error) {
      console.error('Error fetching briefing:', error);
    }
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl border-primary/20 bg-gradient-to-b from-primary/5 to-background">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 rounded-full">
              <Sun className="h-6 w-6 text-amber-600 animate-pulse" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black">¡Buenos días, Estratega!</DialogTitle>
              <DialogDescription className="font-medium text-primary/70">
                Gemma ha analizado tu cartera. Aquí está tu hoja de ruta para hoy.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Top 3 Prioridades */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Rocket className="h-4 w-4" />
              Tus 3 movimientos clave
            </h3>
            <div className="grid gap-3">
              {data.topDeals.map((deal) => (
                <Card 
                  key={deal.id} 
                  className="group hover:border-primary/50 transition-all cursor-pointer bg-background/50"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/dashboard/pipeline/${deal.id}`);
                  }}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex gap-4 items-center">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                        {deal.healthScore}%
                      </div>
                      <div>
                        <h4 className="font-bold text-sm group-hover:text-primary transition-colors">{deal.titulo}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-1">{deal.reason}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Pendientes importantes */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <ListTodo className="h-4 w-4" />
              Pendientes importantes
            </h3>
            {data.tareasPendientes.length > 0 ? (
              <div className="space-y-2">
                {data.tareasPendientes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setOpen(false);
                      router.push(t.leadId ? `/dashboard/leads/${t.leadId}` : '/dashboard/tareas');
                    }}
                    className="w-full text-left p-3 rounded-xl border bg-background/60 hover:border-primary/40 hover:shadow-sm transition-all group flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                          {t.titulo}
                        </h4>
                        {t.vencida && (
                          <Badge variant="destructive" className="shrink-0 animate-pulse">Vencida</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {t.leadNombre ? `Lead: ${t.leadNombre} · ` : ''}
                        📅 {format(new Date(t.fechaVencimiento), "d 'de' MMMM, HH:mm", { locale: es })}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-600 font-medium">Nada urgente pendiente. ✓</p>
            )}
          </div>

          {/* Radar de Riesgos y Novedades */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-red-100 bg-red-50/50 space-y-3">
              <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase">
                <AlertCircle className="h-4 w-4" />
                Operación Rescate
              </div>
              {data.riskyDeals.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {data.riskyDeals.slice(0, 5).map((deal) => {
                      const riskPct =
                        typeof deal.risk === 'number' && deal.risk > 0 && deal.risk <= 1
                          ? Math.round(deal.risk * 100)
                          : Math.round(Number(deal.risk) || 0);
                      return (
                        <button
                          key={deal.id}
                          onClick={() => {
                            setOpen(false);
                            router.push(`/dashboard/pipeline/${deal.id}`);
                          }}
                          className="w-full text-left p-2.5 rounded-lg bg-white/70 border border-red-100 hover:border-red-300 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-xs text-red-800 group-hover:text-red-600 transition-colors line-clamp-1">
                              {deal.titulo}
                            </h4>
                            {riskPct > 0 && (
                              <span className="text-[10px] font-bold text-red-600 shrink-0">
                                {riskPct}% riesgo
                              </span>
                            )}
                          </div>
                          {deal.rescueMessage && (
                            <p className="text-[11px] text-red-600/90 mt-1 leading-snug line-clamp-2">
                              {deal.rescueMessage}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {data.riskyDeals.length > 5 && (
                    <p className="text-[10px] text-red-500 font-medium">
                      +{data.riskyDeals.length - 5} deals en riesgo más. Ve al pipeline para verlos todos.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-emerald-600 font-medium">Todo bajo control.</p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/50 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase">
                <Zap className="h-4 w-4" />
                Nuevos Diamantes
              </div>
              <p className="text-[11px] text-amber-600">
                {data.newDiamonds.length} leads de alta calidad esperando.
              </p>
            </div>
          </div>

          {/* Quote Motivacional */}
          <div className="p-4 rounded-xl bg-slate-900 text-white relative overflow-hidden">
            <Brain className="absolute right-[-10px] bottom-[-10px] h-24 w-24 text-white/5 rotate-12" />
            <p className="text-sm italic font-serif relative z-10">
              "{data.motivationalQuote}"
            </p>
            <p className="text-[10px] mt-2 text-primary uppercase font-bold tracking-widest">— Gemma Intelligence</p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>Descartar</Button>
          <Button onClick={() => {
            setOpen(false);
            router.push('/dashboard/pipeline');
          }}>Ir al Pipeline</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
