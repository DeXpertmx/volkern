
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Building2, Mail, Phone, MapPin, Linkedin, Tag, Save, ArrowLeft, Plus, Users, TrendingUp, UserX, UserPlus, Loader2, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface Contact {
  id: string
  nombre: string
  email: string
  telefono?: string
  cargo?: string
  linkedin?: string
  notas?: string
}

interface Deal {
  id: string
  titulo: string
  valor: number
  etapa: string
  probabilidad: number
  fechaCreacion: string
  contact?: {
    nombre: string
  }
}

interface Company {
  id: string
  nombre: string
  email: string
  telefono?: string
  ubicacion?: string
  linkedin?: string
  tags?: string
  notas?: string
  fechaCreacion: string
  persons: Contact[]
  deals: Deal[]
  dealsAsCompany: Deal[]
}

export default function EmpresaDetailPage() {
  const router = useRouter()
  const params = useParams()
  const companyId = params?.id as string

  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('info')

  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    ubicacion: '',
    linkedin: '',
    tags: '',
    notas: ''
  })

  // Contact modal state
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false)
  const [contactMode, setContactMode] = useState<'new' | 'existing'>('new')
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([])
  const [selectedContactId, setSelectedContactId] = useState('')
  const [newContactData, setNewContactData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    cargo: '',
    linkedin: '',
    notas: ''
  })

  useEffect(() => {
    if (companyId) {
      fetchCompany()
    }
  }, [companyId])

  const fetchCompany = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/contacts/${companyId}`)
      if (!response.ok) throw new Error('Error al cargar empresa')
      const data = await response.json()
      setCompany(data)
      setFormData({
        nombre: data.nombre,
        email: data.email,
        telefono: data.telefono || '',
        ubicacion: data.ubicacion || '',
        linkedin: data.linkedin || '',
        tags: data.tags || '',
        notas: data.notas || ''
      })
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar empresa')
      router.push('/dashboard/empresas')
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableContacts = async () => {
    try {
      const response = await fetch('/api/contacts?tipo=person&sinEmpresa=true')
      if (!response.ok) throw new Error('Error al cargar contactos')
      const data = await response.json()
      setAvailableContacts(data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar contactos disponibles')
    }
  }

  const handleSave = async () => {
    if (!formData.nombre || !formData.email) {
      toast.error('Nombre y email son obligatorios')
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`/api/contacts/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al actualizar empresa')
      }

      toast.success('Empresa actualizada exitosamente')
      fetchCompany()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al actualizar empresa')
    } finally {
      setSaving(false)
    }
  }

  const handleAddContact = async () => {
    try {
      if (contactMode === 'existing') {
        if (!selectedContactId) {
          toast.error('Selecciona un contacto')
          return
        }

        // Link existing contact to company
        const response = await fetch(`/api/contacts/${selectedContactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId })
        })

        if (!response.ok) throw new Error('Error al vincular contacto')

        toast.success('Contacto vinculado exitosamente')
      } else {
        // Create new contact
        if (!newContactData.nombre || !newContactData.email) {
          toast.error('Nombre y email son obligatorios')
          return
        }

        const response = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newContactData,
            tipo: 'person',
            companyId
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Error al crear contacto')
        }

        toast.success('Contacto creado exitosamente')
      }

      setIsContactDialogOpen(false)
      setNewContactData({
        nombre: '',
        email: '',
        telefono: '',
        cargo: '',
        linkedin: '',
        notas: ''
      })
      setSelectedContactId('')
      fetchCompany()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al agregar contacto')
    }
  }

  const handleUnlinkContact = async (contactId: string) => {
    if (!confirm('¿Deseas desvincular este contacto de la empresa?')) return

    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: null })
      })

      if (!response.ok) throw new Error('Error al desvincular contacto')

      toast.success('Contacto desvinculado exitosamente')
      fetchCompany()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al desvincular contacto')
    }
  }

  const openContactDialog = () => {
    fetchAvailableContacts()
    setIsContactDialogOpen(true)
  }

  const allDeals = company ? [...company.deals, ...company.dealsAsCompany] : []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!company) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/empresas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              {company.nombre}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Creada el {format(new Date(company.fechaCreacion), "d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contactos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{company.persons?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deals Activos</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allDeals.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${allDeals.reduce((sum, deal) => sum + deal.valor, 0).toLocaleString('es-MX')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="contactos">
            Contactos ({company.persons?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="deals">
            Deals ({allDeals.length})
          </TabsTrigger>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
        </TabsList>

        {/* Información Tab */}
        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Información de la Empresa</CardTitle>
              <CardDescription>Detalles generales y datos de contacto</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre de la Empresa</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Corporativo</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ubicacion">Ubicación</Label>
                  <Input
                    id="ubicacion"
                    value={formData.ubicacion}
                    onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedin">LinkedIn Corporativo</Label>
                <Input
                  id="linkedin"
                  value={formData.linkedin}
                  onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (separados por comas)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="tecnología, saas, b2b"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contactos Tab */}
        <TabsContent value="contactos" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contactos de la Empresa</CardTitle>
                  <CardDescription>Personas asociadas a esta empresa</CardDescription>
                </div>
                <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={openContactDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar Contacto
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Agregar Contacto a {company.nombre}</DialogTitle>
                      <DialogDescription>
                        Crea un nuevo contacto o vincula uno existente
                      </DialogDescription>
                    </DialogHeader>

                    <Tabs value={contactMode} onValueChange={(v) => setContactMode(v as 'new' | 'existing')}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="new">Nuevo Contacto</TabsTrigger>
                        <TabsTrigger value="existing">Vincular Existente</TabsTrigger>
                      </TabsList>

                      <TabsContent value="new" className="space-y-4 mt-4">
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="new-nombre">
                              Nombre Completo <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="new-nombre"
                              value={newContactData.nombre}
                              onChange={(e) => setNewContactData({ ...newContactData, nombre: e.target.value })}
                              placeholder="Juan Pérez"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="new-email">
                              Email <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="new-email"
                              type="email"
                              value={newContactData.email}
                              onChange={(e) => setNewContactData({ ...newContactData, email: e.target.value })}
                              placeholder="juan@empresa.com"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label htmlFor="new-telefono">Teléfono</Label>
                              <Input
                                id="new-telefono"
                                value={newContactData.telefono}
                                onChange={(e) => setNewContactData({ ...newContactData, telefono: e.target.value })}
                                placeholder="+52 55 1234 5678"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="new-cargo">Cargo</Label>
                              <Input
                                id="new-cargo"
                                value={newContactData.cargo}
                                onChange={(e) => setNewContactData({ ...newContactData, cargo: e.target.value })}
                                placeholder="Director de Marketing"
                              />
                            </div>
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="new-linkedin">LinkedIn</Label>
                            <Input
                              id="new-linkedin"
                              value={newContactData.linkedin}
                              onChange={(e) => setNewContactData({ ...newContactData, linkedin: e.target.value })}
                              placeholder="https://linkedin.com/in/..."
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="new-notas">Notas</Label>
                            <Textarea
                              id="new-notas"
                              value={newContactData.notas}
                              onChange={(e) => setNewContactData({ ...newContactData, notas: e.target.value })}
                              rows={3}
                            />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="existing" className="space-y-4 mt-4">
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label>Seleccionar Contacto</Label>
                            <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona un contacto..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableContacts.length === 0 ? (
                                  <SelectItem value="no-contacts" disabled>
                                    No hay contactos disponibles
                                  </SelectItem>
                                ) : (
                                  availableContacts.map((contact) => (
                                    <SelectItem key={contact.id} value={contact.id}>
                                      {contact.nombre} ({contact.email})
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Solo se muestran contactos que no están vinculados a ninguna empresa
                            </p>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsContactDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddContact}>
                        {contactMode === 'new' ? (
                          <>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Crear Contacto
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Vincular Contacto
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {company.persons?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No hay contactos asociados</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Agrega personas de contacto para esta empresa
                  </p>
                  <Button onClick={openContactDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar Primer Contacto
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {company.persons.map((contact) => (
                    <Card key={contact.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="font-semibold text-lg">{contact.nombre}</h4>
                            {contact.cargo && (
                              <p className="text-sm text-muted-foreground">{contact.cargo}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/dashboard/contactos?id=${contact.id}`)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleUnlinkContact(contact.id)}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {contact.email && (
                            <div className="flex items-center text-sm">
                              <Mail className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                              <span className="truncate">{contact.email}</span>
                            </div>
                          )}
                          {contact.telefono && (
                            <div className="flex items-center text-sm">
                              <Phone className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                              <span>{contact.telefono}</span>
                            </div>
                          )}
                          {contact.linkedin && (
                            <div className="flex items-center text-sm">
                              <Linkedin className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                              <a
                                href={contact.linkedin}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate"
                              >
                                Ver perfil
                              </a>
                            </div>
                          )}
                        </div>

                        {contact.notas && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-xs text-muted-foreground">{contact.notas}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deals Tab */}
        <TabsContent value="deals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Deals Asociados</CardTitle>
              <CardDescription>Oportunidades de venta relacionadas con esta empresa</CardDescription>
            </CardHeader>
            <CardContent>
              {allDeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No hay deals asociados</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Los deals se crearán automáticamente al convertir leads o desde el pipeline
                  </p>
                  <Link href="/dashboard/pipeline">
                    <Button>
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Ir al Pipeline
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {allDeals.map((deal) => (
                    <Card key={deal.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/dashboard/pipeline/${deal.id}`)}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-lg mb-1">{deal.titulo}</h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              {deal.contact?.nombre}
                            </p>
                            <div className="flex items-center gap-4 flex-wrap">
                              <Badge variant="secondary">{deal.etapa}</Badge>
                              <span className="text-sm text-muted-foreground">
                                Probabilidad: {deal.probabilidad}%
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(deal.fechaCreacion), "d MMM yyyy", { locale: es })}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">
                              ${deal.valor.toLocaleString('es-MX')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actividad Tab */}
        <TabsContent value="actividad" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Timeline de Actividad</CardTitle>
              <CardDescription>Historial de interacciones con esta empresa</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">
                  El timeline de actividad se implementará próximamente
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
