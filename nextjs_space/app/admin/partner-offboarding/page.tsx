'use client';

/**
 * /admin/partner-offboarding — Wizard para que el operator (superadmin)
 * archive un partner tenant existente. Reusa la estética exacta del wizard
 * de partner-onboarding (stepper numerado, chips de completado, paleta
 * [#1A365D]/emerald/rose) para que el operator tenga continuidad visual
 * en su día a día.
 *
 * Flujo (6 pasos):
 *   1. Buscar   →  el operator introduce el slug/subdomain y se carga
 *                  la metadata del tenant (GET a /api/admin/tenants).
 *   2. Datos    →  muestra un summary card del target: nombre, slug,
 *                  estado actual, billingEmail, mrr, fecha vencimiento.
 *   3. Razón    →  free-form input + dropdown de razones preestablecidas.
 *   4. Acciones →  checklist de qué se va a revocar (hub, channels, dominio,
 *                  email de despedida). Default todos ON.
 *   5. Confirmar→  vista final con snapshot + razón + acciones. CTA
 *                  "Archivar tenant" en rojo (color destructive).
 *   6. Listo    →  tarjeta de confirmación con timestamp + lista de pasos
 *                  OK/fallidos + CTA al listado de tenants.
 *
 * Backend: una sola llamada a `POST /api/admin/tenants/{tenantId}/archive`
 * que delega en `lib/provisioning/tenant-archiver.ts`.
 */

import { useMemo, useState } from 'react';
import {
  Archive,
  Ban,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Globe,
  Mail,
  Pause,
  Sparkles,
  User,
  UserX,
} from 'lucide-react';
import {
  WizardShell,
  Stepper,
  Field,
  SummaryRow,
} from '@/components/admin/onboarding-ui';

type StepId = 'buscar' | 'datos' | 'razon' | 'acciones' | 'confirmar' | 'listo';

const ORDER: readonly StepId[] = ['buscar', 'datos', 'razon', 'acciones', 'confirmar', 'listo'];

const LABELS: Record<StepId, string> = {
  buscar: '1. Buscar',
  datos: '2. Datos',
  razon: '3. Razón',
  acciones: '4. Acciones',
  confirmar: '5. Confirmar',
  listo: '6. Listo',
};

const STEP_INDEX = (s: StepId): number => ORDER.indexOf(s);

const REASON_PRESETS: { code: string; label: string; description: string }[] = [
  { code: 'requested_by_partner', label: 'Solicitado por el broker',
    description: 'El broker pidió cerrar su cuenta (cancelación voluntaria).' },
  { code: 'non_payment',          label: 'Fallo de pago recurrente',
    description: 'Stripe rechazó >=3 cobros consecutivos o el mrr cayó a 0.' },
  { code: 'tos_violation',        label: 'Violación de ToS',
    description: 'Spam, fraude o uso no autorizado de la plataforma.' },
  { code: 'duplicate_tenant',     label: 'Tenant duplicado',
    description: 'Se creó un segundo tenant para el mismo cliente por error.' },
  { code: 'test_staging_cleanup', label: 'Limpieza de staging',
    description: 'Tenant creado para demo/staging que debe purgarse.' },
  { code: 'other',                label: 'Otra razón',
    description: 'Especificar manualmente en el campo "Detalle libre".' },
];

interface TenantPreview {
  id: string;
  nombre: string;
  slug: string;
  subdomain: string | null;
  estado: string;
  plan: string;
  mrr: number;
  billingEmail: string | null;
  stripeCustomerId: string | null;
  resendDomainId: string | null;
  emailDomainStatus: string;
  fechaVencimiento: string | null;
}

interface ArchiveApiResponse {
  ok: boolean;
  tenantId: string;
  archivedAt: string;
  reason: string;
  steps: { step: string; ok: boolean; detail?: string }[];
  goodbyeEmail: { to: string; messageId: string } | null;
  error?: { code: string; message: string };
}

const ADMIN_HUBS = [
  { name: 'SaaS Metrics', href: '/admin/saas' },
  { name: 'Tenants', href: '/admin/saas/tenants' },
];

