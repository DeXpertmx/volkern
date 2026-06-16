'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldOff, Loader2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ComplianceBadgeProps {
  isCollapsed?: boolean;
}

export function ComplianceBadge({ isCollapsed = false }: ComplianceBadgeProps) {
  const [mode, setMode] = useState<'normal' | 'compliance' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMode = async () => {
      try {
        const res = await fetch('/api/tenant/compliance-mode');
        const json = await res.json();
        if (json.success) {
          setMode(json.mode);
        }
      } catch {
        // Fallback: mostrar como normal si no se puede obtener
      } finally {
        setLoading(false);
      }
    };

    fetchMode();

    // Refrescar cada 30 segundos
    const interval = setInterval(fetchMode, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={cn(
        "flex items-center",
        isCollapsed ? "justify-center" : "gap-3"
      )}>
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  const isCompliance = mode === 'compliance';

  return (
    <Link
      href="/dashboard/configuracion?section=compliance"
      className={cn(
        "flex items-center rounded-xl transition-all group",
        isCollapsed ? "justify-center p-2" : "gap-3 p-3",
        isCompliance
          ? "bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
          : "bg-slate-50 border border-slate-200 hover:bg-slate-100"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110",
        isCompliance ? "bg-emerald-100" : "bg-slate-200"
      )}>
        {isCompliance ? (
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
        ) : (
          <ShieldOff className="w-4 h-4 text-slate-500" />
        )}
      </div>

      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">
              {isCompliance ? 'Compliance ON' : 'Compliance OFF'}
            </span>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              isCompliance ? "bg-emerald-500" : "bg-slate-400"
            )} />
          </div>
          <p className="text-[9px] text-slate-400 font-medium truncate">
            {isCompliance ? 'Procesos obligatorios activos' : 'Sin restricciones'}
          </p>
        </div>
      )}

      {!isCollapsed && (
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
      )}
    </Link>
  );
}
