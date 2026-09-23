'use client';

import { useEffect, useState } from 'react';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
import { 
  BarChart3, 
  BookOpen, 
  ShieldCheck, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Scale, 
  RefreshCcw,
  FileText,
  Lock,
  ChevronRight,
  TrendingUp,
  History,
  Banknote
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { BankSelector } from '@/components/hubs/accounting/BankSelector';
import { PlusCircle, X } from 'lucide-react';

export default function AccountingDashboard() {
  // La divisa de los asientos es la del tenant: la pantalla escribía euros a mano.
  const moneda = useMonedaTenant();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBankSelector, setShowBankSelector] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounting/dashboard');
      const json = await res.json();
      setData(json);
    } catch (err) {
      toast.error('Error al cargar datos contables');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500 animate-pulse">Sincronizando Libro Diario...</p>
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-8 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
              Sistema de Partida Doble Inmutable
            </Badge>
            {data?.integrity?.isValid ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-none flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Integridad Verificada
              </Badge>
            ) : (
              <Badge className="bg-rose-100 text-rose-700 border-none flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Brecha de Seguridad Detectada
              </Badge>
            )}
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Hub Contable</h1>
          <p className="text-slate-500 font-medium">Gestión financiera centralizada con soberanía de datos y sellado Trust.</p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="rounded-xl font-bold bg-white" onClick={fetchData}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Refrescar
          </Button>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100"
            onClick={() => window.open('/api/accounting/export', '_blank')}
          >
            <FileText className="w-4 h-4 mr-2" /> Exportar para Gestoría
          </Button>
        </div>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Activo Total" 
          value={data?.summary?.assets || 0} 
          icon={<Wallet className="text-indigo-600" />} 
          trend="+4.2%" 
          color="bg-indigo-50"
        />
        <StatCard 
          title="Pasivo y Patrimonio" 
          value={data?.summary?.liabilities || 0} 
          icon={<Scale className="text-amber-600" />} 
          trend="-2.1%" 
          color="bg-amber-50"
        />
        <StatCard 
          title="Ingresos" 
          value={data?.summary?.income || 0} 
          icon={<TrendingUp className="text-emerald-600" />} 
          trend="+12%" 
          color="bg-emerald-50"
        />
        <StatCard 
          title="Gastos" 
          value={data?.summary?.expenses || 0} 
          icon={<History className="text-rose-600" />} 
          trend="+5.4%" 
          color="bg-rose-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Entries */}
        <Card className="lg:col-span-2 rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black">Libro Diario Reciente</CardTitle>
                <CardDescription className="font-medium">Últimos asientos registrados automáticamente por el ERP.</CardDescription>
              </div>
              <Button variant="ghost" className="text-indigo-600 font-bold hover:bg-indigo-50 rounded-xl">
                Ver todo el diario <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-0">
            <div className="space-y-4">
              {data?.recentEntries?.map((entry: any) => (
                <div key={entry.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-white hover:border-indigo-100 transition-all cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] font-bold uppercase py-0">{entry.status}</Badge>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                          {new Date(entry.date).toLocaleDateString()} • {entry.entryHash.substring(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">
                      {formatearImporte(entry.lines[0]?.debit > 0 ? entry.lines[0]?.debit : entry.lines[0]?.credit, moneda)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {entry.lines[0]?.account?.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar Status */}
        <div className="space-y-8">
          {/* Integrity Seal Card */}
          <Card className="rounded-[2rem] border-none shadow-xl shadow-indigo-100 bg-slate-900 text-white p-8 relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-500/30 transition-all" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                <Lock className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-xl font-black mb-2">Sellado Inmutable</h3>
              <p className="text-slate-400 text-sm font-medium mb-6">
                Todos los asientos están encadenados criptográficamente. Cualquier alteración rompería el sello de confianza.
              </p>
              <div className="p-4 bg-white/5 rounded-2xl mb-6">
                <div className="flex items-center justify-between text-xs font-bold mb-2">
                  <span className="text-slate-400 uppercase tracking-widest">Cierre de Periodo</span>
                  <span className="text-indigo-400">Marzo 2026</span>
                </div>
                <div className="flex items-center justify-between text-sm font-black">
                  <span>Estado:</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-none">ABIERTO</Badge>
                </div>
              </div>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 rounded-xl">
                Cerrar y Sellar Mes
              </Button>
            </div>
          </Card>

          {/* Bank Sync Card */}
          <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white p-8 relative">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" /> Conciliación Bancaria
              </h3>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full text-indigo-600 hover:bg-indigo-50"
                onClick={() => setShowBankSelector(!showBankSelector)}
              >
                {showBankSelector ? <X className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {showBankSelector ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <BankSelector />
                </motion.div>
              ) : (
                <div className="space-y-6">
                  {data?.bankConnections?.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Banknote className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-sm font-bold text-slate-400">No hay bancos conectados</p>
                      <Button 
                        variant="link" 
                        className="text-indigo-600 font-black uppercase text-[10px] tracking-widest mt-2"
                        onClick={() => setShowBankSelector(true)}
                      >
                        Vincular primer banco
                      </Button>
                    </div>
                  )}
                  {data?.bankConnections?.map((bank: any) => (
                    <div key={bank.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black text-slate-900">{bank.bankName}</p>
                        <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-100 font-bold">
                          {bank._count.transactions} Pendientes
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>Sincronizado: {bank.lastSync ? new Date(bank.lastSync).toLocaleDateString() : 'Nunca'}</span>
                        <span>{bank.status === 'ACTIVE' ? 'Activo' : 'Pendiente'}</span>
                      </div>
                      <Progress value={bank.status === 'ACTIVE' ? 100 : 50} className="h-1.5 bg-slate-100" />
                      <Button 
                        variant="outline" 
                        className="w-full rounded-xl border-slate-100 font-bold text-xs group"
                        onClick={() => window.location.href = '/dashboard/finanzas/contabilidad/reconciliacion'}
                      >
                        Conciliar Ahora <ChevronRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend, color }: any) {
  // La divisa del panel es la del tenant: la tarjeta pide el importe formateado
  // al módulo de dinero en vez de escribir euros a mano.
  const moneda = useMonedaTenant();

  return (
    <Card className="rounded-[2rem] border-none shadow-lg shadow-slate-200/40 bg-white overflow-hidden group hover:shadow-xl transition-all border border-transparent hover:border-slate-100">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110`}>
            {icon}
          </div>
          <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border-none font-bold text-[10px]">
            {trend}
          </Badge>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
          <p className="text-3xl font-black text-slate-900">
            {formatearImporte(value, moneda)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
