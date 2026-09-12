'use client';

import { useRef, useState } from 'react';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, XCircle, Download, Columns3, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

interface ImportRow {
  row: number;
  supplierName: string;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  date: string | null;
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  supplierCreated?: boolean;
  preview?: {
    taxableBase: number;
    vatAmount: number;
    total: number;
    tramos: { rate: number; base: number; amount: number }[];
  };
}

interface ImportResult {
  mode: string;
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  rows: ImportRow[];
  headerErrors?: string[];
  detectedColumns?: string[];
  autoMapping?: Record<string, number>;
  error?: string;
}

// Campos esperados (claves canónicas del mapeo)
const FIELD_LABELS: { key: string; label: string; required?: boolean }[] = [
  { key: 'NOMBRE', label: 'NOMBRE (proveedor)', required: true },
  { key: 'C.I.F.', label: 'C.I.F. / NIF' },
  { key: 'FECHA', label: 'FECHA', required: true },
  { key: 'Nº FRA.', label: 'Nº de factura' },
  { key: 'BASE 21%', label: 'BASE 21%' },
  { key: 'BASE 10%', label: 'BASE 10%' },
  { key: 'BASE 7,5%', label: 'BASE 7,5%' },
  { key: 'BASE 5%', label: 'BASE 5%' },
  { key: 'BASE 4%', label: 'BASE 4%' },
  { key: 'BASE 2%', label: 'BASE 2%' },
  { key: 'BASE 0%', label: 'BASE 0%' },
  { key: 'IVA', label: 'IVA (cuota total)' },
  { key: 'TOTAL', label: 'TOTAL' },
];

