'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  FileText,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  PenLine,
  Building2,
  DollarSign,
  TrendingUp
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DocumentPreview } from '@/components/document-preview'
import { DocumentTimeline, TimelineEvent } from '@/components/document-timeline'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Contrato {
  id: string
  numero: string
  titulo: string
  tipo: string
  estado: string
  total: number
  moneda: string
  fechaCreacion: string
  fechaInicio: string | null
  fechaFin: string | null
  clienteNombre: string | null
  clienteEmpresa: string | null
  firmadoPorCliente: boolean
  firmadoPorEmpresa: boolean
  deal: { id: string; nombre: string } | null
  lead: { id: string; nombre: string } | null
  cotizacion: { id: string; numero: string } | null
}

export default function ContratosPage() {
  const router = useRouter()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('todos')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null)
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false)

  useEffect(() => {
    fetchContratos()
  }, [])

  const fetchContratos = async () => {
    try {
      const res = await fetch('/api/contratos')
      if (res.ok) {
        const data = await res.json()
        setContratos(data)
      }
    } catch (error) {
      toast.error('Error al cargar contratos')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number, currency: string = 'MXN') => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency
    }).format(amount)
  }

  const getEstadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      borrador: 'bg-gray-100 text-gray-700',
      enviado: 'bg-blue-100 text-blue-700',
      firmado: 'bg-green-100 text-green-700',
      vigente: 'bg-emerald-100 text-emerald-700',
      completado: 'bg-slate-100 text-slate-700',
      cancelado: 'bg-red-100 text-red-700'
    }
    return <Badge className={styles[estado] || 'bg-gray-100'}>{estado}</Badge>
  }

  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      servicio: 'Servicio',
      venta: 'Venta',
      suscripcion: 'Suscripción',
      otro: 'Otro'
    }
    return labels[tipo] || tipo
  }

  const filteredContratos = contratos.filter(c => {
    const matchSearch = search === '' ||
      c.numero.toLowerCase().includes(search.toLowerCase()) ||
      c.titulo.toLowerCase().includes(search.toLowerCase()) ||
      (c.clienteNombre && c.clienteNombre.toLowerCase().includes(search.toLowerCase())) ||
      (c.clienteEmpresa && c.clienteEmpresa.toLowerCase().includes(search.toLowerCase()))
    const matchEstado = estadoFilter === 'todos' || c.estado === estadoFilter
    const matchTipo = tipoFilter === 'todos' || c.tipo === tipoFilter
    return matchSearch && matchEstado && matchTipo
  })

  // Métricas
  const totalContratos = contratos.length
  const contratosVigentes = contratos.filter(c => c.estado === 'vigente').length
  const contratosPendientes = contratos.filter(c => ['borrador', 'enviado'].includes(c.estado)).length
  const valorTotal = contratos
    .filter(c => ['firmado', 'vigente', 'completado'].includes(c.estado))
    .reduce((sum, c) => sum + c.total, 0)

  const getTimelineEvents = (contrato: Contrato): TimelineEvent[] => {
    const events: TimelineEvent[] = [
      {
        id: '1',
        type: 'created',
        date: format(new Date(contrato.fechaCreacion), 'dd MMM yyyy', { locale: es }),
        description: 'Contrato generado desde el CRM',
        user: 'Sistema'
      }
    ]

    if (contrato.estado === 'enviado') {
      events.push({
        id: '2',
        type: 'sent',
        date: 'Enviado',
        description: 'Enviado para firma digital',
      })
    }

    if (contrato.firmadoPorEmpresa || contrato.firmadoPorCliente) {
      events.push({
        id: '3',
        type: 'accepted',
        date: 'En proceso',
        description: `Firmas recolectadas: ${contrato.firmadoPorEmpresa ? 'Empresa ✓' : ''} ${contrato.firmadoPorCliente ? 'Cliente ✓' : ''}`,
      })
    }

    if (contrato.estado === 'vigente') {
      events.push({
        id: '4',
        type: 'accepted',
        date: 'Activado',
        description: 'Contrato firmado por ambas partes y en vigor',
      })
    }

    return events.reverse()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Contratos</h1>
          <p className="text-muted-foreground">Gestiona tus contratos y órdenes de venta</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/template-editor/document/new')}>
            <FileText className="h-4 w-4 mr-2" />
            Gestionar Plantillas
          </Button>
          <Button onClick={() => router.push('/dashboard/contratos/nuevo')}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Contrato
          </Button>
        </div>
      </div>

      {/* Métricas */}
      {/* Métricas Premium */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Contratos</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{totalContratos}</p>
              </div>
              <div className="h-12 w-12 bg-gray-100/50 rounded-xl flex items-center justify-center">
                <FileText className="h-6 w-6 text-gray-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vigentes</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600 tracking-tight">{contratosVigentes}</p>
              </div>
              <div className="h-12 w-12 bg-emerald-100/50 rounded-xl flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pendientes</p>
                <p className="text-3xl font-bold mt-1 text-amber-600 tracking-tight">{contratosPendientes}</p>
              </div>
              <div className="h-12 w-12 bg-amber-100/50 rounded-xl flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="premium-gradient-primary hover:scale-105 transition-all duration-300 shadow-lg border-none text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80 uppercase tracking-wider">Valor Firmado</p>
                <p className="text-2xl font-bold mt-1 truncate tracking-tight">{formatCurrency(valorTotal)}</p>
              </div>
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, título, cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="firmado">Firmado</SelectItem>
                <SelectItem value="vigente">Vigente</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                <SelectItem value="servicio">Servicio</SelectItem>
                <SelectItem value="venta">Venta</SelectItem>
                <SelectItem value="suscripcion">Suscripción</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Contratos */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Firmas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContratos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No hay contratos que mostrar
                  </TableCell>
                </TableRow>
              ) : (
                filteredContratos.map((contrato) => (
                  <TableRow
                    key={contrato.id}
                    className="cursor-pointer hover:bg-muted/50 border-l-2 border-transparent hover:border-l-primary transition-all animate-fade-in"
                    onClick={() => {
                      setSelectedContrato(contrato)
                      setIsQuickViewOpen(true)
                    }}
                  >
                    <TableCell className="font-medium">{contrato.numero}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{contrato.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(contrato.fechaCreacion), 'dd MMM yyyy', { locale: es })}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {contrato.clienteNombre || contrato.clienteEmpresa || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTipoLabel(contrato.tipo)}</Badge>
                    </TableCell>
                    <TableCell>{getEstadoBadge(contrato.estado)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <span className={`text-xs ${contrato.firmadoPorEmpresa ? 'text-green-600' : 'text-gray-400'}`}>
                          {contrato.firmadoPorEmpresa ? '✓' : '○'} Empresa
                        </span>
                        <span className="text-gray-300">|</span>
                        <span className={`text-xs ${contrato.firmadoPorCliente ? 'text-green-600' : 'text-gray-400'}`}>
                          {contrato.firmadoPorCliente ? '✓' : '○'} Cliente
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(contrato.total, contrato.moneda)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/contratos/${contrato.id}`) }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quick View Sheet */}
      <Sheet open={isQuickViewOpen} onOpenChange={setIsQuickViewOpen}>
        <SheetContent className="sm:max-w-3xl overflow-y-auto bg-muted/20 border-l-none p-0">
          {selectedContrato && (
            <div className="flex flex-col h-full">
              <div className="p-6 bg-background border-b flex items-center justify-between sticky top-0 z-20">
                <div>
                  <Badge variant="outline" className="font-mono mb-1">{selectedContrato.numero}</Badge>
                  <SheetTitle className="text-xl">{selectedContrato.titulo}</SheetTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/dashboard/contratos/${selectedContrato.id}`)}
                  >
                    Editar <PenLine className="h-4 w-4 ml-2" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setIsQuickViewOpen(false)}>
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 p-6">
                <Tabs defaultValue="preview" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="preview">Vista Previa</TabsTrigger>
                    <TabsTrigger value="history">Historial y Firmas</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="mt-0">
                    <div className="scale-[0.85] origin-top border shadow-inner rounded-xl overflow-hidden bg-white">
                      <DocumentPreview
                        title="Contrato"
                        number={selectedContrato.numero}
                        date={format(new Date(selectedContrato.fechaCreacion), 'dd/MM/yyyy')}
                        emisor={{
                          razonSocial: 'Volkern Hub',
                          idFiscal: 'VKL-2024-X',
                        }}
                        cliente={{
                          nombre: selectedContrato.clienteNombre || 'Cliente',
                          idFiscal: selectedContrato.lead?.nombre,
                        }}
                        items={[{
                          concepto: selectedContrato.titulo,
                          descripcion: `Tipo: ${getTipoLabel(selectedContrato.tipo)}`,
                          cantidad: 1,
                          precioUnitario: selectedContrato.total,
                        }]}
                        totals={{
                          subtotal: selectedContrato.total,
                          impuesto: 0,
                          total: selectedContrato.total,
                          currency: selectedContrato.moneda,
                        }}
                        condiciones="Los términos de este contrato son confidenciales."
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0 bg-background rounded-xl border p-8">
                    <h4 className="font-bold text-lg mb-6 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" /> Historial de Firmas y Estados
                    </h4>
                    <DocumentTimeline events={getTimelineEvents(selectedContrato)} />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="p-6 bg-background border-t mt-auto sticky bottom-0 z-20">
                <Button className="w-full premium-gradient-primary border-none shadow-lg h-12 text-lg" onClick={() => router.push(`/dashboard/contratos/${selectedContrato.id}`)}>
                  Gestionar Contrato
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
