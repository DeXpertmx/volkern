
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  Edit,
  Trash2,
  Plus,
  TrendingUp,
  DollarSign,
  Tag,
  Linkedin,
  StickyNote
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

interface Contact {
  id: string
  nombre: string
  email: string
  telefono?: string | null
  tipo: string
  cargo?: string | null
  ubicacion?: string | null
  linkedin?: string | null
  notas?: string | null
  tags?: string | null
  company?: {
    id: string
    nombre: string
  } | null
  persons?: {
    id: string
    nombre: string
    email: string
    cargo?: string | null
  }[]
  fechaCreacion: string
}

interface Deal {
  id: string
  titulo: string
  valor: number
  moneda: string
  etapa: string
  estado: string
  probabilidad: number
  fechaCreacion: string
  fechaEstimadaCierre?: string | null
}

export default function ContactoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const contactId = params?.id as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreatingDeal, setIsCreatingDeal] = useState(false)

  // Form para crear deal
  const [dealForm, setDealForm] = useState({
    titulo: '',
    descripcion: '',
    valor: '',
    etapa: 'Calificación',
    fechaEstimadaCierre: ''
  })

  const [stages, setStages] = useState<any[]>([])

  useEffect(() => {
    if (contactId) {
      fetchContactData()
      fetchStages()
    }
  }, [contactId])

  const fetchContactData = async () => {
    try {
      setLoading(true)
      
      // Obtener contacto
      const contactRes = await fetch(`/api/contacts/${contactId}`)
      const contactData = await contactRes.json()
      
      if (contactData.success) {
        setContact(contactData.data)
      } else {
        toast.error('Error al cargar contacto')
        router.push('/dashboard/contactos')
        return
      }

      // Obtener deals del contacto
      const dealsRes = await fetch(`/api/deals?contactId=${contactId}`)
      const dealsData = await dealsRes.json()
      
      if (dealsData.success) {
        setDeals(dealsData.data || [])
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos del contacto')
    } finally {
      setLoading(false)
    }
  }

  const fetchStages = async () => {
    try {
      const res = await fetch('/api/pipeline/stages')
      const data = await res.json()
      if (data.success) {
        setStages(data.data)
      }
    } catch (error) {
      console.error('Error al cargar stages:', error)
    }
  }

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!contact) return

    try {
      const selectedStage = stages.find((s) => s.nombre === dealForm.etapa)

      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: dealForm.titulo,
          descripcion: dealForm.descripcion,
          valor: parseFloat(dealForm.valor),
          contactId: contact.id,
          companyId: contact.company?.id,
          etapa: dealForm.etapa,
          probabilidad: selectedStage?.probabilidad || 25,
          fechaEstimadaCierre: dealForm.fechaEstimadaCierre || null
        })
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Deal creado exitosamente')
        setIsCreatingDeal(false)
        setDealForm({
          titulo: '',
          descripcion: '',
          valor: '',
          etapa: 'Calificación',
          fechaEstimadaCierre: ''
        })
        fetchContactData() // Recargar datos
      } else {
        toast.error(data.error || 'Error al crear deal')
      }
    } catch (error) {
      console.error('Error al crear deal:', error)
      toast.error('Error al crear deal')
    }
  }

  const handleDeleteContact = async () => {
    if (!confirm('¿Estás seguro de eliminar este contacto? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE'
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Contacto eliminado correctamente')
        router.push('/dashboard/contactos')
      } else {
        toast.error(data.error || 'Error al eliminar contacto')
      }
    } catch (error) {
      console.error('Error al eliminar:', error)
      toast.error('Error al eliminar contacto')
    }
  }

  const formatCurrency = (valor: number, moneda: string) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: moneda || 'MXN'
    }).format(valor)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getEstadoBadge = (estado: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      activo: 'default',
      ganado: 'secondary',
      perdido: 'destructive',
      cancelado: 'outline'
    }
    return variants[estado] || 'outline'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando contacto...</p>
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">Contacto no encontrado</p>
          <Button onClick={() => router.push('/dashboard/contactos')} className="mt-4">
            Volver a Contactos
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/contactos')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{contact.nombre}</h1>
            <p className="text-muted-foreground mt-1">
              {contact.tipo === 'company' ? 'Empresa' : 'Contacto Individual'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/dashboard/contactos`)}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button variant="destructive" onClick={handleDeleteContact}>
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Información del Contacto */}
        <div className="md:col-span-2 space-y-6">
          {/* Información Básica */}
          <Card>
            <CardHeader>
              <CardTitle>Información de Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Email</p>
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-sm hover:underline"
                    >
                      {contact.email}
                    </a>
                  </div>
                </div>

                {contact.telefono && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Teléfono
                      </p>
                      <a
                        href={`tel:${contact.telefono}`}
                        className="text-sm hover:underline"
                      >
                        {contact.telefono}
                      </a>
                    </div>
                  </div>
                )}

                {contact.ubicacion && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Ubicación
                      </p>
                      <p className="text-sm">{contact.ubicacion}</p>
                    </div>
                  </div>
                )}

                {contact.tipo === 'person' && contact.cargo && (
                  <div className="flex items-start gap-3">
                    <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Cargo</p>
                      <p className="text-sm">{contact.cargo}</p>
                    </div>
                  </div>
                )}

                {contact.tipo === 'person' && contact.company && (
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Empresa
                      </p>
                      <Link
                        href={`/dashboard/contactos/${contact.company.id}`}
                        className="text-sm hover:underline"
                      >
                        {contact.company.nombre}
                      </Link>
                    </div>
                  </div>
                )}

                {contact.linkedin && (
                  <div className="flex items-start gap-3">
                    <Linkedin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        LinkedIn
                      </p>
                      <a
                        href={contact.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:underline flex items-center gap-1"
                      >
                        Ver perfil <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Fecha de Creación
                    </p>
                    <p className="text-sm">{formatDate(contact.fechaCreacion)}</p>
                  </div>
                </div>
              </div>

              {contact.tags && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <Tag className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        Tags
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {contact.tags.split(',').map((tag, idx) => (
                          <Badge key={idx} variant="secondary">
                            {tag.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {contact.notas && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <StickyNote className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        Notas
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{contact.notas}</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Personas de la empresa */}
          {contact.tipo === 'company' && contact.persons && contact.persons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Personas en esta Empresa</CardTitle>
                <CardDescription>
                  {contact.persons.length} contacto(s) asociado(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contact.persons.map((person) => (
                    <div
                      key={person.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => router.push(`/dashboard/contactos/${person.id}`)}
                    >
                      <div>
                        <p className="font-medium">{person.nombre}</p>
                        <p className="text-sm text-muted-foreground">{person.email}</p>
                        {person.cargo && (
                          <p className="text-sm text-muted-foreground">{person.cargo}</p>
                        )}
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deals Asociados */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Deals</CardTitle>
                  <CardDescription>
                    {deals.length} deal(s) asociado(s) a este contacto
                  </CardDescription>
                </div>
                <Dialog open={isCreatingDeal} onOpenChange={setIsCreatingDeal}>
                  <Button onClick={() => setIsCreatingDeal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Deal
                  </Button>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Crear Nuevo Deal</DialogTitle>
                      <DialogDescription>
                        Crear una oportunidad de negocio para {contact.nombre}
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateDeal} className="space-y-4">
                      <div>
                        <Label htmlFor="titulo">Título del Deal *</Label>
                        <Input
                          id="titulo"
                          value={dealForm.titulo}
                          onChange={(e) =>
                            setDealForm({ ...dealForm, titulo: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="descripcion">Descripción</Label>
                        <Textarea
                          id="descripcion"
                          value={dealForm.descripcion}
                          onChange={(e) =>
                            setDealForm({ ...dealForm, descripcion: e.target.value })
                          }
                          rows={3}
                        />
                      </div>

                      <div>
                        <Label htmlFor="valor">Valor del Deal *</Label>
                        <Input
                          id="valor"
                          type="number"
                          step="0.01"
                          value={dealForm.valor}
                          onChange={(e) =>
                            setDealForm({ ...dealForm, valor: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="etapa">Etapa del Pipeline</Label>
                        <Select
                          value={dealForm.etapa}
                          onValueChange={(value) =>
                            setDealForm({ ...dealForm, etapa: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stages
                              .filter((s) => s.nombre !== 'Ganado' && s.nombre !== 'Perdido')
                              .map((stage) => (
                                <SelectItem key={stage.id} value={stage.nombre}>
                                  {stage.nombre} ({stage.probabilidad}%)
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="fechaEstimadaCierre">
                          Fecha Estimada de Cierre
                        </Label>
                        <Input
                          id="fechaEstimadaCierre"
                          type="date"
                          value={dealForm.fechaEstimadaCierre}
                          onChange={(e) =>
                            setDealForm({
                              ...dealForm,
                              fechaEstimadaCierre: e.target.value
                            })
                          }
                        />
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsCreatingDeal(false)}
                        >
                          Cancelar
                        </Button>
                        <Button type="submit">Crear Deal</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No hay deals asociados a este contacto
                  </p>
                  <Button onClick={() => setIsCreatingDeal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Primer Deal
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Deal</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Etapa</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Probabilidad</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deals.map((deal) => (
                        <TableRow key={deal.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{deal.titulo}</p>
                              <p className="text-sm text-muted-foreground">
                                Creado {formatDate(deal.fechaCreacion)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              {formatCurrency(deal.valor, deal.moneda)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{deal.etapa}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getEstadoBadge(deal.estado)}>
                              {deal.estado}
                            </Badge>
                          </TableCell>
                          <TableCell>{deal.probabilidad}%</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/dashboard/pipeline/${deal.id}`)}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Estadísticas */}
        <div className="space-y-6">
          {/* Resumen de Deals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen de Deals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Deals</p>
                <p className="text-2xl font-bold">{deals.length}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Deals Activos</p>
                <p className="text-2xl font-bold">
                  {deals.filter((d) => d.estado === 'activo').length}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Deals Ganados</p>
                <p className="text-2xl font-bold text-green-600">
                  {deals.filter((d) => d.estado === 'ganado').length}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    deals.reduce((acc, d) => acc + d.valor, 0),
                    'MXN'
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Acciones Rápidas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setIsCreatingDeal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Deal
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                asChild
              >
                <a href={`mailto:${contact.email}`}>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar Email
                </a>
              </Button>
              {contact.telefono && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  asChild
                >
                  <a href={`tel:${contact.telefono}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    Llamar
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
