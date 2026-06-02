'use client'

import { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  RefreshCw,
  Bell,
  ChevronRight,
  Loader2,
  ArrowUpRight,
  CalendarDays
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ─── Type ────────────────────────────────────────────────────────────────────

interface FiscalDeadline {
  model: string;
  name: string;
  type: 'quarterly' | 'annual';
  quarter?: number;
  year: number;
  dueDate: string;
  periodLabel: string;
  status: 'pending' | 'notified' | 'filed' | 'overdue';
  daysUntilDue: number;
  estimatedAmount?: number;
}

interface CalendarSummary {
  today: string;
  upcomingDeadlines: FiscalDeadline[];
  overdueDeadlines: FiscalDeadline[];
  nextDeadline: FiscalDeadline | null;
  totalPending: number;
  totalOverdue: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODEL_COLORS: Record<string, string> = {
  '303': 'bg-blue-50 border-blue-200 text-blue-700',
  '111': 'bg-purple-50 border-purple-200 text-purple-700',
  '130': 'bg-amber-50 border-amber-200 text-amber-700',
  '349': 'bg-emerald-50 border-emerald-200 text-emerald-700',
  '347': 'bg-rose-50 border-rose-200 text-rose-700',
  '390': 'bg-cyan-50 border-cyan-200 text-cyan-700',
};

const MODEL_BG: Record<string, string> = {
  '303': 'bg-blue-500',
  '111': 'bg-purple-500',
  '130': 'bg-amber-500',
  '349': 'bg-emerald-500',
  '347': 'bg-rose-500',
  '390': 'bg-cyan-500',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FiscalCalendarDashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CalendarSummary | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [notifying, setNotifying] = useState(false);

  useEffect(() => {
    fetchCalendar();
  }, [year]);

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/fiscal-calendar?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (error) {
      toast.error("Error al cargar el calendario fiscal");
    } finally {
      setLoading(false);
    }
  };

  const handleSendAlerts = async () => {
    setNotifying(true);
    try {
      const res = await fetch('/api/accounting/fiscal-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify' }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.notified} alerta(s) enviada(s)`);
        fetchCalendar();
      }
    } catch (error) {
      toast.error("Error al enviar alertas");
    } finally {
      setNotifying(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Cargando calendario fiscal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Calendario Fiscal</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
              Vencimientos AEAT - España
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select 
            value={year} 
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-10 rounded-xl border-slate-200 text-sm font-bold px-4 focus:ring-primary"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button 
            variant="outline" 
            className="rounded-xl h-10 gap-2"
            onClick={fetchCalendar}
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button 
            className="rounded-xl h-10 gap-2"
            onClick={handleSendAlerts}
            disabled={notifying}
          >
            {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            Enviar Alertas
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-none shadow-md bg-gradient-to-br from-amber-50 to-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-amber-600">Próximos</p>
                <p className="text-3xl font-black text-amber-900 mt-1">{summary?.upcomingDeadlines.length || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-red-50 to-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-600">Vencidos</p>
                <p className="text-3xl font-black text-red-900 mt-1">{summary?.overdueDeadlines.length || 0}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-blue-50 to-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-600">Total año</p>
                <p className="text-3xl font-black text-blue-900 mt-1">
                  {summary ? (summary.upcomingDeadlines.length + summary.overdueDeadlines.length) : 0}
                </p>
              </div>
              <FileText className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-slate-800 to-slate-900 text-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest opacity-60">Siguiente</p>
                <p className="text-lg font-black mt-1 truncate max-w-[140px]">
                  {summary?.nextDeadline ? `Modelo ${summary.nextDeadline.model}` : '—'}
                </p>
              </div>
              <ArrowUpRight className="w-8 h-8 opacity-40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Próximos vencimientos */}
      {summary?.nextDeadline && (
        <Card className="border-none shadow-xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 overflow-hidden">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg",
                MODEL_BG[summary.nextDeadline.model] || 'bg-slate-500'
              )}>
                {summary.nextDeadline.model}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Próximo vencimiento</p>
                <p className="text-lg font-black">
                  {summary.nextDeadline.name} — {summary.nextDeadline.periodLabel}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(summary.nextDeadline.dueDate)} 
                  {summary.nextDeadline.daysUntilDue > 0 
                    ? ` (dentro de ${summary.nextDeadline.daysUntilDue} días)` 
                    : ''}
                </p>
              </div>
            </div>
            {summary.nextDeadline.estimatedAmount && (
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Estimado</p>
                <p className="text-2xl font-black">{formatCurrency(summary.nextDeadline.estimatedAmount)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pendientes */}
        <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-5">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-base font-black">Vencimientos Próximos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!summary?.upcomingDeadlines?.length ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-500">No hay vencimientos próximos</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.upcomingDeadlines.map((dl) => (
                  <DeadlineRow key={`${dl.model}-${dl.periodLabel}`} deadline={dl} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vencidos */}
        <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <CardTitle className="text-base font-black">Vencimientos Pasados</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!summary?.overdueDeadlines?.length ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-500">Todo al día. ¡Excelente!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.overdueDeadlines.map((dl) => (
                  <DeadlineRow key={`${dl.model}-${dl.periodLabel}`} deadline={dl} overdue />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leyenda de modelos */}
      <Card className="border-none shadow-sm bg-slate-50">
        <CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Modelos Fiscales</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { id: '303', label: 'IVA Trimestral' },
              { id: '111', label: 'Retenciones IRPF' },
              { id: '130', label: 'IRPF Est. Directa' },
              { id: '349', label: 'IVA Intracomunitario' },
              { id: '347', label: 'Operac. Terceros (anual)' },
              { id: '390', label: 'IVA Anual' },
            ].map(m => (
              <div key={m.id} className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold",
                MODEL_COLORS[m.id] || 'bg-slate-100 border-slate-200 text-slate-600'
              )}>
                <span className="font-black">{m.id}</span>
                <span className="opacity-70">{m.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-blue-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-blue-900 text-sm">Sobre los plazos fiscales</h4>
          <p className="text-xs text-blue-700 font-medium leading-relaxed">
            Las fechas mostradas corresponden a los plazos generales establecidos por la AEAT. 
            Pueden variar si el día de vencimiento cae en festivo (se traslada al siguiente día hábil). 
            Volkern enviará alertas automáticas 7, 3 y 1 día antes de cada vencimiento, y notificaciones 
            de urgencia para plazos ya vencidos.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Deadline Row ────────────────────────────────────────────────────────────

function DeadlineRow({ deadline, overdue }: { deadline: FiscalDeadline; overdue?: boolean }) {
  const modelColorClass = MODEL_COLORS[deadline.model] || 'bg-slate-100 border-slate-200 text-slate-600';
  const modelBg = MODEL_BG[deadline.model] || 'bg-slate-500';

  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors">
      {/* Model badge */}
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-xs shrink-0",
        modelBg
      )}>
        {deadline.model}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{deadline.name}</p>
        <p className="text-xs text-slate-500">{deadline.periodLabel}</p>
      </div>

      {/* Amount */}
      {deadline.estimatedAmount && (
        <div className="text-right hidden sm:block">
          <p className="text-xs font-bold text-slate-400 uppercase">Estimado</p>
          <p className="text-sm font-black text-slate-900">{formatCurrency(deadline.estimatedAmount)}</p>
        </div>
      )}

      {/* Date + Status */}
      <div className="text-right shrink-0">
        <p className={cn(
          "text-xs font-bold",
          overdue ? "text-red-500" : "text-slate-700"
        )}>
          {formatDate(deadline.dueDate)}
        </p>
        <div className="flex items-center gap-1 justify-end mt-0.5">
          {deadline.status === 'filed' ? (
            <Badge className="bg-emerald-50 text-emerald-600 border-none text-[10px] h-5 font-bold">
              Presentado
            </Badge>
          ) : overdue ? (
            <Badge className="bg-red-50 text-red-600 border-none text-[10px] h-5 font-bold">
              Vencido ({Math.abs(deadline.daysUntilDue)} días)
            </Badge>
          ) : deadline.daysUntilDue <= 7 ? (
            <Badge className="bg-amber-50 text-amber-600 border-none text-[10px] h-5 font-bold">
              {deadline.daysUntilDue === 0 ? 'Hoy' : `${deadline.daysUntilDue} días`}
            </Badge>
          ) : (
            <span className="text-[10px] font-bold text-slate-400">
              {deadline.daysUntilDue} días
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </div>
  );
}
