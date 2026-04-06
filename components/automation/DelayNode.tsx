
'use client'

import { Handle, Position, NodeProps, useReactFlow } from 'reactflow'
import { Card } from '@/components/ui/card'
import { Clock, AlertCircle, CheckCircle2, Timer } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

export const DelayNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { setNodes } = useReactFlow()
  const isInvalid = data.isInvalid
  const validationMessage = data.validationMessage

  const updateNodeConfig = (key: string, value: string | number) => {
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

  const units: Record<string, string> = {
    minutes: 'Minutos',
    hours: 'Horas',
    days: 'Días',
    weeks: 'Semanas',
  }

  const getContextualHelp = () => {
    if (!data.config?.duration || !data.config?.unit) return 'Define espera'

    const { duration, unit } = data.config
    const labelUnit = duration === 1 ? units[unit]?.slice(0, -1) : units[unit] // Remover 's' plural muy rudimentario pero útil

    return `Esperará ${duration} ${labelUnit?.toLowerCase()} antes de seguir`
  }

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Card className={`min-w-[220px] cursor-grab active:cursor-grabbing transition-all ${selected ? 'ring-2 ring-primary shadow-lg' : ''
        } ${isInvalid ? 'border-destructive border-2' : ''}`}>

        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold tracking-wider text-muted-foreground">RETRASO</div>
            </div>
          </div>

          <div className="nodrag flex gap-2 mb-2">
            <Input
              type="number"
              min="1"
              className="w-16 h-8 text-xs bg-slate-50 dark:bg-slate-900 border-dashed"
              placeholder="0"
              value={data.config?.duration || ''}
              onChange={(e) => updateNodeConfig('duration', parseInt(e.target.value) || '')}
            />

            <Select
              value={data.config?.unit || ''}
              onValueChange={(val) => updateNodeConfig('unit', val)}
            >
              <SelectTrigger className="flex-1 h-8 text-xs bg-slate-50 dark:bg-slate-900 border-dashed">
                <SelectValue placeholder="Unidad" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(units).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contextual Help */}
          {data.config?.duration && data.config?.unit && !isInvalid && (
            <div className="mt-3 pt-2 pl-1 border-t">
              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                <Timer className="h-3 w-3 mt-0.5 shrink-0 text-purple-600" />
                <span className="leading-tight font-medium">{getContextualHelp()}</span>
              </div>
            </div>
          )}

          {isInvalid && validationMessage && (
            <div className="text-[10px] text-destructive mt-3 bg-red-50 dark:bg-red-950/30 p-1.5 rounded flex items-start gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{String(validationMessage)}</span>
            </div>
          )}
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </>
  )
}
