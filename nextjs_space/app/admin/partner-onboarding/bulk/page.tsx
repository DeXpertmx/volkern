'use client';

/**
 * /admin/partner-onboarding/bulk — Wizard para que el operator (superadmin)
 * cree N partners tenants en una sola sesión a partir de un CSV.
 *
 * Flujo (4 pasos):
 *   1. Upload    →  el operator sube un .csv o pega texto. La librería
 *                   `lib/insurance/csv-bulk.ts` parsea con detección
 *                   automática de delimitador (',' o ';'), BOM UTF-8 y
 *                   manejo de RFC-4180. Auto-genera password si falta.
 *   2. Preview   →  tabla con las filas parseadas, errores de validación
 *                   y empty rows. El operator puede editar el CSV pegando
 *                   otra vez sin avanzar al siguiente paso.
 *   3. Create    →  loop sobre cada fila: POST /api/tenants/create con
 *                   concurrency=3 (3 workers procesan en paralelo).
 *                   Estado por fila: pending | running | created | error.
 *   4. Done      →  resumen { created, failed, pending } + botón de descarga
 *                   CSV con todos los IDs y estados (lib/insurance/csv-bulk
 *                   genera el reporte RFC-4180 con BOM para Excel).
 *                   ── NUEVO 2026-08-10 ──
 *                   Si hay tenants creados, muestra CTA "Seedear
 *                   verticales en bulk" con 4 cards (insurance /
 *                   real_estate / accounting / general) que llaman a
 *                   `POST /api/admin/partner-bulk/seed-vertical` para
 *                   activar el starter pack de módulos en todos los
 *                   recién creados de un click, sin entrar a
 *                   /admin/saas/tenants/{id}/modulos uno a uno.
 *
 * Reutiliza:
 *   • components/admin/onboarding-ui.tsx → Stepper, Field, SummaryRow,
 *     WizardShell (misma estética que partner-onboarding y
 *     partner-offboarding).
 *   • app/api/tenants/create/route.ts → endpoint unario por fila (no
 *     creamos endpoint bulk separado: el modelo POST uno-a-uno es más
 *     resiliente y reusa toda la lógica del provisioner).
 *   • app/api/admin/partner-bulk/seed-vertical/route.ts → endpoint que
 *     reusa seedTenantModulesFromVertical del provisioner y aplica el
 *     starter pack de la vertical elegida a los tenantIds dados.
 */

import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Pause,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  WizardShell,
  Stepper,
  Field,
  SummaryRow,
} from '@/components/admin/onboarding-ui';
import {
  parseBulkCsv,
  buildBulkResultCsv,
  type BulkParsedRow,
  type BulkResultRow,
} from '@/lib/insurance/csv-bulk';
import { VERTICAL_DEFINITIONS, VERTICALS, type Vertical } from '@/lib/plans';

type BulkStep = 'upload' | 'preview' | 'create' | 'done';

const ORDER: readonly BulkStep[] = ['upload', 'preview', 'create', 'done'];
const STEP_INDEX = (s: BulkStep): number => ORDER.indexOf(s);
const LABELS: Record<BulkStep, string> = {
  upload: '1. CSV',
  preview: '2. Vista previa',
  create: '3. Crear',
  done: '4. Listo',
};

// ─── Estados por fila ────────────────────────────────────────────────────────

type RowStatus = 'pending' | 'running' | 'created' | 'error';

interface BulkRowState {
  parsed: BulkParsedRow;
  password: string; // autogenerado si falta en CSV
  status: RowStatus;
  tenantId?: string;
  chatwootAccountId?: number;
  telegramInboxId?: number | null;
  moneda?: string;
  monedaInferenciaSource?: string;
  errorCode?: string;
  errorMessage?: string;
}

const CONCURRENCY = 3;

// ─── Auto-generador de password ─────────────────────────────────────────────

function generatePassword(length = 14): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const safe = upper + lower + digits;
  const all: string[] = [];
  all.push(upper[Math.floor(Math.random() * upper.length)]);
  all.push(lower[Math.floor(Math.random() * lower.length)]);
  all.push(digits[Math.floor(Math.random() * digits.length)]);
  for (let i = 3; i < length; i++) all.push(safe[Math.floor(Math.random() * safe.length)]);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

