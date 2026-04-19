'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BrainCircuit, 
  Target, 
  AlertTriangle, 
  MessageSquare, 
  Zap, 
  CheckCircle2,
  TrendingDown,
  Info,
  History,
  ShieldCheck
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface CoachAdvice {
  healthScore: number;
  sentiment: string;
  detectedPains: string[];
  rationale?: string;
  confidenceScore?: number;
  evidencePoints?: string[];
  successPath: { title: string; description: string; why: string; action?: any }[];
  objections: { trigger: string; counter: string }[];
  ghostingRisk: number;
  drafts?: any[];
}

export function GemmaDealCoach({ dealId }: { dealId: string }) {
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAdvice = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/coach`);
      if (!res.ok) throw new Error('Error al consultar al coach');
      const data = await res.json();
      setAdvice(data);
    } catch (error) {
      console.error(error);
      toast.error('Gemma no pudo analizar el trato');
    } finally {
      setLoading(false);
    }
  };

  const fetchAudit = async () => {
    try {
      const res = await fetch(`/api/deals/${dealId}/ai-audit`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    }
  };

  useEffect(() => {
    fetchAdvice();
    fetchAudit();
  }, [dealId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!advice) return null;

  return (
    <Tabs defaultValue="coach" className="w-full">
      <TabsList className="grid w-full grid-cols-2 h-8">
        <TabsTrigger value="coach" className="text-[10px] uppercase font-bold">Coach</TabsTrigger>
        <TabsTrigger value="audit" className="text-[10px] uppercase font-bold">Transparencia</TabsTrigger>
      </TabsList>

      <TabsContent value="coach" className="space-y-6 mt-4">
        {/* Sección A: Status Vital */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" />
                RADAR COGNITIVO
              </CardTitle>
              <div className="flex items-center gap-1">
                {advice.confidenceScore && advice.confidenceScore >= 0.7 && (
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                )}
                <Badge variant={advice.healthScore > 70 ? 'default' : 'destructive'} className="text-[10px]">
                  Salud: {advice.healthScore}%
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Sentimiento</span>
                  <span className="font-bold">{advice.sentiment}</span>
                </div>
                <Progress value={advice.healthScore} className="h-2" />
              </div>
              
              {advice.rationale && (
                <div className="p-2 bg-background/50 border border-primary/10 rounded text-[10px] text-muted-foreground italic">
                  "{advice.rationale}"
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {advice.detectedPains.map((pain, i) => (
                  <Badge key={i} variant="outline" className="bg-background text-[8px] uppercase">
                    {pain}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sección B: Success Path */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" />
              THE SUCCESS PATH
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {advice.successPath.map((step, i) => (
              <div key={i} className="relative pl-6 pb-2 border-l border-muted last:border-0 last:pb-0">
                <div className="absolute left-[-9px] top-0 bg-background border border-muted rounded-full p-1">
                  <CheckCircle2 className={`h-3 w-3 ${step.action ? 'text-primary' : 'text-emerald-500'}`} />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold">{step.title}</h4>
                  {step.action && (
                    <Badge variant="secondary" className="text-[8px] h-3 px-1">
                      {advice.confidenceScore && advice.confidenceScore >= 0.7 ? 'AUTO' : 'SUGERIDO'}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{step.description}</p>
                <div className="mt-1 flex items-start gap-1 p-1.5 bg-muted/50 rounded text-[10px] italic text-muted-foreground">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{step.why}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Sección C: Kit de Rescate & Drafts */}
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              KIT DE RESCATE & DRAFTS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Drafts de Gemma */}
            {advice.drafts && advice.drafts.length > 0 && (
              <div className="space-y-2 mb-4">
                <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Borradores de Gemma</h5>
                {advice.drafts.map((draft, i) => (
                  <div key={i} className="p-2 bg-background border border-amber-100 rounded text-[11px] relative group">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-[8px] h-3 px-1 uppercase">{draft.canal}</Badge>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          navigator.clipboard.writeText(draft.contenido);
                          toast.success('Borrador copiado');
                        }}
                      >
                        <MessageSquare className="h-2 w-2" />
                      </Button>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{draft.contenido}</p>
                  </div>
                ))}
              </div>
            )}

            {advice.objections.map((obj, i) => (
              <div key={i} className="space-y-1">
                <div className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  "{obj.trigger}"
                </div>
                <div className="text-[11px] p-2 bg-background border border-amber-100 rounded text-muted-foreground">
                  {obj.counter}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {advice.ghostingRisk > 0.5 && (
          <div className="p-3 border border-red-200 bg-red-50 rounded-lg flex items-start gap-3">
            <TrendingDown className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-red-700">RIESGO DE ABANDONO ALTO</h4>
              <p className="text-[10px] text-red-600">
                La probabilidad de ghosting es del {(advice.ghostingRisk * 100).toFixed(0)}%. 
              </p>
            </div>
          </div>
        )}

        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-muted-foreground text-[10px]"
          onClick={fetchAdvice}
        >
          Recalcular Sabiduría IA
        </Button>
      </TabsContent>

      <TabsContent value="audit" className="mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              LOG DE DECISIONES IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {auditLogs.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4 italic">No hay historial de decisiones aún.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-3 border-l-2 border-primary bg-muted/30 rounded-r-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={log.isAutoExecuted ? 'default' : 'outline'} className="text-[8px] h-3 px-1">
                      {log.decisionOutcome}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <h5 className="text-[10px] font-bold uppercase tracking-tight">{log.actionType}</h5>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    {log.rationale}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground">Certeza:</span>
                    <Progress value={log.confidence * 100} className="h-1 flex-1" />
                    <span className="text-[9px] font-bold">{(log.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
