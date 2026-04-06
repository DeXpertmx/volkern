
'use client'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Mail, Clock, GitBranch, Zap } from 'lucide-react'

interface NodeToolbarProps {
  onAddNode: (type: string) => void
  orientation?: 'horizontal' | 'vertical'
}

export function NodeToolbar({ onAddNode, orientation = 'horizontal' }: NodeToolbarProps) {
  const tools = [
    { 
      type: 'action', 
      icon: Zap, 
      label: 'Acción',
      tooltip: 'Ejecuta una acción (enviar email, SMS, WhatsApp, actualizar lead, etc.)'
    },
    { 
      type: 'condition', 
      icon: GitBranch, 
      label: 'Condición',
      tooltip: 'Divide el flujo según una condición (ej: si puntuación > 80)'
    },
    { 
      type: 'delay', 
      icon: Clock, 
      label: 'Delay',
      tooltip: 'Espera un tiempo determinado antes de continuar (minutos, horas, días)'
    },
  ]

  const containerClass = orientation === 'vertical' 
    ? 'flex flex-col gap-2 w-full' 
    : 'flex gap-2'

  const buttonClass = orientation === 'vertical'
    ? 'w-full justify-start'
    : ''

  return (
    <TooltipProvider>
      <div className={containerClass}>
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Tooltip key={tool.type} delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddNode(tool.type)}
                  className={`flex items-center gap-2 ${buttonClass}`}
                >
                  <Icon className="h-4 w-4" />
                  {tool.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={orientation === 'vertical' ? 'right' : 'bottom'} className="max-w-xs">
                <p className="text-xs">{tool.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
