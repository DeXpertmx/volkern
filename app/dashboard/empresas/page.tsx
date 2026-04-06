
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Building2, Plus, Search, Users, TrendingUp, Mail, Phone, MapPin, Linkedin, Tag, Loader2, Download, Upload, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Company {
  id: string
  nombre: string
  email: string
  telefono?: string
  ubicacion?: string
  linkedin?: string
  tags?: string
  notas?: string
  _count?: {
    persons: number
    deals: number
  }
}

export default function EmpresasPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    ubicacion: '',
    linkedin: '',
    tags: '',
    notas: ''
  })

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/contacts?tipo=company')
      if (!response.ok) throw new Error('Error al cargar empresas')
      const data = await response.json()
      setCompanies(data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar empresas')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.nombre || !formData.email) {
      toast.error('Nombre y email son obligatorios')
      return
    }

    try {
      setSaving(true)
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tipo: 'company'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear empresa')
      }

      const newCompany = await response.json()
      toast.success('Empresa creada exitosamente')
      setIsDialogOpen(false)
      setFormData({
        nombre: '',
        email: '',
        telefono: '',
        ubicacion: '',
        linkedin: '',
        tags: '',
        notas: ''
      })
      fetchCompanies()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al crear empresa')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = () => {
    window.open('/api/contacts/export?tipo=company', '_blank')
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (response.ok) {
        toast.success(`Importación finalizada: ${data.imported} empresas importadas, ${data.errors} errores.`)
        fetchCompanies()
      } else {
        toast.error(data.error || 'Error al importar empresas')
      }
    } catch (error) {
      console.error('Error importing companies CSV:', error)
      toast.error('Error al importar el archivo')
    } finally {
      setImporting(false)
      if (event.target) event.target.value = ''
    }
  }

  const downloadTemplate = () => {
    const headers = 'nombre,email,telefono,tipo,ubicacion,linkedin,tags,notas'
    const csvContent = 'data:text/csv;charset=utf-8,' + headers
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'template_empresas.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filteredCompanies = companies.filter(company =>
    company.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (company.ubicacion && company.ubicacion.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const totalContacts = companies.reduce((sum, c) => sum + (c._count?.persons || 0), 0)
  const totalDeals = companies.reduce((sum, c) => sum + (c._count?.deals || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">
            Gestiona tus empresas clientes y sus contactos
          </p>
        </div>
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
                <DialogTitle>Instrucciones de Importación (Empresas)</DialogTitle>
                <DialogDescription>
                  Sigue estas reglas para asegurar una importación exitosa de tus empresas:
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
                    Los campos **Nombre** (de la empresa) y **Email** corporativo son obligatorios.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Tipo de Registro</h4>
                  <p className="text-sm text-muted-foreground">
                    El sistema detectará automáticamente estos registros como empresas. Puedes usar la columna "Tipo" con el valor "company" para mayor seguridad.
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Plantilla CSV
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nueva Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Nueva Empresa</DialogTitle>
              <DialogDescription>
                Agrega una nueva empresa a tu base de datos
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="nombre">
                    Nombre de la Empresa <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Ej: Acme Corporation"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">
                    Email Corporativo <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contacto@empresa.com"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="telefono">Teléfono</Label>
                    <Input
                      id="telefono"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      placeholder="+52 55 1234 5678"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ubicacion">Ubicación</Label>
                    <Input
                      id="ubicacion"
                      value={formData.ubicacion}
                      onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                      placeholder="Ciudad de México, México"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="linkedin">LinkedIn Corporativo</Label>
                  <Input
                    id="linkedin"
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tags">Tags (separados por comas)</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="tecnología, saas, b2b"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notas">Notas</Label>
                  <Textarea
                    id="notas"
                    value={formData.notas}
                    onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                    placeholder="Información adicional sobre la empresa..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Empresa
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contactos Totales</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalContacts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deals Asociados</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDeals}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresas por nombre, email o ubicación..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Companies List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm ? 'No se encontraron empresas' : 'No hay empresas registradas'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Comienza creando tu primera empresa'}
            </p>
            {!searchTerm && (
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Primera Empresa
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => (
            <Card
              key={company.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(`/dashboard/empresas/${company.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{company.nombre}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {company._count?.persons || 0} contacto{(company._count?.persons || 0) !== 1 ? 's' : ''}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {company.email && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">{company.email}</span>
                  </div>
                )}
                {company.telefono && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Phone className="h-4 w-4 mr-2 shrink-0" />
                    <span>{company.telefono}</span>
                  </div>
                )}
                {company.ubicacion && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">{company.ubicacion}</span>
                  </div>
                )}
                {company.linkedin && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Linkedin className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">Perfil corporativo</span>
                  </div>
                )}
                {company.tags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {company.tags.split(',').slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                )}
                {company._count && company._count.deals > 0 && (
                  <div className="flex items-center text-sm text-muted-foreground pt-2 border-t">
                    <TrendingUp className="h-4 w-4 mr-2 shrink-0" />
                    <span>{company._count.deals} deal{company._count.deals !== 1 ? 's' : ''} activo{company._count.deals !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
