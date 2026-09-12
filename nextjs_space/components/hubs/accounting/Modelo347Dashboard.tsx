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
  Users,
  TrendingUp,
  TrendingDown,
  Loader2,
  Filter,
  Building2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const THRESHOLD = 3005.06;

export function Modelo347Dashboard() {
  const moneda = useMonedaTenant();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filing, setFiling] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'CLIENT' | 'SUPPLIER'>('ALL');

  useEffect(() => {
    fetchReport();
  }, [year]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/taxes/modelo347?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch (error) {
      toast.error("Error al cargar el reporte del Modelo 347");
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
      const res = await fetch("/api/accounting/taxes/modelo347", {
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
    if (!report?.hasOperations) {
      toast.error("No hay datos para exportar");
      return;
    }

    const filtered = getFilteredOps();
    const bom = '\uFEFF';
    const lines: string[] = [];

    lines.push(`Modelo 347 - ${year} - Operaciones con Terceros (Umbral: ${THRESHOLD.toFixed(2)} €)`);
    lines.push("Tipo,NIF/VAT,Razón Social,País,Nº Operaciones,Importe Total");
    
    filtered.forEach((op: any) => {
      const type = op.operationType === 'CLIENT' ? 'Cliente' : 'Proveedor';
      lines.push(`"${type}","${op.counterpartyNif}","${op.counterpartyName}","${op.counterpartyCountry}",${op.invoiceCount},"${op.totalAmount.toFixed(2)}"`);
    });

    lines.push("");
    lines.push(`Total Clientes,,${report.totalClientAmount.toFixed(2)} €`);
    lines.push(`Total Proveedores,,${report.totalSupplierAmount.toFixed(2)} €`);
    lines.push(`Total General,,${report.totalAmount.toFixed(2)} €`);

    const csv = lines.join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-347-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getFilteredOps = () => {
    if (!report?.operations) return [];
    if (filterType === 'ALL') return report.operations;
    return report.operations.filter((op: any) => op.operationType === filterType);
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Analizando operaciones anuales con terceros...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => formatearImporte(amount, moneda);

  const hasOps = report?.hasOperations || false;
  const filteredOps = getFilteredOps();
  const totalOps = report?.totalOperations || 0;
  const totalAmount = report?.totalAmount || 0;
  const totalClient = report?.totalClientAmount || 0;
  const totalSupplier = report?.totalSupplierAmount || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de año */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-100 rounded-2xl text-rose-600">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Operaciones con Terceros</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Modelo 347 - Anual</p>
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
      {!hasOps ? (
        <Card className="border-none shadow-xl ring-1 ring-slate-200">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 mb-4">
              <Building2 className="w-8 h-8 text-rose-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Sin operaciones que declarar</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No se encontraron operaciones superiores a <strong>{formatCurrency(THRESHOLD)}</strong> en {year}.
              El Modelo 347 es obligatorio cuando el volumen anual con un cliente o proveedor supera este umbral.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Total contrapartes */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-rose-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Contrapartes</CardTitle>
                  <Users className="w-5 h-5 text-rose-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{totalOps}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Clientes + Proveedores</p>
              </CardContent>
            </Card>

            {/* Clientes */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-teal-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Clientes</CardTitle>
                  <TrendingUp className="w-5 h-5 text-teal-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalClient)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Facturación agregada</p>
              </CardContent>
            </Card>

            {/* Proveedores */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-violet-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Proveedores</CardTitle>
                  <TrendingDown className="w-5 h-5 text-violet-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalSupplier)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Compras agregadas</p>
              </CardContent>
            </Card>

            {/* Umbral */}
            <Card className="border-none shadow-xl bg-slate-900 text-white overflow-hidden group">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest opacity-60">Umbral Mínimo</CardTitle>
                  <Filter className="w-5 h-5 opacity-60" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black tracking-tighter">{formatCurrency(THRESHOLD)}</div>
                <p className="text-xs mt-2 font-bold uppercase tracking-widest opacity-80">
                  Límite legal AEAT
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de operaciones */}
          <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-rose-50/50 border-b border-slate-100 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-rose-600" />
                  <div>
                    <CardTitle className="text-base font-black">Operaciones declaradas en {year}</CardTitle>
                    <CardDescription className="font-medium text-xs">
                      Solo se muestran contrapartes con importe total anual superior a {formatCurrency(THRESHOLD)}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Filtro tipo */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
                    {(['ALL', 'CLIENT', 'SUPPLIER'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setFilterType(t)}
                        className={cn(
                          "px-3 py-1.5 rounded-md font-black transition-all",
                          filterType === t ? "bg-white shadow-sm text-rose-600" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {t === 'ALL' ? 'Todos' : t === 'CLIENT' ? 'Clientes' : 'Proveedores'}
                      </button>
                    ))}
                  </div>
                  <Button 
                    variant="outline" 
                    className="rounded-xl border-slate-200 h-9 gap-1.5 text-xs"
                    onClick={handleExportCsv}
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                  <Button 
                    className="rounded-xl h-9 gap-1.5 text-xs premium-gradient-primary shadow-lg shadow-primary/20"
                    onClick={handleFileReturn}
                    disabled={filing}
                  >
                    {filing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Presentado
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Tipo</th>
                      <th className="px-5 py-3 text-left">NIF / VAT</th>
                      <th className="px-5 py-3 text-left">Razón Social</th>
                      <th className="px-5 py-3 text-left">País</th>
                      <th className="px-5 py-3 text-right">Nº Ops.</th>
                      <th className="px-5 py-3 text-right">Importe Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOps.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-400 font-medium">
                          No hay operaciones del tipo seleccionado
                        </td>
                      </tr>
                    ) : (
                      filteredOps.map((op: any, idx: number) => (
                        <tr key={`${op.operationType}-${op.counterpartyNif}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter",
                              op.operationType === 'CLIENT' 
                                ? "bg-teal-100 text-teal-700" 
                                : "bg-violet-100 text-violet-700"
                            )}>
                              {op.operationType === 'CLIENT' ? 'Cliente' : 'Proveedor'}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs font-bold text-slate-600">
                            {op.counterpartyNif || '—'}
                          </td>
                          <td className="px-5 py-3 font-bold text-slate-700 max-w-[250px] truncate" title={op.counterpartyName}>
                            {op.counterpartyName}
                          </td>
                          <td className="px-5 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
                              {op.counterpartyCountry}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-slate-600">
                            {op.invoiceCount}
                          </td>
                          <td className="px-5 py-3 text-right font-black text-slate-900">
                            {formatCurrency(op.totalAmount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Resumen informativo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none bg-teal-50/30 shadow-sm ring-1 ring-teal-100 overflow-hidden">
              <CardContent className="p-5 flex items-center gap-4">
                <TrendingUp className="w-8 h-8 text-teal-600 shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-teal-600">Total Clientes</p>
                  <p className="text-2xl font-black text-teal-900">{formatCurrency(totalClient)}</p>
                  <p className="text-xs text-teal-700 font-medium mt-0.5">
                    {report?.operations?.filter((o: any) => o.operationType === 'CLIENT').length || 0} contrapartes
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none bg-violet-50/30 shadow-sm ring-1 ring-violet-100 overflow-hidden">
              <CardContent className="p-5 flex items-center gap-4">
                <TrendingDown className="w-8 h-8 text-violet-600 shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-violet-600">Total Proveedores</p>
                  <p className="text-2xl font-black text-violet-900">{formatCurrency(totalSupplier)}</p>
                  <p className="text-xs text-violet-700 font-medium mt-0.5">
                    {report?.operations?.filter((o: any) => o.operationType === 'SUPPLIER').length || 0} contrapartes
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Ayuda / Info */}
      <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-rose-900 text-sm">Información sobre el Modelo 347</h4>
          <p className="text-xs text-rose-700 font-medium leading-relaxed">
            Este reporte recoge todas las operaciones anuales con cada cliente y proveedor que superen 
            los <strong>{formatCurrency(THRESHOLD)}€</strong> en el ejercicio. Se genera automáticamente 
            a partir de las facturas emitidas (clientes) y los gastos registrados (proveedores) en Volkern.
          </p>
          <ul className="text-xs text-rose-700 font-medium leading-relaxed list-disc list-inside mt-1 space-y-0.5">
            <li><strong>Clientes:</strong> Se agrupan por su NIF/CIF del perfil fiscal. Umbral: facturación anual &gt; {formatCurrency(THRESHOLD)}€.</li>
            <li><strong>Proveedores:</strong> Se agrupan por su NIF del registro de proveedores. Umbral: compras anuales &gt; {formatCurrency(THRESHOLD)}€.</li>
          </ul>
          <p className="text-xs text-rose-700 font-medium leading-relaxed mt-1">
            Plazo de presentación: <strong>Febrero</strong> del año siguiente al ejercicio declarado.
          </p>
        </div>
      </div>
    </div>
  );
}