// ─── API helpers ────────────────────────────────────────────────────────────

interface CreateApiResponse {
  success: boolean;
  tenantId?: string;
  chatwootAccountId?: number;
  telegramInboxId?: number | null;
  telegramSkipped?: boolean;
  moneda: string;
  monedaInferenciaSource?: string;
  vertical?: string | null;
  error?: { code: string; message: string };
  message?: string;
}

async function createRow(row: BulkRowState, signal: AbortSignal): Promise<BulkRowState> {
  try {
    const res = await fetch('/api/tenants/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        empresa: row.parsed.empresa,
        subdomain: row.parsed.subdomain,
        email: row.parsed.email,
        password: row.password,
        moneda: row.parsed.moneda ?? undefined,
        vertical: row.parsed.vertical ?? undefined,
      }),
      signal,
    });
    const data: CreateApiResponse = await res.json().catch(() => ({
      success: false, moneda: 'MXN', error: { code: 'PARSE_ERROR', message: `HTTP ${res.status}` },
    }));
    if (!res.ok || !data.success) {
      return {
        ...row,
        status: 'error',
        errorCode: data.error?.code ?? `HTTP_${res.status}`,
        errorMessage: data.error?.message ?? `Error HTTP ${res.status}`,
      };
    }
    return {
      ...row,
      status: 'created',
      tenantId: data.tenantId,
      chatwootAccountId: data.chatwootAccountId,
      telegramInboxId: data.telegramInboxId ?? null,
      moneda: data.moneda,
      monedaInferenciaSource: data.monedaInferenciaSource,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ...row, status: 'pending', errorCode: 'ABORTED', errorMessage: 'Cancelado por el operador' };
    }
    return {
      ...row,
      status: 'error',
      errorCode: 'UNEXPECTED',
      errorMessage: err instanceof Error ? err.message : 'Error desconocido',
    };
  }
}

interface SeedApiResponse {
  ok: boolean;
  dryRun: boolean;
  vertical: Vertical;
  total: number;
  succeeded: number;
  partial: number;
  failed: number;
  totalSeeded: number;
  totalSkipped: number;
  tenants: Array<{
    tenantId: string;
    seeded: string[];
    skipped: string[];
    errors: Array<{ module: string; error: string }>;
    ok: boolean;
    fatalError?: string;
  }>;
  error?: { code: string; message: string };
}

