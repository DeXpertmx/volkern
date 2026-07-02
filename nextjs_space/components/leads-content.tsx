
'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Users, Search, Eye, Mail, Phone, UserCheck, Download, Upload, HelpCircle, Loader2, Save, MessageSquare, Send, RefreshCw, TrendingUp, BarChart3, Clock, Trash2, Flame, Sparkles, PhoneCall, Plus, Building2, MapPin, Globe, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'

const estadoColors: Record<string, string> = {
  'nuevo': 'bg-blue-100 text-blue-800',
  'contactado': 'bg-yellow-100 text-yellow-800',
  'convertido': 'bg-green-100 text-green-800',
  'perdido': 'bg-red-100 text-red-800',
  'agendado': 'bg-purple-100 text-purple-800',
  'pagado': 'bg-emerald-100 text-emerald-800',
  'inactivo': 'bg-gray-100 text-gray-800'
}

export function LeadsContent() {
  const { data: session } = useSession() || {}
  const [activeTab, setActiveTab] = useState('mis-leads')

  // Clave para persistencia en localStorage
  const FILTERS_KEY = 'volkern-leads-filters'

  // Estado para leads del CRM
  const [leads, setLeads] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEstado, setSelectedEstado] = useState('all')
  const [selectedAssignment, setSelectedAssignment] = useState('all')
  const [empresaFilter, setEmpresaFilter] = useState('')

  // Estado para estadísticas
  const [stats, setStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null)

  // Estado para crear nuevo lead
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newLead, setNewLead] = useState({
    nombre: '',
    email: '',
    telefono: '',
    cargo: '',
    empresa: '',
    direccion: '',
    ciudad: '',
    codigoPostal: '',
    pais: '',
    fuente: '',
    notas: ''
  })

  // Restaurar filtros guardados tras montaje (evita SSR mismatch)
  const [filtersRestored, setFiltersRestored] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTERS_KEY)
      if (saved) {
        const filters = JSON.parse(saved)
        if (filters.searchTerm) setSearchTerm(filters.searchTerm)
        if (filters.selectedEstado) setSelectedEstado(filters.selectedEstado)
        if (filters.selectedAssignment) setSelectedAssignment(filters.selectedAssignment)
        if (filters.empresaFilter) setEmpresaFilter(filters.empresaFilter)
        if (filters.activeTab) setActiveTab(filters.activeTab)
      }
    } catch {}
    setFiltersRestored(true)
  }, [])

  // Persistir filtros cuando cambian
  useEffect(() => {
    if (!filtersRestored) return
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        searchTerm,
        selectedEstado,
        selectedAssignment,
        empresaFilter,
        activeTab,
      }))
    } catch {}
  }, [searchTerm, selectedEstado, selectedAssignment, empresaFilter, activeTab, filtersRestored])

  // Cargar leads cuando cambian los filtros
  useEffect(() => {
    const fetchLeads = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (selectedEstado !== 'all') {
          params.append('estado', selectedEstado)
        }
        if (searchTerm) {
          params.append('search', searchTerm)
        }
        if (selectedAssignment === 'my-leads') {
          params.append('assignedToMe', 'true')
        } else if (selectedAssignment === 'unassigned') {
          params.append('unassigned', 'true')
        }
        if (empresaFilter) {
          params.append('empresa', empresaFilter)
        }

        const response = await apiFetch(`/api/leads?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          setLeads(data)
        }
      } catch (error) {
        console.error('Error fetching leads:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLeads()
  }, [selectedEstado, searchTerm, selectedAssignment, empresaFilter])

  // Importar desde archivo CSV
  const handleImportLeadsCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await apiFetch('/api/leads/import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (response.ok) {
        toast.success(`Importación finalizada: ${data.imported} leads importados, ${data.errors} errores.`)
        // Recargar leads
        const leadsResponse = await apiFetch('/api/leads')
        if (leadsResponse.ok) {
          const leadsData = await leadsResponse.json()
          setLeads(leadsData)
        }
      } else {
        toast.error(data.error || 'Error al importar leads')
      }
    } catch (error) {
      console.error('Error importing leads CSV:', error)
      toast.error('Error al importar el archivo')
    } finally {
      setImporting(false)
      // Reset input
      if (event.target) event.target.value = ''
    }
  }

  const handleExportLeads = () => {
    window.open('/api/leads/export', '_blank')
  }

  const handleCreateLead = async () => {
    if (!newLead.nombre.trim() || !newLead.email.trim()) {
      toast.error('Nombre y email son obligatorios')
      return
    }

    setIsCreating(true)
    try {
      const response = await apiFetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: newLead.nombre,
          email: newLead.email,
          telefono: newLead.telefono || undefined,
          cargo: newLead.cargo || undefined,
          empresa: newLead.empresa || undefined,
          direccion: newLead.direccion || undefined,
          ciudad: newLead.ciudad || undefined,
          codigoPostal: newLead.codigoPostal || undefined,
          pais: newLead.pais || undefined,
          fuente: newLead.fuente || undefined,
          notas: newLead.notas || undefined,
        })
      })

      if (response.ok) {
        const createdLead = await response.json()
        toast.success('Lead creado exitosamente')
        setIsCreateDialogOpen(false)
        setNewLead({
          nombre: '',
          email: '',
          telefono: '',
          cargo: '',
          empresa: '',
          direccion: '',
          ciudad: '',
          codigoPostal: '',
          pais: '',
          fuente: '',
          notas: ''
        })
        // Refrescar lista
        setIsLoading(true)
        const leadsResponse = await apiFetch('/api/leads')
        if (leadsResponse.ok) {
          const leadsData = await leadsResponse.json()
          setLeads(leadsData)
        }
        setIsLoading(false)
      } else {
        const data = await response.json()
        toast.error(data.error || 'Error al crear lead')
      }
    } catch (error) {
      console.error('Error creating lead:', error)
      toast.error('Error al crear el lead')
    } finally {
      setIsCreating(false)
    }
  }

  const downloadTemplate = () => {
    const headers = 'nombre,email,telefono,empresa,cargo,direccion,ciudad,codigoPostal,pais,fuente,ubicacion,notas'
    const csvContent = 'data:text/csv;charset=utf-8,' + headers
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'template_leads.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  // Cargar estadísticas
  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const response = await apiFetch('/api/leads/stats?periodo=30')
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }

  const initiateCall = async (phoneNumber: string, leadId: string) => {
    if (!phoneNumber) return;
    
    setCallingLeadId(leadId);
    try {
      const res = await apiFetch('/api/integrations/telephony/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: phoneNumber })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Llamada iniciada');
      } else {
        toast.error(data.error || 'Error al iniciar llamada');
      }
    } catch (error) {
      console.error('Call error:', error);
      toast.error('Error de conexión al iniciar llamada');
    } finally {
      setCallingLeadId(null);
    }
  };

  // Cargar estadísticas al cambiar a la tab de estadísticas
  useEffect(() => {
    if (activeTab === 'estadisticas' && !stats) {
      loadStats()
    }
  }, [activeTab])

  // Limpiar todos los filtros
  const clearFilters = () => {
    setSearchTerm('')
    setSelectedEstado('all')
    setSelectedAssignment('all')
    setEmpresaFilter('')
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <Users className="h-8 w-8 mr-3 text-primary" />
              Gestión de Leads
            </h1>
            <p className="text-muted-foreground">
              Administra y da seguimiento a todos tus leads
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Users className="h-8 w-8 mr-3 text-primary" />
            Gestión de Leads
          </h1>
          <p className="text-muted-foreground">
            Administra y da seguimiento a todos tus leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Nuevo Lead
                </DialogTitle>
                <DialogDescription>
                  Registra un nuevo lead con sus datos personales y de empresa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Datos Personales */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Datos Personales
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-nombre">Nombre *</Label>
                      <Input
                        id="new-nombre"
                        value={newLead.nombre}
                        onChange={(e) => setNewLead({ ...newLead, nombre: e.target.value })}
                        placeholder="Nombre completo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-email">Email *</Label>
                      <Input
                        id="new-email"
                        type="email"
                        value={newLead.email}
                        onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                        placeholder="email@ejemplo.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-telefono">Teléfono</Label>
                      <Input
                        id="new-telefono"
                        value={newLead.telefono}
                        onChange={(e) => setNewLead({ ...newLead, telefono: e.target.value })}
                        placeholder="+52 123 456 7890"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-cargo">Cargo</Label>
                      <Input
                        id="new-cargo"
                        value={newLead.cargo}
                        onChange={(e) => setNewLead({ ...newLead, cargo: e.target.value })}
                        placeholder="Director, Gerente, etc."
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="new-fuente">Fuente</Label>
                      <Input
                        id="new-fuente"
                        value={newLead.fuente}
                        onChange={(e) => setNewLead({ ...newLead, fuente: e.target.value })}
                        placeholder="Web, Referido, LinkedIn, etc."
                      />
                    </div>
                  </div>
                </div>

                {/* Datos de Empresa */}
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Datos de Empresa
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="new-empresa">Nombre de Empresa</Label>
                      <Input
                        id="new-empresa"
                        value={newLead.empresa}
                        onChange={(e) => setNewLead({ ...newLead, empresa: e.target.value })}
                        placeholder="Nombre de la empresa"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="new-direccion" className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        Dirección
                      </Label>
                      <Input
                        id="new-direccion"
                        value={newLead.direccion}
                        onChange={(e) => setNewLead({ ...newLead, direccion: e.target.value })}
                        placeholder="Calle, número, colonia"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-ciudad">Ciudad</Label>
                      <Input
                        id="new-ciudad"
                        value={newLead.ciudad}
                        onChange={(e) => setNewLead({ ...newLead, ciudad: e.target.value })}
                        placeholder="Ciudad"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-cp">Código Postal</Label>
                      <Input
                        id="new-cp"
                        value={newLead.codigoPostal}
                        onChange={(e) => setNewLead({ ...newLead, codigoPostal: e.target.value })}
                        placeholder="C.P."
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="new-pais" className="flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5" />
                        País
                      </Label>
                      <Input
                        id="new-pais"
                        value={newLead.pais}
                        onChange={(e) => setNewLead({ ...newLead, pais: e.target.value })}
                        placeholder="México, España, etc."
                      />
                    </div>
                  </div>
                </div>

                {/* Notas */}
                <div className="space-y-2 pt-4 border-t">
                  <Label htmlFor="new-notas">Notas</Label>
                  <Textarea
                    id="new-notas"
                    value={newLead.notas}
                    onChange={(e) => setNewLead({ ...newLead, notas: e.target.value })}
                    placeholder="Notas adicionales sobre el lead..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateLead} disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Crear Lead
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={handleExportLeads}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild disabled={importing}>
              <span>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Importar
              </span>
            </Button>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={handleImportLeadsCSV}
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
                  Sigue estas reglas para asegurar una importación exitosa de tus leads:
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
                  <h4 className="font-semibold text-sm">Actualización de Datos</h4>
                  <p className="text-sm text-muted-foreground">
                    Si el email de un registro ya existe, la información del lead se actualizará automáticamente.
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Plantilla CSV
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="mis-leads">
            <Users className="h-4 w-4 mr-2" />
            Mis Leads
          </TabsTrigger>
          <TabsTrigger value="estadisticas">
            <BarChart3 className="h-4 w-4 mr-2" />
            Estadísticas
          </TabsTrigger>
        </TabsList>

        {/* Tab: Mis Leads */}
        <TabsContent value="mis-leads" className="space-y-6">

          {/* Filtros */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Filtros</CardTitle>
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
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Buscar</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre o email..."
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado</label>
                  <select
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                    value={selectedEstado}
                    onChange={(e) => setSelectedEstado(e.target.value)}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="nuevo">Nuevo</option>
                    <option value="contactado">Contactado</option>
                    <option value="convertido">Convertido</option>
                    <option value="perdido">Perdido</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Asignación</label>
                  <select
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                    value={selectedAssignment}
                    onChange={(e) => setSelectedAssignment(e.target.value)}
                  >
                    <option value="all">Todos los leads</option>
                    <option value="my-leads">Mis leads</option>
                    <option value="unassigned">Sin asignar</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    Empresa
                  </label>
                  <Input
                    placeholder="Filtrar por empresa..."
                    value={empresaFilter}
                    onChange={(e) => setEmpresaFilter(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas rápidas */}
          <div className="grid gap-4 md:grid-cols-4">
            {Object.entries({
              'Total': leads.length,
              'Nuevos': leads.filter((l: any) => l.estado === 'nuevo').length,
              'Contactados': leads.filter((l: any) => l.estado === 'contactado').length,
              'Convertidos': leads.filter((l: any) => l.estado === 'convertido').length,
            }).map(([label, count]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{count}</div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabla de leads */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Leads ({leads.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leads.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No hay leads</h3>
                  <p className="text-muted-foreground mb-4">
                    Aún no tienes leads capturados. Comparte tu formulario de contacto para empezar a recibir leads.
                  </p>
                  <div className="space-x-2">
                    <Link href="/embed/contact" target="_blank">
                      <Button variant="outline">
                        Ver formulario
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Asignado a</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Citas</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((lead: any) => (
                        <TableRow key={lead.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{lead.nombre}</TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                              {lead.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            {lead.telefono ? (
                              <div className="flex items-center">
                                <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                                {lead.telefono}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {lead.empresa ? (
                              <div className="flex items-center">
                                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                                <span className="text-sm">{lead.empresa}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={estadoColors[lead.estado as keyof typeof estadoColors] || 'bg-gray-100 text-gray-800'}
                            >
                              {lead.estado}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {lead.scoreValue >= 80 ? (
                                <Badge className="bg-red-500 text-white gap-1 px-1.5 h-6">
                                  <Flame className="h-3 w-3" />
                                  {lead.scoreValue}
                                </Badge>
                              ) : lead.scoreValue >= 60 ? (
                                <Badge variant="secondary" className="bg-orange-100 text-orange-700 gap-1 px-1.5 h-6 border-orange-200">
                                  {lead.scoreValue}
                                </Badge>
                              ) : (
                                <span className="text-sm font-medium text-muted-foreground ml-1.5">
                                  {lead.scoreValue || 0}
                                </span>
                              )}
                              {lead.score?.categoria === 'ia_evaluation' && (
                                <Sparkles className="h-3 w-3 text-indigo-500" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {lead.asignadoUsuario ? (
                              <div className="flex items-center">
                                <UserCheck className="h-4 w-4 mr-2 text-muted-foreground" />
                                <span className="text-sm">{lead.asignadoUsuario.name || lead.asignadoUsuario.email}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin asignar</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {format(new Date(lead.fechaCreacion), 'dd MMM yyyy', { locale: es })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {lead.citas?.length || 0} citas
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Link href={`/dashboard/leads/${lead.id}`}>
                                <Button variant="ghost" size="sm" title="Ver ficha">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                              {lead.telefono && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  title="Llamar (VoIP)"
                                  onClick={() => initiateCall(lead.telefono, lead.id)}
                                  disabled={callingLeadId !== null}
                                >
                                  {callingLeadId === lead.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <PhoneCall className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Estadísticas */}
        <TabsContent value="estadisticas" className="space-y-6">
          {statsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : stats ? (
            <>
              {/* Overview Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Leads
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.overview.totalLeads}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.overview.leadsNuevos} nuevos este mes
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Convertidos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.overview.leadsConvertidos}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.overview.tasaConversion}% tasa de conversión
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Score Promedio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.overview.scorePromedio}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      De 100 puntos posibles
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Sin Asignar
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.overview.leadsSinAsignar}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.overview.leadsAsignados} asignados
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Leads por Estado */}
                <Card>
                  <CardHeader>
                    <CardTitle>Leads por Estado</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.porEstado.map((item: any) => (
                        <div key={item.estado} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={estadoColors[item.estado] || 'bg-gray-100 text-gray-800'}>
                              {item.estado}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{item.count}</span>
                            <span className="text-sm text-muted-foreground">
                              ({Math.round((item.count / stats.overview.totalLeads) * 100)}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Leads por Fuente */}
                <Card>
                  <CardHeader>
                    <CardTitle>Leads por Fuente</CardTitle>
                    <CardDescription>Últimos 30 días</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.porFuente.map((item: any) => (
                        <div key={item.fuente} className="flex items-center justify-between">
                          <span className="text-sm font-medium">{item.fuente || 'Manual'}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{item.count}</span>
                          </div>
                        </div>
                      ))}
                      {stats.porFuente.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No hay datos de fuentes en este periodo
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Evolución y Top Leads */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Evolución de Leads */}
                <Card>
                  <CardHeader>
                    <CardTitle>Evolución (Últimos 7 días)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.evolucion.map((item: any) => (
                        <div key={item.fecha} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(item.fecha), "d 'de' MMM", { locale: es })}
                          </span>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 bg-primary rounded-full"
                              style={{ width: `${Math.max(item.count * 10, 20)}px` }}
                            />
                            <span className="font-medium w-8 text-right">{item.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Leads */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top 10 Leads por Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.topLeads.slice(0, 5).map((lead: any, index: number) => (
                        <div key={lead.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm font-medium text-muted-foreground w-6">
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{lead.nombre}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {lead.empresa || lead.email}
                              </p>
                            </div>
                          </div>
                          <Badge variant="default" className="ml-2">
                            {lead.score}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Leads por Usuario */}
              {stats.porUsuario.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Distribución por Usuario</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.porUsuario.map((item: any) => (
                        <div key={item.usuarioId} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{item.usuarioNombre}</span>
                          </div>
                          <Badge variant="outline">{item.count} leads</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}


              {/* Refresh Button */}
              <div className="flex justify-center">
                <Button onClick={loadStats} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar Estadísticas
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold text-lg">No hay estadísticas disponibles</h3>
                    <p className="text-muted-foreground">
                      Las estadísticas se cargarán automáticamente
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

    </div>
  )
}
