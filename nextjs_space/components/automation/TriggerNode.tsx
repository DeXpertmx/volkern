
'use client'

import { useState, useEffect } from 'react'
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow'
import { Card } from '@/components/ui/card'
import { Zap, FileText } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'

// Formulario web del tenant (para el selector de formulario del trigger)
type WebFormOption = {
  id: string
  name: string
}

export const TriggerNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { setNodes } = useReactFlow()
  const [forms, setForms] = useState<WebFormOption[]>([])

  // Cargar formularios del tenant para el selector específico del trigger
  useEffect(() => {
    if (data.trigger === 'formulario_enviado') {
      fetch('/api/formularios', { headers: { 'Accept': 'application/json' } })
        .then((r) => r.ok ? r.json() : Promise.resolve({ forms: [] }))
        .then((res) => setForms(res.forms || []))
        .catch(() => setForms([]))
    }
  }, [data.trigger])

  const updateTrigger = (val: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              trigger: val,
              // Al cambiar de trigger, limpiar la selección de formulario
              config: {
                ...(node.data.config || {}),
                formId: undefined,
              },
            },
          }
        }
        return node
      })
    )
  }

  const updateForm = (formId: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...(node.data.config || {}),
                formId,
              },
            },
          }
        }
        return node
      })
    )
  }

  // Agrupación manual para el Select visual
  const triggerGroups = {
    leads: {
      label: 'Prospectos / CRM',
      items: [
        { value: 'nuevo_lead', label: 'Nuevo Lead Creado' },
        { value: 'lead_actualizado', label: 'Lead Actualizado' },
        { value: 'lead_etiquetado', label: 'Lead Etiquetado' },
        { value: 'lead_sin_respuesta', label: 'Lead Sin Respuesta (24h)' },
        { value: 'nota_creada', label: 'Nota Creada' },
        { value: 'interaccion_creada', label: 'Interacción Registrada' },
      ]
    },
    formularios: {
      label: 'Formularios',
      items: [
        { value: 'formulario_enviado', label: 'Formulario Enviado' },
      ]
    },
    citas: {
      label: 'Citas y Calendario',
      items: [
        { value: 'cita_agendada', label: 'Cita Agendada' },
        { value: 'cita_confirmada', label: 'Cita Confirmada' },
        { value: 'cita_cancelada', label: 'Cita Cancelada' },
        { value: 'cita_reagendada', label: 'Cita Reagendada' },
      ]
    },
    marketing: {
      label: 'Email Marketing',
      items: [
        { value: 'email_abierto', label: 'Email Abierto' },
        { value: 'email_clicado', label: 'Enlace Clicado' },
      ]
    },
    lms: {
      label: 'Academia (LMS)',
      items: [
        { value: 'estudiante_inscrito', label: 'Estudiante Inscrito' },
        { value: 'estudiante_completa_curso', label: 'Completa Curso' },
        { value: 'leccion_completada', label: 'Lección Completada' },
      ]
    },
    comercial: {
      label: 'Pagos y Comercial',
      items: [
        { value: 'pago_recibido', label: 'Pago Recibido' },
        { value: 'pago_fallido', label: 'Pago Fallido' },
      ]
    },
    externos: {
      label: '🤖 Externos (n8n / Webhooks)',
      items: [
        { value: 'webhook_recibido', label: 'Webhook Recibido' },
        { value: 'n8n_workflow_completado', label: 'Workflow n8n Completado' },
        { value: 'n8n_workflow_fallido', label: 'Workflow n8n Fallido' },
        { value: 'evento_externo', label: 'Evento Externo' },
      ]
    }
  }

  // Mapeo simple para el caso donde el trigger actual no está en la lista reducida (legacy support)
  const legacyLabels: Record<string, string> = {
    fecha_especifica: 'Fecha/Hora Específica',
    cita_creada: 'Cita Creada (Anytimebot)',
    cita_reprogramada: 'Cita Reprogramada (Anytimebot)',
  }

  return (
    <Card className={`min-w-[260px] cursor-grab active:cursor-grabbing transition-all ${selected ? 'ring-2 ring-blue-500 shadow-lg' : ''
      }`}>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold tracking-wider text-muted-foreground">DISPARADOR</div>
          </div>
        </div>

        <div className="nodrag mb-1">
          <Select
            value={data.trigger || ''}
            onValueChange={updateTrigger}
          >
            <SelectTrigger className="w-full h-8 text-xs bg-slate-50 dark:bg-slate-900 border-blue-200 dark:border-blue-900 border-dashed">
              <SelectValue placeholder="Selecciona un evento..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(triggerGroups).map(([groupKey, group]) => (
                <SelectGroup key={groupKey}>
                  <SelectLabel className="text-xs">{group.label}</SelectLabel>
                  {group.items.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}

              {/* Fallback si el dato actual es legacy */}
              {data.trigger && legacyLabels[data.trigger] && (
                <SelectGroup>
                  <SelectLabel className="text-xs">Otros</SelectLabel>
                  <SelectItem value={data.trigger}>{legacyLabels[data.trigger]}</SelectItem>
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          {/* Selector de formulario específico para el trigger formulario_enviado */}
          {data.trigger === 'formulario_enviado' && (
            <div className="mt-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1">
                <FileText className="h-3 w-3" />
                Formulario a automatizar
              </div>
              <Select
                value={data.config?.formId || ''}
                onValueChange={updateForm}
              >
                <SelectTrigger className="w-full h-8 text-xs bg-slate-50 dark:bg-slate-900 border-blue-200 dark:border-blue-900 border-dashed">
                  <SelectValue placeholder="Selecciona un formulario..." />
                </SelectTrigger>
                <SelectContent>
                  {forms.length === 0 && (
                    <SelectItem value="__none__" disabled>
                      No hay formularios creados
                    </SelectItem>
                  )}
                  {forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Solo se disparará cuando se envíe este formulario.
              </p>
            </div>
          )}
        </div>

      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
    </Card>
  )
}
