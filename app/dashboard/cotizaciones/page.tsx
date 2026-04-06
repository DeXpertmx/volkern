'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Eye,
  MoreHorizontal,
  Building2,
  User,
  Calendar,
  TrendingUp,
  AlertTriangle
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DocumentPreview } from '@/components/document-preview'
import { DocumentTimeline, TimelineEvent } from '@/components/document-timeline'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Cotizacion {
  id: string
  numero: string
  titulo: string
  estado: string
  total: number
  moneda: string
  fechaCreacion: string
  fechaVencimiento: string | null
  fechaEnvio: string | null
  vecesVista: number
  clienteNombre: string | null
  clienteEmail: string | null
  clienteEmpresa: string | null
  lead: {
    id: string
    nombre: string
    email: string
    empresa: string | null
  } | null
  deal: {
    id: string
    titulo: string
  } | null
  items: any[]
}

const estadoConfig: Record<string, { label: string; color: string; icon: any }> = {
  borrador: { label: 'Borrador', color: 'bg-gray-100 text-gray-800', icon: FileText },
  enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-800', icon: Send },
  vista: { label: 'Vista', color: 'bg-purple-100 text-purple-800', icon: Eye },
  aceptada: { label: 'Aceptada', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-800', icon: XCircle },
  vencida: { label: 'Vencida', color: 'bg-orange-100 text-orange-800', icon: AlertTriangle },
}

export default function CotizacionesPage() {
  const router = useRouter()
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [selectedCotizacion, setSelectedCotizacion] = useState<Cotizacion | null>(null)
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false)
  const [metrics, setMetrics] = useState({
    total: 0,
    borradores: 0,
    enviadas: 0,
    aceptadas: 0,
    valorTotal: 0,
    tasaConversion: 0
  })

  useEffect(() => {
    fetchCotizaciones()
  }, [])

  const fetchCotizaciones = async () => {
    try {
      const res = await fetch('/api/cotizaciones')
      const data = await res.json()

      if (data.cotizaciones) {
        setCotizaciones(data.cotizaciones)

        // Calcular métricas
        const total = data.cotizaciones.length
        const borradores = data.cotizaciones.filter((c: Cotizacion) => c.estado === 'borrador').length
        const enviadas = data.cotizaciones.filter((c: Cotizacion) => ['enviada', 'vista'].includes(c.estado)).length
        const aceptadas = data.cotizaciones.filter((c: Cotizacion) => c.estado === 'aceptada').length
        const valorTotal = data.cotizaciones
          .filter((c: Cotizacion) => c.estado === 'aceptada')
          .reduce((sum: number, c: Cotizacion) => sum + c.total, 0)
        const tasaConversion = total > 0 ? Math.round((aceptadas / total) * 100) : 0

        setMetrics({ total, borradores, enviadas, aceptadas, valorTotal, tasaConversion })
      }
    } catch (error) {
      toast.error('Error al cargar cotizaciones')
    } finally {
      setLoading(false)
    }
  }

  const filteredCotizaciones = cotizaciones.filter(cot => {
    const matchesSearch =
      cot.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cot.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cot.clienteNombre && cot.clienteNombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (cot.clienteEmpresa && cot.clienteEmpresa.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (cot.lead?.nombre && cot.lead.nombre.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesEstado = filtroEstado === 'todos' || cot.estado === filtroEstado

    return matchesSearch && matchesEstado
  })

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency || 'MXN'
    }).format(amount)
  }

  const isExpired = (cot: Cotizacion) => {
    if (!cot.fechaVencimiento) return false
    return new Date(cot.fechaVencimiento) < new Date() && !['aceptada', 'rechazada'].includes(cot.estado)
  }

  const getTimelineEvents = (cot: Cotizacion): TimelineEvent[] => {
    const events: TimelineEvent[] = [
      {
        id: '1',
        type: 'created',
        date: format(new Date(cot.fechaCreacion), 'dd MMM yyyy, HH:mm', { locale: es }),
        description: 'Cotización creada en el sistema',
        user: 'Sistema'
      }
    ]

    if (cot.fechaEnvio) {
      events.push({
        id: '2',
        type: 'sent',
        date: format(new Date(cot.fechaEnvio), 'dd MMM yyyy, HH:mm', { locale: es }),
        description: 'Cotización enviada al cliente por email',
        user: 'Ejecutivo de Ventas'
      })
    }

    if (cot.vecesVista > 0) {
      events.push({
        id: '3',
        type: 'viewed',
        date: 'Recientemente',
        description: `El cliente ha visualizado el documento ${cot.vecesVista} veces`,
      })
    }

    if (cot.estado === 'aceptada') {
      events.push({
        id: '4',
        type: 'accepted',
        date: 'Completado',
        description: 'La propuesta fue aprobada por el cliente',
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground">Gestiona tus propuestas y presupuestos</p>
        </div>
        <Button onClick={() => router.push('/dashboard/cotizaciones/nueva')}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cotización
        </Button>
      </div>

      {/* Métricas */}
      {/* Métricas Premium */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <FileText className="h-5 w-5 text-gray-500" />
                <Badge variant="outline" className="text-[10px] h-4">TOTAL</Badge>
              </div>
              <p className="text-3xl font-bold tracking-tight mt-1">{metrics.total}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Registros</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Clock className="h-5 w-5 text-amber-500" />
                <Badge variant="outline" className="text-[10px] h-4 border-amber-200 text-amber-600">EDICIÓN</Badge>
              </div>
              <p className="text-3xl font-bold tracking-tight mt-1 text-amber-600">{metrics.borradores}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Borradores</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Send className="h-5 w-5 text-blue-500" />
                <Badge variant="outline" className="text-[10px] h-4 border-blue-200 text-blue-600">EN CURSO</Badge>
              </div>
              <p className="text-3xl font-bold tracking-tight mt-1 text-blue-600">{metrics.enviadas}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Enviadas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <Badge variant="outline" className="text-[10px] h-4 border-emerald-200 text-emerald-600">CIERRE</Badge>
              </div>
              <p className="text-3xl font-bold tracking-tight mt-1 text-emerald-600">{metrics.aceptadas}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Aceptadas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                <Badge variant="outline" className="text-[10px] h-4 border-emerald-200 text-emerald-700">VALOR</Badge>
              </div>
              <p className="text-xl font-bold tracking-tight mt-1 truncate">{formatCurrency(metrics.valorTotal, 'MXN')}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ventas Reales</p>
            </div>
          </CardContent>
        </Card>
        <Card className="premium-gradient-primary hover:scale-105 transition-all duration-300 shadow-lg border-none text-white">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <TrendingUp className="h-5 w-5 text-white/80" />
                <Badge variant="outline" className="text-[10px] h-4 border-white/40 text-white bg-white/20">KPI</Badge>
              </div>
              <p className="text-3xl font-bold tracking-tight mt-1">{metrics.tasaConversion}%</p>
              <p className="text-xs text-white/80 font-medium uppercase tracking-wider">Conversión</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, título, cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="enviada">Enviada</SelectItem>
            <SelectItem value="vista">Vista</SelectItem>
            <SelectItem value="aceptada">Aceptada</SelectItem>
            <SelectItem value="rechazada">Rechazada</SelectItem>
            <SelectItem value="vencida">Vencida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de cotizaciones */}
      {filteredCotizaciones.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No hay cotizaciones</h3>
            <p className="text-muted-foreground mb-4">Crea tu primera cotización para empezar</p>
            <Button onClick={() => router.push('/dashboard/cotizaciones/nueva')}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Cotización
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredCotizaciones.map((cot) => {
            const estado = estadoConfig[isExpired(cot) ? 'vencida' : cot.estado] || estadoConfig.borrador
            const EstadoIcon = estado.icon

            return (
              <Card
                key={cot.id}
                className="hover:shadow-md transition-all duration-200 border-l-4 border-l-primary/30 hover:border-l-primary animate-fade-in"
                onClick={() => {
                  setSelectedCotizacion(cot)
                  setIsQuickViewOpen(true)
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm text-muted-foreground">{cot.numero}</span>
                        <Badge className={estado.color}>
                          <EstadoIcon className="h-3 w-3 mr-1" />
                          {estado.label}
                        </Badge>
                        {cot.vecesVista > 0 && (
                          <Badge variant="outline" className="text-purple-600">
                            <Eye className="h-3 w-3 mr-1" />
                            {cot.vecesVista} {cot.vecesVista === 1 ? 'vista' : 'vistas'}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg">{cot.titulo}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        {(cot.clienteNombre || cot.lead?.nombre) && (
                          <span className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {cot.clienteNombre || cot.lead?.nombre}
                          </span>
                        )}
                        {(cot.clienteEmpresa || cot.lead?.empresa) && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            {cot.clienteEmpresa || cot.lead?.empresa}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(cot.fechaCreacion), 'dd MMM yyyy', { locale: es })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xl font-bold">{formatCurrency(cot.total, cot.moneda)}</p>
                        <p className="text-xs text-muted-foreground">
                          {cot.items.length} {cot.items.length === 1 ? 'item' : 'items'}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/dashboard/cotizaciones/${cot.id}`)
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalles
                          </DropdownMenuItem>
                          {cot.estado === 'borrador' && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/dashboard/cotizaciones/${cot.id}?action=send`)
                            }}>
                              <Send className="h-4 w-4 mr-2" />
                              Enviar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Quick View Sheet */}
      <Sheet open={isQuickViewOpen} onOpenChange={setIsQuickViewOpen}>
        <SheetContent className="sm:max-w-3xl overflow-y-auto bg-muted/20 border-l-none p-0">
          {selectedCotizacion && (
            <div className="flex flex-col h-full">
              <div className="p-6 bg-background border-b flex items-center justify-between sticky top-0 z-20">
                <div>
                  <Badge variant="outline" className="font-mono mb-1">{selectedCotizacion.numero}</Badge>
                  <SheetTitle className="text-xl">{selectedCotizacion.titulo}</SheetTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/dashboard/cotizaciones/${selectedCotizacion.id}`)}
                  >
                    Editar <FileText className="h-4 w-4 ml-2" />
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
                    <TabsTrigger value="history">Historial y Actividad</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="mt-0">
                    <div className="scale-[0.85] origin-top border shadow-inner rounded-xl overflow-hidden bg-white">
                      <DocumentPreview
                        title="Cotización"
                        number={selectedCotizacion.numero}
                        date={format(new Date(selectedCotizacion.fechaCreacion), 'dd/MM/yyyy')}
                        emisor={{
                          razonSocial: selectedCotizacion.clienteEmpresa || 'Volkern Hub',
                          idFiscal: 'VKL-2024-X',
                        }}
                        cliente={{
                          nombre: selectedCotizacion.clienteNombre || selectedCotizacion.lead?.nombre || 'Cliente',
                          idFiscal: selectedCotizacion.lead?.email,
                        }}
                        items={selectedCotizacion.items}
                        totals={{
                          subtotal: selectedCotizacion.total * 0.84, // Estimado si no viene desglosado
                          impuesto: selectedCotizacion.total * 0.16,
                          total: selectedCotizacion.total,
                          currency: selectedCotizacion.moneda,
                        }}
                        notas="Gracias por su preferencia."
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0 bg-background rounded-xl border p-8">
                    <h4 className="font-bold text-lg mb-6 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" /> Línea de Tiempo del Documento
                    </h4>
                    <DocumentTimeline events={getTimelineEvents(selectedCotizacion)} />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="p-6 bg-background border-t mt-auto sticky bottom-0 z-20">
                <Button className="w-full premium-gradient-primary border-none shadow-lg h-12 text-lg" onClick={() => router.push(`/dashboard/cotizaciones/${selectedCotizacion.id}`)}>
                  Ver Detalles Completos
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
