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
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  FileStack
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { apiFetch } from '@/lib/api-client'
import { DocumentPreview } from '@/components/document-preview'
import { DocumentTimeline, TimelineEvent } from '@/components/document-timeline'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContratoTemplatesManager } from '@/components/contratos/ContratoTemplatesManager'

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
  timeline?: {
    id: string
    action: string
    note: string | null
    createdAt: string
  }[]
}

export default function ContratosPage() {
  const router = useRouter()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('todos')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null)
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  useEffect(() => {
    fetchContratos()
  }, [])

  const fetchContratos = async () => {
    try {
      const [contractsRes, analyticsRes] = await Promise.all([
        apiFetch('/api/contratos'),
        apiFetch(`/api/analytics/contracts`)
      ])

      if (contractsRes.ok) {
        const data = await contractsRes.json()
        setContratos(data)
      }
      
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json()
        setAnalytics(analyticsData)
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

  const getUltimoEvento = (contrato: Contrato) => {
    const ev = contrato.timeline?.[0]
    if (!ev) return null
    const labels: Record<string, { texto: string; color: string }> = {
      document_signed: { texto: '✍️ Firma recibida', color: 'text-green-600' },
      document_sent: { texto: '📤 Enviado a firmar', color: 'text-blue-600' },
      created: { texto: '➕ Creado', color: 'text-slate-600' },
      plan_pagos: { texto: '📅 Plan de pagos', color: 'text-indigo-600' },
      pagado: { texto: '💳 Pago registrado', color: 'text-emerald-600' },
      actualizado: { texto: '✏️ Actualizado', color: 'text-slate-600' },
      cancelado: { texto: '✖️ Cancelado', color: 'text-red-600' }
    }
    const label = labels[ev.action] || { texto: ev.action.replace(/_/g, ' '), color: 'text-slate-600' }
    return {
      texto: label.texto,
      color: label.color,
      nota: ev.note,
      fecha: format(new Date(ev.createdAt), 'dd MMM HH:mm', { locale: es })
    }
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
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <FileStack className="h-4 w-4 mr-2" />
            Plantillas
          </Button>
          <Button variant="outline" onClick={() => router.push('/template-editor/document/new')}>
            <FileText className="h-4 w-4 mr-2" />
            Nuevo documento
          </Button>
          <Button onClick={() => router.push('/dashboard/contratos/nuevo')}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Contrato
          </Button>
        </div>
      </div>

      <ContratoTemplatesManager open={templatesOpen} onOpenChange={setTemplatesOpen} />

      {/* Inteligencia de Retención (Fase 6) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Widget: Salud de Cartera */}
        <Card className="glass-card premium-shadow border-none overflow-hidden col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Salud de Cartera
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-4">
            <div className="relative h-24 w-24">
              <svg className="h-full w-full" viewBox="0 0 36 36">
                <path className="stroke-slate-100" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path 
                  className="stroke-emerald-500 transition-all duration-1000" 
                  strokeWidth="3" 
                  strokeDasharray={`${analytics?.health?.averageScore || 0}, 100`} 
                  strokeLinecap="round" 
                  fill="none" 
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-slate-900">{Math.round(analytics?.health?.averageScore || 0)}</span>
                <span className="text-[8px] text-slate-400 font-bold uppercase">Score Avg</span>
              </div>
            </div>
            <div className="grid grid-cols-3 w-full mt-6 gap-2">
              <div className="text-center">
                <p className="text-[10px] font-bold text-emerald-600">{analytics?.health?.distribution?.low || 0}</p>
                <p className="text-[8px] text-slate-400 uppercase">Sano</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-amber-600">{analytics?.health?.distribution?.medium || 0}</p>
                <p className="text-[8px] text-slate-400 uppercase">Medio</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-red-600">{analytics?.health?.distribution?.high || 0}</p>
                <p className="text-[8px] text-slate-400 uppercase">Riesgo</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget: Revenue at Risk */}
        <Card className="glass-card premium-shadow border-none overflow-hidden col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" /> Revenue at Risk
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[140px] flex flex-col justify-between">
            <div>
              <p className="text-2xl font-black text-red-600 tracking-tighter">
                {formatCurrency(analytics?.health?.revenueAtRisk || 0)}
              </p>
              <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Impacto Potencial Churn</p>
            </div>
            <div className="p-2 bg-red-50 rounded-lg border border-red-100">
              <p className="text-[9px] text-red-700 leading-tight">
                <strong>{analytics?.health?.distribution?.high || 0} contratos</strong> presentan anomalías de pago o expiración inminente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Widget: Crecimiento YoY */}
        <Card className="glass-card premium-shadow border-none overflow-hidden col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Crecimiento YoY (Interanual)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[140px] flex gap-6 items-end">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <div className={`p-1 rounded ${analytics?.growth?.growth >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                  {analytics?.growth?.growth >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                </div>
                <span className={`text-2xl font-black ${analytics?.growth?.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {analytics?.growth?.growth >= 0 ? '+' : ''}{analytics?.growth?.growth?.toFixed(1)}%
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400 font-bold uppercase">Mes Actual</span>
                  <span className="font-bold">{formatCurrency(analytics?.growth?.current || 0)}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: '100%' }} />
                </div>
                <div className="flex justify-between text-[10px] pt-1">
                  <span className="text-slate-400 font-bold uppercase">Mismo Mes Año Anterior</span>
                  <span className="font-bold">{formatCurrency(analytics?.growth?.previous || 0)}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-300" style={{ width: `${(analytics?.growth?.previous / analytics?.growth?.current) * 100 || 0}%` }} />
                </div>
              </div>
            </div>
            <div className="w-24 h-full bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center p-2 text-center">
              <p className="text-[10px] font-black text-slate-500 uppercase leading-tight">Salud Global</p>
              <p className="text-xs font-bold text-emerald-600 mt-1">Óptima</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Métricas de Soberanía Comercial (Fase 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget 1: Concentración de Riesgo (Pareto) */}
        <Card className="glass-card premium-shadow border-none overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Concentración de Riesgo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {contratos.length > 0 ? (
                (() => {
                  const clients = new Map<string, number>()
                  contratos.forEach(c => {
                    const name = c.clienteEmpresa || c.clienteNombre || 'Sin Identificar'
                    clients.set(name, (clients.get(name) || 0) + c.total)
                  })
                  const sorted = Array.from(clients.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                  
                  return sorted.map(([name, amount], i) => {
                    const percent = (amount / valorTotal) * 100
                    return (
                      <div key={name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium truncate max-w-[150px]">{name}</span>
                          <span className="font-bold">{percent.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${i === 0 && percent > 30 ? 'bg-red-500' : 'bg-primary'}`} 
                            style={{ width: `${percent}%` }} 
                          />
                        </div>
                      </div>
                    )
                  })
                })()
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Sin datos suficientes</p>
              )}
              {valorTotal > 0 && Array.from(new Set(contratos.map(c => c.clienteNombre))).length < 3 && (
                <div className="p-2 bg-red-50 rounded border border-red-100 flex items-start gap-2">
                  <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5" />
                  <p className="text-[10px] text-red-700 leading-tight font-medium">
                    ALERTA: Alta dependencia de pocos clientes detectada.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Widget 2: Forecast de Flujo de Caja */}
        <Card className="glass-card premium-shadow border-none overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Forecast de Flujo Real
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-between h-[140px]">
            <div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">
                {formatCurrency(valorTotal * 0.85)} {/* Simulación de cobro esperado */}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">
                Proyección a 30 días
              </p>
            </div>
            <div className="mt-4 h-12 flex items-end gap-1">
              {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                <div 
                  key={i} 
                  className="flex-1 bg-primary/20 rounded-t hover:bg-primary transition-colors cursor-pointer" 
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Widget 3: Próximas Expiraciones */}
        <Card className="glass-card premium-shadow border-none overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" /> Expiración de Contratos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(() => {
                const expiring = contratos
                  .filter(c => c.fechaFin && new Date(c.fechaFin) > new Date() && 
                    (new Date(c.fechaFin).getTime() - new Date().getTime()) < 30 * 24 * 60 * 60 * 1000)
                  .slice(0, 3)
                
                if (expiring.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Sin renovaciones próximas</p>

                return expiring.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-2 hover:bg-white rounded border border-transparent hover:border-slate-100 transition-all cursor-pointer" onClick={() => router.push(`/dashboard/contratos/${c.id}`)}>
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-bold truncate max-w-[120px]">{c.titulo}</p>
                      <p className="text-[9px] text-muted-foreground">Vence: {format(new Date(c.fechaFin!), 'dd MMM', { locale: es })}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] text-blue-600 bg-blue-50 border-blue-100">
                      RENOVAR
                    </Badge>
                  </div>
                ))
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Métricas Tradicionales */}
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
                <TableHead>Última actividad</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContratos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                    <TableCell>
                      {(() => {
                        const ev = getUltimoEvento(contrato)
                        if (!ev) return <span className="text-xs text-muted-foreground">—</span>
                        return (
                          <div className="min-w-[160px]">
                            <p className={`text-xs font-semibold ${ev.color}`}>{ev.texto}</p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={ev.nota || ''}>
                              {ev.nota || ev.fecha}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70">{ev.fecha}</p>
                          </div>
                        )
                      })()}
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
