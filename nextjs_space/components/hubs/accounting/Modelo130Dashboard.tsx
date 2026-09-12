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
  TrendingUp, 
  TrendingDown, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Calculator,
  Loader2,
  Landmark,
  PiggyBank
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Modelo130Dashboard() {
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
      const res = await fetch(`/api/accounting/taxes/modelo130?year=${year}&quarter=${quarter}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch (error) {
      toast.error("Error al cargar el reporte del Modelo 130");
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
      const res = await fetch("/api/accounting/taxes/modelo130", {
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
    if (!report?.hasActivity) {
      toast.error("No hay datos para exportar");
      return;
    }

    const bom = '\uFEFF';
    const lines: string[] = [];

    // Sección Ingresos
    lines.push("=== INGRESOS ===");
    lines.push("Cuenta,Concepto,Importe");
    report.details.incomeAccounts.forEach((a: any) => {
      lines.push(`"${a.code}","${a.name}","${formatCurrency(a.amount)}"`);
    });
    lines.push(`,,${formatCurrency(report.totalIncome)}`);
    lines.push("");

    // Sección Gastos
    lines.push("=== GASTOS ===");
    lines.push("Cuenta,Concepto,Importe");
    report.details.expenseAccounts.forEach((a: any) => {
      lines.push(`"${a.code}","${a.name}","${formatCurrency(a.amount)}"`);
    });
    lines.push(`,,${formatCurrency(report.totalExpenses)}`);
    lines.push("");

    // Resumen
    lines.push("=== RESUMEN MODELO 130 ===");
    lines.push(`Total Ingresos,,${formatCurrency(report.totalIncome)}`);
    lines.push(`Total Gastos,,${formatCurrency(report.totalExpenses)}`);
    lines.push(`Base (Ingresos - Gastos),,${formatCurrency(report.netBase)}`);
    lines.push(`Tipo Aplicado,,${(report.paymentRate * 100).toFixed(0)}%`);
    lines.push(`Resultado a Ingresar,,${formatCurrency(report.resultToPay)}`);

    const csv = lines.join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-130-t${quarter}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Calculando pago fraccionado del IRPF...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => formatearImporte(amount, moneda);

  const hasActivity = report?.hasActivity || false;
  const totalIncome = report?.totalIncome || 0;
  const totalExpenses = report?.totalExpenses || 0;
  const netBase = report?.netBase || 0;
  const resultToPay = report?.resultToPay || 0;
  const paymentRate = report?.paymentRate || 0.20;
  const isResultPositive = resultToPay > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de periodo */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Pago Fraccionado IRPF</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Modelo 130 - Estimación Directa</p>
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

      {!hasActivity ? (
        <Card className="border-none shadow-xl ring-1 ring-slate-200">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <Calculator className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Sin actividad en el período</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No se encontraron asientos contables con ingresos o gastos para el T{quarter} de {year}. 
              El Modelo 130 se calcula automáticamente en base a tu contabilidad inmutable.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Ingresos */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-emerald-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Ingresos</CardTitle>
                  <TrendingUp className="w-5 h-5 text-emerald-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalIncome)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Cuentas del Grupo 7</p>
              </CardContent>
            </Card>

            {/* Gastos */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-red-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Gastos</CardTitle>
                  <TrendingDown className="w-5 h-5 text-red-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalExpenses)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Cuentas del Grupo 6</p>
              </CardContent>
            </Card>

            {/* Base */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className={cn("h-1.5", netBase >= 0 ? "bg-blue-500" : "bg-amber-500")} />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Base</CardTitle>
                  <Calculator className={cn("w-5 h-5 group-hover:scale-125 transition-transform", netBase >= 0 ? "text-blue-500" : "text-amber-500")} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={cn("text-3xl font-black", netBase >= 0 ? "text-slate-900" : "text-amber-600")}>
                  {formatCurrency(netBase)}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Ingresos - Gastos</p>
              </CardContent>
            </Card>

            {/* Resultado a ingresar */}
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
                  )}>Resultado</CardTitle>
                  <PiggyBank className={cn(
                    "w-5 h-5 group-hover:scale-125 transition-transform",
                    isResultPositive ? "text-emerald-400" : "text-slate-300"
                  )} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={cn("text-3xl font-black", isResultPositive ? "text-white" : "text-slate-400")}>
                  {isResultPositive ? formatCurrency(resultToPay) : '0,00 €'}
                </div>
                <p className={cn("text-xs mt-1 font-medium", isResultPositive ? "text-emerald-300" : "text-slate-500")}>
                  {isResultPositive ? `Pago fraccionado al ${(paymentRate * 100).toFixed(0)}%` : 'No procede pago'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Desglose detallado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ingresos detalle */}
            <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
              <CardHeader className="bg-emerald-50/50 border-b border-slate-100 py-5">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  <div>
                    <CardTitle className="text-base font-black">Ingresos del Período</CardTitle>
                    <CardDescription className="font-medium text-xs">Grupo 7 - Ventas y Prestaciones</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Cuenta</th>
                      <th className="px-5 py-3 text-left">Concepto</th>
                      <th className="px-5 py-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.details.incomeAccounts.map((acc: any) => (
                      <tr key={acc.code} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs font-bold text-slate-600">{acc.code}</td>
                        <td className="px-5 py-3 font-medium text-slate-700">{acc.name}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700">{formatCurrency(acc.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-50/50 font-black">
                      <td className="px-5 py-3 text-xs uppercase tracking-wider">Total</td>
                      <td className="px-5 py-3"></td>
                      <td className="px-5 py-3 text-right text-emerald-800">{formatCurrency(totalIncome)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Gastos detalle */}
            <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
              <CardHeader className="bg-red-50/50 border-b border-slate-100 py-5">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                  <div>
                    <CardTitle className="text-base font-black">Gastos del Período</CardTitle>
                    <CardDescription className="font-medium text-xs">Grupo 6 - Compras y Gastos</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Cuenta</th>
                      <th className="px-5 py-3 text-left">Concepto</th>
                      <th className="px-5 py-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.details.expenseAccounts.map((acc: any) => (
                      <tr key={acc.code} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs font-bold text-slate-600">{acc.code}</td>
                        <td className="px-5 py-3 font-medium text-slate-700">{acc.name}</td>
                        <td className="px-5 py-3 text-right font-bold text-red-700">{formatCurrency(acc.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-red-50/50 font-black">
                      <td className="px-5 py-3 text-xs uppercase tracking-wider">Total</td>
                      <td className="px-5 py-3"></td>
                      <td className="px-5 py-3 text-right text-red-800">{formatCurrency(totalExpenses)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Resultado final */}
          <Card className="border-none shadow-xl overflow-hidden">
            <CardHeader className={cn(
              "border-b py-5",
              isResultPositive ? "bg-slate-900 text-white" : "bg-slate-50"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calculator className={cn("w-5 h-5", isResultPositive ? "text-emerald-400" : "text-slate-400")} />
                  <div>
                    <CardTitle className="text-base font-black">Liquidación del Pago Fraccionado</CardTitle>
                    <CardDescription className={cn("font-medium text-xs", isResultPositive ? "text-slate-400" : "text-slate-500")}>
                      Cálculo automático basado en tu contabilidad inmutable para el T{quarter} de {year}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant={isResultPositive ? "secondary" : "outline"} 
                    className="rounded-xl h-10 gap-2"
                    onClick={handleExportCsv}
                  >
                    <Download className="w-4 h-4" /> Exportar CSV
                  </Button>
                  <Button 
                    className={cn(
                      "rounded-xl h-10 gap-2",
                      isResultPositive 
                        ? "bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 text-white" 
                        : "bg-slate-800 hover:bg-slate-900 text-white"
                    )}
                    onClick={handleFileReturn}
                    disabled={filing}
                  >
                    {filing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Marcar como Presentado
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center p-5 bg-emerald-50 rounded-2xl">
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-1">Total Ingresos</span>
                  <span className="text-2xl font-black text-emerald-900">{formatCurrency(totalIncome)}</span>
                </div>
                <div className="flex flex-col items-center p-5 bg-red-50 rounded-2xl">
                  <span className="text-xs font-black uppercase tracking-widest text-red-600 mb-1">Total Gastos</span>
                  <span className="text-2xl font-black text-red-900">- {formatCurrency(totalExpenses)}</span>
                </div>
                <div className={cn(
                  "flex flex-col items-center p-5 rounded-2xl",
                  isResultPositive ? "bg-slate-900" : "bg-slate-100"
                )}>
                  <span className={cn(
                    "text-xs font-black uppercase tracking-widest mb-1",
                    isResultPositive ? "text-emerald-400" : "text-slate-500"
                  )}>
                    {isResultPositive ? `A Ingresar (${(paymentRate * 100).toFixed(0)}%)` : 'Resultado'}
                  </span>
                  <span className={cn(
                    "text-2xl font-black",
                    isResultPositive ? "text-white" : "text-slate-400"
                  )}>
                    {isResultPositive ? formatCurrency(resultToPay) : '0,00 €'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Ayuda / Info */}
      <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-emerald-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-emerald-900 text-sm">Información sobre el Modelo 130</h4>
          <p className="text-xs text-emerald-700 font-medium leading-relaxed">
            Este reporte calcula el pago fraccionado del IRPF en estimación directa: 
            <strong> ({'Ingresos - Gastos'} ) × 20%</strong>. 
            Los datos provienen de los asientos contables registrados en Volkern. 
            Si el resultado es positivo, debes ingresar ese importe a Hacienda dentro del plazo correspondiente. 
            Si el resultado es cero o negativo, no procede pago fraccionado. Asegúrate de que todos tus 
            ingresos y gastos del trimestre estén correctamente contabilizados antes de presentar.
          </p>
        </div>
      </div>
    </div>
  );
}
