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
  Home,
  ArrowUpRight,
  Loader2,
  Calendar,
  Building2,
  Percent
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Modelo180Dashboard() {
  const moneda = useMonedaTenant();
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
      const res = await fetch(`/api/accounting/taxes/modelo180?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch (error) {
      toast.error("Error al cargar el reporte del Modelo 180");
    } finally {
      setLoading(false);
    }
  };

  const handleFileReturn = async () => {
    if (!confirm(`¿Estás seguro de que deseas marcar el ejercicio ${year} como presentado? Esta acción es informativa para tu control contable.`)) {
      return;
    }

    setFiling(true);
    try {
      const res = await fetch("/api/accounting/taxes/modelo180", {
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
    if (!report?.landlords?.length) {
      toast.error("No hay datos para exportar");
      return;
    }

    const bom = '\uFEFF';
    const lines: string[] = [];

    lines.push(`Modelo 180 - Resumen Anual Retenciones Arrendamientos ${year}`);
    lines.push("Arrendador,NIF,Rentas Pagadas,Retenciones Practicadas");
    
    report.landlords.forEach((l: any) => {
      lines.push(`"${l.supplierName}","${l.supplierTaxId}","${Number(l.totalRentBase).toFixed(2)}","${Number(l.totalRetentions).toFixed(2)}"`);
    });

    lines.push("");
    lines.push(`TOTAL,"","${report.totalRentBase.toFixed(2)}","${report.totalRetentions.toFixed(2)}"`);

    const csv = lines.join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-180-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Consolidando retenciones anuales...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => formatearImporte(amount, moneda);

  const hasActivity = report?.hasActivity || false;
  const totalRentBase = report?.totalRentBase || 0;
  const totalRetentions = report?.totalRetentions || 0;
  const totalLandlords = report?.totalLandlords || 0;
  const tasaMedia = totalRentBase > 0 ? ((totalRetentions / totalRentBase) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de año */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-100 rounded-2xl text-rose-600">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Resumen Anual de Arrendamientos</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Modelo 180 - Resumen del Ejercicio</p>
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
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 mb-4">
              <Home className="w-8 h-8 text-rose-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Sin retenciones de arrendamiento en {year}</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No se encontraron gastos de alquiler con retención de IRPF para el ejercicio {year}.
              El Modelo 180 resume los 4 trimestres presentados en el Modelo 115.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-rose-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Rentas Pagadas</CardTitle>
                  <Building2 className="w-5 h-5 text-rose-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalRentBase)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Total pagado a arrendadores</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-purple-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Retenciones</CardTitle>
                  <ArrowUpRight className="w-5 h-5 text-purple-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalRetentions)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Retenciones practicadas en el año</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-amber-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Arrendadores</CardTitle>
                  <Calendar className="w-5 h-5 text-amber-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{totalLandlords}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Proveedores con retención</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl bg-slate-900 text-white overflow-hidden group">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black uppercase tracking-widest opacity-60">Tasa Media</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-black tracking-tighter">{tasaMedia}%</div>
                <p className="text-xs mt-2 font-bold uppercase tracking-widest opacity-80">
                  Tipo estándar: 19%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla por arrendador */}
          <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-rose-50/50 border-b border-slate-100 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Percent className="w-5 h-5 text-rose-600" />
                  <div>
                    <CardTitle className="text-base font-black">Retenciones por Arrendador</CardTitle>
                    <CardDescription className="font-medium text-xs">
                      Cada proveedor corresponde a una fila del Modelo 180
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
                      <th className="px-5 py-3 text-left">Arrendador</th>
                      <th className="px-5 py-3 text-left">NIF</th>
                      <th className="px-5 py-3 text-right">Rentas Pagadas</th>
                      <th className="px-5 py-3 text-right">Retenciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.landlords.map((l: any) => (
                      <tr key={l.supplierId} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-800">{l.supplierName}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-500">{l.supplierTaxId || '-'}</td>
                        <td className="px-5 py-3 text-right font-medium">{formatCurrency(l.totalRentBase)}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-900">{formatCurrency(l.totalRetentions)}</td>
                      </tr>
                    ))}
                    <tr className="bg-rose-100/50 font-black">
                      <td className="px-5 py-3 text-sm uppercase tracking-wider text-rose-900">TOTAL</td>
                      <td className="px-5 py-3" />
                      <td className="px-5 py-3 text-right text-rose-900">{formatCurrency(totalRentBase)}</td>
                      <td className="px-5 py-3 text-right text-rose-900">{formatCurrency(totalRetentions)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Resumen trimestral */}
          <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-5">
              <CardTitle className="text-base font-black">Consolidación Trimestral (Modelo 115)</CardTitle>
              <CardDescription className="font-medium text-xs">
                Retenciones declaradas cada trimestre del ejercicio
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Trimestre</th>
                      <th className="px-5 py-3 text-right">Rentas Pagadas</th>
                      <th className="px-5 py-3 text-right">Retenciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.quarters.map((q: any) => (
                      <tr key={q.quarter} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-black text-slate-800">T{q.quarter}</span>
                          <span className="text-[10px] text-slate-400 ml-2 font-medium">
                            {['Ene-Mar', 'Abr-Jun', 'Jul-Sep', 'Oct-Dic'][q.quarter - 1]}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium">{formatCurrency(q.totalRentBase)}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-900">{formatCurrency(q.totalRetentions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Ayuda / Info */}
      <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-rose-900 text-sm">Información sobre el Modelo 180</h4>
          <p className="text-xs text-rose-700 font-medium leading-relaxed">
            El Modelo 180 es la declaración informativa anual de retenciones e ingresos a cuenta
            sobre <strong>arrendamientos de inmuebles urbanos</strong>. Consolida los 4 trimestres
            del Modelo 115 y detalla cada arrendador con sus rentas pagadas y retenciones practicadas.
          </p>
          <ul className="text-xs text-rose-700 font-medium leading-relaxed list-disc list-inside mt-1 space-y-0.5">
            <li>Presentación: <strong>enero</strong> del año siguiente (junto al 4T del Modelo 115).</li>
            <li>Los arrendadores son los proveedores de tus gastos de alquiler con retención.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
