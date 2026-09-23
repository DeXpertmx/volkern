'use client';

/**
 * /admin/partner-onboarding — Wizard para que el operator (superadmin) cree
 * un nuevo partner tenant desde la UI, sin pasar por el flujo POST de API.
 *
 * Sustituye la fricción del endpoint anterior (Telegram obligatorio):
 *   • Telegram ahora opcional (broker que sólo usa email + web chat puede
 *     crear su tenant sin necesidad de configurar el bot aún).
 *   • Moneda se elige vía el mismo menú numerado que `scripts/seed-partner-tenants.ts`.
 *   • Backend reusa `TenantProvisioningInput` vía POST /api/tenants/create —
 *     cero duplicación de lógica.
 *   • Última vista es una tarjeta de confirmación con los datos del
 *     tenant recién creado (slug, subdominio, moneda confirmada,
 *     estado de Telegram) y CTA al dashboard superadmin.
 *
 * Persistencia de la infección: el operator puede habilitar el módulo
 * insurance desde aquí mismo, dejando el tenant listo para empezar a
 * importar pólizas sin tener que entrar a /admin/saas/tenants/{id}.
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Forward,
  Loader2,
  Mail,
  Send,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import {
  getCurrencyMenuOptions,
  parseCurrencyAnswer,
  currencyChip,
  type CurrencyMenuOption,
} from '@/lib/insurance/currency-prompt';
import { MONEDA_MINIMA_ESQUEMA, MONEDAS_SOPORTADAS } from '@/lib/moneda';
import {
  VERTICAL_DEFINITIONS,
  type Vertical,
} from '@/lib/plans';

type WizardStep = 'empresa' | 'vertical' | 'subdominio' | 'email' | 'telegram' | 'moneda' | 'resumen' | 'done';

interface WizardForm {
  empresa: string;
  /** null = aún sin decidir. El operador puede saltarlo para arrancar sin overrides. */
  vertical: Vertical | null;
  subdomain: string;
  email: string;
  password: string;
  useTelegram: boolean;
  telegramBotName: string;
  telegramBotToken: string;
  monedaCode: string | null; // null = aún sin decidir
  fuenteInferencia: 'EXPLICIT' | 'USER_PROMPT' | 'FALLBACK';
}

interface CreateResponse {
  success: boolean;
  tenantId?: string;
  chatwootAccountId?: number;
  telegramInboxId?: number;
  telegramSkipped?: boolean;
  moneda: string;
  monedaInferenciaSource?: string;
  vertical?: Vertical | null;
  error?: { code: string; message: string };
  message?: string;
}

interface TelegramConnectResponse {
  success: boolean;
  state?: 'created' | 'already-exists';
  telegramInboxId?: number;
  telegramChannelId?: string;
  hubConfigId?: string;
  code?: string;
  error?: string;
}

const INITIAL: WizardForm = {
  empresa: '',
  vertical: null,
  subdomain: '',
  email: '',
  password: '',
  useTelegram: true, // default ON; el operator puede desactivar
  telegramBotName: '',
  telegramBotToken: '',
  monedaCode: null,
  fuenteInferencia: 'EXPLICIT',
};

const VERTICAL_ICONS: Record<Vertical, React.ReactNode> = {
  insurance: <Shield size={20} className="text-rose-600" />,
  real_estate: <Building size={20} className="text-blue-600" />,
  accounting: <Sparkles size={20} className="text-emerald-600" />,
  hospitality: <Building2 size={20} className="text-violet-600" />,
  general: <User size={20} className="text-slate-600" />,
};

const ADMIN_HUBS = [
  { name: 'SaaS Metrics', href: '/admin/saas' },
  { name: 'Tenants', href: '/admin/saas/tenants' },
];

function stepIndex(s: WizardStep): number {
  const order: WizardStep[] = ['empresa', 'vertical', 'subdominio', 'email', 'telegram', 'moneda', 'resumen', 'done'];
  return order.indexOf(s);
}

