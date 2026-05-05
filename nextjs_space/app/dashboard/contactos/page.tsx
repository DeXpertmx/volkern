
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  HelpCircle
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  _count: {
    deals: number
    persons: number
  }
  fechaCreacion: string
}

export default function ContactosPage() {
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('all')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [companies, setCompanies] = useState<Contact[]>([])
  const [importing, setImporting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    tipo: 'person',
    companyId: '',
    cargo: '',
    ubicacion: '',
    linkedin: '',
    notas: '',
    tags: ''
  })

  useEffect(() => {
    fetchContacts()
    fetchCompanies()
  }, [])

  useEffect(() => {
    filterContacts()
  }, [searchTerm, tipoFilter, contacts])

  const fetchContacts = async () => {
    try {
const res = await apiFetch('/api/contacts')
      const res = await apiFetch('/api/contacts?tipo=company')
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
    const headers = 'nombre,email,telefono,tipo,empresa,cargo,ubicacion,linkedin,tags,notas'
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1 flex flex-col md:flex-row gap-4">
              {/* Búsqueda */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filtro por tipo */}
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
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
                        placeholder="Ciudad, País"
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
                {searchTerm || tipoFilter !== 'all'
                  ? 'No se encontraron contactos con los filtros seleccionados'
                  : 'Comienza creando tu primer contacto'}
              </p>
              {!searchTerm && tipoFilter === 'all' && (
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
                            <p className="font-medium">{contact.nombre}</p>
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
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(contact.id)
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
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
    </div>
  )
}
