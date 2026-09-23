'use client';

import { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  ChevronRight, 
  Info, 
  RefreshCcw, 
  Search, 
  Sparkles, 
  Wallet,
  AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';

export default function ReconciliationPage() {
  const router = useRouter();
  // La divisa del extracto es la de la cuenta bancaria y, si no la declara, la
  // del tenant: la pantalla escribía euros a mano.
  const moneda = useMonedaTenant();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounting/reconcile');
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      toast.error('Error al cargar transacciones bancarias');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestions = async (txId: string) => {
    setSuggestions([]);
    try {
      const res = await fetch(`/api/accounting/reconcile?transactionId=${txId}`);
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      toast.error('Error al cargar sugerencias de conciliación');
    }
  };

  const handleSelectTransaction = (tx: any) => {
    setSelectedTx(tx);
    fetchSuggestions(tx.id);
  };

  const handleReconcile = async (entryId: string) => {
    setMatching(true);
    try {
      const res = await fetch('/api/accounting/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: selectedTx.id,
          entryId,
          matchedBy: 'USER'
        })
      });

      if (res.ok) {
        toast.success('Conciliación completada con éxito');
        setSelectedTx(null);
        setSuggestions([]);
        fetchTransactions();
      } else {
        const err = await res.json();
        toast.error(`Error: ${err.error}`);
      }
    } catch (err) {
      toast.error('Error de red al conciliar');
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="p-8 space-y-8 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full bg-white shadow-sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Conciliación Bancaria</h1>
            <p className="text-slate-500 font-medium">Empareja movimientos bancarios con asientos contables.</p>
          </div>
        </div>
        <Button variant="outline" className="rounded-xl font-bold bg-white" onClick={fetchTransactions}>
          <RefreshCcw className="w-4 h-4 mr-2" /> Sincronizar Banco
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Transaction List */}
        <Card className="lg:col-span-5 rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-xl font-black flex items-center gap-2">
              <Wallet className="w-5 h-5 text-indigo-600" />
              Movimientos Pendientes
            </CardTitle>
            <CardDescription>
              Tienes {transactions.length} transacciones esperando ser conciliadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 h-[65vh] overflow-y-auto">
            <div className="space-y-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                   <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
                   <p className="text-sm font-bold text-slate-400">Consultando API Bancaria...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                   <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8" />
                   </div>
                   <p className="text-lg font-black text-slate-900">¡Todo al día!</p>
                   <p className="text-sm text-slate-500">No hay movimientos pendientes de conciliación.</p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div 
                    key={tx.id}
                    onClick={() => handleSelectTransaction(tx)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                      selectedTx?.id === tx.id 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
                        : 'bg-slate-50 border-slate-100 hover:bg-white hover:border-indigo-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-sm font-black ${selectedTx?.id === tx.id ? 'text-white' : 'text-slate-900'}`}>
                        {tx.description}
                      </p>
                      <p className={`text-sm font-black ${
                        selectedTx?.id === tx.id 
                          ? 'text-white' 
                          : Number(tx.amount) > 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {Number(tx.amount) > 0 ? '+' : ''}{formatearImporte(Number(tx.amount), tx.currency || moneda)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedTx?.id === tx.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {new Date(tx.date).toLocaleDateString()} • {tx.bankConnection.bankName}
                      </p>
                      <ChevronRight className={`w-3 h-3 transition-transform ${selectedTx?.id === tx.id ? 'translate-x-1 opacity-100' : 'opacity-0'}`} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Matching Area */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {!selectedTx ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full flex flex-col items-center justify-center p-12 text-center bg-slate-100/50 rounded-[2rem] border-2 border-dashed border-slate-200"
              >
                <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-6 text-slate-300">
                  <Search className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Selecciona un movimiento</h3>
                <p className="text-sm text-slate-500 max-w-xs">
                  Haz click en una transacción de la izquierda para ver sugerencias de conciliación impulsadas por Gemma AI.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* AI Matching Logic */}
                <Card className="rounded-[2rem] border-none shadow-xl shadow-indigo-100 bg-slate-900 text-white overflow-hidden relative">
                   <div className="absolute top-0 right-0 p-8">
                      <Sparkles className="w-20 h-20 text-indigo-500/20 rotate-12" />
                   </div>
                   <CardHeader className="relative z-10">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-indigo-500 text-white border-none text-[9px] font-black tracking-widest px-2">GEMMA AI ASSISTANT</Badge>
                      </div>
                      <CardTitle className="text-2xl font-black">Sugerencias de Conciliación</CardTitle>
                      <CardDescription className="text-indigo-300 font-medium">
                        Analizando el Libro Diario para encontrar el asiento correspondiente...
                      </CardDescription>
                   </CardHeader>
                   <CardContent className="relative z-10 p-8 pt-0">
                      <div className="space-y-4">
                        {suggestions.length === 0 ? (
                          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                             <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                             <p className="text-sm font-bold">No se encontraron coincidencias directas.</p>
                             <p className="text-xs text-slate-400 mt-1 italic">
                               Es posible que el asiento no esté registrado o el monto no coincida exactamente.
                             </p>
                          </div>
                        ) : (
                          suggestions.map((sug) => (
                            <div 
                              key={sug.entry.id}
                              className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
                            >
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[8px] font-black uppercase">
                                      {Math.round(sug.confidence * 100)}% Confianza
                                    </Badge>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                      {new Date(sug.entry.date).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <p className="text-sm font-black">{sug.entry.description}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-black">
                                    {formatearImporte(Math.abs(Number(selectedTx.amount)), selectedTx.currency || moneda)}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    Monto Identificado
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 mb-6">
                                {sug.entry.lines.slice(0, 2).map((line: any, i: number) => (
                                  <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{line.account.name}</p>
                                    <p className="text-xs font-bold">
                                      {line.debit > 0 ? `DEBE: ${formatearImporte(Number(line.debit), moneda)}` : `HABER: ${formatearImporte(Number(line.credit), moneda)}`}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              <Button 
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest py-6 h-auto rounded-xl shadow-lg shadow-indigo-900/20"
                                onClick={() => handleReconcile(sug.entry.id)}
                                disabled={matching}
                              >
                                {matching ? 'Conciliando...' : 'Confirmar y Conciliar'}
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                   </CardContent>
                </Card>

                {/* Manual Search (Placeholder) */}
                <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white p-8">
                   <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 rounded-xl bg-slate-100 text-slate-500">
                        <Info className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Búsqueda Manual</h4>
                        <p className="text-xs text-slate-500">¿No es ninguna de las sugerencias? Busca el asiento manualmente.</p>
                      </div>
                   </div>
                   <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Buscar por descripción, ID de asiento o referencia..."
                        className="w-full bg-slate-50 border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 ring-indigo-100 outline-none transition-all"
                      />
                   </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
