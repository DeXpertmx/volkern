'use client';

import { useEffect, useState } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  RefreshCcw, 
  Wallet, 
  BookOpen,
  Scale,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Suggestion {
  entryId: string;
  transactionId: string;
  confidence: number;
  reason: string;
  entry?: any;
  transaction?: any;
}

export function ReconciliationDashboard() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reconciliation/suggestions');
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      toast.error('Error al cargar sugerencias');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (suggestion: Suggestion) => {
    const id = `${suggestion.entryId}-${suggestion.transactionId}`;
    setProcessingId(id);
    
    try {
      const res = await fetch('/api/reconciliation/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: suggestion.entryId,
          transactionId: suggestion.transactionId,
          matchedBy: 'GEMMA_AI',
          confidenceScore: suggestion.confidence
        }),
      });

      if (res.ok) {
        toast.success('Conciliación aceptada correctamente');
        setSuggestions(prev => prev.filter(s => `${s.entryId}-${s.transactionId}` !== id));
      } else {
        toast.error('Error al conciliar');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCcw className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Gemma AI analizando el Libro Diario...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Sugerencias Inteligentes</h2>
          <p className="text-slate-500 font-medium">Gemma ha encontrado coincidencias potenciales para conciliar.</p>
        </div>
        <Button variant="outline" className="rounded-xl font-bold bg-white" onClick={fetchSuggestions}>
          <RefreshCcw className="w-4 h-4 mr-2" /> Recalcular
        </Button>
      </div>
      
      {suggestions.length === 0 ? (
        <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-100 bg-white p-12 text-center">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2">¡Todo al día!</h3>
          <p className="text-slate-500 max-w-xs mx-auto">
            No hay más movimientos pendientes que coincidan con tus registros contables.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <AnimatePresence>
            {suggestions.map((suggestion) => {
              const id = `${suggestion.entryId}-${suggestion.transactionId}`;
              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  layout
                >
                  <Card className="rounded-[2.5rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden group">
                    <CardContent className="p-0">
                      <div className="flex flex-col md:flex-row">
                        {/* Banco */}
                        <div className="flex-1 p-8 border-r border-slate-50">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                              <Wallet className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Extracto Bancario</span>
                          </div>
                          <p className="text-lg font-black text-slate-900 mb-1">{suggestion.transaction.description}</p>
                          <p className="text-2xl font-black text-slate-900">
                            {Number(suggestion.transaction.amount).toFixed(2)} €
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 mt-2">
                            {new Date(suggestion.transaction.date).toLocaleDateString()} • {suggestion.transaction.bankConnection.bankName}
                          </p>
                        </div>

                        {/* Comparador AI */}
                        <div className="bg-indigo-600 flex flex-col items-center justify-center px-6 py-8 text-white relative">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500 to-indigo-600 opacity-50" />
                          <div className="relative z-10 flex flex-col items-center">
                            <Badge className="bg-white/20 text-white border-none mb-3 text-[9px] font-black tracking-widest uppercase">
                              {Math.round(suggestion.confidence * 100)}% Match
                            </Badge>
                            <Zap className="w-6 h-6 mb-3 fill-amber-400 text-amber-400" />
                            <div className="h-px w-12 bg-white/30 mb-3" />
                            <p className="text-[9px] font-black uppercase tracking-tighter text-indigo-100 text-center max-w-[100px]">
                              {suggestion.reason.split(', ')[0]}
                            </p>
                          </div>
                        </div>

                        {/* Asiento */}
                        <div className="flex-1 p-8">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                              <BookOpen className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Asiento en Libro Diario</span>
                          </div>
                          <p className="text-lg font-black text-slate-900 mb-1">{suggestion.entry.description}</p>
                          <p className="text-2xl font-black text-slate-900">
                            {suggestion.entry.lines.reduce((s: number, l: any) => s + (Number(l.debit) || Number(l.credit)), 0).toFixed(2)} €
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 mt-2">
                            ID: {suggestion.entry.id.substring(0, 12)} • {new Date(suggestion.entry.date).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Acciones */}
                        <div className="p-8 flex items-center bg-slate-50/50">
                           <Button 
                             className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest px-8 py-6 h-auto shadow-lg shadow-indigo-100"
                             onClick={() => handleAccept(suggestion)}
                             disabled={processingId === id}
                           >
                             {processingId === id ? 'Sincronizando...' : 'Conciliar'}
                           </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
