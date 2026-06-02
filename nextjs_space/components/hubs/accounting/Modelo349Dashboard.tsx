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
  ArrowUpRight, 
  ArrowDownLeft, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Globe,
  Loader2,
  Ship,
  Plane,
  Euro
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Modelo349Dashboard() {
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
      const res = await fetch(`/api/accounting/taxes/modelo349?year=${year}&quarter=${quarter}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch (error) {
      toast.error("Error al cargar el reporte del Modelo 349");
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
      const res = await fetch("/api/accounting/taxes/modelo349", {
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
    if (!report?.hasOperations) {
      toast.error("No hay datos para exportar");
      return;
    }

    const bom = '\uFEFF';
    const lines: string[] = [];

    // Sección Entregas
    lines.push("=== ENTREGAS INTRACOMUNITARIAS (Modelo 349) ===");
    lines.push("NIF/VAT Cliente,País,Cliente,Factura,Fecha,Importe");
    report.deliveries.forEach((d: any) => {
      const date = new Date(d.invoiceDate).toLocaleDateString('es-ES');
      lines.push(`"${d.clientVatId}","${d.clientCountry}","${d.clientName}","${d.invoiceNumber}","${date}","${Number(d.amount).toFixed(2)}"`);
    });
    lines.push(`,,,,,${report.totalDeliveries.toFixed(2)}`);
    lines.push("");

    // Sección Adquisiciones
    lines.push("=== ADQUISICIONES INTRACOMUNITARIAS (Modelo 349) ===");
    lines.push("NIF Proveedor,País,Proveedor,Concepto,Fecha,Importe");
    report.acquisitions.forEach((a: any) => {
      const date = new Date(a.expenseDate).toLocaleDateString('es-ES');
      lines.push(`"${a.supplierTaxId}","${a.supplierCountry}","${a.supplierName}","${a.expenseDescription}","${date}","${Number(a.amount).toFixed(2)}"`);
    });
    lines.push(`,,,,,${report.totalAcquisitions.toFixed(2)}`);

    const csv = lines.join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-349-t${quarter}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Analizando operaciones intracomunitarias...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const hasOps = report?.hasOperations || false;
  const totalDeliveries = report?.totalDeliveries || 0;
  const totalAcquisitions = report?.totalAcquisitions || 0;
  const deliveryCount = report?.deliveryCount || 0;
  const acquisitionCount = report?.acquisitionCount || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de periodo */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-2xl text-blue-600">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">IVA Intracomunitario</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Modelo 349 - Trimestral</p>
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

      {/* Empty state */}
      {!hasOps ? (
        <Card className="border-none shadow-xl ring-1 ring-slate-200">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
              <Globe className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Sin operaciones intracomunitarias</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No se encontraron entregas ni adquisiciones con países de la UE para el T{quarter} de {year}.
              Asegúrate de que tus clientes/proveedores tengan configurado su perfil fiscal con 
              ID Intracomunitario (VAT) en la ficha de contacto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Entregas */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-teal-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Entregas UE</CardTitle>
                  <Ship className="w-5 h-5 text-teal-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalDeliveries)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">{deliveryCount} operación{deliveryCount !== 1 ? 'es' : ''}</p>
              </CardContent>
            </Card>

            {/* Adquisiciones */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className="h-1.5 bg-violet-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Adquisiciones UE</CardTitle>
                  <Plane className="w-5 h-5 text-violet-500 group-hover:scale-125 transition-transform" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-slate-900">{formatCurrency(totalAcquisitions)}</div>
                <p className="text-xs text-slate-500 mt-1 font-medium">{acquisitionCount} operación{acquisitionCount !== 1 ? 'es' : ''}</p>
              </CardContent>
            </Card>

            {/* Diferencia */}
            <Card className="border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden group">
              <div className={cn("h-1.5", totalDeliveries >= totalAcquisitions ? "bg-emerald-500" : "bg-amber-500")} />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Saldo Neto</CardTitle>
                  <Euro className={cn("w-5 h-5 group-hover:scale-125 transition-transform", totalDeliveries >= totalAcquisitions ? "text-emerald-500" : "text-amber-500")} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={cn("text-3xl font-black", totalDeliveries >= totalAcquisitions ? "text-slate-900" : "text-amber-600")}>
                  {formatCurrency(totalDeliveries - totalAcquisitions)}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">Entregas - Adquisiciones</p>
              </CardContent>
            </Card>

            {/* Total ops */}
            <Card className="border-none shadow-xl bg-slate-900 text-white overflow-hidden group">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black uppercase tracking-widest opacity-60">Total Ops.</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-black tracking-tighter">{deliveryCount + acquisitionCount}</div>
                <p className="text-xs mt-2 font-bold uppercase tracking-widest opacity-80">
                  Operaciones con la UE
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de Entregas */}
          <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-teal-50/50 border-b border-slate-100 py-5">
              <div className="flex items-center gap-3">
                <ArrowUpRight className="w-5 h-5 text-teal-600" />
                <div>
                  <CardTitle className="text-base font-black">Entregas Intracomunitarias</CardTitle>
                  <CardDescription className="font-medium text-xs">
                    Ventas a clientes en otros países de la UE (exentas de IVA por inversión de sujeto pasivo)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Cliente</th>
                      <th className="px-5 py-3 text-left">NIF/VAT</th>
                      <th className="px-5 py-3 text-left">País</th>
                      <th className="px-5 py-3 text-left">Factura</th>
                      <th className="px-5 py-3 text-left">Fecha</th>
                      <th className="px-5 py-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.deliveries.map((d: any) => (
                      <tr key={d.invoiceId} className="hover:bg-teal-50/30 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-700">{d.clientName}</td>
                        <td className="px-5 py-3 font-mono text-xs">{d.clientVatId}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
                            {d.clientCountry}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">{d.invoiceNumber}</td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{new Date(d.invoiceDate).toLocaleDateString('es-ES')}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-900">{formatCurrency(d.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-teal-50/50 font-black">
                      <td colSpan={5} className="px-5 py-3 text-xs uppercase tracking-wider">Total Entregas</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(totalDeliveries)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Tabla de Adquisiciones */}
          <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="bg-violet-50/50 border-b border-slate-100 py-5">
              <div className="flex items-center gap-3">
                <ArrowDownLeft className="w-5 h-5 text-violet-600" />
                <div>
                  <CardTitle className="text-base font-black">Adquisiciones Intracomunitarias</CardTitle>
                  <CardDescription className="font-medium text-xs">
                    Compras a proveedores de otros países de la UE (sujetas a inversión de sujeto pasivo)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-5 py-3 text-left">Proveedor</th>
                      <th className="px-5 py-3 text-left">NIF/VAT</th>
                      <th className="px-5 py-3 text-left">País</th>
                      <th className="px-5 py-3 text-left">Concepto</th>
                      <th className="px-5 py-3 text-left">Fecha</th>
                      <th className="px-5 py-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.acquisitions.map((a: any) => (
                      <tr key={a.expenseId} className="hover:bg-violet-50/30 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-700">{a.supplierName}</td>
                        <td className="px-5 py-3 font-mono text-xs">{a.supplierTaxId}</td>
                        <td className="px-5 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
                            {a.supplierCountry}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-600 text-xs max-w-[200px] truncate" title={a.expenseDescription}>
                          {a.expenseDescription}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{new Date(a.expenseDate).toLocaleDateString('es-ES')}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-900">{formatCurrency(a.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-violet-50/50 font-black">
                      <td colSpan={5} className="px-5 py-3 text-xs uppercase tracking-wider">Total Adquisiciones</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(totalAcquisitions)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Actions bar */}
          <div className="flex justify-end gap-3">
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
        </>
      )}

      {/* Ayuda / Info */}
      <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex gap-4">
        <AlertCircle className="w-6 h-6 text-blue-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="font-bold text-blue-900 text-sm">Información sobre el Modelo 349</h4>
          <p className="text-xs text-blue-700 font-medium leading-relaxed">
            Este reporte recoge las operaciones intracomunitarias (B2B) con otros países de la Unión Europea:
          </p>
          <ul className="text-xs text-blue-700 font-medium leading-relaxed list-disc list-inside mt-1 space-y-0.5">
            <li><strong>Entregas:</strong> Ventas a clientes UE con VAT intracomunitario. Se detectan automáticamente desde el perfil fiscal del contacto.</li>
            <li><strong>Adquisiciones:</strong> Compras a proveedores UE. Se detectan por el prefijo del NIF (DE, FR, IT...) en la ficha del proveedor.</li>
          </ul>
          <p className="text-xs text-blue-700 font-medium leading-relaxed mt-1">
            Asegúrate de que cada contacto UE tenga su <strong>ID Intracomunitario (VAT)</strong> configurado en Datos Fiscales para una detección precisa.
          </p>
        </div>
      </div>
    </div>
  );
}
