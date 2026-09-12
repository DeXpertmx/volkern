'use client'

import { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { formatearImporte } from "@/lib/moneda";
import { useMonedaTenant } from "@/lib/use-moneda-tenant";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Percent,
  Home,
  ArrowUpRight,
  Loader2,
  Calendar,
  Building2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Modelo115Dashboard() {
  const moneda = useMonedaTenant();
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
      const res = await fetch(`/api/accounting/taxes/modelo115?year=${year}&quarter=${quarter}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch (error) {
      toast.error("Error al cargar el reporte del Modelo 115");
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
      const res = await fetch("/api/accounting/taxes/modelo115", {
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

    const headers = "Fecha,Arrendador,NIF,Descripción,Base,Reteción %,Retención";
    const rows = report.details.map((r: any) => {
      const date = r.date ? new Date(r.date).toLocaleDateString('es-ES') : '';
      const rate = r.retentionRate ? `${r.retentionRate}%` : '';
      return `"${date}","${r.supplierName}","${r.supplierTaxId}","${r.description}","${Number(r.base).toFixed(2)}","${rate}","${Number(r.retentionAmount).toFixed(2)}"`;
    }).join('\n');

    const bom = '\uFEFF';
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-115-t${quarter}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Calculando retenciones de arrendamientos...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => formatearImporte(amount, moneda);

  const totalBase = report?.totalRentBase || 0;
  const totalRetenciones = report?.totalRetentions || 0;
  const tasaMedia = totalBase > 0 ? ((totalRetenciones / totalBase) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de periodo */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-100 rounded-2xl text-rose-600">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Retenciones por Arrendamientos</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Modelo 115 - Trimestral</p>
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
        {/* Rentas pagadas */}
        <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
          <div className="h-1.5 bg-rose-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Rentas Pagadas</CardTitle>
              <Building2 className="w-5 h-5 text-rose-500 group-hover:scale-125 transition-transform" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{formatCurrency(totalBase)}</div>
            <p className="text-xs text-slate-500 mt-1 font-medium">Base imponible de los alquileres con retención</p>
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
              Tipo estándar: 19%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detalles del reporte */}
      <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-6">
          <div>
            <CardTitle className="text-lg font-black">Desglose de Retenciones por Alquiler</CardTitle>
            <CardDescription className="font-medium">Gastos de alquiler con retención practicada en el trimestre</CardDescription>
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
                  <th className="px-6 py-4 text-left">Arrendador</th>
                  <th className="px-6 py-4 text-left">NIF</th>
                  <th className="px-6 py-4 text-left">Descripción</th>
                  <th className="px-6 py-4 text-right">Base</th>
                  <th className="px-6 py-4 text-right">%</th>
                  <th className="px-6 py-4 text-right">Retención</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!report?.details?.length ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                      No hay gastos de alquiler con retención para este periodo
                    </td>
                  </tr>
                ) : (
                  report.details.map((record: any) => (
                    <tr key={record.expenseId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs">
                        {record.date ? new Date(record.date).toLocaleDateString('es-ES') : '-'}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">
                        {record.supplierName || 'Sin proveedor'}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        {record.supplierTaxId || '-'}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {record.description}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        {formatCurrency(Number(record.base))}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-400">
                        {record.retentionRate ? `${record.retentionRate}%` : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900">
                        {formatCurrency(Number(record.retentionAmount))}
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
      <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-rose-900 text-sm">Información sobre el Modelo 115</h4>
          <p className="text-xs text-rose-700 font-medium leading-relaxed">
            El Modelo 115 declara la retención del IRPF que debes practicar al pagar el alquiler
            de un inmueble urbano a un arrendador (persona física o entidad sin actividad).
            El tipo general de retención es del <strong>19%</strong> sobre la renta pagada.
          </p>
          <ul className="text-xs text-rose-700 font-medium leading-relaxed list-disc list-inside mt-1 space-y-0.5">
            <li>Se detecta automáticamente desde los gastos con categoría <strong>«Alquiler»</strong> que incluyen retención de IRPF.</li>
            <li>Presentación trimestral: 20 abril, 20 julio, 20 octubre y 30 enero.</li>
            <li>El resumen anual de estas retenciones se declara en el <strong>Modelo 180</strong>.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
