
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  MessageCircle,
  Mail,
  Phone,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Template {
  id: string
  nombre: string
  canal: string
  asunto?: string
  contenido: string
  variables?: any
  categoria?: string
  activo: boolean
}

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [canalFilter, setCanalFilter] = useState('todos')
  const [showDialog, setShowDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    nombre: '',
    canal: 'whatsapp',
    asunto: '',
    contenido: '',
    categoria: '',
  })

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (canalFilter !== 'todos') params.append('canal', canalFilter)

      const response = await fetch(`/api/mensajes/templates?${params}`)
      const data = await response.json()

      if (response.ok) {
        setTemplates(data.templates || [])
      } else {
        toast.error(data.error || 'Error al cargar templates')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [canalFilter])

  const handleOpenDialog = (template?: Template) => {
    if (template) {
      setEditingTemplate(template)
      setFormData({
        nombre: template.nombre,
        canal: template.canal,
        asunto: template.asunto || '',
        contenido: template.contenido,
        categoria: template.categoria || '',
      })
    } else {
      setEditingTemplate(null)
      setFormData({
        nombre: '',
        canal: 'whatsapp',
        asunto: '',
        contenido: '',
        categoria: '',
      })
    }
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    if (!formData.nombre || !formData.contenido) {
      toast.error('Por favor completa todos los campos requeridos')
      return
    }

    try {
      const url = editingTemplate
        ? `/api/mensajes/templates/${editingTemplate.id}`
        : '/api/mensajes/templates'
      
      const method = editingTemplate ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast.success(
          editingTemplate
            ? 'Template actualizado correctamente'
            : 'Template creado correctamente'
        )
        setShowDialog(false)
        fetchTemplates()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Error al guardar template')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar template')
    }
  }

  const handleDelete = async () => {
    if (!templateToDelete) return

    try {
      const response = await fetch(`/api/mensajes/templates/${templateToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Template eliminado correctamente')
        fetchTemplates()
      } else {
        toast.error('Error al eliminar template')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar template')
    } finally {
      setDeleteDialogOpen(false)
      setTemplateToDelete(null)
    }
  }

  const filteredTemplates = templates.filter((template) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      template.nombre.toLowerCase().includes(searchLower) ||
      template.contenido.toLowerCase().includes(searchLower) ||
      (template.categoria && template.categoria.toLowerCase().includes(searchLower))
    )
  })

  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'whatsapp':
        return <Phone className="h-4 w-4 text-green-600" />
      case 'email':
        return <Mail className="h-4 w-4 text-blue-600" />
      case 'ambos':
        return <MessageCircle className="h-4 w-4 text-purple-600" />
      default:
        return <MessageCircle className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Templates de Mensajes
          </h1>
          <p className="text-muted-foreground">
            Gestiona plantillas de mensajes para WhatsApp y Email
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchTemplates} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          <Button onClick={() => handleOpenDialog()} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Template
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={canalFilter} onValueChange={setCanalFilter}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los canales</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="todos_canales">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Lista de templates */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No hay templates
            </h3>
            <p className="text-muted-foreground mb-4">
              Crea tu primer template para agilizar tus comunicaciones
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Template
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {getCanalIcon(template.canal)}
                  <h3 className="font-semibold">{template.nombre}</h3>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDialog(template)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTemplateToDelete(template.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {template.categoria && (
                <Badge variant="outline" className="mb-3">
                  {template.categoria}
                </Badge>
              )}

              {template.asunto && template.canal === 'email' && (
                <p className="text-sm font-medium mb-2">
                  Asunto: {template.asunto}
                </p>
              )}

              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {template.contenido}
              </p>

              {!template.activo && (
                <Badge variant="secondary" className="mt-2">
                  Inactivo
                </Badge>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de crear/editar */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Template' : 'Nuevo Template'}
            </DialogTitle>
            <DialogDescription>
              Crea una plantilla de mensaje reutilizable
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nombre">Nombre del Template *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) =>
                  setFormData({ ...formData, nombre: e.target.value })
                }
                placeholder="Ej: Bienvenida Lead"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="canal">Canal *</Label>
                <Select
                  value={formData.canal}
                  onValueChange={(value) =>
                    setFormData({ ...formData, canal: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="categoria">Categoría</Label>
                <Input
                  id="categoria"
                  value={formData.categoria}
                  onChange={(e) =>
                    setFormData({ ...formData, categoria: e.target.value })
                  }
                  placeholder="Ej: bienvenida, recordatorio"
                />
              </div>
            </div>

            {(formData.canal === 'email' || formData.canal === 'ambos') && (
              <div>
                <Label htmlFor="asunto">Asunto (para emails)</Label>
                <Input
                  id="asunto"
                  value={formData.asunto}
                  onChange={(e) =>
                    setFormData({ ...formData, asunto: e.target.value })
                  }
                  placeholder="Asunto del email"
                />
              </div>
            )}

            <div>
              <Label htmlFor="contenido">Contenido del Mensaje *</Label>
              <Textarea
                id="contenido"
                value={formData.contenido}
                onChange={(e) =>
                  setFormData({ ...formData, contenido: e.target.value })
                }
                placeholder="Escribe el contenido del mensaje..."
                className="min-h-[200px]"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Usa variables como {'{nombre}'}, {'{fecha}'}, {'{servicio}'}, etc.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingTemplate ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El template será eliminado
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
