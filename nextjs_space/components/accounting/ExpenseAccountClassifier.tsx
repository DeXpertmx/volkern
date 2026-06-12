'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles, CheckCircle2, RefreshCw, BookOpen, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Expense {
  id: string
  description: string
  category: string
  amount: number
  supplier?: { name: string }
  metadata?: {
    aiClassification?: { accountCode: string; accountName: string; confidence: number; reasoning: string }
    confirmedAccountCode?: string
    confirmedAccountName?: string
  }
}

interface AccountOption {
  code: string
  name: string
}

interface Props {
  expense: Expense
  accounts: AccountOption[]
  onConfirmed: () => void
}

export function ExpenseAccountClassifier({ expense, accounts, onConfirmed }: Props) {
  const [classifying, setClassifying] = useState(false)
  const [classification, setClassification] = useState<{
    accountCode: string
    accountName: string
    confidence: number
    reasoning: string
  } | null>(expense.metadata?.aiClassification ?? null)

  const [selectedCode, setSelectedCode] = useState(
    expense.metadata?.confirmedAccountCode ?? expense.metadata?.aiClassification?.accountCode ?? '',
  )

  const confirmedCode = expense.metadata?.confirmedAccountCode

  const handleClassify = async () => {
    setClassifying(true)
    try {
      const res = await fetch(`/api/accounting/expenses/${expense.id}/classify`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Error al clasificar')
        return
      }
      const data = await res.json()
      setClassification(data)
      setSelectedCode(data.accountCode)
      toast.success(`Gemma sugiere cuenta ${data.accountCode} (${Math.round(data.confidence * 100)}% confianza)`)
    } catch {
      toast.error('Error de conexión al clasificar')
    } finally {
      setClassifying(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedCode) return
    try {
      const res = await fetch(`/api/accounting/expenses/${expense.id}/confirm-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountCode: selectedCode }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Error al confirmar')
        return
      }
      toast.success(`Cuenta ${selectedCode} confirmada`)
      onConfirmed()
    } catch {
      toast.error('Error de conexión')
    }
  }

  const selectedAccount = accounts.find(a => a.code === selectedCode)
  const confidencePct = classification ? Math.round(classification.confidence * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
          <BookOpen className="h-3 w-3" /> Cuenta Contable (Grupo 6)
        </h3>
        {!confirmedCode && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1 h-7 rounded-lg"
            onClick={handleClassify}
            disabled={classifying}
          >
            {classifying ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {classifying ? 'Analizando...' : 'Clasificar con Gemma'}
          </Button>
        )}
      </div>

      {confirmedCode ? (
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">
                {expense.metadata?.confirmedAccountName ?? confirmedCode}
              </p>
              <p className="text-[10px] text-emerald-600 font-medium">
                Cuenta {confirmedCode} — Confirmada por usuario
              </p>
            </div>
          </CardContent>
        </Card>
      ) : classification ? (
        <div className="space-y-3">
          <Card className={confidencePct >= 80 ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-50 border-amber-200'}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge className={`text-[10px] font-bold px-2 py-0.5 ${
                  confidencePct >= 80 ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {confidencePct}% Confianza
                </Badge>
                <span className="text-xs font-mono font-bold">{classification.accountCode}</span>
              </div>
              <p className="text-sm font-bold">{classification.accountName}</p>
              <p className="text-[11px] text-muted-foreground">{classification.reasoning}</p>
            </CardContent>
          </Card>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                O ajustar manualmente
              </label>
              <Select value={selectedCode} onValueChange={setSelectedCode}>
                <SelectTrigger className="h-9 text-sm bg-accent/30">
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 gap-1 text-xs" onClick={handleConfirm} disabled={!selectedCode}>
              <CheckCircle2 className="h-3 w-3" /> Confirmar
            </Button>
          </div>
        </div>
      ) : (
        <Card className="bg-slate-50 border-dashed border-slate-200">
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">
              Presiona &quot;Clasificar con Gemma&quot; para sugerir la cuenta contable
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