export function ImportGastosModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moneda = useMonedaTenant();
  // La previsualización de la importación se escribe en la divisa del tenant.
  const fmt = (n: number) => formatearImporte(n, moneda);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [committed, setCommitted] = useState(false);

  // ── Mapeo manual de columnas ──────────────────────────────────────────
  const [showMapping, setShowMapping] = useState(false);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [mappingTouched, setMappingTouched] = useState(false);
  const [noHeader, setNoHeader] = useState(false);
  const fileColumns = result?.detectedColumns || [];

  const reset = () => {
    setFile(null);
    setResult(null);
    setCommitted(false);
    setShowMapping(false);
    setMapping({});
    setMappingTouched(false);
    setNoHeader(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  const run = async (mode: 'preview' | 'commit') => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (showMapping && Object.keys(mapping).length > 0) {
        formData.append('mapping', JSON.stringify(mapping));
        formData.append('noHeader', String(noHeader));
      }
      const res = await fetch(`/api/erp/expenses/import?mode=${mode}`, {
        method: 'POST',
        body: formData,
      });
      const data: ImportResult = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al procesar el fichero');
        if (data.headerErrors) {
          setResult(data);
          setShowMapping(true);
        }
        return;
      }
      setResult(data);

      // Prellenar el mapeo con la detección automática la primera vez
      if (!mappingTouched && data.autoMapping && Object.keys(data.autoMapping).length > 0) {
        setMapping(data.autoMapping);
      }

      if (mode === 'commit') {
        setCommitted(true);
        if (data.imported > 0) {
          toast.success(`${data.imported} gastos importados correctamente`);
          onSuccess?.();
        } else {
          toast.warning('No se importó ningún gasto');
        }
      }
    } catch (e) {
      toast.error('Error de red al procesar el fichero');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch('/api/erp/expenses/import/template');
      if (!res.ok) {
        toast.error('No se pudo descargar la plantilla');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-gastos.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Plantilla descargada');
    } catch {
      toast.error('Error al descargar la plantilla');
    }
  };

  const onFileChange = (f: File | null) => {
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['xls', 'xlsx'].includes(ext)) {
      toast.error('Formato no válido. Sube un archivo .xls o .xlsx');
      return;
    }
    setFile(f);
    setResult(null);
    setCommitted(false);
    setShowMapping(false);
    setMappingTouched(false);
    run('preview');
  };

  const resetMapping = () => {
    setMapping({});
    setMappingTouched(false);
    setNoHeader(false);
    run('preview');
  };

  const applyMappingPreview = () => {
    setMappingTouched(true);
    run('preview');
  };

  const validRows = result?.rows.filter((r) => r.ok) || [];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Importar Gastos desde Excel
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>Formato esperado: NOMBRE · C.I.F. · FECHA · Nº FRA. · BASE 21%..0% · IVA · TOTAL</span>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1 text-emerald-600 font-bold hover:underline text-xs whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" /> Descargar plantilla (XLSX)
            </button>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4">
          {/* Selector de archivo */}
          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
                <p className="font-bold text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">Haz clic para elegir otro archivo</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-slate-300" />
                <p className="font-bold text-sm">Arrastra o selecciona un archivo .xls / .xlsx</p>
                <p className="text-xs text-muted-foreground">Se generará una vista previa antes de importar</p>
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-5 w-5 animate-spin" /> Procesando fichero...
            </div>
          )}

          {/* Errores de encabezado */}
          {result?.headerErrors && result.headerErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p className="font-bold text-sm text-red-700 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> El fichero no tiene el formato esperado
              </p>
              {result.headerErrors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">• {e}</p>
              ))}
            </div>
          )}

          {/* Aviso cuando hay detección automática OK pero el fichero no coincide */}
          {!result?.headerErrors && file && (
            <button
              onClick={() => setShowMapping(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 transition-colors"
            >
              <Columns3 className="h-3.5 w-3.5" />
              {showMapping ? 'Ocultar mapeo de columnas' : 'El fichero usa otras columnas? Mapear manualmente'}
            </button>
          )}

          {/* Editor de mapeo manual */}
          {showMapping && fileColumns.length > 0 && (
            <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm text-blue-900 flex items-center gap-2">
                  <Columns3 className="h-4 w-4" /> Mapeo de columnas
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={resetMapping}>
                    <Wand2 className="h-3 w-3 mr-1" /> Detección automática
                  </Button>
                  <Button size="sm" className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700" onClick={applyMappingPreview} disabled={loading}>
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Previsualizar
                  </Button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noHeader}
                  onChange={(e) => setNoHeader(e.target.checked)}
                />
                La primera fila ya son datos (el fichero no tiene encabezado)
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FIELD_LABELS.map(({ key, label, required }) => (
                  <label key={key} className="flex items-center gap-2 text-xs">
                    <span className="w-40 shrink-0 font-bold text-slate-700 truncate">
                      {label}
                      {required && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                    <select
                      value={mapping[key] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMapping((m) => ({ ...m, [key]: v === '' ? null : Number(v) }));
                        setMappingTouched(true);
                      }}
                      className="flex-1 h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400"
                    >
                      <option value="">— Ignorar —</option>
                      {fileColumns.map((col, i) => (
                        <option key={i} value={i}>{col}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Resumen */}
          {result && !result.headerErrors && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-emerald-600">{committed ? result.imported : validRows.length}</p>
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                  {committed ? 'Importados' : 'Válidos'}
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-amber-600">{result.duplicates}</p>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Duplicados</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-red-600">{result.errors}</p>
                <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Con error</p>
              </div>
            </div>
          )}

          {/* Tabla de filas */}
          {result && !result.headerErrors && result.rows.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">Fila</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">Proveedor</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">C.I.F.</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">Nº FRA.</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">Fecha</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">Base</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">IVA</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">Total</th>
                      <th className="px-3 py-2 font-black uppercase text-[10px]">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.rows.map((r) => (
                      <tr key={r.row} className={r.ok ? '' : 'bg-red-50/40'}>
                        <td className="px-3 py-2 text-slate-400">{r.row}</td>
                        <td className="px-3 py-2 font-bold">
                          {r.supplierName}
                          {r.supplierCreated && (
                            <Badge className="ml-1 bg-emerald-100 text-emerald-700 text-[9px] border-none">nuevo</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{r.supplierTaxId || '—'}</td>
                        <td className="px-3 py-2 font-mono">{r.invoiceNumber || '—'}</td>
                        <td className="px-3 py-2">{r.date ? new Date(r.date).toLocaleDateString('es-ES') : '—'}</td>
                        <td className="px-3 py-2">{r.preview ? fmt(r.preview.taxableBase) : '—'}</td>
                        <td className="px-3 py-2">{r.preview ? fmt(r.preview.vatAmount) : '—'}</td>
                        <td className="px-3 py-2 font-black">{r.preview ? fmt(r.preview.total) : '—'}</td>
                        <td className="px-3 py-2">
                          {r.duplicate ? (
                            <Badge className="bg-amber-100 text-amber-700 text-[9px] border-none">Duplicado</Badge>
                          ) : r.ok ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[9px] border-none">
                              {committed ? 'Importado' : 'OK'}
                            </Badge>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 font-semibold text-[10px]">
                              <AlertTriangle className="h-3 w-3" /> {r.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 gap-2">
          {committed ? (
            <Button onClick={close} className="gap-2">
              <CheckCircle2 className="h-4 w-4" /> Cerrar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button
                onClick={() => run('commit')}
                disabled={!file || loading || !result || validRows.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Importar {validRows.length > 0 ? `${validRows.length} gasto${validRows.length !== 1 ? 's' : ''}` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}