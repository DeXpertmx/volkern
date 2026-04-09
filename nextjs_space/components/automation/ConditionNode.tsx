'use client'

import { Handle, Position, NodeProps, useReactFlow } from 'reactflow'
import { Card } from '@/components/ui/card'
import { GitBranch, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { VariableSelector } from './VariableSelector'

export const ConditionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { setNodes } = useReactFlow()
  const isInvalid = data.isInvalid
  const validationMessage = data.validationMessage

  const updateNodeConfig = (key: string, value: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...node.data.config,
                [key]: value,
              },
              isInvalid: false
            },
          }
        }
        return node
      })
    )
  }

  const handleVariableSelect = (variable: string) => {
    const currentValue = data.config?.value || ''
    updateNodeConfig('value', currentValue + variable)
  }

  const fieldLabels: Record<string, string> = {
    'contact.tags': 'Etiquetas (Tags)',
    'contact.email': 'Email',
    'contact.phone': 'Teléfono',
    'contact.score': 'Puntuación (Score)',
    'contact.source': 'Origen (Source)',
    'contact.pipeline_stage': 'Etapa del Pipeline',
    'appointment.status': 'Estado de Cita',
    'email.opened': 'Email Abierto',
    'email.clicked': 'Enlace Clicado',
  }

  const operatorLabels: Record<string, string> = {
    'equals': 'Es igual a',
    'contains': 'Contiene',
    'greater_than': 'Mayor que',
    'less_than': 'Menor que',
    'exists': 'Existe / Tiene valor',
    'not_exists': 'No existe / Vacío',
  }

  const requiresValue = !['exists', 'not_exists'].includes(data.config?.operator || '')

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Card className={`min-w-[280px] cursor-grab active:cursor-grabbing transition-all ${selected ? 'ring-2 ring-primary shadow-lg' : ''
        } ${isInvalid ? 'border-destructive border-2' : ''}`}>
        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center shrink-0">
              <GitBranch className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold tracking-wider text-muted-foreground">CONDICIÓN</div>
            </div>
          </div>

          <div className="nodrag flex flex-col gap-2 mb-2">
            <Select
              value={data.config?.field || ''}
              onValueChange={(val) => updateNodeConfig('field', val)}
            >
              <SelectTrigger className="w-full text-xs h-8 bg-slate-50 dark:bg-slate-900 border-dashed">
                <SelectValue placeholder="Seleccionar Campo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Contacto</SelectLabel>
                  <SelectItem value="contact.tags">Etiquetas</SelectItem>
                  <SelectItem value="contact.email">Email</SelectItem>
                  <SelectItem value="contact.phone">Teléfono</SelectItem>
                  <SelectItem value="contact.score">Puntuación</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={data.config?.operator || ''}
              onValueChange={(val) => updateNodeConfig('operator', val)}
            >
              <SelectTrigger className="w-full text-xs h-8 bg-slate-50 dark:bg-slate-900 border-dashed">
                <SelectValue placeholder="Condición..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Es igual a</SelectItem>
                <SelectItem value="contains">Contiene</SelectItem>
                <SelectItem value="exists">Tiene valor</SelectItem>
                <SelectItem value="not_exists">Está vacío</SelectItem>
              </SelectContent>
            </Select>

            {requiresValue && (
              <div className="flex gap-1">
                <Input
                  className="flex-1 h-8 text-xs font-mono bg-slate-50 dark:bg-slate-900 border-dashed"
                  placeholder="Valor..."
                  value={data.config?.value || ''}
                  onChange={(e) => updateNodeConfig('value', e.target.value)}
                />
                <VariableSelector onSelect={handleVariableSelect} />
              </div>
            )}
          </div>

          {isInvalid && validationMessage && (
            <div className="text-[10px] text-destructive mt-3 bg-red-50 dark:bg-red-950/30 p-1.5 rounded flex items-start gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{String(validationMessage)}</span>
            </div>
          )}

        </div>

        {/* Indicadores visuales integrados en el borde de la tarjeta para las salidas (Handles) */}
        <div className="border-t bg-slate-50 dark:bg-slate-900/50 flex justify-between p-1 px-3 text-[10px] font-medium text-muted-foreground rounded-b-xl border-dashed">
          <span className="text-green-600 dark:text-green-500 font-bold">✓ SÍ</span>
          <span className="text-red-500 dark:text-red-400 font-bold">NO ✕</span>
        </div>
      </Card>

      {/* Handles ubicados visualmente sobre los textos de SÍ / NO */}
      {/* SÍ = Salida izquierda inferior */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!bg-green-500 w-3 h-3 border-2 border-white dark:border-slate-950 !-ml-[70px]"
      />
      {/* NO = Salida derecha inferior */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!bg-red-500 w-3 h-3 border-2 border-white dark:border-slate-950 !ml-[70px]"
      />
    </>
  )
}
