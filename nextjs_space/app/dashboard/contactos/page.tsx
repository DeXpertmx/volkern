
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiFetch } from '@/lib/api-client'
import {
  UserCheck,
  Building2,
  Search,
  Plus,
  MoreVertical,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  ExternalLink,
  Trash2,
  Edit,
  Download,
  Upload,
  Loader2,
  HelpCircle,
  ShieldCheck,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useFiltersPersistence } from '@/lib/hooks/useFiltersPersistence'

interface Contact {
  id: string
  nombre: string
  email: string
  telefono?: string | null
  tipo: string
  cargo?: string | null
  ubicacion?: string | null
  direccion?: string | null
  ciudad?: string | null
  codigoPostal?: string | null
  pais?: string | null
  linkedin?: string | null
  notas?: string | null
  tags?: string | null
  perfilFiscal?: {
    id: string
    idFiscalValidado: boolean
  } | null
  company?: {
    id: string
    nombre: string
  } | null
  _count: {
    deals: number
    persons: number
  }
  fechaCreacion: string
}

export default function ContactosPage() {
  const router = useRouter()
  
  const { data: session } = useSession()
  // @ts-ignore
  const userPermissions = session?.user?.role?.permissions || []
  const hasDeletePermission = userPermissions.some((p: any) => p.code === 'contacts:delete' || p.code === 'admin') || session?.user?.role === 'OWNER'

  const [contacts, setContacts] = useState<Contact[]>([])
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilter, clearFilters, filtersRestored] = useFiltersPersistence('contacts-filters', {
    searchTerm: '',
    tipoFilter: 'all',
  })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [companies, setCompanies] = useState<Contact[]>([])
  const [importing, setImporting] = useState(false)

  // Delete justification modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null)
  const [deleteJustification, setDeleteJustification] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    tipo: 'person',
    companyId: '',
    cargo: '',
    ubicacion: '',
    direccion: '',
    ciudad: '',
    codigoPostal: '',
    pais: '',
    linkedin: '',
    notas: '',
    tags: ''
  })
  const [createFiscalProfile, setCreateFiscalProfile] = useState(false)
  const [fiscalData, setFiscalData] = useState({
    fiscalType: 'EMPRESA',
    fiscalNif: '',
    fiscalRazonSocial: '',
  })

  useEffect(() => {
    fetchContacts()
    fetchCompanies()
  }, [])

  useEffect(() => {
    filterContacts()
  }, [filters.searchTerm, filters.tipoFilter, contacts])

  const fetchContacts = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/contacts')
      const data = await res.json()
      if (Array.isArray(data)) {
        setContacts(data)
      } else if (data.error) {
        toast.error(data.error)
      }
    } catch (error) {
      console.error('Error al cargar contactos:', error)
      toast.error('Error al cargar contactos')
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanies = async () => {
    try {
      const res = await apiFetch('/api/contacts?tipo=company')
      const data = await res.json()
      if (Array.isArray(data)) {
        setCompanies(data)
      }
    } catch (error) {
      console.error('Error al cargar empresas:', error)
    }
  }

  const filterContacts = () => {
    let filtered = contacts

    // Filtrar por búsqueda
    if (filters.searchTerm) {
      filtered = filtered.filter(
        (contact) =>
          contact.nombre.toLowerCase().includes((filters.searchTerm || '').toLowerCase()) ||
          contact.email.toLowerCase().includes((filters.searchTerm || '').toLowerCase()) ||
          (contact.telefono && contact.telefono.toLowerCase().includes((filters.searchTerm || '').toLowerCase()))
      )
    }

    // Filtrar por tipo
    if (filters.tipoFilter !== 'all') {
      filtered = filtered.filter((contact) => contact.tipo === filters.tipoFilter)
    }

    setFilteredContacts(filtered)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    // Validación básica
    if (!formData.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!formData.email.trim()) {
      toast.error('El email es obligatorio')
      return
    }
    
    try {
      const url = editingContact
        ? `/api/contacts/${editingContact.id}`
        : '/api/contacts'
      
      const method = editingContact ? 'PUT' : 'POST'
      
      // Limpiar datos antes de enviar
      const dataToSend = {
        ...formData,
        companyId: formData.companyId || null,
        telefono: formData.telefono || null,
        cargo: formData.cargo || null,
        ubicacion: formData.ubicacion || null,
        direccion: formData.direccion || null,
        ciudad: formData.ciudad || null,
        codigoPostal: formData.codigoPostal || null,
        pais: formData.pais || null,
        linkedin: formData.linkedin || null,
        notas: formData.notas || null,
        tags: formData.tags || null,
        createFiscalProfile: editingContact ? false : createFiscalProfile,
        fiscalData: createFiscalProfile ? {
          tipo: fiscalData.fiscalType,
          nif: fiscalData.fiscalNif || '',
          razonSocial: fiscalData.fiscalRazonSocial || formData.nombre,
          address: formData.direccion || '',
          city: formData.ciudad || '',
          zipCode: formData.codigoPostal || '',
          country: formData.pais || 'ES',
        } : null,
      }
      
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend)
      })

      const data = await res.json()
      
      if (res.ok && data.id) {
        toast.success(
          editingContact
            ? 'Contacto actualizado correctamente'
            : 'Contacto creado correctamente'
        )
        setIsDialogOpen(false)
        resetForm()
        fetchContacts()
      } else {
        toast.error(data.error || 'Error al guardar contacto')
      }
    } catch (error) {
      console.error('Error al guardar contacto:', error)
      toast.error('Error al guardar contacto')
    }
  }

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact)
    setFormData({
      nombre: contact.nombre,
      email: contact.email,
      telefono: contact.telefono || '',
      tipo: contact.tipo,
      companyId: contact.company?.id || '',
      cargo: contact.cargo || '',
      ubicacion: contact.ubicacion || '',
      direccion: contact.direccion || '',
      ciudad: contact.ciudad || '',
      codigoPostal: contact.codigoPostal || '',
      pais: contact.pais || '',
      linkedin: contact.linkedin || '',
      notas: contact.notas || '',
      tags: contact.tags || ''
    })
    setCreateFiscalProfile(false)
    setIsDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!contactToDelete) return
    if (!deleteJustification.trim()) {
      toast.error('Debes proporcionar una justificación para eliminar el contacto')
      return
    }

    try {
      setDeleting(true)
      const res = await apiFetch(`/api/contacts/${contactToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: deleteJustification })
      })

      const data = await res.json()
      
      if (res.ok) {
        toast.success('Contacto eliminado correctamente')
        setIsDeleteModalOpen(false)
        setContactToDelete(null)
        setDeleteJustification('')
        fetchContacts()
      } else {
        toast.error(data.error || 'Error al eliminar contacto')
      }
    } catch (error) {
      console.error('Error al eliminar contacto:', error)
      toast.error('Error al eliminar contacto')
    } finally {
      setDeleting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      nombre: '',
      email: '',
      telefono: '',
      tipo: 'person',
      companyId: '',
      cargo: '',
      ubicacion: '',
      direccion: '',
      ciudad: '',
      codigoPostal: '',
      pais: '',
      linkedin: '',
      notas: '',
      tags: ''
    })
    setCreateFiscalProfile(false)
    setFiscalData({
      fiscalType: 'EMPRESA',
      fiscalNif: '',
      fiscalRazonSocial: '',
    })
    setEditingContact(null)
  }

  const handleExport = () => {
    const url = `/api/contacts/export${filters.tipoFilter !== 'all' ? `?tipo=${filters.tipoFilter}` : ''}`
    window.open(url, '_blank')
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await apiFetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (response.ok) {
        toast.success(`Importación finalizada: ${data.imported} contactos importados, ${data.errors} errores.`)
        fetchContacts()
      } else {
        toast.error(data.error || 'Error al importar contactos')
      }
    } catch (error) {
      console.error('Error importing contacts CSV:', error)
      toast.error('Error al importar el archivo')
    } finally {
      setImporting(false)
      if (event.target) event.target.value = ''
    }
  }

  const downloadTemplate = () => {
    const headers = 'nombre,email,telefono,tipo,empresa,cargo,direccion,ciudad,codigoPostal,pais,ubicacion,linkedin,tags,notas'
    const csvContent = 'data:text/csv;charset=utf-8,' + headers
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'template_contactos.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOpenDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  // Estadísticas
  const totalPersons = contacts.filter((c) => c.tipo === 'person').length
  const totalCompanies = contacts.filter((c) => c.tipo === 'company').length
  const totalDeals = contacts.reduce((acc, c) => acc + (c._count?.deals || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando contactos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Contactos</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona tus contactos y empresas
        </p>
      </div>

      {/* Estadísticas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Contactos
            </CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contacts.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalPersons} personas, {totalCompanies} empresas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Personas</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPersons}</div>
            <p className="text-xs text-muted-foreground">
              Contactos individuales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCompanies}</div>
            <p className="text-xs text-muted-foreground">
              Organizaciones registradas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y acciones */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Filtros y Acciones</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Limpiar filtros
            </Button>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1 flex flex-col md:flex-row gap-4">
              {/* Búsqueda */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email o teléfono..."
                  value={filters.searchTerm || ''}
                  onChange={(e) => setFilter('searchTerm', e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filtro por tipo */}
              <Select value={filters.tipoFilter || 'all'} onValueChange={(v) => setFilter('tipoFilter', v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo de contacto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="person">Personas</SelectItem>
                  <SelectItem value="company">Empresas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botones de Importar/Exportar */}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
              <label className="cursor-pointer">
                <Button variant="outline" asChild disabled={importing}>
                  <span>
                    {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Importar
                  </span>
                </Button>
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleImportCSV}
                  disabled={importing}
                />
              </label>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Instrucciones de Importación</DialogTitle>
                    <DialogDescription>
                      Sigue estas reglas para asegurar una importación exitosa de tus contactos:
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Formato del Archivo</h4>
                      <p className="text-sm text-muted-foreground">
                        El archivo debe ser un **CSV** separado por comas. Asegúrate de que el archivo esté codificado en **UTF-8**.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Columnas Requeridas</h4>
                      <p className="text-sm text-muted-foreground">
                        Los campos **Nombre** y **Email** son obligatorios para cada registro.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Empresas vs Personas</h4>
                      <p className="text-sm text-muted-foreground">
                        Puedes especificar el tipo en la columna "Tipo" (valores posibles: "person" o "company").
                      </p>
                    </div>
                    <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                      <Download className="h-4 w-4 mr-2" />
                      Descargar Plantilla CSV
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Botón nuevo contacto */}
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleOpenDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo Contacto
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingContact ? 'Editar Contacto' : 'Nuevo Contacto'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingContact
                      ? 'Actualiza la información del contacto'
                      : 'Completa los datos del nuevo contacto'}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Tipo */}
                  <div>
                    <Label htmlFor="tipo">Tipo de Contacto</Label>
                    <Select
                      value={formData.tipo}
                      onValueChange={(value) =>
                        setFormData({ ...formData, tipo: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="person">Persona</SelectItem>
                        <SelectItem value="company">Empresa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Nombre */}
                  <div>
                    <Label htmlFor="nombre">
                      {formData.tipo === 'company'
                        ? 'Nombre de la Empresa'
                        : 'Nombre Completo'}{' '}
                      *
                    </Label>
                    <Input
                      id="nombre"
                      value={formData.nombre}
                      onChange={(e) =>
                        setFormData({ ...formData, nombre: e.target.value })
                      }
                      required
                    />
                  </div>

                  {/* Email y Teléfono */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="telefono">Teléfono</Label>
                      <Input
                        id="telefono"
                        value={formData.telefono}
                        onChange={(e) =>
                          setFormData({ ...formData, telefono: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Campos para personas */}
                  {formData.tipo === 'person' && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="cargo">Cargo</Label>
                          <Input
                            id="cargo"
                            value={formData.cargo}
                            onChange={(e) =>
                              setFormData({ ...formData, cargo: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="companyId">Empresa</Label>
                          <Select
                            value={formData.companyId || "sin-empresa"}
                            onValueChange={(value) =>
                              setFormData({ ...formData, companyId: value === "sin-empresa" ? "" : value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar empresa" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sin-empresa">Sin empresa</SelectItem>
                              {companies.map((company) => (
                                <SelectItem key={company.id} value={company.id}>
                                  {company.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Dirección completa */}
                  <div className="space-y-4 pt-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {formData.tipo === 'company' ? 'Dirección de la Empresa' : 'Dirección'}
                    </h4>
                    <div>
                      <Label htmlFor="direccion">Dirección</Label>
                      <Input
                        id="direccion"
                        value={formData.direccion}
                        onChange={(e) =>
                          setFormData({ ...formData, direccion: e.target.value })
                        }
                        placeholder="Calle, número, colonia"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="ciudad">Ciudad</Label>
                        <Input
                          id="ciudad"
                          value={formData.ciudad}
                          onChange={(e) =>
                            setFormData({ ...formData, ciudad: e.target.value })
                          }
                          placeholder="Ciudad"
                        />
                      </div>
                      <div>
                        <Label htmlFor="codigoPostal">Código Postal</Label>
                        <Input
                          id="codigoPostal"
                          value={formData.codigoPostal}
                          onChange={(e) =>
                            setFormData({ ...formData, codigoPostal: e.target.value })
                          }
                          placeholder="C.P."
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="pais">País</Label>
                      <Input
                        id="pais"
                        value={formData.pais}
                        onChange={(e) =>
                          setFormData({ ...formData, pais: e.target.value })
                        }
                        placeholder="México, España, etc."
                      />
                    </div>
                  </div>

                  {/* Ubicación y LinkedIn */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="ubicacion">Ubicación</Label>
                      <Input
                        id="ubicacion"
                        value={formData.ubicacion}
                        onChange={(e) =>
                          setFormData({ ...formData, ubicacion: e.target.value })
                        }
                        placeholder="Región, zona"
                      />
                    </div>
                    <div>
                      <Label htmlFor="linkedin">LinkedIn</Label>
                      <Input
                        id="linkedin"
                        value={formData.linkedin}
                        onChange={(e) =>
                          setFormData({ ...formData, linkedin: e.target.value })
                        }
                        placeholder="URL de perfil"
                      />
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <Label htmlFor="tags">Tags</Label>
                    <Input
                      id="tags"
                      value={formData.tags}
                      onChange={(e) =>
                        setFormData({ ...formData, tags: e.target.value })
                      }
                      placeholder="cliente, partner, prospecto (separados por coma)"
                    />
                  </div>

                  {/* Notas */}
                  <div>
                    <Label htmlFor="notas">Notas</Label>
                    <Textarea
                      id="notas"
                      value={formData.notas}
                      onChange={(e) =>
                        setFormData({ ...formData, notas: e.target.value })
                      }
                      rows={3}
                    />
                  </div>

                  {/* Perfil Fiscal (solo creación) */}
                  {!editingContact && (
                    <div className="pt-4 border-t space-y-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="createFiscal"
                          checked={createFiscalProfile}
                          onCheckedChange={(checked) => setCreateFiscalProfile(!!checked)}
                        />
                        <div>
                          <Label htmlFor="createFiscal" className="font-medium flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            Crear perfil fiscal Veri*factu
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Genera el perfil fiscal usando los datos de dirección del formulario
                          </p>
                        </div>
                      </div>

                      {createFiscalProfile && (
                        <div className="pl-8 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="fiscalType" className="text-xs">Tipo Fiscal</Label>
                              <Select
                                value={fiscalData.fiscalType}
                                onValueChange={(v) => setFiscalData({ ...fiscalData, fiscalType: v })}
                              >
                                <SelectTrigger id="fiscalType" className="h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EMPRESA">Empresa</SelectItem>
                                  <SelectItem value="AUTONOMO">Autónomo</SelectItem>
                                  <SelectItem value="PARTICULAR">Particular</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="fiscalNif" className="text-xs">NIF / CIF</Label>
                              <Input
                                id="fiscalNif"
                                value={fiscalData.fiscalNif}
                                onChange={(e) => setFiscalData({ ...fiscalData, fiscalNif: e.target.value.toUpperCase() })}
                                placeholder="B12345678"
                                className="h-9 text-sm font-mono"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="fiscalRazonSocial" className="text-xs">Razón Social</Label>
                            <Input
                              id="fiscalRazonSocial"
                              value={fiscalData.fiscalRazonSocial}
                              onChange={(e) => setFiscalData({ ...fiscalData, fiscalRazonSocial: e.target.value })}
                              placeholder={formData.nombre || 'Razón social'}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="button"
                      onClick={handleSubmit}
                    >
                      {editingContact ? 'Actualizar' : 'Crear'} Contacto
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Tabla de contactos */}
          {filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay contactos</h3>
              <p className="text-muted-foreground mb-4">
                {filters.searchTerm || filters.tipoFilter !== 'all'
                  ? 'No se encontraron contactos con los filtros seleccionados'
                  : 'Comienza creando tu primer contacto'}
              </p>
              {!filters.searchTerm && filters.tipoFilter === 'all' && (
                <Button onClick={handleOpenDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Primer Contacto
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Empresa/Cargo</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Deals</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/dashboard/contactos/${contact.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {contact.tipo === 'company' ? (
                              <Building2 className="h-5 w-5 text-primary" />
                            ) : (
                              <UserCheck className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium flex items-center gap-1.5">
                              {contact.nombre}
                              {contact.perfilFiscal && (
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {contact.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            contact.tipo === 'company' ? 'default' : 'secondary'
                          }
                        >
                          {contact.tipo === 'company' ? 'Empresa' : 'Persona'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {contact.tipo === 'person' ? (
                          <div>
                            {contact.company && (
                              <p className="font-medium flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {contact.company.nombre}
                              </p>
                            )}
                            {contact.cargo && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                {contact.cargo}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {contact._count.persons} personas
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {contact.telefono && (
                            <p className="text-sm flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.telefono}
                            </p>
                          )}
                          {contact.ubicacion && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {contact.ubicacion}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contact._count.deals} deals</Badge>
                      </TableCell>
                      <TableCell>
                        {contact.tags && (
                          <div className="flex flex-wrap gap-1">
                            {contact.tags.split(',').slice(0, 2).map((tag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {tag.trim()}
                              </Badge>
                            ))}
                            {contact.tags.split(',').length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{contact.tags.split(',').length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/dashboard/contactos/${contact.id}`)
                              }}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Ver Detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(contact)
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            {hasDeletePermission && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setContactToDelete(contact)
                                  setIsDeleteModalOpen(true)
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Modal de Justificación para Eliminar */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Eliminar Contacto
            </DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. Para proceder, debes proporcionar una justificación que quedará registrada en el historial de auditoría.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {contactToDelete && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{contactToDelete.nombre}</p>
                <p className="text-xs text-muted-foreground">{contactToDelete.email}</p>
              </div>
            )}
            <div>
              <Label htmlFor="delete-justification">Motivo de la eliminación *</Label>
              <Textarea
                id="delete-justification"
                value={deleteJustification}
                onChange={(e) => setDeleteJustification(e.target.value)}
                placeholder="Ej: Solicitud del cliente, duplicado, datos incorrectos..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteModalOpen(false)
              setContactToDelete(null)
              setDeleteJustification('')
            }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || !deleteJustification.trim()}
            >
              {deleting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Confirmar Eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
