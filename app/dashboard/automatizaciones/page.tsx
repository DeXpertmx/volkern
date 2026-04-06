
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Play, Pause, Trash2, Edit, MoreVertical, Workflow, Sparkles, Search, Filter, UserPlus, Clock, Calendar, GraduationCap, Award, RefreshCw, CreditCard, Eye } from 'lucide-react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Automation {
  id: string
  nombre: string
  descripcion?: string
  activo: boolean
  trigger: string
  fechaCreacion: string
  fechaActualizacion: string
}

interface AutomationTemplate {
  id: string
  nombre: string
  descripcion: string
  categoria: string
  icono?: string
  color?: string
  flowData: any
  trigger: string
  tags: string[]
  popularidad: number
  esOficial: boolean
}

const triggerLabels: Record<string, string> = {
  nuevo_lead: 'Nuevo Lead',
  cita_agendada: 'Cita Agendada',
  cita_confirmada: 'Cita Confirmada',
  pago_recibido: 'Pago Recibido',
  lead_sin_respuesta: 'Lead Sin Respuesta',
  estudiante_inscrito: 'Estudiante Inscrito',
  estudiante_completa_curso: 'Estudiante Completa Curso',
  leccion_completada: 'Lección Completada',
}

const categoriaLabels: Record<string, string> = {
  todas: 'Todas',
  leads: 'Leads',
  ventas: 'Ventas',
  cursos: 'Cursos',
  engagement: 'Engagement',
  servicio_cliente: 'Servicio al Cliente',
}

const iconMap: Record<string, any> = {
  UserPlus,
  Clock,
  Calendar,
  GraduationCap,
  Award,
  Sparkles,
  RefreshCw,
  CreditCard,
}

