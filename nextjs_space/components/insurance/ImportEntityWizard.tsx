'use client';

import React, { useState, useRef } from 'react';
import { FileDown, Loader2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { descargarCsv } from '@/lib/insurance/csv-template';
import {
  buildReportFilename,
  renderReportAsCsv,
  type ImportReport,
} from '@/lib/insurance/import-report';

// ─── Tipos expuestos ─────────────────────────────────────────────────────────

export interface CanonicalColumn {
  key: string;
  label: string;
  required: boolean;
}

interface WizardMatch {
  canonical: string;
  matchedHeader: string | null;
  confidence: number;
  reason: string;
}

interface WizardAnalysis {
  fileName: string;
  delimiter: ',' | ';' | '\t';
  delimiterLabel: string;
  totalRows: number;
  columns: string[];
  preview: Record<string, string>[];
  mapeoSugerido: Record<string, string>;
  matches: WizardMatch[];
  autoMapAvailable: boolean;
}

type WizardStep = 'select' | 'analyzing' | 'mapping' | 'importing';

export interface ImportEntityWizardProps {
  /** Si el modal está abierto (controlado por el padre). */
  open: boolean;
  /** Callback al intentar cerrar el modal (con X, escape, click fuera). */
  onOpenChange: (open: boolean) => void;
  /** Endpoint del import (acepta `PUT` para analizar + `POST` para importar). */
  endpoint: string;
  /** Lista de columnas canónicas con su label humano y si son obligatorias. */
  canonicalColumns: CanonicalColumn[];
  /** Nombre del archivo template (cuando el usuario hace clic en descargar). */
  templateFilename: string;
  /** Builder que genera el cuerpo CSV del template. */
  templateBuilder: () => string;
  /** ID del input file (único por página si hay varios wizards). */
  fileInputId?: string;
  /** Etiqueta humana de la entidad para los mensajes/toasts ("Cartera", "Aseguradoras"…). */
  entityLabel: string;
  /** Callback invocado cuando el import termina bien — el padre recarga su lista. */
  onCompleted?: (report: ImportReport) => void;
  /** Texto de la columna "obligatorias" en el paso 1 (override por entidad). */
  requiredFieldsHint?: string;
  /** Texto extra en los tips del paso 1 (override por entidad). */
  extraTips?: string[];
}

// ─── Componente ──────────────────────────────────────────────────────────────

/**
 * Wizard genérico de import CSV para cualquier entidad del vertical Seguros.
 * Compatible con Pólizas, Aseguradoras, Productos y futuras entidades: el
 * padre sólo pasa `endpoint`, `canonicalColumns`, `templateFilename` y
 * `templateBuilder`.
 *
 * Flujo:
 *   1. 'select'    → file picker + botón descargar template
 *   2. 'analyzing' → PUT contra `endpoint` para detectar delimitador + sugerir mapping
 *   3. 'mapping'   → tabla editable con badge de confianza por columna
 *   4. 'importing' → POST con el mapping confirmado + toast resumen + reporte
 *
 * Cancelable: durante el paso 4 el botón "Cancelar import" aborta el POST vía
 * AbortController. Las filas insertadas antes de la cancelación permanecen en
 * BD (el servidor no implementa rollback transaccional todavía) y se avisa
 * al usuario.
 */
export function ImportEntityWizard(props: ImportEntityWizardProps) {
  const {
    open,
    onOpenChange,
    endpoint,
    canonicalColumns,
    templateFilename,
    templateBuilder,
    fileInputId = 'wizard-file-input',
    entityLabel,
    onCompleted,
    requiredFieldsHint,
    extraTips,
  } = props;

  const [wizardStep, setWizardStep] = useState<WizardStep>('select');
  const [wizardAnalysis, setWizardAnalysis] = useState<WizardAnalysis | null>(null);
  const [wizardMapping, setWizardMapping] = useState<Record<string, string>>({});
  const importAbortRef = useRef<AbortController | null>(null);

  const cerrarWizard = () => {
    if (importAbortRef.current) {
      importAbortRef.current.abort();
      importAbortRef.current = null;
    }
    onOpenChange(false);
    setWizardStep('select');
    setWizardAnalysis(null);
    setWizardMapping({});
  };

  const volverASelect = () => {
    setWizardStep('select');
    setWizardAnalysis(null);
    setWizardMapping({});
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWizardStep('analyzing');

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(endpoint, { method: 'PUT', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No pude analizar el archivo');

      const analysis = data as WizardAnalysis;
      setWizardAnalysis(analysis);
      setWizardMapping({ ...analysis.mapeoSugerido });
      setWizardStep('mapping');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar el archivo');
      setWizardStep('select');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const confirmarImportWizard = async () => {
    if (!wizardAnalysis) return;
    const faltantesRequeridos = canonicalColumns
      .filter(c => c.required && !wizardMapping[c.key])
      .map(c => c.label);
    if (faltantesRequeridos.length > 0) {
      toast.error(`Faltan columnas obligatorias: ${faltantesRequeridos.join(', ')}`);
      return;
    }
    setWizardStep('importing');
    importAbortRef.current = new AbortController();
    try {
      const inputEl = document.getElementById(fileInputId) as HTMLInputElement | null;
      const file2 = inputEl?.files?.[0];
      if (!file2) {
        toast.error('Vuelve a seleccionar el archivo para importar.');
        setWizardStep('mapping');
        return;
      }
      const fd = new FormData();
      fd.append('file', file2);
      const mappingLimpio: Record<string, string> = {};
      for (const [k, v] of Object.entries(wizardMapping)) {
        if (v && v.length > 0) mappingLimpio[k] = v;
      }
      fd.append('mapping', JSON.stringify(mappingLimpio));

      const res = await apiFetch(
        endpoint,
        { method: 'POST', body: fd, signal: importAbortRef.current.signal },
      );
      const data = await res.json();
      if (res.ok) {
        const report: ImportReport | undefined = data.report;
        if (report) {
          mostrarResumenImportacion(report);
          onCompleted?.(report);
        } else {
          toast.success(`Importación completada: ${data.importadas || 0} registros importados`);
          onCompleted?.(data as ImportReport);
        }
        cerrarWizard();
      } else {
        toast.error(data.error || 'Error al importar');
        setWizardStep('mapping');
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        toast.warning(`Importación cancelada. Los registros que ya se habían guardado permanecen en ${entityLabel.toLowerCase()}.`, {
          duration: 8000,
          description: 'Puedes revisar la lista o reimportar el archivo corregido.',
        });
        setWizardStep('mapping');
      } else {
        console.error('Error importando:', error);
        toast.error('Error al importar');
        setWizardStep('mapping');
      }
    } finally {
      importAbortRef.current = null;
    }
  };

  const cancelarImport = () => {
    if (importAbortRef.current) {
      importAbortRef.current.abort();
    }
  };

  const mostrarResumenImportacion = (report: ImportReport) => {
    const totalesPartes = [
      `${report.totalRows} procesadas`,
      `✅ ${report.importadas} importadas`,
    ];
    if (report.fallidas > 0) {
      totalesPartes.push(`⚠️ ${report.fallidas} con error`);
    }
    const detalle = totalesPartes.join(' · ');

    const subdetalle: string[] = [];
    if (report.creadas?.clientes?.length > 0) {
      const nuevos = report.creadas.clientes.filter(c => c.fueCreado).length;
      subdetalle.push(`${nuevos} cliente(s) creado(s)`);
    }
    if (report.creadas?.aseguradoras?.length > 0) {
      const nuevas = report.creadas.aseguradoras.filter(a => a.fueCreada).length;
      subdetalle.push(`${nuevas} aseguradora(s) creada(s)`);
    }
    if (report.creadas?.productos?.length > 0) {
      const nuevos = report.creadas.productos.filter(p => p.fueCreado).length;
      subdetalle.push(`${nuevos} producto(s) creado(s)`);
    }

    const opciones: Parameters<typeof toast.success>[1] = {
      duration: report.fallidas > 0 || (report.creadas?.clientes?.length ?? 0) > 0 ? 10000 : 5000,
      description: subdetalle.length > 0 ? subdetalle.join(' · ') : undefined,
    };

    if (report.fallidas > 0) {
      opciones.action = {
        label: 'Descargar reporte',
        onClick: () => {
          descargarCsv(
            buildReportFilename(report.fileName),
            renderReportAsCsv(report),
          );
          toast.success('Reporte descargado');
        },
      };
    }

    toast.success(`Importación: ${detalle}`, opciones);
  };

  const descargarTemplate = () => {
    if (descargarCsv(templateFilename, templateBuilder())) {
      toast.success('Template descargado');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => o ? onOpenChange(true) : cerrarWizard()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* ── Stepper visible: 3 fases ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {(['select', 'analyzing', 'mapping'] as const).map((s, i) => {
            const active =
              s === wizardStep ||
              (s === 'select' && wizardStep === 'importing') ||
              (s === 'analyzing' && (wizardStep === 'mapping' || wizardStep === 'importing'));
            return (
              <React.Fragment key={s}>
                <span className={`px-2 py-0.5 rounded-full ${active ? 'bg-sky-100 text-sky-700' : 'bg-muted'}`}>
                  {i + 1}. {s === 'select' ? 'Subir' : s === 'analyzing' ? 'Analizar' : 'Mapear'}
                </span>
                {i < 2 && <span>→</span>}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Paso 1: Selección de archivo ───────────────────────────────── */}
        {wizardStep === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>Importar {entityLabel}</DialogTitle>
              <DialogDescription>
                Sube tu archivo CSV. Detectamos automáticamente el delimitador y mapeamos las columnas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Selecciona tu CSV. No necesitas renombrar columnas: detectaremos el delimitador
                  y te mostraremos el mapeo antes de importar.
                </p>
                <label htmlFor={fileInputId} className="cursor-pointer">
                  <Button variant="outline" asChild>
                    <span>Seleccionar archivo</span>
                  </Button>
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImport}
                  />
                </label>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">¿No tienes un archivo listo?</p>
                  <Button variant="outline" size="sm" onClick={descargarTemplate}>
                    <FileDown className="h-3.5 w-3.5 mr-1.5" />
                    Descargar template
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  {requiredFieldsHint && <p><strong>Columnas mínimas:</strong> {requiredFieldsHint}</p>}
                  {extraTips?.map((tip, i) => <p key={i}>• {tip}</p>)}
                  <p>• Aceptamos CSV con <strong>coma</strong>, <strong>punto y coma</strong> o <strong>tab</strong>. Fechas en <code className="bg-background px-1 rounded">YYYY-MM-DD</code>.</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Paso 2: Analizando ──────────────────────────────────────────── */}
        {wizardStep === 'analyzing' && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-sky-500 mx-auto mb-4" />
            <DialogHeader className="items-center">
              <DialogTitle>Analizando archivo…</DialogTitle>
              <DialogDescription>
                Detectando delimitador y proponiendo el mapeo de columnas.
              </DialogDescription>
            </DialogHeader>
          </div>
        )}

        {/* ── Paso 3: Mapeo editable ────────────────────────────────────── */}
        {wizardStep === 'mapping' && wizardAnalysis && (
          <>
            <DialogHeader>
              <DialogTitle>Confirma el mapeo de columnas</DialogTitle>
              <DialogDescription>
                {wizardAnalysis.totalRows} filas · delimitador <strong>{wizardAnalysis.delimiterLabel}</strong> ·
                columnas detectadas: {wizardAnalysis.columns.length}
                {wizardAnalysis.autoMapAvailable
                  ? ' · sugerencia automática disponible'
                  : ' · requiere tu confirmación'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-2">
                {canonicalColumns.map((c) => {
                  const match = wizardAnalysis.matches.find(m => m.canonical === c.key);
                  const sugerido = match?.matchedHeader ?? wizardMapping[c.key] ?? '';
                  const confidence = match?.confidence ?? 0;
                  const confidenceColor =
                    confidence >= 0.85 ? 'bg-green-100 text-green-700' :
                    confidence >= 0.6 ? 'bg-amber-100 text-amber-700' :
                    confidence > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground';
                  return (
                    <div key={c.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{c.label}</span>
                          {c.required && <span className="text-red-500 text-xs">*</span>}
                        </div>
                        {match?.reason && (
                          <p className="text-xs text-muted-foreground truncate">
                            <code className="bg-background px-1 rounded">{sugerido || '—'}</code>
                            {match.reason !== 'Exacto' && match.reason !== 'Sin match' && (
                              <span className="ml-2">· {match.reason}</span>
                            )}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${confidenceColor}`}>
                        {confidence ? `${Math.round(confidence * 100)}%` : 'manual'}
                      </span>
                      <Select
                        value={wizardMapping[c.key] ?? ''}
                        onValueChange={(v) => setWizardMapping(prev => {
                          const next = { ...prev };
                          if (v === '') delete next[c.key];
                          else {
                            for (const k of Object.keys(next)) {
                              if (next[k] === v) delete next[k];
                            }
                            next[c.key] = v;
                          }
                          return next;
                        })}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue placeholder="(sin mapear)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">(sin mapear)</SelectItem>
                          {wizardAnalysis.columns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* Preview de las primeras filas */}
              <details className="rounded-lg bg-muted/30 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-foreground">
                  Vista previa · {Math.min(5, wizardAnalysis.preview.length)} de {wizardAnalysis.totalRows} filas
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        {wizardAnalysis.columns.map(col => (
                          <th key={col} className="p-1 font-medium">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {wizardAnalysis.preview.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-border/50">
                          {wizardAnalysis.columns.map(col => (
                            <td key={col} className="p-1 whitespace-nowrap">{row[col] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={cerrarWizard}>Cancelar</Button>
              <Button variant="ghost" onClick={volverASelect}>
                ← Elegir otro archivo
              </Button>
              <Button onClick={confirmarImportWizard}>
                Confirmar e importar
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Paso 4: Importando ─────────────────────────────────────────── */}
        {wizardStep === 'importing' && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-sky-500 mx-auto mb-4" />
            <DialogHeader className="items-center">
              <DialogTitle>Importando {wizardAnalysis?.fileName || ''}…</DialogTitle>
              <DialogDescription>
                Procesando {wizardAnalysis?.totalRows ?? 0} filas. Esto puede tardar unos segundos.
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="outline"
              onClick={cancelarImport}
              className="mt-6"
            >
              Cancelar import
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ImportEntityWizard;
