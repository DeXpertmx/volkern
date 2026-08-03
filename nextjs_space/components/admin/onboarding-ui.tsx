'use client';

/**
 * Componentes UI compartidos para los wizards de partner-onboarding y
 * partner-offboarding en /admin/*.
 *
 * Antes, los sub-componentes (Stepper, Field, SummaryRow) vivían inline
 * en `app/admin/partner-onboarding/page.tsx`. Al añadir partner-offboarding,
 * los extraje aquí para que ambos wizards compartan exactamente la misma
 * estética (paleta, tipografía, tamaño, animaciones) sin duplicación.
 *
 * Regla: si necesitas cambiar la estética (color, font, espaciado), cambia
 * aquí. Si necesitas un nuevo step o tipo de item, expón una prop y
 * deja que cada wizard haga su composición.
 *
 * Todos los componentes usan 'use client' porque son interactivos
 * (botones, hover, transitions). Los wizards padres también son 'use client'.
 */

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';

export interface WizardShellProps<T extends string> {
  /** Orden completo de pasos por los que navega el usuario. */
  order: readonly T[];
  /** Paso actual. */
  step: T;
  /** Función para resolver el índice de un step. */
  resolveIndex: (s: T) => number;
  /** Si el wizard está enviando la última operación async al backend. */
  submitting?: boolean;
  /** Mostrar siempre el CTA "Atrás" como enabled. */
  disableBackOnStep?: T;
  /** Texto del CTA principal cuando es el último paso antes de done. */
  finalCtaLabel?: string;
  /** Texto del CTA principal por defecto. */
  nextCtaLabel?: string;
  /** Función invocada al hacer click en el CTA principal. */
  onNext: () => void;
  /** Función invocada al hacer click en Atrás. */
  onPrev: () => void;
  /** Si false, el CTA está disabled. */
  valid: boolean;
  /**
   * Opcional. Si lo Wizards lo usan como footer (sibling del step-content),
   * se omite. Si lo usan como wrapper, se pasa el step-content aquí.
   */
  children?: ReactNode;
}

export function WizardShell<T extends string>(props: WizardShellProps<T>) {
  const {
    order, step, resolveIndex, submitting,
    finalCtaLabel = 'Confirmar', nextCtaLabel = 'Siguiente',
    onNext, onPrev,
    valid,
  } = props;

  const isFirst = resolveIndex(step) === 0;
  const isLast = resolveIndex(step) === order.length - 1;
  const isFinalCta = resolveIndex(step) === order.length - 2;

  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
      <button
        type="button"
        disabled={isFirst || isLast || submitting}
        onClick={onPrev}
        className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 disabled:opacity-30 inline-flex items-center gap-1.5"
      >
        <ArrowLeft size={14} /> Atrás
      </button>
      {!isLast && (
        <button
          type="button"
          disabled={!valid || submitting}
          onClick={onNext}
          className={`px-5 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-transform hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center gap-1.5 ${
            isFinalCta
              ? 'bg-rose-600 text-white shadow-rose-900/10'
              : 'bg-[#1A365D] text-white shadow-indigo-900/10'
          }`}
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> :
            isFinalCta ? <>{finalCtaLabel} <Sparkles size={14} /></> :
            <>{nextCtaLabel} <ArrowRight size={14} /></>}
        </button>
      )}
    </div>
  );
}

/**
 * Stepper numerado con checkmarks verdes para pasos pasados.
 */
export interface StepperProps<T extends string> {
  order: readonly T[];
  step: T;
  resolveIndex: (s: T) => number;
  /** Mapa de step ID → label. */
  labels: Record<T, string>;
}

export function Stepper<T extends string>({ order, step, resolveIndex, labels }: StepperProps<T>) {
  const i = resolveIndex(step);
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

/**
 * Etiqueta de campo con label en MAYÚSCULAS pequeñas + hint opcional.
 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-black uppercase tracking-widest text-slate-700">{label}</span>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </label>
  );
}

/**
 * Una fila de resumen con icono + label + value. highlighted=true da fondo verde
 * (para el callout "moneda confirmada" o "tenant archivado").
 */
export interface SummaryRowProps {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlighted?: boolean;
  /** 'rose' usa fondo rojo en lugar de verde. Útil para "todos los servicios suspendidos". */
  tone?: 'emerald' | 'rose' | 'slate';
}

export function SummaryRow({ icon, label, value, mono, highlighted, tone = 'emerald' }: SummaryRowProps) {
  const bgClass = highlighted
    ? tone === 'rose'
      ? 'bg-rose-50 border border-rose-200'
      : tone === 'slate'
        ? 'bg-slate-50 border border-slate-200'
        : 'bg-emerald-50 border border-emerald-200'
    : 'bg-slate-50';
  const valueClass = highlighted
    ? tone === 'rose'
      ? 'font-bold text-rose-900'
      : 'font-bold text-emerald-900'
    : 'text-slate-800';
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${bgClass}`}>
      <span className="text-slate-500">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 w-24">{label}</span>
      <span className={`text-sm flex-1 truncate ${mono ? 'font-mono' : ''} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
