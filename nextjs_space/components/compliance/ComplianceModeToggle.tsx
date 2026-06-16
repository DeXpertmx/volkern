'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldOff, Loader2, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ComplianceModeData {
  mode: 'normal' | 'compliance';
  canToggle: boolean;
}

export function ComplianceModeToggle() {
  const [data, setData] = useState<ComplianceModeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMode();
  }, []);

  const fetchMode = async () => {
    try {
      const res = await fetch('/api/tenant/compliance-mode');
      const json = await res.json();
      if (json.success) {
        setData({ mode: json.mode, canToggle: json.canToggle });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!data) return;
    if (!justification.trim() || justification.trim().length < 10) {
      toast.error('La justificación debe tener al menos 10 caracteres');
      return;
    }

    const newMode = data.mode === 'normal' ? 'compliance' : 'normal';
    setSaving(true);
    try {
      const res = await fetch('/api/tenant/compliance-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode, justification: justification.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        setData(prev => prev ? { ...prev, mode: newMode } : prev);
        setShowConfirm(false);
        setJustification('');
      } else {
        toast.error(json.error || 'Error al cambiar modo');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        No se pudo cargar el estado de compliance
      </div>
    );
  }

  const isCompliance = data.mode === 'compliance';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0",
          isCompliance ? "bg-emerald-100" : "bg-slate-100"
        )}>
          {isCompliance ? (
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          ) : (
            <ShieldOff className="w-7 h-7 text-slate-400" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-900">Modo de Control</h3>
            <span className={cn(
              "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
              isCompliance
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            )}>
              {isCompliance ? '🔒 Compliance' : '🔓 Normal'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isCompliance
              ? 'Modo Compliance activo. Los procesos obligatorios están siendo evaluados. Las acciones críticas requieren validación.'
              : 'Modo Normal. El sistema opera sin restricciones de compliance. Actívalo para proteger procesos críticos.'}
          </p>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={cn(
          "p-4 rounded-xl border transition-all",
          isCompliance
            ? "bg-emerald-50 border-emerald-200"
            : "bg-slate-50 border-slate-200"
        )}>
          <div className="flex items-center gap-2 mb-1">
            {isCompliance ? (
              <Lock className="w-4 h-4 text-emerald-600" />
            ) : (
              <Unlock className="w-4 h-4 text-slate-400" />
            )}
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {isCompliance ? 'Protegido' : 'Sin protección'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isCompliance
              ? '6 reglas activas. No se pueden cerrar deals sin contratos, ni activar contratos sin firmas.'
              : 'El sistema no bloquea acciones. Puedes operar con total flexibilidad.'}
          </p>
        </div>

        <div className={cn(
          "p-4 rounded-xl border transition-all",
          isCompliance
            ? "bg-emerald-50 border-emerald-200"
            : "bg-slate-50 border-slate-200"
        )}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={cn(
              "w-4 h-4",
              isCompliance ? "text-emerald-600" : "text-slate-400"
            )} />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Auditoría
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isCompliance
              ? 'Cada acción bloqueada se registra en el audit trail permanente con trazabilidad completa.'
              : 'Sin restricciones. Cambia a Compliance para activar la trazabilidad forzada.'}
          </p>
        </div>
      </div>

      {/* Toggle */}
      {data.canToggle && (
        <div className="pt-2">
          {!showConfirm ? (
            <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {isCompliance ? 'Desactivar Modo Compliance' : 'Activar Modo Compliance'}
                </p>
                <p className="text-xs text-slate-400">
                  {isCompliance
                    ? 'Las reglas de compliance dejarán de evaluarse'
                    : 'Los procesos obligatorios comenzarán a evaluarse'}
                </p>
              </div>
              <Button
                onClick={() => setShowConfirm(true)}
                variant={isCompliance ? 'outline' : 'default'}
                className={cn(
                  "rounded-xl font-bold text-xs h-10 px-6",
                  isCompliance
                    ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                )}
              >
                {isCompliance ? 'Desactivar' : 'Activar'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">
                    {isCompliance
                      ? '¿Desactivar el Modo Compliance?'
                      : '¿Activar el Modo Compliance?'}
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    {isCompliance
                      ? 'Al desactivarlo, los procesos obligatorios dejarán de evaluarse. Esta acción quedará registrada en el audit trail.'
                      : 'Al activarlo, los procesos obligatorios comenzarán a evaluarse. Acciones como cerrar deals requerirán contratos firmados.'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-700 block mb-2">
                  Justificación obligatoria *
                </label>
                <Textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Describe por qué cambias el modo de compliance..."
                  rows={3}
                  className="rounded-xl border-amber-200 bg-white text-sm resize-none"
                />
                <p className="text-[10px] text-amber-500 mt-1 text-right">
                  {justification.length} / 10 mínimo
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setShowConfirm(false); setJustification(''); }}
                  className="flex-1 rounded-xl border-amber-200 text-amber-700"
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleToggle}
                  disabled={saving || justification.trim().length < 10}
                  className={cn(
                    "flex-[2] rounded-xl text-white font-bold",
                    isCompliance
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-emerald-600 hover:bg-emerald-500"
                  )}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {isCompliance ? 'Sí, desactivar' : 'Sí, activar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!data.canToggle && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
          <p className="text-xs text-slate-500">
            Solo los administradores pueden cambiar el modo de compliance.
          </p>
        </div>
      )}
    </div>
  );
}