interface SeedCardState {
  status: 'idle' | 'running' | 'done';
  response?: SeedApiResponse;
  error?: string;
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function PartnerOnboardingBulkPage() {
  const [step, setStep] = useState<BulkStep>('upload');
  const [csvText, setCsvText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<BulkParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<{ rowNum: number | null; message: string }[]>([]);
  const [emptyRows, setEmptyRows] = useState<number[]>([]);
  const [delimiter, setDelimiter] = useState<',' | ';' | null>(null);

  const [rows, setRows] = useState<BulkRowState[]>([]);
  const [running, setRunning] = useState(false);
  const [aborted, setAborted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Bulk vertical seed CTA (Done step) ──────────────────────────────────
  const [seedCards, setSeedCards] = useState<Record<string, SeedCardState>>({});

  function downloadReportCsv() {
    const report: BulkResultRow[] = rows.map(r => ({
      rowNum: r.parsed.rowNum,
      empresa: r.parsed.empresa,
      subdomain: r.parsed.subdomain,
      email: r.parsed.email,
      moneda: r.moneda ?? r.parsed.moneda ?? 'MXN',
      status: r.status === 'created' ? 'created'
            : r.status === 'error'  ? 'error'
            : 'pending',
      tenantId: r.tenantId,
      chatwootAccountId: r.chatwootAccountId,
      telegramInboxId: r.telegramInboxId,
      telegramStatus: r.telegramInboxId ? 'connected'
                    : r.parsed.telegramBotName ? 'skipped'
                    : 'n/a',
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      monedaInferenciaSource: r.monedaInferenciaSource,
    }));
    const csv = buildBulkResultCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-onboarding-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  }

  function parseAndGo() {
    const result = parseBulkCsv(csvText);
    setDelimiter(result.delimiter);
    setParsedRows(result.rows);
    setParseErrors(result.errors);
    setEmptyRows(result.emptyRows);
    setStep('preview');
  }

  function startCreate() {
    const states: BulkRowState[] = parsedRows.map(p => ({
      parsed: p,
      password: p.password?.trim() || generatePassword(),
      status: 'pending' as RowStatus,
    }));
    setRows(states);
    setAborted(false);
    setStep('create');
    void runCreate(states);
  }

  async function runCreate(initialStates: BulkRowState[]) {
    setRunning(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const active = [...initialStates];

    async function worker(): Promise<void> {
      while (true) {
        if (signal.aborted) return;
        const idx = active.findIndex(r => r.status === 'pending');
        if (idx === -1) return;
        active[idx] = { ...active[idx], status: 'running' };
        setRows([...active]);
        const result = await createRow(active[idx], signal);
        active[idx] = result;
        setRows([...active]);
      }
    }
    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
    setRunning(false);
    setStep('done');
  }

  function cancelCreate() {
    abortRef.current?.abort();
    setAborted(true);
    setRows(prev => prev.map(r => r.status === 'running'
      ? { ...r, status: 'pending', errorCode: 'CANCELLED', errorMessage: 'Cancelado por el operador' }
      : r));
  }

  // ─── Bulk vertical seed action ──────────────────────────────────────────
  const createdTenantIds = useMemo(
    () => rows.filter(r => r.status === 'created' && r.tenantId).map(r => r.tenantId!) ?? [],
    [rows],
  );

  async function runSeedVertical(vertical: Vertical, dryRun: boolean) {
    if (createdTenantIds.length === 0) return;
    setSeedCards(prev => ({ ...prev, [vertical]: { status: 'running' } }));
    try {
      const res = await fetch('/api/admin/partner-bulk/seed-vertical', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantIds: createdTenantIds,
          vertical,
          dryRun,
        }),
      });
      const data: SeedApiResponse = await res.json().catch(() => ({
        ok: false,
        dryRun,
        vertical,
        total: 0, succeeded: 0, partial: 0, failed: 0,
        totalSeeded: 0, totalSkipped: 0, tenants: [],
        error: { code: 'PARSE_ERROR', message: `HTTP ${res.status}` },
      }));
      if (!res.ok || data.error) {
        setSeedCards(prev => ({
          ...prev,
          [vertical]: {
            status: 'done',
            error: data.error?.message ?? `Error HTTP ${res.status}`,
          },
        }));
        return;
      }
      setSeedCards(prev => ({ ...prev, [vertical]: { status: 'done', response: data } }));
    } catch (err: unknown) {
      setSeedCards(prev => ({
        ...prev,
        [vertical]: {
          status: 'done',
          error: err instanceof Error ? err.message : 'Error desconocido',
        },
      }));
    }
  }

  // ─── Validación por paso ────────────────────────────────────────────────

  const valid = useMemo(() => {
    switch (step) {
      case 'upload':   return csvText.trim().length > 0;
      case 'preview':  return parsedRows.length > 0;
      case 'create':   return !running;
      default:         return true;
    }
  }, [step, csvText, parsedRows, running]);

  const stats = useMemo(() => {
    const created = rows.filter(r => r.status === 'created').length;
    const failed = rows.filter(r => r.status === 'error').length;
    const pending = rows.filter(r => r.status === 'pending' || r.status === 'running').length;
    return { created, failed, pending, total: rows.length };
  }, [rows]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-black text-[#1A365D] tracking-tight">Bulk Partner Onboarding</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Sube un CSV con <code className="font-mono">empresa,subdomain,email,password,moneda,vertical</code>{' '}
          (password opcional — se autogenera si falta). Wizard gemelo al de partner-onboarding,
          optimizado para crear N tenants a la vez con concurrencia={CONCURRENCY}.
        </p>
      </header>

      <Stepper order={ORDER} step={step} resolveIndex={STEP_INDEX} labels={LABELS} />

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        {step === 'upload' && (
          <Field label="CSV con los tenants a crear" hint="Sube un .csv o pega texto. Columnas esperadas: empresa, subdomain, email, password (opcional), moneda (opcional), vertical (opcional). Delimitador detectado automáticamente.">
            <div className="space-y-3 mt-2">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                ref={fileInputRef}
                className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#1A365D] file:text-white file:font-bold file:cursor-pointer"
              />
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={'empresa,subdomain,email,password,moneda,vertical\nBrokers SL,brokers,admin@b.com,MagicPwd123,EUR,insurance\nOther,other-sa,info@o.com,,,real_estate'}
                rows={6}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-xs font-mono"
              />
              <button
                type="button"
                onClick={parseAndGo}
                disabled={!csvText.trim()}
                className="px-4 py-2 bg-[#1A365D] text-white rounded-xl text-sm font-black uppercase tracking-widest shadow inline-flex items-center gap-2 hover:scale-105 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FileUp size={14} /> Parsear y previsualizar
              </button>
            </div>
          </Field>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="px-2 py-1 bg-slate-100 rounded font-mono">
                Delimitador: {delimiter === ',' ? 'coma' : delimiter === ';' ? 'punto y coma' : 'no detectado'}
              </span>
              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-bold">
                {parsedRows.length} filas listas
              </span>
              {emptyRows.length > 0 && (
                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded font-bold">
                  {emptyRows.length} filas vacías (ignoradas)
                </span>
              )}
              {parseErrors.length > 0 && (
                <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded font-bold">
                  {parseErrors.length} filas con error (ignoradas)
                </span>
              )}
            </div>

            {parseErrors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900 space-y-1 max-h-32 overflow-y-auto">
                <p className="font-bold mb-1">Errores de parseo (estas filas no se crearán):</p>
                {parseErrors.map((err, i) => (
                  <div key={i} className="font-mono">
                    {err.rowNum ? `Fila #${err.rowNum}: ` : 'Header: '}{err.message}
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">#</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Empresa</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Subdominio</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Email</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Moneda</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Vertical</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 50).map(r => (
                    <tr key={r.rowNum} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-1.5 font-mono text-slate-500">{r.rowNum}</td>
                      <td className="px-2 py-1.5 text-slate-800">{r.empresa}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-800">{r.subdomain}</td>
                      <td className="px-2 py-1.5 text-slate-800">{r.email}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-500">{r.moneda || '(auto)'}</td>
                      <td className="px-2 py-1.5 text-slate-500">{r.vertical || '(none)'}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-500">
                        {r.password ? '*** del CSV' : '(autogen)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 50 && (
                <p className="text-xs text-slate-500 p-2 border-t border-slate-200 bg-slate-50">
                  + {parsedRows.length - 50} filas más (sólo se muestran las primeras 50).
                </p>
              )}
            </div>

            {parsedRows.length === 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900">
                <p className="font-bold">No hay filas válidas para procesar.</p>
                <p className="text-xs mt-1">Vuelve al paso 1 y corrige el CSV. Las filas con errores se listan arriba.</p>
              </div>
            )}
          </div>
        )}

        {step === 'create' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-blue-900">
                <Loader2 size={16} className="animate-spin" />
                <span>
                  Creando tenants en paralelo (concurrencia={CONCURRENCY}) —
                  <span className="font-mono ml-2">
                    {stats.created + stats.failed}/{stats.total} procesados
                  </span>
                </span>
              </div>
              {!aborted && (
                <button
                  type="button"
                  onClick={cancelCreate}
                  className="px-3 py-1.5 bg-white border border-rose-300 text-rose-700 rounded-lg text-xs font-bold uppercase tracking-widest inline-flex items-center gap-1.5 hover:bg-rose-50"
                >
                  <Pause size={12} /> Cancelar
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-700 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">#</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Empresa</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Subdominio</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Estado</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.parsed.rowNum} className={`border-t border-slate-100 ${
                      r.status === 'created' ? 'bg-emerald-50' :
                      r.status === 'error'   ? 'bg-rose-50' :
                      r.status === 'running' ? 'bg-blue-50' : ''
                    }`}>
                      <td className="px-2 py-1.5 font-mono text-slate-500">{r.parsed.rowNum}</td>
                      <td className="px-2 py-1.5 text-slate-800">{r.parsed.empresa}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-800">{r.parsed.subdomain}</td>
                      <td className="px-2 py-1.5">
                        <RowStatusChip status={r.status} />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-slate-600">
                        {r.status === 'created' && r.tenantId && <span>tenant={r.tenantId.slice(0, 10)}…</span>}
                        {r.status === 'error'  && <span className="text-rose-700">{r.errorCode}: {r.errorMessage}</span>}
                        {r.status === 'running' && <span className="text-blue-700">…</span>}
                        {r.status === 'pending' && <span className="text-slate-400">en cola</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 size={32} className="text-emerald-600 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-black text-emerald-900 tracking-tight">Resultado del bulk</h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  {stats.created} creados · {stats.failed} fallos · {stats.pending} pendientes
                  {aborted && <span className="ml-2 italic">(operación cancelada por el operador)</span>}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <SummaryRow icon={<CheckCircle2 size={14} className="text-emerald-600" />} label="Creados"      value={`${stats.created} tenants`} highlighted tone="emerald" />
              <SummaryRow icon={<AlertCircle size={14} className="text-rose-600" />}     label="Fallos"       value={`${stats.failed} tenants`} tone={stats.failed > 0 ? 'rose' : 'slate'} />
              <SummaryRow icon={<Loader2 size={14} />}                                  label="Pendientes"   value={`${stats.pending} tenants`} tone="slate" />
              <SummaryRow icon={<FileUp size={14} />}                                    label="Total"        value={`${stats.total} filas procesadas`} highlighted tone="emerald" />
            </div>

            <button
              type="button"
              onClick={downloadReportCsv}
              className="w-full px-4 py-2 bg-[#1A365D] text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10 hover:scale-[1.01] transition-transform inline-flex items-center justify-center gap-1.5"
            >
              <Download size={14} /> Descargar CSV reporte
            </button>

            <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              El reporte incluye tenantId, chatwootAccountId, telegramInboxId, estado de Telegram,
              moneda con fuente de inferencia (EXPLICIT | FALLBACK | USER_PROMPT) y errores con código.
              Compatible con Excel y parsers RFC-4180.
            </p>

            {/* ─── NUEVO: Bulk Vertical Seed CTA ──────────────────────────── */}
            {createdTenantIds.length > 0 && (
              <BulkVerticalSeedCTA
                tenantIds={createdTenantIds}
                cards={seedCards}
                onSeed={(v, dry) => void runSeedVertical(v, dry)}
              />
            )}

            <div className="flex gap-2 pt-2">
              <a
                href="/admin/saas/tenants"
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
              >
                Ver tenants creados
                <ArrowRight size={14} />
              </a>
              <a
                href="/admin/partner-onboarding/bulk"
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
              >
                <RefreshCw size={14} /> Crear otro batch
              </a>
            </div>
          </div>
        )}

        <WizardShell
          order={ORDER}
          step={step}
          resolveIndex={STEP_INDEX}
          submitting={running || aborted}
          onNext={() => {
            if (step === 'upload')  { parseAndGo(); return; }
            if (step === 'preview') { startCreate();  return; }
          }}
          onPrev={() => {
            if (step === 'preview') setStep('upload');
            else if (step === 'create') cancelCreate();
            else if (step === 'done') setStep('preview');
          }}
          valid={valid}
          finalCtaLabel={step === 'preview' ? 'Crear N tenants' : undefined}
          nextCtaLabel={step === 'upload' ? 'Parsear' : step === 'preview' ? 'Crear N tenants' : step === 'create' ? 'Esperando...' : step === 'done' ? 'Listo' : 'Siguiente'}
        />
      </div>
    </div>
  );
}

function RowStatusChip({ status }: { status: RowStatus }) {
  if (status === 'pending') return <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-black uppercase tracking-widest">Pendiente</span>;
  if (status === 'running') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Creando</span>;
  if (status === 'created') return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1"><Check size={10} /> Creado</span>;
  return <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1"><AlertCircle size={10} /> Error</span>;
}

// ─── Bulk Vertical Seed CTA (Done step) ─────────────────────────────────────

/**
 * CTA inline en el paso Done: 4 cards (insurance / real_estate /
 * accounting / general) que llaman a /api/admin/partner-bulk/seed-vertical
 * con los tenantIds de los recién creados. Reusa el helper SeedCardState
 * para que cada card muestre progreso + resultado por separado.
 */
function BulkVerticalSeedCTA({
  tenantIds,
  cards,
  onSeed,
}: {
  tenantIds: string[];
  cards: Record<string, SeedCardState>;
  onSeed: (v: Vertical, dry: boolean) => void;
}) {
  return (
    <section className="space-y-3 pt-3 border-t border-slate-100">
      <header className="space-y-1">
        <h4 className="text-sm font-black uppercase tracking-widest text-[#1A365D] inline-flex items-center gap-2">
          <Sparkles size={14} className="text-[#1A365D]" />
          Seedear verticales en bulk
        </h4>
        <p className="text-xs text-slate-500">
          Activa el starter pack de módulos de una vertical para los{' '}
          <span className="font-mono font-bold">{tenantIds.length}</span> tenants recién creados,
          en lugar de entrar a <code className="font-mono">/admin/saas/tenants/&#123;id&#125;/modulos</code>{' '}
          uno a uno. Reusa <code className="font-mono">seedTenantModulesFromVertical</code> del provisioner.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(VERTICALS as readonly Vertical[]).map(vertical => (
          <VerticalCard
            key={vertical}
            vertical={vertical}
            tenantCount={tenantIds.length}
            state={cards[vertical]}
            onSeed={(dryRun) => onSeed(vertical, dryRun)}
          />
        ))}
      </div>
    </section>
  );
}

function VerticalCard({
  vertical,
  tenantCount,
  state,
  onSeed,
}: {
  vertical: Vertical;
  tenantCount: number;
  state: SeedCardState | undefined;
  onSeed: (dryRun: boolean) => void;
}) {
  const def = VERTICAL_DEFINITIONS[vertical];
  const isRunning = state?.status === 'running';
  const isDone = state?.status === 'done';
  const response = state?.response;
  const errorMsg = state?.error;

  const toneById: Record<Vertical, { bg: string; border: string; text: string; ring: string }> = {
    insurance:   { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-900',  ring: 'ring-amber-300' },
    real_estate: { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-900',   ring: 'ring-blue-300' },
    accounting:  { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-900',ring: 'ring-emerald-300' },
    general:     { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-900',  ring: 'ring-slate-300' },
  };
  const tone = toneById[vertical];

  return (
    <div className={`p-4 border ${tone.border} ${tone.bg} rounded-2xl space-y-2 transition-shadow ${isRunning ? `ring-2 ${tone.ring}` : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className={`text-sm font-black ${tone.text} flex items-center gap-1.5`}>
            <span className="text-base">{def.icon}</span>
            {def.name}
          </h5>
          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{def.description}</p>
          <p className="text-[10px] font-mono text-slate-500 mt-1">
            {def.modules.length} módulos · {tenantCount} tenants
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg text-base font-black ${tone.text} bg-white border ${tone.border}`}>
          {def.modules.length}
        </span>
      </div>

      {isDone && response && !errorMsg && (
        <div className="text-xs space-y-1.5 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
            <CheckCircle2 size={12} />
            <span>
              {response.succeeded}/{response.total} ok · {response.totalSeeded} sembrados · {response.totalSkipped} ya activos
            </span>
          </div>
          {response.failed > 0 && (
            <div className="text-rose-700">
              {response.failed} tenant(s) con error fatal — ver reporte.
            </div>
          )}
          {response.partial > 0 && (
            <div className="text-amber-700">
              {response.partial} tenant(s) con errores parciales (siguen ok=true pero con detalle).
            </div>
          )}
        </div>
      )}

      {isDone && errorMsg && (
        <div className="text-xs text-rose-700 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle size={12} /> {errorMsg}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSeed(false)}
          disabled={isRunning || (isDone && response?.ok)}
          className="flex-1 px-3 py-2 bg-[#1A365D] text-white rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5 hover:scale-[1.02] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {isRunning ? 'Sembrando…' : isDone && response?.ok ? 'Aplicado' : 'Sembrar'}
        </button>
        <button
          type="button"
          onClick={() => onSeed(true)}
          disabled={isRunning || isDone}
          className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Simula el upsert sin tocar la BD"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : 'Dry-run'}
        </button>
      </div>
    </div>
  );
}
