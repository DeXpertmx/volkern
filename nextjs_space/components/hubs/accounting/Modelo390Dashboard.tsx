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
  TrendingUp,
  TrendingDown,
  Loader2,
  PieChart,
  Calendar,
  CheckSquare
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Modelo390Dashboard() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filing, setFiling] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [year]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/taxes/modelo390?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch (error) {
      toast.error("Error al cargar el reporte del Modelo 390");
    } finally {
      setLoading(false);
    }
  };

  const handleFileReturn = async () => {
    if (!confirm(`¿Estás seguro de que deseas marcar el ejercicio ${year} del IVA como presentado? Esta acción es informativa para tu control contable.`)) {
      return;
    }

    setFiling(true);
    try {
      const res = await fetch("/api/accounting/taxes/modelo390", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year })
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
    if (!report?.hasActivity) {
      toast.error("No hay datos para exportar");
      return;
    }

    const bom = '\uFEFF';
    const lines: string[] = [];

    lines.push(`Modelo 390 - Resumen Anual IVA ${year}`);
    lines.push("Trimestre,Base IVA Repercutido,IVA Repercutido,Base IVA Soportado,IVA Soportado,Resultado,Presentado");
    
    report.quarters.forEach((q: any) => {
      const r = q.result >= 0 ? q.result.toFixed(2) : `(${Math.abs(q.result).toFixed(2)})`;
      lines.push(`T${q.quarter},"${q.outputVatBase.toFixed(2)}","${q.outputVatAmount.toFixed(2)}","${q.inputVatBase.toFixed(2)}","${q.inputVatAmount.toFixed(2)}","${r}","${q.isFiled ? 'Sí' : 'No'}"`);
    });

    lines.push("");
    lines.push(`ANUAL,"${report.annualOutputVatBase.toFixed(2)}","${report.annualOutputVatAmount.toFixed(2)}","${report.annualInputVatBase.toFixed(2)}","${report.annualInputVatAmount.toFixed(2)}","${report.annualResult.toFixed(2)}","${report.quartersFiled}/4"`);

    const csv = lines.join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-390-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Consolidando IVA anual...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const hasActivity = report?.hasActivity || false;
  const annualOutputVat = report?.annualOutputVatAmount || 0;
  const annualInputVat = report?.annualInputVatAmount || 0;
  const annualResult = report?.annualResult || 0;
  const isResultPositive = annualResult >= 0;
  const quartersFiled = report?.quartersFiled || 0;
  const quarters = report?.quarters || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de año */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-100 rounded-2xl text-indigo-600">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">IVA Anual</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Modelo 390 - Resumen del Ejercicio</p>
          </div>
        </div>

        <select 
          value={year} 
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="h-10 rounded-xl border-slate-200 text-sm font-bold px-4 focus:ring-primary"
        >
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {!hasActivity ? (
        <Card className="border-none shadow-xl ring-1 ring-slate-200">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 mb-4">
              <PieChart className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Sin actividad de IVA en {year}</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No se encontraron registros de IVA repercutido ni soportado para el ejercicio {year}.
              El Modelo 390 resume los 4 trimestres presentados en el Modelo 303.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* IVA Repercutido */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-indigo-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">IVA Repercutido</CardTitle>
                  <TrendingUp className="w-5 h-5 text-indigo-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(annualOutputVat)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Base: {formatCurrency(report?.annualOutputVatBase || 0)}</p>
              </CardContent>
            </Card>

            {/* IVA Soportado */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-cyan-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">IVA Soportado</CardTitle>
                  <TrendingDown className="w-5 h-5 text-cyan-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(annualInputVat)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Base: {formatCurrency(report?.annualInputVatBase || 0)}</p>
              </CardContent>
            </Card>

            {/* Resultado anual */}
            <Card className={cn(
              "border-none shadow-xl overflow-hidden group",
              isResultPositive ? "bg-slate-900 text-white" : "bg-gradient-to-br from-white to-slate-50"
            )}>
              <div className={cn("h-1.5", isResultPositive ? "bg-emerald-400" : "bg-slate-200")} />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className={cn(
                    "text-sm font-black uppercase tracking-widest",
                    isResultPositive ? "text-emerald-300" : "text-slate-400"
                  )}>Resultado Anual</CardTitle>
                  <FileText className={cn(
                    "w-5 h-5 group-hover:scale-125 transition-transform",
                    isResultPositive ? "text-emerald-400" : "text-slate-300"
                  )} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={cn("text-3xl font-black", isResultPositive ? "text-white" : "text-slate-400")}>
                  {formatCurrency(Math.abs(annualResult))}
                </div>
                <p className={cn("text-xs mt-1 font-medium", isResultPositive ? "text-emerald-300" : "text-slate-500")}>
                  {isResultPositive ? 'A ingresar' : 'A compensar / devolver'}
                </p>
              </CardContent>
            </Card>

            {/* Trimestres presentados */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-amber-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Trimestres</CardTitle>
                  <Calendar className="w-5 h-5 text-amber-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{quartersFiled}/4</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Presentados</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla trimestral */}
          <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-indigo-50/50 border-b border-slate-100 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PieChart className="w-5 h-5 text-indigo-600" />
                  <div>
                    <CardTitle className="text-base font-black">Desglose Trimestral del IVA</CardTitle>
                    <CardDescription className="font-medium text-xs">
                      Cada trimestre corresponde a un Modelo 303 presentado
                    </CardDescription>
                  </div>
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
                    Marcar Anual como Presentado
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Trimestre</th>
                      <th className="px-5 py-3 text-right">Base Repercutido</th>
                      <th className="px-5 py-3 text-right">IVA Repercutido</th>
                      <th className="px-5 py-3 text-right">Base Soportado</th>
                      <th className="px-5 py-3 text-right">IVA Soportado</th>
                      <th className="px-5 py-3 text-right">Resultado</th>
                      <th className="px-5 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quarters.map((q: any) => (
                      <tr key={q.quarter} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-black text-slate-800">T{q.quarter}</span>
                          <span className="text-[10px] text-slate-400 ml-2 font-medium">
                            {['Ene-Mar', 'Abr-Jun', 'Jul-Sep', 'Oct-Dic'][q.quarter - 1]}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium">{formatCurrency(q.outputVatBase)}</td>
                        <td className="px-5 py-3 text-right font-bold text-indigo-700">{formatCurrency(q.outputVatAmount)}</td>
                        <td className="px-5 py-3 text-right font-medium">{formatCurrency(q.inputVatBase)}</td>
                        <td className="px-5 py-3 text-right font-bold text-cyan-700">{formatCurrency(q.inputVatAmount)}</td>
                        <td className={cn(
                          "px-5 py-3 text-right font-black",
                          q.result >= 0 ? "text-slate-900" : "text-amber-600"
                        )}>
                          {formatCurrency(q.result)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {q.isFiled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700">
                              <CheckSquare className="w-3 h-3" /> Presentado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700">
                              <AlertCircle className="w-3 h-3" /> Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Fila total anual */}
                    <tr className="bg-indigo-100/50 font-black">
                      <td className="px-5 py-3 text-sm uppercase tracking-wider text-indigo-900">ANUAL</td>
                      <td className="px-5 py-3 text-right text-indigo-900">{formatCurrency(report?.annualOutputVatBase || 0)}</td>
                      <td className="px-5 py-3 text-right text-indigo-900">{formatCurrency(annualOutputVat)}</td>
                      <td className="px-5 py-3 text-right text-indigo-900">{formatCurrency(report?.annualInputVatBase || 0)}</td>
                      <td className="px-5 py-3 text-right text-indigo-900">{formatCurrency(annualInputVat)}</td>
                      <td className={cn(
                        "px-5 py-3 text-right",
                        isResultPositive ? "text-emerald-700" : "text-amber-700"
                      )}>
                        {formatCurrency(Math.abs(annualResult))}
                      </td>
                      <td className="px-5 py-3 text-center text-indigo-900">
                        {quartersFiled}/4
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Resumen informativo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none bg-indigo-50/30 shadow-sm ring-1 ring-indigo-100 overflow-hidden">
              <CardContent className="p-5 flex items-center gap-4">
                <TrendingUp className="w-8 h-8 text-indigo-600 shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Total IVA Repercutido</p>
                  <p className="text-2xl font-black text-indigo-900">{formatCurrency(annualOutputVat)}</p>
                  <p className="text-xs text-indigo-700 font-medium mt-0.5">
                    Base {formatCurrency(report?.annualOutputVatBase || 0)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none bg-cyan-50/30 shadow-sm ring-1 ring-cyan-100 overflow-hidden">
              <CardContent className="p-5 flex items-center gap-4">
                <TrendingDown className="w-8 h-8 text-cyan-600 shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-cyan-600">Total IVA Soportado</p>
                  <p className="text-2xl font-black text-cyan-900">{formatCurrency(annualInputVat)}</p>
                  <p className="text-xs text-cyan-700 font-medium mt-0.5">
                    Base {formatCurrency(report?.annualInputVatBase || 0)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className={cn(
              "border-none shadow-sm ring-1 overflow-hidden",
              isResultPositive ? "bg-slate-900 text-white ring-slate-800" : "bg-amber-50 ring-amber-200"
            )}>
              <CardContent className="p-5 flex items-center gap-4">
                <FileText className={cn("w-8 h-8 shrink-0", isResultPositive ? "text-emerald-400" : "text-amber-600")} />
                <div>
                  <p className={cn(
                    "text-xs font-black uppercase tracking-widest",
                    isResultPositive ? "text-emerald-300" : "text-amber-600"
                  )}>Resultado Anual</p>
                  <p className={cn("text-2xl font-black", isResultPositive ? "text-white" : "text-amber-900")}>
                    {formatCurrency(Math.abs(annualResult))}
                  </p>
                  <p className={cn("text-xs font-medium mt-0.5", isResultPositive ? "text-emerald-300" : "text-amber-700")}>
                    {isResultPositive ? 'A ingresar en Hacienda' : 'A compensar / solicitar devolución'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Ayuda / Info */}
      <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-indigo-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-indigo-900 text-sm">Información sobre el Modelo 390</h4>
          <p className="text-xs text-indigo-700 font-medium leading-relaxed">
            Este reporte consolida los 4 trimestres del IVA (Modelo 303) en un resumen anual. 
            Los datos provienen directamente de los registros fiscales (TaxRecord) de tu contabilidad inmutable.
          </p>
          <ul className="text-xs text-indigo-700 font-medium leading-relaxed list-disc list-inside mt-1 space-y-0.5">
            <li>Si el resultado es <strong>positivo</strong>: debes ingresar la diferencia a Hacienda.</li>
            <li>Si el resultado es <strong>negativo</strong>: puedes compensarlo en trimestres siguientes o solicitar devolución.</li>
          </ul>
          <p className="text-xs text-indigo-700 font-medium leading-relaxed mt-1">
            Plazo de presentación: <strong>Enero</strong> del año siguiente (junto con el 4T del Modelo 303).
          </p>
        </div>
      </div>
    </div>
  );
}
