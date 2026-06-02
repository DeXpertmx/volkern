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
  FileText, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Percent,
  ArrowUpRight,
  Loader2,
  Calendar,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function IrpfDashboard() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [filing, setFiling] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [year, quarter]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/taxes/irpf?year=${year}&quarter=${quarter}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch (error) {
      toast.error("Error al cargar el reporte de retenciones");
    } finally {
      setLoading(false);
    }
  };

  const handleFileReturn = async () => {
    if (!confirm(`¿Estás seguro de que deseas marcar el T${quarter} de ${year} como presentado? Esta acción es informativa para tu control contable.`)) {
      return;
    }

    setFiling(true);
    try {
      const res = await fetch("/api/accounting/taxes/irpf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, quarter })
      });

      if (res.ok) {
        toast.success("Declaración marcada como presentada");
        fetchReport();
      }
    } catch (error) {
      toast.error("Error al procesar la declaración");
    } finally {
      setFiling(false);
    }
  };

  const handleExportCsv = () => {
    if (!report?.details?.length) {
      toast.error("No hay datos para exportar");
      return;
    }

    const headers = "Fecha,Descripción,Base,Porcentaje,Retención";
    const rows = report.details.map((r: any) => {
      const date = r.entry?.date ? new Date(r.entry.date).toLocaleDateString('es-ES') : '';
      const desc = r.entry?.description || '';
      const base = Number(r.baseAmount).toFixed(2);
      const rate = r.taxRate ? `${r.taxRate}%` : '';
      const amount = Number(r.taxAmount).toFixed(2);
      return `"${date}","${desc}","${base}","${rate}","${amount}"`;
    }).join('\n');

    const bom = '\uFEFF';
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-111-t${quarter}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Generando reporte de retenciones...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const totalRetenciones = report?.retentions?.amount || 0;
  const totalBase = report?.retentions?.base || 0;
  const tasaMedia = totalBase > 0 ? ((totalRetenciones / totalBase) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de periodo */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
            <Percent className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Retenciones IRPF</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Modelo 111 - Trimestral</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select 
            value={year} 
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-10 rounded-xl border-slate-200 text-sm font-bold px-4 focus:ring-primary"
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {[1, 2, 3, 4].map(q => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-black transition-all",
                  quarter === q ? "bg-white shadow-sm text-primary scale-105" : "text-slate-400 hover:text-slate-600"
                )}
              >
                T{q}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Base de retenciones */}
        <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
          <div className="h-1.5 bg-amber-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Base de Retenciones</CardTitle>
              <Users className="w-5 h-5 text-amber-500 group-hover:scale-125 transition-transform" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{formatCurrency(totalBase)}</div>
            <p className="text-xs text-slate-500 mt-1 font-medium">Importe total sujeto a retención</p>
          </CardContent>
        </Card>

        {/* Retención Total */}
        <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
          <div className="h-1.5 bg-purple-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Retención Total</CardTitle>
              <ArrowUpRight className="w-5 h-5 text-purple-500 group-hover:scale-125 transition-transform" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{formatCurrency(totalRetenciones)}</div>
            <p className="text-xs text-slate-500 mt-1 font-medium">Total a ingresar a Hacienda</p>
          </CardContent>
        </Card>

        {/* Tasa media */}
        <Card className="border-none shadow-xl bg-slate-900 text-white overflow-hidden group">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest opacity-60">Tasa Media Aplicada</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tighter">{tasaMedia}%</div>
            <p className="text-xs mt-2 font-bold uppercase tracking-widest opacity-80">
              Tipo de retención promedio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detalles del reporte */}
      <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-6">
          <div>
            <CardTitle className="text-lg font-black">Desglose de Retenciones</CardTitle>
            <CardDescription className="font-medium">Todos los registros de IRPF detectados en el trimestre</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="rounded-xl border-slate-200 h-10 gap-2"
              onClick={handleExportCsv}
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
            <Button 
              className="rounded-xl h-10 gap-2 premium-gradient-primary shadow-lg shadow-primary/20"
              onClick={handleFileReturn}
              disabled={filing}
            >
              {filing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Marcar como Presentado
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-4 text-left">Fecha</th>
                  <th className="px-6 py-4 text-left">Descripción</th>
                  <th className="px-6 py-4 text-left">Tipo</th>
                  <th className="px-6 py-4 text-right">Base</th>
                  <th className="px-6 py-4 text-right">%</th>
                  <th className="px-6 py-4 text-right">Retención</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!report?.details?.length ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                      No hay registros de retenciones IRPF para este periodo
                    </td>
                  </tr>
                ) : (
                  report.details.map((record: any) => (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs">
                        {record.entry?.date ? new Date(record.entry.date).toLocaleDateString('es-ES') : '-'}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">
                        {record.entry?.description || 'Sin descripción'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter bg-purple-100 text-purple-700">
                          IRPF
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        {formatCurrency(Number(record.baseAmount))}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-400">
                        {record.taxRate}%
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900">
                        {formatCurrency(Number(record.taxAmount))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Ayuda / Info */}
      <div className="p-6 bg-purple-50 border border-purple-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-purple-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-purple-900 text-sm">Información sobre el Modelo 111</h4>
          <p className="text-xs text-purple-700 font-medium leading-relaxed">
            Este reporte agrupa las retenciones de IRPF practicadas a profesionales y proveedores 
            durante el trimestre seleccionado. Los datos provienen de los asientos contables con 
            impacto fiscal registrados en Volkern. Asegúrate de que todas las facturas con retención 
            han sido registradas antes de utilizar estos datos para tu declaración oficial en la AEAT.
          </p>
        </div>
      </div>
    </div>
  );
}