export default function PartnerOnboardingPage() {
  const [step, setStep] = useState<WizardStep>('empresa');
  const [form, setForm] = useState<WizardForm>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // CTA 'Conectar Telegram después' — sólo relevante cuando result.telegramSkipped = true.
  const [telegramDeferredOpen, setTelegramDeferredOpen] = useState(false);
  const [telegramDeferred, setTelegramDeferred] = useState({ botName: '', botToken: '' });
  const [telegramDeferredStatus, setTelegramDeferredStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'success'; telegramInboxId: number }
    | { kind: 'error'; code: string; message: string }
  >({ kind: 'idle' });

  // Lista canónica del menú (misma que el script CLI)
  const menuOptions: CurrencyMenuOption[] = useMemo(() => getCurrencyMenuOptions(), []);

  // Validación reactiva por paso. La vertical es OPCIONAL — el operador puede
  // decidir saltarla usando el botón "Sin vertical" (vertical queda null) y
  // aún así avanzar al siguiente step.
  const valid = useMemo(() => {
    switch (step) {
      case 'empresa':  return form.empresa.trim().length >= 2;
      case 'vertical': return true; // opcional
      case 'subdominio': return /^[a-z0-9-]{3,40}$/.test(form.subdomain.toLowerCase());
      case 'email':   return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) && form.password.length >= 8;
      case 'telegram': return !form.useTelegram || (form.telegramBotName.startsWith('@') && form.telegramBotToken.length > 20);
      case 'moneda':  return form.monedaCode !== null;
      default:        return true;
    }
  }, [step, form]);

  function field<K extends keyof WizardForm>(k: K, v: WizardForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function pickMonedaByNumber(n: string) {
    const { code } = parseCurrencyAnswer(n);
    if (code) field('monedaCode', code);
  }

  async function submitFinal() {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        empresa: form.empresa.trim(),
        subdomain: form.subdomain.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        moneda: form.monedaCode,
      };
      // vertical es opcional: si el operador la eligió, la enviamos para que
      // el provisioner siembre los módulos de la vertical.
      if (form.vertical) body.vertical = form.vertical;
      if (form.useTelegram && form.telegramBotName && form.telegramBotToken) {
        body.telegram = {
          botName: form.telegramBotName,
          botToken: form.telegramBotToken,
        };
      }
      const res = await fetch('/api/tenants/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: CreateResponse = await res.json().catch((): CreateResponse => ({ success: false, moneda: MONEDA_MINIMA_ESQUEMA }));
      if (!res.ok || !data.success) {
        setError(data?.error?.message ?? `Error HTTP ${res.status}`);
        setResult(null);
        setStep('resumen');
        return;
      }
      setResult(data);
      setStep('done');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al crear el tenant';
      setError(message);
      setStep('resumen');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTelegramDeferred() {
    if (!result?.tenantId) return;
    setTelegramDeferredStatus({ kind: 'submitting' });
    try {
      const res = await fetch(`/api/admin/tenants/${result.tenantId}/telegram`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(telegramDeferred),
      });
      const data: TelegramConnectResponse = await res.json().catch((): TelegramConnectResponse => ({
        success: false, code: 'PARSE_ERROR', error: `HTTP ${res.status}`,
      }));
      if (!res.ok || !data.success) {
        setTelegramDeferredStatus({
          kind: 'error',
          code: data?.code ?? `HTTP_${res.status}`,
          message: data?.error ?? `Error HTTP ${res.status}`,
        });
        return;
      }
      setTelegramDeferredStatus({
        kind: 'success',
        telegramInboxId: data.telegramInboxId ?? 0,
      });
      // Reflejar en el resultado global para que el DoneCard muestre el éxito.
      setResult(prev => prev ? {
        ...prev,
        telegramSkipped: false,
        telegramInboxId: data.telegramInboxId,
      } : prev);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al conectar Telegram';
      setTelegramDeferredStatus({ kind: 'error', code: 'UNEXPECTED', message });
    }
  }

  // CTA "Siguiente" con auto-skip si Telegram desactivado
  function next() {
    if (step === 'email' && !form.useTelegram) {
      setStep('moneda');
      return;
    }
    if (step === 'telegram' && !form.useTelegram) {
      setStep('moneda');
      return;
    }
    if (step === 'resumen') {
      submitFinal();
      return;
    }
    const i = stepIndex(step);
    const order: WizardStep[] = ['empresa', 'vertical', 'subdominio', 'email', 'telegram', 'moneda', 'resumen', 'done'];
    setStep(order[Math.min(i + 1, order.length - 1)]);
  }

  function prev() {
    if (step === 'moneda' && !form.useTelegram) setStep('email');
    else if (step === 'done') setStep('resumen');
    else if (step === 'resumen') setStep('moneda');
    else {
      const order: WizardStep[] = ['empresa', 'vertical', 'subdominio', 'email', 'telegram', 'moneda', 'resumen', 'done'];
      const i = stepIndex(step);
      setStep(order[Math.max(i - 1, 0)]);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-black text-[#1A365D] tracking-tight">Partner Onboarding</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Wizard paso-a-paso para provisionar un nuevo tenant. Sustituye el flujo viejo
          que exigía configurar un bot de Telegram antes de empezar.
        </p>
      </header>

      <Stepper step={step} />

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        {step === 'empresa' && (
          <Field label="Nombre de la empresa">
            <input
              type="text"
              autoFocus
              value={form.empresa}
              onChange={e => field('empresa', e.target.value)}
              placeholder="Brokers Asociados SL"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              Mínimo 2 caracteres. Lo verá el broker al iniciar sesión.
            </p>
          </Field>
        )}

        {step === 'vertical' && (
          <VerticalStep
            selected={form.vertical}
            onSelect={(v) => field('vertical', v)}
          />
        )}

        {step === 'subdominio' && (
          <Field label="Subdominio">
            <div className="flex items-stretch">
              <input
                type="text"
                autoFocus
                value={form.subdomain}
                onChange={e => field('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="brokers-asociados"
                className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm font-mono"
              />
              <span className="px-3 py-2 bg-slate-100 border border-l-0 rounded-r-lg text-xs text-slate-500 font-mono">
                .volkern.app
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Sólo minúsculas, números y guiones. 3-40 caracteres.
            </p>
          </Field>
        )}

        {step === 'email' && (
          <>
            <Field label="Email del admin">
              <input
                type="email"
                autoFocus
                value={form.email}
                onChange={e => field('email', e.target.value)}
                placeholder="admin@brokers-asociados.com"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm"
              />
            </Field>
            <Field label="Contraseña inicial" hint="El broker la cambiará al primer login.">
              <input
                type="password"
                value={form.password}
                onChange={e => field('password', e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm"
              />
            </Field>
          </>
        )}

        {step === 'telegram' && (
          <>
            <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div>
                <p className="text-sm font-bold text-amber-900">Bot de Telegram — OPCIONAL</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Antes era obligatorio. Si el broker aún no tiene bot, puedes crearlo
                  sin Telegram y conectarlo después desde esta misma página.
                </p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.useTelegram}
                  onChange={e => field('useTelegram', e.target.checked)}
                  className="h-5 w-5 text-[#1A365D] rounded"
                />
                <span className="ml-2 text-sm font-bold text-amber-900">
                  {form.useTelegram ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>
            {form.useTelegram && (
              <>
                <Field label="Bot username">
                  <input
                    type="text"
                    autoFocus
                    value={form.telegramBotName}
                    onChange={e => field('telegramBotName', e.target.value)}
                    placeholder="@mi_empresa_bot"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm font-mono"
                  />
                </Field>
                <Field label="Bot token" hint="Lo obtienes de @BotFather en Telegram.">
                  <input
                    type="password"
                    value={form.telegramBotToken}
                    onChange={e => field('telegramBotToken', e.target.value)}
                    placeholder="123456789:ABCdefGHI..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm font-mono"
                  />
                </Field>
              </>
            )}
          </>
        )}

        {step === 'moneda' && (
          <CurrencyStep
            options={menuOptions}
            selected={form.monedaCode}
            onSelect={(code) => field('monedaCode', code)}
            onPickByNumber={pickMonedaByNumber}
          />
        )}

        {step === 'resumen' && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#1A365D] uppercase tracking-tighter">
              Resumen antes de crear
            </h3>
            <SummaryRow icon={<User size={14} />}      label="Empresa"        value={form.empresa} />
            <SummaryRow
              icon={form.vertical ? VERTICAL_ICONS[form.vertical] : <Sparkles size={14} />}
              label="Vertical"
              value={form.vertical
                ? `${VERTICAL_DEFINITIONS[form.vertical].icon} ${VERTICAL_DEFINITIONS[form.vertical].name} (${VERTICAL_DEFINITIONS[form.vertical].modules.length} módulos)`
                : '🔹 Sin vertical específica (plan default)'}
              highlighted
            />
            <SummaryRow icon={<Sparkles size={14} />}  label="Subdominio"     value={`${form.subdomain}.volkern.app`} mono />
            <SummaryRow icon={<Mail size={14} />}      label="Admin email"    value={form.email} />
            <SummaryRow
              icon={<Sparkles size={14} />}
              label="Telegram"
              value={form.useTelegram
                ? `${form.telegramBotName} (token configurado)`
                : '⏭️  Omitido — broker puede añadirlo después'}
            />
            <SummaryRow
              icon={<Sparkles size={14} />}
              label="Moneda"
              value={form.monedaCode ? `${currencyChip(form.monedaCode as CurrencyMenuOption['code'])}` : '—'}
              highlighted
            />
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900">
                <p className="font-bold">Error al crear el tenant</p>
                <p className="text-xs mt-1">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 'done' && result && (
          <DoneCard
            result={result}
            form={form}
            opened={telegramDeferredOpen}
            onToggleOpen={() => setTelegramDeferredOpen(o => !o)}
            deferredForm={telegramDeferred}
            onDeferredChange={(k, v) => setTelegramDeferred(prev => ({ ...prev, [k]: v }))}
            deferredStatus={telegramDeferredStatus}
            onSubmitDeferred={submitTelegramDeferred}
          />
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={step === 'empresa' || step === 'done' || submitting}
            onClick={prev}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 disabled:opacity-30 inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> Atrás
          </button>
          {step === 'done' ? (
            <div className="flex gap-2">
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
            </div>
          ) : (
            <button
              type="button"
              disabled={!valid || submitting}
              onClick={next}
              className="px-5 py-2 bg-[#1A365D] text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10 hover:scale-105 transition-transform disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center gap-1.5"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> :
                step === 'resumen' ? <>Crear tenant <Sparkles size={14} /></> :
                <>Siguiente <ArrowRight size={14} /></>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Subcomponentes locales
// ──────────────────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: WizardStep }) {
  const order: WizardStep[] = ['empresa', 'vertical', 'subdominio', 'email', 'telegram', 'moneda', 'resumen', 'done'];
  const i = stepIndex(step);
  const labels: Record<WizardStep, string> = {
    empresa: '1. Empresa',
    vertical: '2. Vertical',
    subdominio: '3. Subdominio',
    email: '4. Admin',
    telegram: '5. Telegram',
    moneda: '6. Moneda',
    resumen: '7. Confirmar',
    done: '8. Listo',
  };
  return (
    <ol className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
      {order.map((s, idx) => {
        const passed = idx < i;
        const active = s === step;
        return (
          <li key={s} className={`flex items-center gap-1.5 ${passed ? 'text-emerald-600' : active ? 'text-[#1A365D]' : ''}`}>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${passed ? 'bg-emerald-100 border-emerald-300' : active ? 'bg-[#1A365D]/10 border-[#1A365D]/40' : 'border-slate-200'}`}>
              {passed ? <Check size={10} className="text-emerald-700" /> : <span>{idx + 1}</span>}
            </span>
            <span>{labels[s]}</span>
            {idx < order.length - 1 && <ChevronRight size={10} className="text-slate-300 mr-1.5" />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-black uppercase tracking-widest text-slate-700">{label}</span>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </label>
  );
}

function SummaryRow({
  icon, label, value, mono, highlighted,
}: { icon: React.ReactNode; label: string; value: string; mono?: boolean; highlighted?: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${highlighted ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'}`}>
      <span className="text-slate-500">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 w-24">{label}</span>
      <span className={`text-sm flex-1 truncate ${mono ? 'font-mono' : ''} ${highlighted ? 'font-bold text-emerald-900' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  );
}

function CurrencyStep({
  options, selected, onSelect, onPickByNumber,
}: {
  options: CurrencyMenuOption[];
  selected: string | null;
  onSelect: (code: string) => void;
  onPickByNumber: (raw: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Moneda preferida del broker">
        <p className="text-xs text-slate-500 mb-2">
          Esta moneda alimentará el chip del portfolio ejecutivo. Si dejas la
          moneda mínima del sistema y luego suben pólizas en otra divisa, el
          auto-fix lo corrige automáticamente al primer import.
        </p>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map(opt => (
          <button
            key={opt.code}
            type="button"
            onClick={() => onSelect(opt.code)}
            className={`text-left p-3 rounded-lg border transition-colors ${
              selected === opt.code
                ? 'bg-[#1A365D]/5 border-[#1A365D]/40 ring-2 ring-[#1A365D]/30'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold">{opt.index}. {opt.code}</span>
              {selected === opt.code && <CheckCircle2 size={16} className="text-[#1A365D]" />}
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-tight">{opt.label}</p>
            {opt.nota && <p className="text-[10px] text-slate-400 mt-1 italic">{opt.nota}</p>}
          </button>
        ))}
      </div>
      <details className="rounded-lg bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-600">
          ¿Prefieres escribir el código directamente?
        </summary>
        <input
          type="text"
          placeholder={`${MONEDAS_SOPORTADAS.slice(0, 3).join(' / ')} / … (o número 1..${MONEDAS_SOPORTADAS.length})`}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              onPickByNumber((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
          className="mt-2 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm font-mono"
        />
      </details>
    </div>
  );
}

function VerticalStep({
  selected, onSelect,
}: {
  selected: Vertical | null;
  onSelect: (v: Vertical | null) => void;
}) {
  const verticals: Vertical[] = ['insurance', 'real_estate', 'accounting', 'general'];
  return (
    <div className="space-y-3">
      <Field
        label="Vertical del broker"
        hint="Opcional. Si eliges una, el provisioner siembra el 'starter pack' de módulos (insurance, real_estate, accounting o general) para que el broker arranque con los módulos clave ya habilitados. Si eliges 'Sin vertical', el tenant arranca con los módulos default del plan."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {verticals.map(v => {
            const def = VERTICAL_DEFINITIONS[v];
            const isSelected = selected === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onSelect(v)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-[#1A365D]/5 border-[#1A365D]/40 ring-2 ring-[#1A365D]/30'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden>{def.icon}</span>
                    <span className="font-bold text-sm text-slate-900">{def.name}</span>
                  </div>
                  {isSelected && <CheckCircle2 size={16} className="text-[#1A365D]" />}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-tight">{def.description}</p>
                <p className="text-[10px] font-mono text-slate-400 mt-1.5">
                  {def.modules.length} módulos: {def.modules.slice(0, 4).join(', ')}{def.modules.length > 4 ? `, +${def.modules.length - 4}` : ''}
                </p>
              </button>
            );
          })}
        </div>
      </Field>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full text-left p-3 rounded-lg border transition-colors ${
          selected === null
            ? 'bg-slate-50 border-slate-300 ring-2 ring-slate-300/30'
            : 'bg-white border-slate-200 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700">🔹 Sin vertical (dejar que el plan decida)</span>
          {selected === null && <CheckCircle2 size={16} className="text-slate-500" />}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          El tenant arranca con los módulos default del plan (ver PLAN_MODULES en lib/plans.ts).
          No se siembran overrides. El broker puede cambiar módulos después en /admin/saas/tenants/{'{id}'}/modulos.
        </p>
      </button>
    </div>
  );
}

function DoneCard({
  result, form,
  opened, onToggleOpen,
  deferredForm, onDeferredChange,
  deferredStatus, onSubmitDeferred,
}: {
  result: CreateResponse;
  form: WizardForm;
  opened: boolean;
  onToggleOpen: () => void;
  deferredForm: { botName: string; botToken: string };
  onDeferredChange: (k: 'botName' | 'botToken', v: string) => void;
  deferredStatus:
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'success'; telegramInboxId: number }
    | { kind: 'error'; code: string; message: string };
  onSubmitDeferred: () => void;
}) {
  const telegramSkipped = result.telegramSkipped && !result.telegramInboxId;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle2 size={32} className="text-emerald-600 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-black text-emerald-900 tracking-tight">Tenant creado</h3>
          <p className="text-sm text-emerald-700 mt-0.5">{result.message ?? 'Operación exitosa'}</p>
        </div>
      </div>
      <div className="space-y-2">
        <SummaryRow icon={<User size={14} />}      label="Tenant ID"      value={result.tenantId ?? '—'} mono />
        <SummaryRow icon={<Sparkles size={14} />}  label="Subdominio"     value={`${form.subdomain}.volkern.app`} mono />
        <SummaryRow icon={<Sparkles size={14} />}  label="Chatwoot ID"    value={String(result.chatwootAccountId ?? '—')} mono />
        <SummaryRow
          icon={<Sparkles size={14} />}
          label="Telegram"
          value={telegramSkipped
            ? '⏭️  Pendiente'
            : `✅ Inbox #${result.telegramInboxId}`}
        />
        <SummaryRow
          icon={form.vertical ? VERTICAL_ICONS[form.vertical] : <Sparkles size={14} />}
          label="Vertical"
          value={form.vertical
            ? `${VERTICAL_DEFINITIONS[form.vertical].icon} ${VERTICAL_DEFINITIONS[form.vertical].name} (${VERTICAL_DEFINITIONS[form.vertical].modules.length} módulos activados)`
            : '🔹 Sin vertical (default del plan)'}
          highlighted
        />
        <SummaryRow
          icon={<Sparkles size={14} />}
          label="Moneda"
          value={`${currencyChip(result.moneda as CurrencyMenuOption['code'])}  · fuente: ${result.monedaInferenciaSource ?? 'EXPLICIT'}`}
          highlighted
        />
      </div>

      {telegramSkipped && result.tenantId && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={onToggleOpen}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <Send size={16} className="text-amber-700" />
              <div>
                <p className="text-sm font-black text-amber-900 tracking-tight">
                  {opened ? 'Ocultar formulario de Telegram' : 'Conectar Telegram ahora'}
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  El broker aún no tiene bot configurado. Si ya habló con @BotFather, lo conectas aquí en 1 paso.
                </p>
              </div>
            </div>
            <ChevronRight
              size={14}
              className={`text-amber-700 transition-transform ${opened ? 'rotate-90' : ''}`}
            />
          </button>

          {opened && (
            <div className="px-4 pb-4 space-y-3 border-t border-amber-200 pt-3">
              {deferredStatus.kind === 'success' ? (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-900">Telegram conectado</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Inbox #{deferredStatus.telegramInboxId} listo. El broker ya puede
                      escribirle al bot.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Field label="Bot username">
                    <input
                      type="text"
                      autoFocus
                      value={deferredForm.botName}
                      onChange={e => onDeferredChange('botName', e.target.value)}
                      placeholder="@mi_empresa_bot"
                      disabled={deferredStatus.kind === 'submitting'}
                      className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg focus:ring-2 focus:ring-amber-400/40 text-sm font-mono disabled:opacity-50"
                    />
                  </Field>
                  <Field label="Bot token" hint="Lo obtienes de @BotFather en Telegram.">
                    <input
                      type="password"
                      value={deferredForm.botToken}
                      onChange={e => onDeferredChange('botToken', e.target.value)}
                      placeholder="123456789:ABCdefGHI..."
                      disabled={deferredStatus.kind === 'submitting'}
                      className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg focus:ring-2 focus:ring-amber-400/40 text-sm font-mono disabled:opacity-50"
                    />
                  </Field>
                  {deferredStatus.kind === 'error' && (
                    <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
                      <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-rose-600" />
                      <div>
                        <p className="font-bold">{deferredStatus.code}</p>
                        <p className="mt-0.5">{deferredStatus.message}</p>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={
                      !deferredForm.botName.startsWith('@') ||
                      deferredForm.botToken.length < 20 ||
                      deferredStatus.kind === 'submitting'
                    }
                    onClick={onSubmitDeferred}
                    className="w-full px-4 py-2 bg-amber-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-900/10 hover:scale-[1.01] transition-transform disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center justify-center gap-1.5"
                  >
                    {deferredStatus.kind === 'submitting' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <><Forward size={14} /> Conectar bot</>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
        El broker ya puede iniciar sesión en{' '}
        <a href={`https://${form.subdomain}.volkern.app/auth/login`}
           target="_blank" rel="noreferrer"
           className="font-mono text-blue-600 hover:underline">
          {form.subdomain}.volkern.app/auth/login
        </a>{' '}
        con las credenciales que acabas de crear.
      </p>
    </div>
  );
}