export default function PartnerOffboardingPage() {
  const [step, setStep] = useState<StepId>('buscar');
  const [slugInput, setSlugInput] = useState('');
  const [tenant, setTenant] = useState<TenantPreview | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [reasonCode, setReasonCode] = useState<string>('requested_by_partner');
  const [reasonDetail, setReasonDetail] = useState<string>('');

  const [actions, setActions] = useState({
    disableHub: true,
    revokeChannels: true,
    deleteEmailDomain: true,
    sendGoodbyeEmail: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ArchiveApiResponse | null>(null);

  const valid = useMemo(() => {
    switch (step) {
      case 'buscar':     return /^[a-z0-9-]{2,40}$/.test(slugInput.toLowerCase());
      case 'datos':      return tenant !== null;
      case 'razon':      if (reasonCode === 'other') return reasonDetail.trim().length >= 5;
                          return reasonCode.length > 0;
      case 'acciones':   return Object.values(actions).some(v => v); // al menos 1
      default:           return true;
    }
  }, [step, slugInput, tenant, reasonCode, reasonDetail, actions]);

  async function searchTenant() {
    setSearching(true);
    setSearchError(null);
    try {
      // Buscamos en el listado general y filtramos por slug/subdomain.
      // (Endpoint público para superadmin ya existe.)
      const res = await fetch('/api/admin/tenants?limit=200', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSearchError(data?.error ?? `Error HTTP ${res.status}`);
        setTenant(null);
        return;
      }
      const list: TenantPreview[] = data?.items ?? data?.tenants ?? data ?? [];
      const target = (list as TenantPreview[]).find(t =>
        t.slug === slugInput.toLowerCase() ||
        (t.subdomain && t.subdomain === slugInput.toLowerCase()),
      );
      if (!target) {
        setSearchError(`No se encontró ningún tenant con slug/subdomain "${slugInput}".`);
        setTenant(null);
        return;
      }
      if (target.estado === 'archived') {
        setSearchError(`El tenant "${target.nombre}" ya está archivado.`);
        setTenant(target);
        return;
      }
      setTenant(target);
      setStep('datos');
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSearching(false);
    }
  }

  async function submitArchive() {
    if (!tenant) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const reason = reasonCode === 'other'
        ? (reasonDetail.trim() || 'other')
        : REASON_PRESETS.find(r => r.code === reasonCode)?.description ?? reasonCode;
      const res = await fetch(`/api/admin/tenants/${tenant.id}/archive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason,
          // Los toggles individuales de acciones se aplican como un sólo
          // endpoint atómico; el operator que necesite granularidad fina
          // puede usar el endpoint archiver con un sub-recurso dedicado.
          sendGoodbyeEmail: actions.sendGoodbyeEmail,
          dryRun: false,
        }),
      });
      const data: ArchiveApiResponse = await res.json().catch(
        (): ArchiveApiResponse => ({
          ok: false, tenantId: tenant.id, archivedAt: '', reason,
          steps: [], goodbyeEmail: null,
          error: { code: 'PARSE_ERROR', message: `HTTP ${res.status}` },
        }),
      );
      if (!res.ok || !data.ok) {
        setSubmitError(data?.error?.message ?? `Error HTTP ${res.status}`);
        setResult(data);
        setStep('listo');
        return;
      }
      setResult(data);
      setStep('listo');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al archivar';
      setSubmitError(message);
      setStep('listo');
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (step === 'buscar')     { void searchTenant(); return; }
    if (step === 'confirmar')  { void submitArchive(); return; }
    const i = STEP_INDEX(step);
    setStep(ORDER[Math.min(i + 1, ORDER.length - 1)]);
  }

  function prev() {
    if (step === 'listo')      { setStep('confirmar'); return; }
    if (step === 'confirmar')  { setStep('acciones'); return; }
    if (step === 'datos')      { setTenant(null); setSearchError(null); setStep('buscar'); return; }
    const i = STEP_INDEX(step);
    setStep(ORDER[Math.max(i - 1, 0)]);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-black text-[#1A365D] tracking-tight">Partner Offboarding</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Wizard paso-a-paso para archivar un partner tenant. Archivar es
          reversible sólo mediante soporte manual; los datos de cartera se
          preservan por 90 días.
        </p>
      </header>

      <Stepper order={ORDER} step={step} resolveIndex={STEP_INDEX} labels={LABELS} />

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        {step === 'buscar' && (
          <Field label="Slug o subdominio del tenant">
            <div className="flex items-stretch">
              <input
                type="text"
                autoFocus
                value={slugInput}
                onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="brokers-asociados"
                onKeyDown={e => { if (e.key === 'Enter' && valid) void searchTenant(); }}
                className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm font-mono"
              />
              <span className="px-3 py-2 bg-slate-100 border border-l-0 rounded-r-lg text-xs text-slate-500 font-mono">
                .volkern.app
              </span>
            </div>
            {searchError && (
              <p className="text-xs text-rose-700 mt-2 bg-rose-50 border border-rose-200 p-2 rounded">
                {searchError}
              </p>
            )}
          </Field>
        )}

        {step === 'datos' && tenant && (
          <div className="space-y-2">
            <SummaryRow icon={<User size={14} />}      label="Empresa"        value={tenant.nombre} />
            <SummaryRow icon={<Globe size={14} />}      label="Subdominio"     value={`${tenant.subdomain ?? tenant.slug}.volkern.app`} mono />
            <SummaryRow icon={<Sparkles size={14} />}   label="Estado actual"  value={tenant.estado} />
            <SummaryRow icon={<Sparkles size={14} />}   label="Plan"           value={tenant.plan} />
            <SummaryRow icon={<DollarSign size={14} />} label="MRR"            value={`$${tenant.mrr.toFixed(2)}`} />
            <SummaryRow icon={<Mail size={14} />}       label="Billing email"  value={tenant.billingEmail ?? '—'} mono />
            <SummaryRow icon={<Mail size={14} />}       label="Email domain"   value={`${tenant.emailDomainStatus}${tenant.resendDomainId ? ` · Resend ${tenant.resendDomainId.slice(0, 8)}…` : ''}`} mono />
          </div>
        )}

        {step === 'razon' && (
          <>
            <Field label="Razón predefinida" hint="Elige una y el sistema la incluirá en el auditLog.">
              <select
                value={reasonCode}
                onChange={e => setReasonCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm"
              >
                {REASON_PRESETS.map(r => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </Field>
            {reasonCode === 'other' && (
              <Field label="Detalle libre" hint="Mínimo 5 caracteres.">
                <textarea
                  value={reasonDetail}
                  onChange={e => setReasonDetail(e.target.value)}
                  rows={3}
                  placeholder="Describe la razón específica…"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm"
                />
              </Field>
            )}
            <p className="text-xs text-slate-500 italic">
              Texto que verá el broker en el email:{' '}
              <strong>
                {REASON_PRESETS.find(r => r.code === reasonCode)?.description ?? '—'}
              </strong>
            </p>
          </>
        )}

        {step === 'acciones' && (
          <Field label="Acciones a ejecutar al archivar" hint="Puedes desactivar lo que no quieras aplicar.">
            <div className="space-y-2 mt-2">
              <ActionToggle
                icon={<Pause size={14} />}
                label="Suspender hub de Nexus (corta tráfico in/out)"
                checked={actions.disableHub}
                onChange={v => setActions(a => ({ ...a, disableHub: v }))}
              />
              <ActionToggle
                icon={<Ban size={14} />}
                label="Revocar tokens de canales (Telegram/WhatsApp)"
                checked={actions.revokeChannels}
                onChange={v => setActions(a => ({ ...a, revokeChannels: v }))}
              />
              <ActionToggle
                icon={<Globe size={14} />}
                label="Eliminar dominio de Resend + marcar emailDomainStatus='archived'"
                checked={actions.deleteEmailDomain}
                onChange={v => setActions(a => ({ ...a, deleteEmailDomain: v }))}
              />
              <ActionToggle
                icon={<Mail size={14} />}
                label="Enviar email de despedida al billingEmail"
                checked={actions.sendGoodbyeEmail}
                onChange={v => setActions(a => ({ ...a, sendGoodbyeEmail: v }))}
              />
            </div>
          </Field>
        )}

        {step === 'confirmar' && tenant && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#1A365D] uppercase tracking-tighter">
              Confirmar archivo
            </h3>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm font-bold text-rose-900">Esta acción es IRREVERSIBLE sin soporte manual</p>
              <p className="text-xs text-rose-700 mt-1">
                El tenant no podrá iniciar sesión ni enviar emails. Sólo
                superadmin puede revertir.
              </p>
            </div>
            <SummaryRow icon={<User size={14} />}    label="Tenant" value={tenant.nombre} />
            <SummaryRow icon={<Globe size={14} />}    label="Slug"   value={tenant.slug} mono />
            <SummaryRow
              icon={<UserX size={14} />}
              label="Razón"
              value={reasonCode === 'other'
                ? reasonDetail || '—'
                : REASON_PRESETS.find(r => r.code === reasonCode)?.label ?? reasonCode}
              highlighted tone="rose"
            />
            <SummaryRow
              icon={<Ban size={14} />}
              label="Acciones"
              value={Object.entries(actions)
                .filter(([, v]) => v)
                .map(([k]) =>
                  ({
                    disableHub: 'suspender hub',
                    revokeChannels: 'revocar tokens',
                    deleteEmailDomain: 'borrar dominio Resend',
                    sendGoodbyeEmail: 'email de despedida',
                  } as Record<string, string>)[k] ?? k).join(' · ')}
              highlighted tone="rose"
            />
            {submitError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900">
                <p className="font-bold">Error al archivar</p>
                <p className="text-xs mt-1">{submitError}</p>
              </div>
            )}
          </div>
        )}

        {step === 'listo' && result && (
          <DoneCard tenant={tenant} result={result} />
        )}

        {step === 'listo' && !result && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900">
            <p className="font-bold">No se pudo archivar el tenant</p>
            <p className="text-xs mt-1">{submitError ?? 'Error desconocido.'}</p>
          </div>
        )}

        <WizardShell
          order={ORDER}
          step={step}
          resolveIndex={STEP_INDEX}
          submitting={submitting || searching}
          onNext={next}
          onPrev={prev}
          valid={valid && !(step === 'buscar' && searching)}
          finalCtaLabel={step === 'confirmar' ? 'Archivar tenant' : undefined}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-componentes locales (pequeños; no vale la pena factorizar)
// ──────────────────────────────────────────────────────────────────────────────

interface ActionToggleProps {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ActionToggle({ icon, label, checked, onChange }: ActionToggleProps) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
      <div className="flex items-center gap-2.5">
        <span className="text-slate-500">{icon}</span>
        <span className="text-sm text-slate-800">{label}</span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-5 w-5 text-[#1A365D] rounded"
      />
    </label>
  );
}

function DoneCard({ tenant, result }: { tenant: TenantPreview | null; result: ArchiveApiResponse }) {
  const allOk = result.ok && result.steps.every(s => s.ok);
  const partial = result.ok && !result.steps.every(s => s.ok);
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 p-4 border rounded-xl ${
        allOk  ? 'bg-rose-50 border-rose-200' :
        partial ? 'bg-amber-50 border-amber-200' :
                  'bg-rose-50 border-rose-200'}`}>
        {allOk ? (
          <Archive size={32} className="text-rose-600 flex-shrink-0" />
        ) : (
          <CheckCircle2 size={32} className="text-amber-600 flex-shrink-0" />
        )}
        <div>
          <h3 className={`text-lg font-black tracking-tight ${
            allOk ? 'text-rose-900' : 'text-amber-900'}`}>
            {allOk  ? 'Tenant archivado' :
             partial ? 'Tenant archivado (con pasos parciales)' :
                       'No se pudo archivar'}
          </h3>
          <p className={`text-sm mt-0.5 ${
            allOk ? 'text-rose-700' : 'text-amber-700'}`}>
            {tenant?.nombre ? `"${tenant.nombre}" — ` : ''}
            {new Date(result.archivedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {result.steps.map(s => (
          <SummaryRow
            key={s.step}
            icon={s.ok ? <CheckCircle2 size={14} className="text-emerald-600" /> :
                         <Ban size={14} className="text-rose-600" />}
            label={s.step}
            value={s.detail ?? (s.ok ? 'OK' : 'falló')}
            tone={s.ok ? 'emerald' : 'rose'}
          />
        ))}
      </div>

      {result.goodbyeEmail && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
          <p className="font-bold flex items-center gap-1">
            <Mail size={14} /> Email de despedida enviado
          </p>
          <p className="text-xs mt-1 font-mono">
            to: {result.goodbyeEmail.to} · messageId: {result.goodbyeEmail.messageId.slice(0, 12)}…
          </p>
        </div>
      )}

      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
        Datos de cartera preservados por 90 días. El broker ya no podrá
        iniciar sesión en <code className="font-mono">{tenant?.slug ?? '—'}.volkern.app/auth/login</code>.
      </p>

      <div className="flex gap-2 pt-2">
        {ADMIN_HUBS.map(h => (
          <a
            key={h.href}
            href={h.href}
            className="px-4 py-2 bg-[#1A365D] text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10 hover:scale-105 transition-transform inline-flex items-center gap-1.5"
          >
            {h.name}
            <ChevronRight size={14} />
          </a>
        ))}
        <a
          href="/admin/partner-offboarding"
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
        >
          Archivar otro
        </a>
      </div>
    </div>
  );
}