export default function AutomatizacionesPage() {
  const router = useRouter()
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<AutomationTemplate[]>([])
  const [filteredTemplates, setFilteredTemplates] = useState<AutomationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [categoriaActual, setCategoriaActual] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [creandoDesdeTemplate, setCreandoDesdeTemplate] = useState(false)
  const [activeTab, setActiveTab] = useState('mis-automatizaciones')

  useEffect(() => {
    fetchAutomations()
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [])

  useEffect(() => {
    filterTemplates()
  }, [templates, categoriaActual, busqueda])

  const fetchAutomations = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/automatizaciones')
      if (!response.ok) throw new Error('Error al cargar automatizaciones')
      const data = await response.json()
      setAutomations(data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar automatizaciones')
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true)
      const response = await fetch('/api/automatizaciones/templates')
      if (!response.ok) throw new Error('Error al cargar templates')
      const data = await response.json()
      setTemplates(data)
      setFilteredTemplates(data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar templates')
    } finally {
      setTemplatesLoading(false)
    }
  }

  const filterTemplates = () => {
    let filtered = [...templates]

    // Filtrar por categoría
    if (categoriaActual !== 'todas') {
      filtered = filtered.filter(t => t.categoria === categoriaActual)
    }

    // Filtrar por búsqueda
    if (busqueda.trim()) {
      const searchLower = busqueda.toLowerCase()
      filtered = filtered.filter(t =>
        t.nombre.toLowerCase().includes(searchLower) ||
        t.descripcion.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      )
    }

    setFilteredTemplates(filtered)
  }

  const handleUseTemplate = async (template: AutomationTemplate) => {
    try {
      setCreandoDesdeTemplate(true)
      const response = await fetch('/api/automatizaciones/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          nombre: `${template.nombre} (Copia)`,
        }),
      })

      if (!response.ok) throw new Error('Error al crear automatización')

      const automation = await response.json()
      toast.success('Automatización creada desde template')
      setPreviewOpen(false)
      setSelectedTemplate(null)

      // Redirigir al builder para personalizar
      router.push(`/dashboard/automatizaciones/builder/${automation.id}`)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al crear automatización')
    } finally {
      setCreandoDesdeTemplate(false)
    }
  }

  const toggleActive = async (id: string, currentState: boolean) => {
    try {
      const response = await fetch(`/api/automatizaciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !currentState }),
      })

      if (!response.ok) throw new Error('Error al actualizar')

      toast.success(currentState ? 'Automatización desactivada' : 'Automatización activada')
      fetchAutomations()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar automatización')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    try {
      const response = await fetch(`/api/automatizaciones/${deleteId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Error al eliminar')

      toast.success('Automatización eliminada')
      setDeleteId(null)
      fetchAutomations()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar automatización')
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Automatizaciones</h1>
            <p className="text-muted-foreground mt-2">
              Crea flujos de trabajo automatizados o usa templates predefinidos
            </p>
          </div>
          <Link href="/dashboard/automatizaciones/builder/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Crear Desde Cero
            </Button>
          </Link>
        </div>

        {/* Tabs para Automatizaciones y Templates */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="mis-automatizaciones">
              <Workflow className="h-4 w-4 mr-2" />
              Mis Automatizaciones
            </TabsTrigger>
            <TabsTrigger value="templates">
              <Sparkles className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
          </TabsList>

          {/* Tab: Mis Automatizaciones */}
          <TabsContent value="mis-automatizaciones" className="space-y-4">

            {/* Lista de automatizaciones */}
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4"></div>
                      <div className="h-4 bg-muted rounded w-1/2 mt-2"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-4 bg-muted rounded w-full"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : automations.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Workflow className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No hay automatizaciones</h3>
                  <p className="text-muted-foreground text-center mb-6 max-w-md">
                    Crea tu primera automatización desde cero o usa un template predefinido.
                  </p>
                  <div className="flex gap-3">
                    <Link href="/dashboard/automatizaciones/builder/new">
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Crear Desde Cero
                      </Button>
                    </Link>
                    <Button variant="outline" onClick={() => setActiveTab('templates')}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Ver Templates
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {automations.map((automation) => (
                  <Card key={automation.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{automation.nombre}</CardTitle>
                          <CardDescription className="mt-1">
                            <Badge variant={automation.activo ? 'default' : 'secondary'} className="text-xs">
                              {automation.activo ? 'Activa' : 'Inactiva'}
                            </Badge>
                          </CardDescription>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/automatizaciones/builder/${automation.id}`} className="cursor-pointer">
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive(automation.id, automation.activo)}>
                              {automation.activo ? (
                                <>
                                  <Pause className="h-4 w-4 mr-2" />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-2" />
                                  Activar
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteId(automation.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {automation.descripcion && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {automation.descripcion}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Trigger:</span>
                          <Badge variant="outline">
                            {triggerLabels[automation.trigger] || automation.trigger}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Actualizado: {new Date(automation.fechaActualizacion).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab: Templates */}
          <TabsContent value="templates" className="space-y-4">
            {/* Filtros y búsqueda */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar templates..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />
                    {categoriaLabels[categoriaActual]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {Object.entries(categoriaLabels).map(([key, label]) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => setCategoriaActual(key)}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Galería de Templates */}
            {templatesLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4"></div>
                      <div className="h-4 bg-muted rounded w-full mt-2"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No se encontraron templates</h3>
                  <p className="text-muted-foreground text-center mb-6 max-w-md">
                    Intenta ajustar los filtros o la búsqueda.
                  </p>
                  <Button variant="outline" onClick={() => {
                    setCategoriaActual('todas')
                    setBusqueda('')
                  }}>
                    Limpiar Filtros
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map((template) => {
                  const Icon = iconMap[template.icono || 'Sparkles'] || Sparkles
                  return (
                    <Card
                      key={template.id}
                      className="hover:shadow-lg transition-shadow cursor-pointer group relative overflow-hidden"
                      onClick={() => {
                        setSelectedTemplate(template)
                        setPreviewOpen(true)
                      }}
                    >
                      {/* Color accent bar */}
                      <div
                        className="absolute top-0 left-0 right-0 h-1"
                        style={{ backgroundColor: template.color || '#8b5cf6' }}
                      />

                      <CardHeader className="pt-6">
                        <div className="flex items-start gap-3">
                          <div
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: `${template.color || '#8b5cf6'}20` }}
                          >
                            <Icon
                              className="h-5 w-5"
                              style={{ color: template.color || '#8b5cf6' }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg line-clamp-1">
                              {template.nombre}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {categoriaLabels[template.categoria]}
                              </Badge>
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                          {template.descripcion}
                        </p>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {triggerLabels[template.trigger]}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <span>{template.popularidad}</span>
                            <span>usos</span>
                          </div>
                        </div>

                        <Button
                          className="w-full mt-4 opacity-0 group-hover:opacity-100 transition-opacity"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTemplate(template)
                            setPreviewOpen(true)
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalles
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar automatización?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La automatización y todo su historial de ejecuciones serán eliminados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de preview de template */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          {selectedTemplate && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${selectedTemplate.color || '#8b5cf6'}20` }}
                  >
                    {(() => {
                      const Icon = iconMap[selectedTemplate.icono || 'Sparkles'] || Sparkles
                      return <Icon
                        className="h-6 w-6"
                        style={{ color: selectedTemplate.color || '#8b5cf6' }}
                      />
                    })()}
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-2xl">{selectedTemplate.nombre}</DialogTitle>
                    <DialogDescription className="mt-2">
                      {selectedTemplate.descripcion}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Información del template */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-1">Categoría</p>
                    <Badge variant="secondary">
                      {categoriaLabels[selectedTemplate.categoria]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">Trigger</p>
                    <Badge variant="outline">
                      {triggerLabels[selectedTemplate.trigger]}
                    </Badge>
                  </div>
                </div>

                {/* Tags */}
                {selectedTemplate.tags.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Información del flujo */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm font-medium mb-2">Estructura del Flujo</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4" />
                      <span>{(selectedTemplate.flowData?.nodes || []).length} nodos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      <span>
                        {(selectedTemplate.flowData?.nodes || []).filter((n: any) => n.type === 'action').length} acciones
                      </span>
                    </div>
                    {(selectedTemplate.flowData?.nodes || []).some((n: any) => n.type === 'delay') && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Incluye delays programados</span>
                      </div>
                    )}
                    {(selectedTemplate.flowData?.nodes || []).some((n: any) => n.type === 'condition') && (
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <span>Incluye condiciones</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Estadísticas */}
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
                  <span>Usado {selectedTemplate.popularidad} veces</span>
                  {selectedTemplate.esOficial && (
                    <Badge variant="default" className="text-xs">
                      Template Oficial
                    </Badge>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPreviewOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleUseTemplate(selectedTemplate)}
                  disabled={creandoDesdeTemplate}
                >
                  {creandoDesdeTemplate ? (
                    <>Creando...</>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Usar Template
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
