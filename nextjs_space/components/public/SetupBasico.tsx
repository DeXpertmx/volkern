'use client';

import React, { useState } from 'react';
import { Settings, Check, AlertTriangle } from 'lucide-react';

const SETUP_ITEMS = [
  'Configuración inicial',
  'Pipeline estándar',
  'Automatización básica',
  '1 canal de comunicación',
  'Sesión de onboarding',
] as const;

export default function SetupBasico() {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="vl-ring-soft rounded-2xl p-5 border border-emerald-500/20 bg-emerald-500/5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Settings className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <span className="text-sm font-black text-emerald-300 uppercase tracking-wider">
          Setup básico incluido
        </span>
      </div>

      {/* Items */}
      <ul className="space-y-1.5 mb-3">
        {SETUP_ITEMS.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-slate-300">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      {/* Ready message */}
      <p className="text-xs text-emerald-200/80 font-medium mb-3">
        👉 Listo para usar en pocos días
      </p>

      {/* Toggle details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
        aria-expanded={showDetails}
      >
        💥 Ver qué incluye y qué no incluye
      </button>

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-emerald-500/10 space-y-2 text-xs text-slate-400 leading-relaxed">
          <p>
            <strong className="text-emerald-300">✅ Incluye:</strong> configuración guiada del CRM, creación de pipeline con etapas estándar, 1 automatización de seguimiento básica, activación de 1 canal (email o WhatsApp/web), y 1 sesión de onboarding en vivo con tu equipo.
          </p>
          <p>
            <strong className="text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              No incluye:
            </strong>{' '}
            personalizaciones avanzadas, integraciones a medida, migración de datos históricos ni desarrollos exclusivos fuera del alcance estándar. Estos servicios pueden contratarse por separado.
          </p>
        </div>
      )}
    </div>
  );
}
