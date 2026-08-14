'use client'

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Trato fiscal del proveedor: régimen legal que determina las retenciones
 * aplicables al pagarle (IRPF/IVA). Presets legales (España):
 *   • EMPRESA     → persona jurídica, sin retención (0% / 0%)
 *   • PROFESIONAL → autónomo/profesional, IRPF 15% (art. 101 LIRPF)
 *   • PRIMER_ANO  → autónomo primer año, IRPF 7%
 *   • ARRENDADOR  → arrendamiento local, IRPF 19%
 *   • CUSTOM      → porcentajes manuales
 * Los porcentajes siempre son editables (la ley puede variar por caso).
 */
export const FISCAL_REGIMES = [
  { value: 'EMPRESA', label: 'Empresa / Persona jurídica', irpf: 0, iva: 0, hint: 'Sin retención (IRPF 0%)' },
  { value: 'PROFESIONAL', label: 'Profesional / Autónomo', irpf: 15, iva: 0, hint: 'IRPF 15% (art. 101 LIRPF)' },
  { value: 'PRIMER_ANO', label: 'Autónomo — primer año', irpf: 7, iva: 0, hint: 'IRPF 7% (primer año de actividad)' },
  { value: 'ARRENDADOR', label: 'Arrendador de local', irpf: 19, iva: 0, hint: 'IRPF 19% (arrendamiento local)' },
  { value: 'CUSTOM', label: 'Personalizado', irpf: 0, iva: 0, hint: 'Porcentajes manuales' },
] as const

export type FiscalRegimeValue = typeof FISCAL_REGIMES[number]['value']

export default function FiscalRegimeEditor({
  regime,
  irpfRetention,
  ivaRetention,
  onChange,
}: {
  regime: string
  irpfRetention: number
  ivaRetention: number
  onChange: (patch: { fiscalRegime: string; irpfRetention: number; ivaRetention: number }) => void
}) {
  const current = FISCAL_REGIMES.find(r => r.value === regime) || FISCAL_REGIMES[FISCAL_REGIMES.length - 1]

  const applyPreset = (value: string) => {
    const preset = FISCAL_REGIMES.find(r => r.value === value)!
    onChange({
      fiscalRegime: value,
      irpfRetention: value === 'CUSTOM' ? irpfRetention : preset.irpf,
      ivaRetention: value === 'CUSTOM' ? ivaRetention : preset.iva,
    })
  }

  const setRate = (kind: 'irpf' | 'iva', raw: string) => {
    const n = parseFloat(raw.replace(',', '.'))
    const val = Number.isFinite(n) && n >= 0 ? n : 0
    onChange({
      fiscalRegime: 'CUSTOM',
      irpfRetention: kind === 'irpf' ? val : irpfRetention,
      ivaRetention: kind === 'iva' ? val : ivaRetention,
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground font-semibold uppercase">Trato fiscal</Label>
        <select
          value={regime}
          onChange={e => applyPreset(e.target.value)}
          className="w-full bg-background border rounded-xl px-3 py-2.5 text-sm outline-none"
        >
          {FISCAL_REGIMES.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground">{current.hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground font-semibold uppercase">Retención IRPF %</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={irpfRetention}
            onChange={e => setRate('irpf', e.target.value)}
            className="rounded-xl h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground font-semibold uppercase">Retención IVA %</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={ivaRetention}
            onChange={e => setRate('iva', e.target.value)}
            className="rounded-xl h-9"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Al pagarle a este proveedor se aplicará la retención indicada. Editar un porcentaje cambia el trato a «Personalizado».
      </p>
    </div>
  )
}
