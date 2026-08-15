'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Send,
  Download,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  FileText,
  User,
  Building2,
  Calendar,
  Mail,
  Phone,
  ExternalLink,
  Loader2,
  Edit,
  AlertTriangle
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { calculateCotizacionDisplayTotals } from '@/lib/cotizaciones/cotizacion-totals'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter
} from '@/components/ui/table'

interface CotizacionItem {
  id: string
  concepto: string
  descripcion: string | null
  cantidad: number
  precioUnitario: number
  descuento: number
  total: number
  orden: number
}

interface Cotizacion {
  id: string
  numero: string
  titulo: string
  descripcion: string | null
  estado: string
  subtotal: number
  descuentoPorcentaje: number
  descuentoMonto: number
  impuestos: number
  total: number
  moneda: string
  validezDias: number
  terminosPago: string | null
  notasCliente: string | null
  fechaCreacion: string
  fechaEnvio: string | null
  fechaAceptacion: string | null
  fechaVencimiento: string | null
  tokenPublico: string | null
  vecesVista: number
  ultimaVista: string | null
  firmadoPorCliente: boolean
  fechaFirma: string | null
  clienteNombre: string | null
  clienteEmail: string | null
  clienteTelefono: string | null
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
  items: CotizacionItem[]
  tenant: {
    nombre: string
    dominio: string | null
  }
}

