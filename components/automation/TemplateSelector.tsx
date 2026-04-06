'use client'

import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, MessageCircle, Zap, Bot, Target, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface WorkflowTemplate {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  icon: string | null
  color: string | null
  isPremium: boolean
  isActive: boolean
}

interface TemplateSelectorProps {
  value: string
  onChange: (templateId: string, template?: WorkflowTemplate) => void
  placeholder?: string
  showDescription?: boolean
  filterByCategory?: string
  disabled?: boolean
}

// Mapa de iconos por nombre
const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="h-4 w-4" />,
  MessageCircle: <MessageCircle className="h-4 w-4" />,
  Zap: <Zap className="h-4 w-4" />,
  Bot: <Bot className="h-4 w-4" />,
  Target: <Target className="h-4 w-4" />,
  Calendar: <Calendar className="h-4 w-4" />,
  AlertTriangle: <AlertTriangle className="h-4 w-4" />,
}

// Mapa de categorías para labels
const CATEGORY_LABELS: Record<string, string> = {
  ai: '🤖 Inteligencia Artificial',
  comunicacion: '💬 Comunicación',
  crm: '💼 CRM & Ventas',
  integraciones: '🔗 Integraciones',
  pagos: '💳 Pagos',
  marketing: '📣 Marketing',
  productividad: '⚙️ Productividad',
}

export function TemplateSelector({
  value,
  onChange,
  placeholder = 'Seleccionar Automatización...',
  showDescription = true,
  filterByCategory,
  disabled = false,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      setError(null)

      let url = '/api/automation/templates'
      if (filterByCategory) {
        url += `?category=${encodeURIComponent(filterByCategory)}`
      }

      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Error al cargar automatizaciones')
      }

      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err: any) {
      console.error('Error fetching templates:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [filterByCategory])

  const selectedTemplate = templates.find((t) => t.id === value)

  const getIcon = (iconName: string | null, color: string | null) => {
    const icon = iconName && ICON_MAP[iconName] ? ICON_MAP[iconName] : <Bot className="h-4 w-4" />
    return (
      <span style={{ color: color || undefined }}>
        {icon}
      </span>
    )
  }

  // Agrupar templates por categoría
  const templatesByCategory = templates.reduce((acc, template) => {
    const cat = template.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(template)
    return acc
  }, {} as Record<string, WorkflowTemplate[]>)

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando automatizaciones...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4" />
        {error}
      </div>
    )
  }

  const handleSelect = (val: string) => {
    const template = templates.find((t) => t.id === val)
    onChange(val, template)
  }

  return (
    <div className="space-y-2">
      <Select value={value || ''} onValueChange={handleSelect} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder}>
            {selectedTemplate ? (
              <div className="flex items-center gap-2">
                {getIcon(selectedTemplate.icon, selectedTemplate.color)}
                <span>{selectedTemplate.displayName}</span>
              </div>
            ) : (
              placeholder
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="max-h-[300px]">
          {templates.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No hay automatizaciones disponibles.
            </div>
          ) : (
            Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
              <SelectGroup key={category}>
                <SelectLabel className="text-xs font-semibold text-muted-foreground">
                  {CATEGORY_LABELS[category] || category}
                </SelectLabel>
                {categoryTemplates.map((template) => (
                  <SelectItem
                    key={template.id}
                    value={template.id}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {getIcon(template.icon, template.color)}
                      <span>{template.displayName}</span>
                      {template.isPremium && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          PRO
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Descripción del template seleccionado */}
      {showDescription && selectedTemplate && (
        <div
          className="p-3 rounded-md border text-xs"
          style={{ borderColor: selectedTemplate.color || undefined }}
        >
          <div className="flex items-center gap-2 font-medium text-sm">
            {getIcon(selectedTemplate.icon, selectedTemplate.color)}
            {selectedTemplate.displayName}
            {selectedTemplate.isPremium && (
              <Badge variant="secondary" className="text-[10px]">
                Premium
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{selectedTemplate.description}</p>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span className="text-muted-foreground">Se creará automáticamente al guardar</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default TemplateSelector
