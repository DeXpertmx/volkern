
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
  StickyNote,
  ShieldCheck,
  Verified,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  History,
  MessageSquare,
  Paperclip,
  Clock
} from 'lucide-react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs'
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
import { UnifiedTimeline } from '@/components/unified-timeline'
import { LeadTasks } from '@/components/lead-tasks'
import { EnhancedNotes } from '@/components/enhanced-notes'
import { LeadAttachments } from '@/components/dashboard/LeadAttachments'
import { ContactConversations } from '@/components/contact-conversations'

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
  perfilFiscal?: {
    tipo: string
    nif: string
    tipoIdFiscal: string
    razonSocial: string
    isLocked: boolean
    idFiscalValidado: boolean
    address: string
    city: string
    country: string
    zipCode: string
    defaultIva: number
    defaultIrpf: number
    recargoEquivalencia: boolean
    aplicaRetencion: boolean
  } | null
  invoices?: {
    id: string
    numero: string
    monto: number
    moneda: string
    fechaEmision: string
    isSealed: boolean
    verifactuVersion: number
    fingerprint: string
    ordenVenta?: { numero: string }
  }[]
  convertedFromLeads?: {
    id: string
    nombre: string
    email: string
    fuente: string
    fechaCreacion: string
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
  
  // Fiscal Modal State
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false)
  const [fiscalForm, setFiscalForm] = useState({
    tipo: 'EMPRESA',
    razonSocial: '',
    tipoIdFiscal: 'NIF',
    nif: '',
    address: '',
    city: '',
    country: 'España',
    zipCode: '',
    defaultIva: '21',
    defaultIrpf: '0',
    recargoEquivalencia: false,
    aplicaRetencion: false
  })

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

  const handleUpdateFiscal = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfilFiscal: {
            ...fiscalForm,
            defaultIva: parseFloat(fiscalForm.defaultIva),
            defaultIrpf: parseFloat(fiscalForm.defaultIrpf)
          }
        })
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Perfil fiscal actualizado')
        setIsFiscalModalOpen(false)
        fetchContactData()
      } else {
        toast.error(data.error || 'Error al actualizar perfil fiscal')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar perfil fiscal')
    }
  }

  const openFiscalModal = () => {
    if (contact?.perfilFiscal) {
      setFiscalForm({
        tipo: contact.perfilFiscal.tipo || 'EMPRESA',
        razonSocial: contact.perfilFiscal.razonSocial || '',
        tipoIdFiscal: contact.perfilFiscal.tipoIdFiscal || 'NIF',
        nif: contact.perfilFiscal.nif || '',
        address: contact.perfilFiscal.address || '',
        city: contact.perfilFiscal.city || '',
        country: contact.perfilFiscal.country || 'España',
        zipCode: contact.perfilFiscal.zipCode || '',
        defaultIva: String(contact.perfilFiscal.defaultIva || '21'),
        defaultIrpf: String(contact.perfilFiscal.defaultIrpf || '0'),
        recargoEquivalencia: !!contact.perfilFiscal.recargoEquivalencia,
        aplicaRetencion: !!contact.perfilFiscal.aplicaRetencion
      })
    } else {
      setFiscalForm({
        tipo: 'EMPRESA',
        razonSocial: contact?.nombre || '',
        tipoIdFiscal: 'NIF',
        nif: '',
        address: '',
        city: '',
        country: 'España',
        zipCode: '',
        defaultIva: '21',
        defaultIrpf: '0',
        recargoEquivalencia: false,
        aplicaRetencion: false
      })
    }
    setIsFiscalModalOpen(true)
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
          <Button variant="outline" onClick={openFiscalModal}>
            <ShieldCheck className="h-4 w-4 mr-2" />
            Editar Datos Fiscales
          </Button>
          <Button variant="destructive" onClick={handleDeleteContact}>
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="general">Visión General</TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Cumplimiento Fiscal
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <History className="h-4 w-4" /> Historial
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Tareas
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex items-center gap-2">
            <StickyNote className="h-4 w-4" /> Notas
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Documentos
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Mensajería
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
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
    </TabsContent>

        {/* Tab de Cumplimiento Fiscal */}
        <TabsContent value="compliance">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              {/* Perfil Fiscal Card */}
              <Card className="border-emerald-100 shadow-sm">
                <CardHeader className="bg-emerald-50/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                        <ShieldCheck className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Identidad Fiscal Validada</CardTitle>
                        <CardDescription>Estado legal para facturación Veri*factu</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {contact.perfilFiscal && !contact.perfilFiscal.isLocked && (
                        <Button variant="ghost" size="sm" onClick={openFiscalModal}>
                          <Edit className="h-4 w-4 mr-1" /> Editar
                        </Button>
                      )}
                      {contact.perfilFiscal?.isLocked ? (
                        <Badge className="bg-emerald-600 text-white gap-1 flex items-center">
                          <Lock className="h-3 w-3" /> Blindado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 gap-1 flex items-center">
                          <Unlock className="h-3 w-3" /> Editable
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {contact.perfilFiscal ? (
                    <>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground uppercase">Razón Social</p>
                          <p className="text-lg font-bold">{contact.perfilFiscal.razonSocial}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground uppercase">NIF / CIF</p>
                          <div className="flex items-center gap-2">
                             <p className="text-lg font-mono font-bold">{contact.perfilFiscal.nif}</p>
                             {contact.perfilFiscal.idFiscalValidado && (
                               <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                             )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground uppercase">Tipo de Sujeto</p>
                          <Badge variant="outline" className="text-sm">
                            {contact.perfilFiscal.tipo}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground uppercase">Jurisdicción</p>
                          <p className="text-sm">{contact.perfilFiscal.city}, {contact.perfilFiscal.country}</p>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg flex gap-3 italic text-sm text-blue-800">
                        <AlertCircle className="h-5 w-5 flex-shrink-0" />
                        <p>
                          Este perfil ha sido validado para cumplir con la normativa de Hacienda. 
                          Las facturas emitidas a este contacto se sellarán con un hash criptográfico.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                       <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                      <Button onClick={openFiscalModal} className="mt-2">
                        <Plus className="h-4 w-4 mr-2" />
                        Configurar Perfil Fiscal
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Historial de Facturas Selladas */}
              <Card>
                <CardHeader>
                  <CardTitle>Historial Forense de Facturación</CardTitle>
                  <CardDescription>Facturas emitidas con integridad Veri*factu</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead>Factura</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Sello Integridad</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!contact.invoices || contact.invoices.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-10 text-muted-foreground italic">
                              No hay facturas registradas en la era Veri*factu.
                            </TableCell>
                          </TableRow>
                        ) : (
                          contact.invoices.map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell className="font-bold">{invoice.numero}</TableCell>
                              <TableCell>{formatDate(invoice.fechaEmision)}</TableCell>
                              <TableCell>
                                {invoice.isSealed ? (
                                  <div className="flex items-center gap-2 text-emerald-600 font-medium">
                                    <ShieldCheck className="h-4 w-4" /> Guardado
                                    <span className="text-[10px] bg-emerald-100 px-1 rounded font-mono truncate max-w-[80px]">
                                      {invoice.fingerprint.substring(0, 8)}...
                                    </span>
                                  </div>
                                ) : (
                                  <Badge variant="outline">Draft / Legacy</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-bold">
                                {formatCurrency(invoice.monto, invoice.moneda)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Compliance */}
            <div className="space-y-6">
              <Card className="premium-gradient-primary text-white border-none shadow-md overflow-hidden">
                <CardHeader className="relative z-10">
                  <CardTitle className="text-lg">Salud Fiscal</CardTitle>
                  <CardDescription className="text-white/80">Monitor de Cumplimiento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 relative z-10">
                   <div className="flex items-center justify-between">
                     <span className="text-sm opacity-90">Cadena de Facturas</span>
                     <span className="font-bold">{contact.invoices?.filter(i => i.isSealed).length || 0} Verificadas</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-sm opacity-90">Versión Protocolo</span>
                     <span className="font-bold">Verifactu 2.0</span>
                   </div>
                   <div className="pt-4 mt-4 border-t border-white/20">
                      <p className="text-xs italic opacity-80 text-center">
                        Garantizamos que este contacto cumple con el "Reglamento que establece los requisitos de los sistemas informáticos de facturación".
                      </p>
                   </div>
                </CardContent>
                {/* Micro-animación sutil de fondo */}
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <ShieldCheck className="h-24 w-24 rotate-12" />
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6 space-y-6">
          <UnifiedTimeline contactId={contact.id} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6 space-y-6">
          <LeadTasks contactId={contact.id} />
        </TabsContent>

        <TabsContent value="notes" className="mt-6 space-y-6">
          <EnhancedNotes contactId={contact.id} />
        </TabsContent>

        <TabsContent value="documents" className="mt-6 space-y-6">
          <LeadAttachments contactId={contact.id} />
        </TabsContent>

        <TabsContent value="messages" className="mt-6 space-y-6">
          <ContactConversations contactId={contact.id} />
        </TabsContent>
      </Tabs>

      {/* Modal de Edición Fiscal */}
      <Dialog open={isFiscalModalOpen} onOpenChange={setIsFiscalModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Perfil Fiscal</DialogTitle>
            <DialogDescription>
              Configura los datos legales para la facturación Veri*factu de este contacto.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateFiscal} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Sujeto</Label>
                <Select 
                  value={fiscalForm.tipo} 
                  onValueChange={(v) => setFiscalForm({ ...fiscalForm, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPRESA">Empresa / SL / SA</SelectItem>
                    <SelectItem value="AUTONOMO">Autónomo / Profesional</SelectItem>
                    <SelectItem value="PARTICULAR">Particular / Cliente Final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Razón Social / Nombre Legal</Label>
                <Input 
                  value={fiscalForm.razonSocial} 
                  onChange={(e) => setFiscalForm({ ...fiscalForm, razonSocial: e.target.value })}
                  placeholder="Nombre oficial para facturas"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo ID Fiscal</Label>
                <Select 
                  value={fiscalForm.tipoIdFiscal} 
                  onValueChange={(v) => setFiscalForm({ ...fiscalForm, tipoIdFiscal: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NIF">NIF (España)</SelectItem>
                    <SelectItem value="CIF">CIF (Empresas)</SelectItem>
                    <SelectItem value="NIE">NIE (Extranjeros)</SelectItem>
                    <SelectItem value="VAT">VAT Intra (UE)</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número ID (NIF/CIF)</Label>
                <Input 
                  value={fiscalForm.nif} 
                  onChange={(e) => setFiscalForm({ ...fiscalForm, nif: e.target.value })}
                  placeholder="A12345678"
                />
              </div>
            </div>

            <Separator />
            <div className="space-y-4">
              <Label className="text-base">Dirección Fiscal</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Dirección</Label>
                  <Input 
                    value={fiscalForm.address} 
                    onChange={(e) => setFiscalForm({ ...fiscalForm, address: e.target.value })}
                    placeholder="Calle, número, piso..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ciudad</Label>
                  <Input 
                    value={fiscalForm.city} 
                    onChange={(e) => setFiscalForm({ ...fiscalForm, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Código Postal</Label>
                  <Input 
                    value={fiscalForm.zipCode} 
                    onChange={(e) => setFiscalForm({ ...fiscalForm, zipCode: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <Separator />
            <div className="space-y-4">
              <Label className="text-base">Configuración de Impuestos</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IVA Predeterminado (%)</Label>
                  <Input 
                    type="number"
                    value={fiscalForm.defaultIva} 
                    onChange={(e) => setFiscalForm({ ...fiscalForm, defaultIva: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IRPF Predeterminado (%)</Label>
                  <Input 
                    type="number"
                    value={fiscalForm.defaultIrpf} 
                    onChange={(e) => setFiscalForm({ ...fiscalForm, defaultIrpf: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="retencion"
                      checked={fiscalForm.aplicaRetencion}
                      onChange={(e) => setFiscalForm({ ...fiscalForm, aplicaRetencion: e.target.checked, defaultIrpf: e.target.checked ? '15' : '0' })}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="retencion" className="font-bold">¿Aplica Retención de IRPF?</Label>
                  </div>
                  
                  {fiscalForm.aplicaRetencion && (
                    <div className="pl-6 space-y-3 border-l-2 border-primary/20 ml-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Presets de Retención (España)</p>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          type="button" 
                          variant={fiscalForm.defaultIrpf === '7' ? 'default' : 'outline'} 
                          size="sm" 
                          className="h-8 text-xs"
                          onClick={() => setFiscalForm({ ...fiscalForm, defaultIrpf: '7' })}
                        >
                          7% (Nuevos Autónomos)
                        </Button>
                        <Button 
                          type="button" 
                          variant={fiscalForm.defaultIrpf === '15' ? 'default' : 'outline'} 
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setFiscalForm({ ...fiscalForm, defaultIrpf: '15' })}
                        >
                          15% (Profesional Estándar)
                        </Button>
                      </div>
                      <p className="text-[11px] text-blue-600 italic bg-blue-50 p-2 rounded border border-blue-100">
                        * El 7% se aplica durante el año de inicio y los 2 siguientes. Asegúrate de que el contacto cumple los requisitos de la AEAT.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="recargo"
                      checked={fiscalForm.recargoEquivalencia}
                      onChange={(e) => setFiscalForm({ ...fiscalForm, recargoEquivalencia: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="recargo">¿Aplica Recargo de Equivalencia?</Label>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsFiscalModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar Cambios Fiscales</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