const estadoConfig: Record<string, { label: string; color: string; icon: any }> = {
  borrador: { label: 'Borrador', color: 'bg-gray-100 text-gray-800', icon: FileText },
  enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-800', icon: Send },
  vista: { label: 'Vista', color: 'bg-purple-100 text-purple-800', icon: Eye },
  aceptada: { label: 'Aceptada', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-800', icon: XCircle },
  vencida: { label: 'Vencida', color: 'bg-orange-100 text-orange-800', icon: AlertTriangle },
}

export default function CotizacionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const showSendModal = searchParams.get('action') === 'send'
  
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(showSendModal)
  const [sendEmail, setSendEmail] = useState('')
  const [sendMessage, setSendMessage] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Estados para conversión a orden
  const [convertModalOpen, setConvertModalOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [notasOrden, setNotasOrden] = useState('')

  useEffect(() => {
    fetchCotizacion()
  }, [params.id])

  useEffect(() => {
    if (cotizacion?.clienteEmail) {
      setSendEmail(cotizacion.clienteEmail)
    }
  }, [cotizacion])

  const fetchCotizacion = async () => {
    try {
      const res = await fetch(`/api/cotizaciones/${params.id}`)
      const data = await res.json()
      
      if (data.cotizacion) {
        setCotizacion(data.cotizacion)
      } else {
        toast.error('Cotización no encontrada')
        router.push('/dashboard/cotizaciones')
      }
    } catch (error) {
      toast.error('Error al cargar cotización')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!sendEmail) {
      toast.error('El email es requerido')
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/cotizaciones/${params.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: sendEmail,
          mensaje: sendMessage
        })
      })

      const data = await res.json()
      
      if (res.ok) {
        toast.success('Cotización enviada exitosamente')
        setSendModalOpen(false)
        fetchCotizacion()
      } else {
        toast.error(data.error || 'Error al enviar')
      }
    } catch (error) {
      toast.error('Error al enviar cotización')
    } finally {
      setSending(false)
    }
  }

  const handleUpdateEstado = async (estado: string) => {
    try {
      const res = await fetch(`/api/cotizaciones/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      })

      if (res.ok) {
        toast.success(`Estado actualizado a ${estadoConfig[estado]?.label || estado}`)
        fetchCotizacion()
      }
    } catch (error) {
      toast.error('Error al actualizar estado')
    }
  }

  const copyPublicLink = () => {
    if (cotizacion?.tokenPublico) {
      const url = `${window.location.origin}/cotizacion/${cotizacion.tokenPublico}`
      navigator.clipboard.writeText(url)
      toast.success('Enlace copiado al portapapeles')
    }
  }

  const downloadPdf = async () => {
    if (!cotizacion) return
    setDownloadingPdf(true)
    try {
      const response = await fetch(`/api/cotizaciones/${cotizacion.id}/pdf`)
      if (!response.ok) {
        throw new Error('Error generando PDF')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${cotizacion.numero}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('PDF descargado correctamente')
    } catch (error) {
      console.error('Error downloading PDF:', error)
      toast.error('Error al descargar el PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleConvertOrder = async () => {
    setConverting(true)
    try {
      const res = await fetch('/api/ordenes-venta/from-cotizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cotizacionId: params.id,
          fechaEntrega: fechaEntrega || undefined,
          notas: notasOrden || undefined
        })
      })

      const data = await res.json()
      
      if (res.ok && data.orden?.id) {
        toast.success(data.mensaje || 'Orden de venta creada exitosamente')
        setConvertModalOpen(false)
        router.push(`/dashboard/ventas/ordenes/${data.orden.id}`)
      } else {
        toast.error(data.error || 'Error al convertir a orden')
      }
    } catch (error) {
      toast.error('Error de red al convertir cotización')
    } finally {
      setConverting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: cotizacion?.moneda || 'MXN'
    }).format(amount)
  }

  const isExpired = () => {
    if (!cotizacion?.fechaVencimiento) return false
    return new Date(cotizacion.fechaVencimiento) < new Date() && 
           !['aceptada', 'rechazada'].includes(cotizacion.estado)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!cotizacion) {
    return (
      <div className="p-6">
        <p>Cotización no encontrada</p>
      </div>
    )
  }

  const estado = estadoConfig[isExpired() ? 'vencida' : cotizacion.estado] || estadoConfig.borrador
  const EstadoIcon = estado.icon
  const displayTotals = calculateCotizacionDisplayTotals(
    cotizacion.items,
    cotizacion.subtotal,
    cotizacion.descuentoMonto,
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/cotizaciones')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{cotizacion.numero}</h1>
              <Badge className={estado.color}>
                <EstadoIcon className="h-3 w-3 mr-1" />
                {estado.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">{cotizacion.titulo}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {cotizacion.estado === 'borrador' && (
            <>
              <Button variant="outline" onClick={() => router.push(`/dashboard/cotizaciones/nueva?editId=${cotizacion.id}`)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
              <Button onClick={() => setSendModalOpen(true)}>
                <Send className="h-4 w-4 mr-2" />
                Enviar
              </Button>
            </>
          )}
          {cotizacion.tokenPublico && (
            <Button variant="outline" onClick={copyPublicLink}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar Enlace
            </Button>
          )}
          <Button variant="outline" onClick={downloadPdf} disabled={downloadingPdf}>
            {downloadingPdf ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {downloadingPdf ? 'Generando...' : 'Descargar PDF'}
          </Button>
          {cotizacion.estado === 'enviada' && (
            <>
              <Button variant="outline" onClick={() => handleUpdateEstado('aceptada')} className="text-green-600">
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar Aceptada
              </Button>
              <Button onClick={() => setConvertModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <FileText className="h-4 w-4 mr-2" />
                Convertir a Orden
              </Button>
              <Button variant="outline" onClick={() => handleUpdateEstado('rechazada')} className="text-red-600">
                <XCircle className="h-4 w-4 mr-2" />
                Marcar Rechazada
              </Button>
            </>
          )}
          {cotizacion.estado === 'aceptada' && (
            <Button onClick={() => setConvertModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <FileText className="h-4 w-4 mr-2" />
              Convertir a Orden
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Contenido principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabla de items */}
          <Card>
            <CardHeader>
              <CardTitle>Items de la Cotización</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Concepto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
                    <TableHead className="text-right">Descuento</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cotizacion.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.concepto}</p>
                          {item.descripcion && (
                            <p className="text-sm text-muted-foreground">{item.descripcion}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{item.cantidad}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.precioUnitario)}</TableCell>
                      <TableCell className="text-right">
                        {item.descuento > 0 ? formatCurrency(item.descuento) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>Subtotal bruto</TableCell>
                    <TableCell className="text-right">{formatCurrency(displayTotals.subtotalBruto)}</TableCell>
                  </TableRow>
                  {displayTotals.descuentosLineas > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-green-600">
                        Descuentos por línea
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        -{formatCurrency(displayTotals.descuentosLineas)}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={4}>Subtotal</TableCell>
                    <TableCell className="text-right">{formatCurrency(displayTotals.subtotal)}</TableCell>
                  </TableRow>
                  {displayTotals.descuentoGlobal > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-green-600">
                        Descuento global{cotizacion.descuentoPorcentaje > 0 ? ` (${cotizacion.descuentoPorcentaje}%)` : ''}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        -{formatCurrency(displayTotals.descuentoGlobal)}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={4}>Base imponible</TableCell>
                    <TableCell className="text-right">{formatCurrency(displayTotals.baseImponible)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4}>IVA</TableCell>
                    <TableCell className="text-right">{formatCurrency(cotizacion.impuestos)}</TableCell>
                  </TableRow>
                  <TableRow className="font-bold text-lg">
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(cotizacion.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Términos y notas */}
          {(cotizacion.terminosPago || cotizacion.notasCliente) && (
            <Card>
              <CardHeader>
                <CardTitle>Términos y Condiciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cotizacion.terminosPago && (
                  <div>
                    <Label className="text-sm font-medium">Términos de Pago</Label>
                    <p className="text-sm text-muted-foreground mt-1">{cotizacion.terminosPago}</p>
                  </div>
                )}
                {cotizacion.notasCliente && (
                  <div>
                    <Label className="text-sm font-medium">Notas</Label>
                    <p className="text-sm text-muted-foreground mt-1">{cotizacion.notasCliente}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info del cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(cotizacion.clienteNombre || cotizacion.lead?.nombre) && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{cotizacion.clienteNombre || cotizacion.lead?.nombre}</span>
                </div>
              )}
              {(cotizacion.clienteEmail || cotizacion.lead?.email) && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{cotizacion.clienteEmail || cotizacion.lead?.email}</span>
                </div>
              )}
              {cotizacion.clienteTelefono && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{cotizacion.clienteTelefono}</span>
                </div>
              )}
              {(cotizacion.clienteEmpresa || cotizacion.lead?.empresa) && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{cotizacion.clienteEmpresa || cotizacion.lead?.empresa}</span>
                </div>
              )}
              {cotizacion.lead && (
                <Button 
                  variant="link" 
                  className="p-0 h-auto"
                  onClick={() => router.push(`/dashboard/leads/${cotizacion.lead?.id}`)}
                >
                  Ver lead <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Detalles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Detalles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creada</span>
                <span>{format(new Date(cotizacion.fechaCreacion), 'dd MMM yyyy', { locale: es })}</span>
              </div>
              {cotizacion.fechaEnvio && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enviada</span>
                  <span>{format(new Date(cotizacion.fechaEnvio), 'dd MMM yyyy', { locale: es })}</span>
                </div>
              )}
              {cotizacion.fechaVencimiento && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vence</span>
                  <span className={isExpired() ? 'text-red-500' : ''}>
                    {format(new Date(cotizacion.fechaVencimiento), 'dd MMM yyyy', { locale: es })}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Validez</span>
                <span>{cotizacion.validezDias} días</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Moneda</span>
                <span>{cotizacion.moneda}</span>
              </div>
            </CardContent>
          </Card>

          {/* Tracking */}
          {cotizacion.estado !== 'borrador' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Tracking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Veces vista</span>
                  <Badge variant="outline">{cotizacion.vecesVista}</Badge>
                </div>
                {cotizacion.ultimaVista && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Última vista</span>
                    <span>{format(new Date(cotizacion.ultimaVista), 'dd MMM HH:mm', { locale: es })}</span>
                  </div>
                )}
                {cotizacion.firmadoPorCliente && cotizacion.fechaFirma && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Firmada el {format(new Date(cotizacion.fechaFirma), 'dd MMM yyyy', { locale: es })}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Enlace público */}
          {cotizacion.tokenPublico && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="h-5 w-5" />
                  Enlace Público
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input 
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/cotizacion/${cotizacion.tokenPublico}`}
                    readOnly
                    className="text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={copyPublicLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Comparte este enlace con tu cliente para que pueda ver la cotización
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal de envío */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Cotización</DialogTitle>
            <DialogDescription>
              Se enviará un email con el enlace a la cotización
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email del destinatario *</Label>
              <Input
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="cliente@empresa.com"
              />
            </div>
            <div>
              <Label>Mensaje personalizado (opcional)</Label>
              <Textarea
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Escribe un mensaje para acompañar la cotización..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de conversión a orden */}
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir a Orden de Venta</DialogTitle>
            <DialogDescription>
              Esta acción creará una orden de venta formal heredando todos los items y precios de esta cotización ({cotizacion.numero}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="fechaEntrega">Fecha de Entrega Estimada (Opcional)</Label>
              <Input
                id="fechaEntrega"
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notasOrden">Notas para la Orden (Opcional)</Label>
              <Textarea
                id="notasOrden"
                value={notasOrden}
                onChange={(e) => setNotasOrden(e.target.value)}
                placeholder="Ej: Entrega urgente, requiere embalaje especial..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConvertOrder} 
              disabled={converting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {converting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Confirmar y Crear Orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
