'use client'

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Target, Quote, User, ChevronRight, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export const LivingPlaybook = () => {
  const { data, isLoading } = useSWR('/api/analytics/training/playbook', fetcher, {
    dedupingInterval: 60000
  });

  const entries = data?.success ? data.data : [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
        {[1, 2].map(i => <div key={i} className="h-48 bg-muted rounded-3xl" />)}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="rounded-3xl border-dashed border-2 p-12 text-center text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto opacity-20 mb-4" />
        <p className="text-sm font-medium">Aún no se han cosechado argumentos ganadores.</p>
        <p className="text-xs">Los mejores cierres en el Simulador aparecerán aquí automáticamente.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h3 className="text-2xl font-black tracking-tight flex items-center gap-2">
             Living Playbook <Sparkles className="h-5 w-5 text-amber-500 fill-amber-500" />
           </h3>
           <p className="text-sm text-muted-foreground font-medium">Conocimiento experto cosechado automáticamente por Gemma 4.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {entries.map((entry: any, index: number) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="rounded-3xl border-none shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden bg-white group">
              <div className="h-2 bg-gradient-to-r from-blue-600 to-indigo-600" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between mb-2">
                   <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-none px-3">
                     {entry.topic}
                   </Badge>
                   <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                     SCORE {entry.score}%
                   </span>
                </div>
                <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Target className="h-4 w-4 text-slate-400" />
                  Objeción Detectada
                </CardTitle>
                <CardDescription className="text-slate-600 italic font-medium">
                  "{entry.objection}"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative">
                  <Quote className="h-8 w-8 text-slate-200 absolute -top-2 -left-2 rotate-180" />
                  <p className="text-sm font-bold text-slate-800 relative z-10 leading-relaxed">
                    {entry.bestResponse}
                  </p>
                </div>
                
                <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                      {entry.agent?.name?.charAt(0) || 'A'}
                    </div>
                    <div className="flex flex-col">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Cosechado de</span>
                       <span className="text-xs font-bold text-slate-700">{entry.agent?.name || 'Agente Experto'}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-1 bg-slate-50/50">
                    {entry.technique}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
