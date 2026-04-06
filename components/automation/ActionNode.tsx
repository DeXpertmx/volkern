'use client'

import { Handle, Position, NodeProps, useReactFlow } from 'reactflow'
import { Card } from '@/components/ui/card'
import {
  Mail, MessageSquare, Bell, UserPlus, FileText, Send, MessageCircle,
  AlertCircle, CheckCircle2, Tag, Users, TrendingUp, DollarSign,
  Calendar, Webhook, CreditCard, Pause, Play, GraduationCap, Award,
  Target, Megaphone, Archive, Copy, Calculator, TagIcon, ChevronDown,
  Workflow, ShieldCheck, Zap, Bot
} from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { VariableSelector } from './VariableSelector'

export const ActionNode: React.FC<NodeProps> = ({ id, data, selected }) => {
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
    const currentMessage = data.config?.message || ''
    updateNodeConfig('message', currentMessage + variable)
  }

  const getIcon = (actionType: string) => {
    const icons: Record<string, any> = {
      enviar_email: Mail,
      enviar_sms: MessageSquare,
      enviar_whatsapp: MessageCircle,
      enviar_telegram: Send,
      enviar_notificacion: Bell,
      actualizar_lead: UserPlus,
      cambiar_etapa_lead: Target,
      asignar_tag: Tag,
      crear_tarea: FileText,
      crear_cita: Calendar,
      crear_deal: DollarSign,
      pausar_automatizacion: Pause,
      activar_automatizacion: Play,
      ejecutar_workflow: Bot,
      webhook_externo_seguro: ShieldCheck,
      webhook_saliente: Webhook,
      crear_factura_stripe: CreditCard,
      crear_factura_holded: FileText,
      crear_factura_square: CreditCard,
      cobrar_gocardless: DollarSign,
      enviar_mandato_gocardless: Send,
    }
    const Icon = icons[actionType] || Bell
    return <Icon className="h-4 w-4 text-green-600 dark:text-green-400" />
  }

  const sType = data.config?.actionType || ''
  const isMessageAction = ['enviar_email', 'enviar_sms', 'enviar_whatsapp'].includes(sType)
  const isEmail = sType === 'enviar_email'

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Card className={`min-w-[280px] w-[300px] cursor-grab active:cursor-grabbing transition-all ${selected ? 'ring-2 ring-primary shadow-lg' : ''
        } ${isInvalid ? 'border-destructive border-2' : ''}`}>

        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center shrink-0">
              {getIcon(data.config?.actionType)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold tracking-wider text-muted-foreground">ACCIÓN</div>
            </div>
          </div>

          <div className="nodrag mb-3">
            <Select
              value={sType}
              onValueChange={(val) => updateNodeConfig('actionType', val)}
            >
              <SelectTrigger className="w-full h-8 text-xs bg-slate-50 dark:bg-slate-900 border-dashed">
                <SelectValue placeholder="Seleccionar acción..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Comunicaciones</SelectLabel>
                  <SelectItem value="enviar_email">Enviar Email</SelectItem>
                  <SelectItem value="enviar_whatsapp">Enviar WhatsApp</SelectItem>
                  <SelectItem value="enviar_sms">Enviar SMS</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>CRM y Leads</SelectLabel>
                  <SelectItem value="cambiar_etapa_lead">Cambiar Etapa Pipeline</SelectItem>
                  <SelectItem value="asignar_tag">Asignar Etiqueta</SelectItem>
                  <SelectItem value="crear_tarea">Programar Tarea</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>🤖 Automatizaciones Avanzadas</SelectLabel>
                  <SelectItem value="ejecutar_workflow">Ejecutar Automatización</SelectItem>
                  <SelectItem value="webhook_externo_seguro">Webhook Seguro</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>💰 Facturación</SelectLabel>
                  <SelectItem value="crear_factura_stripe">Factura Stripe</SelectItem>
                  <SelectItem value="crear_factura_holded">Factura Holded</SelectItem>
                  <SelectItem value="crear_factura_square">Factura Square</SelectItem>
                  <SelectItem value="cobrar_gocardless">Cobrar GoCardless</SelectItem>
                  <SelectItem value="enviar_mandato_gocardless">Mandato GoCardless</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {isMessageAction && (
            <div className="nodrag space-y-2 mt-2 bg-slate-50/50 dark:bg-slate-900/50 p-2 rounded-md border border-slate-100 dark:border-slate-800">
              {isEmail && (
                <Input
                  className="h-7 text-xs"
                  placeholder="Asunto del correo"
                  value={data.config?.subject || ''}
                  onChange={(e) => updateNodeConfig('subject', e.target.value)}
                />
              )}

              <div className="relative">
                <Textarea
                  className="text-xs min-h-[60px] resize-y pr-8"
                  placeholder="Escribe el mensaje..."
                  value={data.config?.message || ''}
                  onChange={(e) => updateNodeConfig('message', e.target.value)}
                />
              </div>

              <div className="flex justify-end mt-1">
                <VariableSelector onSelect={handleVariableSelect} />
              </div>
            </div>
          )}

          {/* Extras Textuales/Opciones (Para cosas futuras no-mensaje) */}
          {!isMessageAction && data.config?.subject && (
            <div className="text-xs p-2 rounded bg-slate-100 dark:bg-slate-800 text-muted-foreground mt-1 truncate">
              <span className="font-semibold text-slate-500">Valor:</span> {data.config.subject}
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
