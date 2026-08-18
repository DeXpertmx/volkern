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

  const fieldGroups: Record<string, { label: string; items: { value: string; label: string }[] }> = {
    contacto: {
      label: 'Contacto / Lead',
      items: [
        { value: 'contact.tags', label: 'Etiquetas (Tags)' },
        { value: 'contact.email', label: 'Email' },
        { value: 'contact.phone', label: 'Teléfono' },
        { value: 'contact.name', label: 'Nombre' },
        { value: 'contact.company', label: 'Empresa' },
        { value: 'contact.score', label: 'Puntuación (Score)' },
        { value: 'contact.source', label: 'Origen (fuente del lead)' },
        { value: 'contact.channel', label: 'Canal (WhatsApp, email...)' },
        { value: 'contact.pipeline_stage', label: 'Etapa del Pipeline / Estado' },
      ],
    },
    formulario: {
      label: 'Formulario',
      items: [
        { value: 'form.formName', label: 'Nombre del Formulario' },
        { value: 'form.formId', label: 'ID del Formulario' },
      ],
    },
  }

  const operatorLabels: Record<string, string> = {
    'equals': 'Es igual a',
    'not_equals': 'No es igual a',
    'contains': 'Contiene',
    'not_contains': 'No contiene',
    'starts_with': 'Empieza con',
    'ends_with': 'Termina con',
    'exists': 'Existe / Tiene valor',
    'not_exists': 'No existe / Vacío',
    'includes': 'Incluye (tags)',
    'not_includes': 'No incluye',
    'greater_than': 'Mayor que (número)',
    'less_than': 'Menor que (número)',
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
                {Object.entries(fieldGroups).map(([key, group]) => (
                  <SelectGroup key={key}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
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
                {Object.entries(operatorLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
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
